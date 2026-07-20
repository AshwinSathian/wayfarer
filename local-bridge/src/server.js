'use strict';

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const pkg = require('../package.json');

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25MB — generous for API testing, not "proxy anything"
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

/** Forwards one relay request to its target and writes the wrapped envelope to `res`. */
function relay(payload, res) {
  let target;
  try {
    target = new URL(String(payload?.url ?? ''));
  } catch {
    sendJson(res, 400, { error: 'invalid or missing target url' });
    return;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    sendJson(res, 400, { error: `unsupported protocol: ${target.protocol}` });
    return;
  }

  const method =
    typeof payload.method === 'string' && payload.method ? payload.method.toUpperCase() : 'GET';
  const outgoingHeaders = sanitizeOutgoingHeaders(payload.headers);
  const lib = target.protocol === 'https:' ? https : http;

  let requestBody;
  if (payload.body !== undefined && payload.body !== null) {
    requestBody = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
    outgoingHeaders['Content-Length'] = String(Buffer.byteLength(requestBody));
  }

  const outgoing = lib.request(
    target,
    { method, headers: outgoingHeaders, timeout: RELAY_TIMEOUT_MS },
    (upstreamRes) => {
      const chunks = [];
      upstreamRes.on('data', (chunk) => chunks.push(chunk));
      upstreamRes.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const { text, encoding } = decodeBody(buffer, upstreamRes.headers['content-type']);
        sendJson(res, 200, {
          status: upstreamRes.statusCode,
          statusText: upstreamRes.statusMessage ?? '',
          headers: flattenHeaders(upstreamRes.headers),
          body: text,
          bodyEncoding: encoding,
        });
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
  decodeBody,
  sanitizeOutgoingHeaders,
  timingSafeEqualStrings,
};
