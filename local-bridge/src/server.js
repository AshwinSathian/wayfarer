'use strict';

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const pkg = require('../package.json');

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25MB, for the request and for the target's response — generous for API testing, not "proxy anything"
const RELAY_TIMEOUT_MS = 30_000;

// Headers we never forward as-is: connection-management headers Node sets
// itself for the outgoing request, plus content-length (recomputed from the
// actual body we're about to send).
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

// Content-types decoded as base64 rather than UTF-8 text, since forcing a
// UTF-8 decode on binary bytes is lossy. Deliberately narrow — most API
// testing traffic is textual (JSON/XML/form/plain), and defaulting to text
// keeps the common case simple.
const BINARY_TYPE_RE = /^(image\/|audio\/|video\/|font\/|application\/(octet-stream|pdf|zip|x-[\w.+-]+|vnd\.[\w.+-]+))/i;

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

function decodeBody(buffer, contentType) {
  if (contentType && BINARY_TYPE_RE.test(contentType)) {
    return { text: buffer.toString('base64'), encoding: 'base64' };
  }
  return { text: buffer.toString('utf8'), encoding: 'utf8' };
}

function flattenHeaders(nodeHeaders) {
  const out = {};
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) {
      continue;
    }
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

function sanitizeOutgoingHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') {
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      continue;
    }
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** The most hops the bridge follows for one relay, whatever the page asks for. */
const MAX_FOLLOW = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Not sent on to another origin: the page wrote them for the first one.
const OTHER_ORIGIN_DROPPED = new Set(['authorization', 'cookie']);
// Gone with the body when a redirect turns the request into a GET.
const BODY_HEADERS = new Set(['content-type', 'content-encoding', 'content-language', 'content-location']);

/** A hop from `from` to `to` leaves the host: another name or port, or the same one without TLS. */
function leavesHost(from, to) {
  return from.host !== to.host || (from.protocol === 'https:' && to.protocol === 'http:');
}

function withoutHeaders(headers, dropped) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !dropped.has(key.toLowerCase())));
}

/**
 * Forwards one relay request to its target and writes the wrapped envelope to `res`.
 *
 * With `follow` in the payload (0 to 20) the bridge follows that many
 * redirects and lists each in `chain`; `url` is the address the response
 * came from. A redirect it does not follow is the response, and `stopped`
 * says why: `limit`, `location` (no http or https address) or `other-host`
 * (asked for with `stayOnHost`). Without `follow` nothing is followed and
 * the answer has none of the three, as before the addition.
 */
function relay(payload, res) {
  let first;
  try {
    first = new URL(String(payload?.url ?? ''));
  } catch {
    sendJson(res, 400, { error: 'invalid or missing target url' });
    return;
  }
  if (first.protocol !== 'http:' && first.protocol !== 'https:') {
    sendJson(res, 400, { error: `unsupported protocol: ${first.protocol}` });
    return;
  }
  const following = payload.follow !== undefined;
  if (following && !(Number.isInteger(payload.follow) && payload.follow >= 0 && payload.follow <= MAX_FOLLOW)) {
    sendJson(res, 400, { error: `follow must be a whole number from 0 to ${MAX_FOLLOW}` });
    return;
  }
  if (payload.stayOnHost !== undefined && typeof payload.stayOnHost !== 'boolean') {
    sendJson(res, 400, { error: 'stayOnHost must be true or false' });
    return;
  }

  const firstMethod =
    typeof payload.method === 'string' && payload.method ? payload.method.toUpperCase() : 'GET';
  let firstBody;
  if (payload.body !== undefined && payload.body !== null) {
    firstBody = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
  }
  const chain = [];

  const hop = (target, method, headers, requestBody) => {
    const lib = target.protocol === 'https:' ? https : http;
    const outgoingHeaders = { ...headers };
    if (requestBody !== undefined) {
      outgoingHeaders['Content-Length'] = String(Buffer.byteLength(requestBody));
    }
    const outgoing = lib.request(
      target,
      { method, headers: outgoingHeaders, timeout: RELAY_TIMEOUT_MS },
      (upstreamRes) => {
        const chunks = [];
        let bytes = 0;
        upstreamRes.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) {
            // Buffering an unbounded response would exhaust this process's memory.
            outgoing.destroy(Object.assign(new Error('response body too large'), { code: 'RELAY_RESPONSE_TOO_LARGE' }));
            return;
          }
          chunks.push(chunk);
        });
        upstreamRes.on('end', () => {
          const answer = (stopped) => {
            const { text, encoding } = decodeBody(Buffer.concat(chunks), upstreamRes.headers['content-type']);
            sendJson(res, 200, {
              status: upstreamRes.statusCode,
              statusText: upstreamRes.statusMessage ?? '',
              headers: flattenHeaders(upstreamRes.headers),
              body: text,
              bodyEncoding: encoding,
              ...(following && { chain, url: target.href }),
              ...(stopped && { stopped }),
            });
          };
          const location = upstreamRes.headers.location;
          if (!following || !REDIRECT_STATUSES.has(upstreamRes.statusCode) || location === undefined) {
            answer();
            return;
          }
          if (chain.length >= payload.follow) {
            answer('limit');
            return;
          }
          // Each hop's address is checked as the first one is.
          const next = URL.canParse(location, target) ? new URL(location, target) : undefined;
          if (!next || (next.protocol !== 'http:' && next.protocol !== 'https:')) {
            answer('location');
            return;
          }
          if (payload.stayOnHost && leavesHost(target, next)) {
            answer('other-host');
            return;
          }
          chain.push({ status: upstreamRes.statusCode, url: target.href, location });
          // As a browser does: 303 makes a GET of anything but a HEAD, 301 and 302 of a POST; 307 and 308 repeat the request.
          const status = upstreamRes.statusCode;
          const toGet = (status === 303 && method !== 'GET' && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST');
          let nextHeaders = toGet ? withoutHeaders(headers, BODY_HEADERS) : headers;
          if (next.origin !== target.origin) {
            nextHeaders = withoutHeaders(nextHeaders, OTHER_ORIGIN_DROPPED);
          }
          hop(next, toGet ? 'GET' : method, nextHeaders, toGet ? undefined : requestBody);
        });
        upstreamRes.on('error', (err) => {
          sendJson(res, 502, { error: { message: err.message, code: err.code ?? 'RELAY_READ_ERROR' } });
        });
      }
    );

    outgoing.on('timeout', () => {
      outgoing.destroy(new Error('relay request timed out'));
    });
    outgoing.on('error', (err) => {
      sendJson(res, 502, { error: { message: err.message, code: err.code ?? 'RELAY_ERROR' } });
    });

    outgoing.end(requestBody);
  };

  hop(first, firstMethod, sanitizeOutgoingHeaders(payload.headers), firstBody);
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
      sendJson(res, 200, { ok: true, name: 'wayfarer-local-bridge', version: pkg.version });
      return;
    }

    if (req.url !== '/relay' || req.method !== 'POST') {
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
  leavesHost,
  sanitizeOutgoingHeaders,
  timingSafeEqualStrings,
};
