'use strict';

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { URL } = require('node:url');
const pkg = require('../package.json');

// The protocol the page and the bridge speak (README.md, "Protocol"). A change that an older page or bridge would
// read wrongly is a new number and a new path: the path is what keeps the two from guessing at each other.
const PROTOCOL = 2;
const RELAY_PATH = `/v${PROTOCOL}/relay`;
const CAPABILITIES = ['bytes', 'decompression', 'header-list', 'timeout'];

// 25 MB: for the request as it arrives here (its body is base64 inside JSON, so some 18 MB of bytes) and for the
// target's response, as received and as decoded. Generous for API testing, not "proxy anything".
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const RELAY_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
// What Node can decode, and so what is asked for when the request names nothing.
const ACCEPT_ENCODING = 'gzip, deflate, br';

// Headers we never forward as-is: connection-management headers Node sets
// itself for the outgoing request, plus content-length (recomputed from the
// actual body we're about to send).
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare a buffer against itself so the failure path still costs a
    // comparable amount of time regardless of the length mismatch, rather
    // than short-circuiting on length alone.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isLoopbackHost(host) {
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(String(host ?? ''));
}

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.headersSent) {
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function setCorsHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wayfarer-Bridge-Token');
  res.setHeader('Access-Control-Max-Age', '600');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Node's flat `rawHeaders` (name, value, name, value) as pairs: two Set-Cookie headers stay two. */
function pairHeaders(rawHeaders) {
  const out = [];
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    out.push([rawHeaders[i], rawHeaders[i + 1]]);
  }
  return out;
}

/**
 * The request's headers as Node takes them, without the ones Node writes
 * itself. A name that repeats keeps every value. Built with no prototype:
 * a header may be named `__proto__`.
 */
function sanitizeOutgoingHeaders(headers) {
  const out = Object.create(null);
  for (const [name, value] of headers) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    (out[name] ??= []).push(value);
  }
  return { ...out };
}

/**
 * What a relay request asks for, or the reason it is refused. Every field
 * is checked: a field of the wrong type, or one this protocol does not
 * have, is an error and never a default.
 */
function readPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'the request must be a JSON object' };
  }
  const known = new Set(['method', 'url', 'headers', 'bodyB64', 'timeoutMs']);
  const unknown = Object.keys(payload).find((key) => !known.has(key));
  if (unknown !== undefined) {
    return { error: `unknown field: ${unknown}` };
  }
  const { method, url, headers, bodyB64, timeoutMs } = payload;
  if (typeof method !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,32}$/.test(method)) {
    return { error: 'method must be an HTTP method' };
  }
  if (!Array.isArray(headers) || !headers.every((pair) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string')) {
    return { error: 'headers must be a list of [name, value] pairs of text' };
  }
  if (bodyB64 !== undefined && (typeof bodyB64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(bodyB64))) {
    return { error: 'bodyB64 must be base64 text' };
  }
  if (timeoutMs !== undefined && !(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= MAX_TIMEOUT_MS)) {
    return { error: `timeoutMs must be a whole number from 1 to ${MAX_TIMEOUT_MS}` };
  }
  let target;
  try {
    target = new URL(String(url ?? ''));
  } catch {
    return { error: 'invalid or missing target url' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { error: `unsupported protocol: ${target.protocol}` };
  }
  return { method: method.toUpperCase(), target, headers, body: bodyB64 === undefined ? undefined : Buffer.from(bodyB64, 'base64'), timeoutMs: timeoutMs ?? RELAY_TIMEOUT_MS };
}

/** The stream that undoes a response's Content-Encoding, or undefined when there is nothing to undo. Null: an encoding Node cannot decode. */
function decoderFor(encoding) {
  const name = String(encoding ?? '').trim().toLowerCase();
  if (name === '' || name === 'identity') return undefined;
  if (name === 'gzip' || name === 'x-gzip') return zlib.createGunzip();
  // Some servers send raw deflate under this name; a browser reads both.
  if (name === 'deflate') return zlib.createInflate();
  if (name === 'br') return zlib.createBrotliDecompress();
  return null;
}

/** Forwards one relay request to its target and writes the wrapped envelope to `res`. */
function relay(payload, res) {
  const request = readPayload(payload);
  if (request.error) {
    sendJson(res, 400, { error: request.error });
    return;
  }
  const { method, target, body } = request;
  const outgoingHeaders = sanitizeOutgoingHeaders(request.headers);
  if (!request.headers.some(([name]) => name.toLowerCase() === 'accept-encoding')) {
    outgoingHeaders['Accept-Encoding'] = ACCEPT_ENCODING;
  }
  if (body !== undefined) {
    outgoingHeaders['Content-Length'] = String(body.length);
  }
  const lib = target.protocol === 'https:' ? https : http;
  let decoder;
  // One way out for every failure, whenever it comes: the target's response may have ended before its body is
  // found to be too large or not what its header says, and a request that has ended emits no error when destroyed.
  const abort = (status, message, code) => {
    clearTimeout(deadline);
    sendJson(res, status, { error: { message, code } });
    decoder?.destroy();
    outgoing.destroy();
  };

  const outgoing = lib.request(target, { method, headers: outgoingHeaders }, (upstreamRes) => {
    decoder = decoderFor(upstreamRes.headers['content-encoding']);
    if (decoder === null) {
      abort(502, `the response's Content-Encoding (${upstreamRes.headers['content-encoding']}) is not one the bridge can decode`, 'RELAY_DECODE_ERROR');
      return;
    }
    // Both counts are capped: what arrives, and what it decodes to. A small compressed body can decode to any size.
    const tooLarge = () => abort(502, 'response body too large', 'RELAY_RESPONSE_TOO_LARGE');
    let encodedSize = 0;
    upstreamRes.on('data', (chunk) => {
      encodedSize += chunk.length;
      if (encodedSize > MAX_BODY_BYTES) tooLarge();
      else decoder?.write(chunk);
    });
    // Not piped: a response with no body (HEAD, 204, 304) may name an encoding, and there is nothing to decode then.
    if (decoder) upstreamRes.on('end', () => (encodedSize > 0 ? decoder.end() : finish()));
    const decoded = decoder ?? upstreamRes;
    const chunks = [];
    let decodedSize = 0;
    decoded.on('data', (chunk) => {
      decodedSize += chunk.length;
      if (decodedSize > MAX_BODY_BYTES) {
        tooLarge();
        return;
      }
      chunks.push(chunk);
    });
    const finish = () => {
      clearTimeout(deadline);
      // After a failure this writes nothing: the answer has gone out.
      sendJson(res, 200, {
        status: upstreamRes.statusCode,
        statusText: upstreamRes.statusMessage ?? '',
        // As received, one entry each, Content-Encoding among them: the body below is decoded, and the two sizes say so.
        headers: pairHeaders(upstreamRes.rawHeaders),
        bodyB64: Buffer.concat(chunks).toString('base64'),
        encodedSize,
        decodedSize,
      });
    };
    decoded.on('end', finish);
    upstreamRes.on('error', (err) => abort(502, err.message, err.code ?? 'RELAY_READ_ERROR'));
    decoder?.on('error', (err) => abort(502, `the response could not be decoded: ${err.message}`, 'RELAY_DECODE_ERROR'));
  });

  // One deadline for the whole exchange, as the page's own: a socket's idle timeout would start again with every byte.
  const deadline = setTimeout(() => abort(504, 'relay request timed out', 'RELAY_TIMEOUT'), request.timeoutMs);
  outgoing.on('error', (err) => abort(502, err.message, err.code ?? 'RELAY_ERROR'));
  // The page went away (Cancel, or its own timeout): the target is not kept waiting.
  res.on('close', () => {
    if (!res.writableEnded) abort(502, 'the page closed the connection', 'RELAY_ABORTED');
  });

  outgoing.end(body);
}

/**
 * Creates the bridge's HTTP server. Every request must both come from an
 * allowed Origin (checked first, so unknown pages get a generic 403 without
 * learning whether a token would even be checked) and carry the correct
 * bridge token — two independent gates, since either one alone is weaker:
 * Origin headers are browser-enforced but the token is what actually proves
 * the caller is a Wayfarer instance the operator configured, not just any
 * page that happens to be served from an allowed origin.
 */
function createServer({ token, allowedOrigins }) {
  if (!token) {
    throw new Error('createServer requires a token');
  }
  const origins = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins ?? []);

  return http.createServer((req, res) => {
    // A loopback name is the only Host a browser sends when it really means
    // this process. Anything else is a DNS-rebinding page whose hostname was
    // re-pointed at 127.0.0.1; refuse it before looking at anything else.
    if (!isLoopbackHost(req.headers.host)) {
      sendJson(res, 421, { error: 'unexpected Host header' });
      return;
    }
    const origin = req.headers.origin;
    const originAllowed = typeof origin === 'string' && origins.has(origin);

    if (req.method === 'OPTIONS') {
      if (originAllowed) {
        setCorsHeaders(res, origin);
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      if (originAllowed) {
        setCorsHeaders(res, origin);
      }
      sendJson(res, 200, { ok: true, name: 'wayfarer-bridge', version: pkg.version, protocol: PROTOCOL, capabilities: CAPABILITIES });
      return;
    }

    if (req.url === '/relay' && req.method === 'POST') {
      // The path of protocol 1: a page from before this bridge. Its request is not read as anything.
      if (originAllowed) {
        setCorsHeaders(res, origin);
      }
      sendJson(res, 404, { error: `This Local Bridge speaks protocol ${PROTOCOL} and the page speaks protocol 1. Reload Wayfarer to get its current version.` });
      return;
    }
    if (req.url !== RELAY_PATH || req.method !== 'POST') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    if (!originAllowed) {
      sendJson(res, 403, { error: `origin not allowed: ${origin ?? '(none sent)'}` });
      return;
    }
    setCorsHeaders(res, origin);

    if (!timingSafeEqualStrings(req.headers['x-wayfarer-bridge-token'], token)) {
      sendJson(res, 401, { error: 'invalid or missing bridge token' });
      return;
    }

    readRequestBody(req)
      .then((raw) => {
        let payload;
        try {
          payload = raw.length ? JSON.parse(raw.toString('utf8')) : {};
        } catch {
          sendJson(res, 400, { error: 'invalid JSON body' });
          return;
        }
        relay(payload, res);
      })
      .catch((err) => {
        sendJson(res, err.statusCode ?? 400, { error: err.message });
      });
  });
}

module.exports = {
  createServer,
  isLoopbackHost,
  sanitizeOutgoingHeaders,
  timingSafeEqualStrings,
};
