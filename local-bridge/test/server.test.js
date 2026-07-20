'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer, sanitizeOutgoingHeaders, timingSafeEqualStrings } = require('../src/server');

const TOKEN = 'test-token-abc123';
const ORIGIN = 'http://localhost:4200';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Spins up a tiny target server the bridge relays requests to. */
function startTarget(handler) {
  const server = http.createServer(handler);
  return listen(server).then((port) => ({ server, port, url: `http://127.0.0.1:${port}` }));
}

test('sanitizeOutgoingHeaders drops hop-by-hop headers and non-string values', () => {
  const out = sanitizeOutgoingHeaders({
    Authorization: 'Bearer xyz',
    'Content-Length': '999',
    Connection: 'keep-alive',
    Host: 'evil.example.com',
    'X-Custom': 42,
  });
  assert.deepEqual(out, { Authorization: 'Bearer xyz' });
});

test('timingSafeEqualStrings matches equal strings and rejects mismatches/undefined', () => {
  assert.equal(timingSafeEqualStrings('abc', 'abc'), true);
  assert.equal(timingSafeEqualStrings('abc', 'abd'), false);
  assert.equal(timingSafeEqualStrings(undefined, 'abc'), false);
  assert.equal(timingSafeEqualStrings('abc', undefined), false);
});

test('GET /health returns ok without requiring a token', async () => {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.name, 'wayfarer-local-bridge');
  } finally {
    await close(bridge);
  }
});

test('POST /relay rejects requests from an unlisted Origin with 403', async () => {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
        'X-Wayfarer-Bridge-Token': TOKEN,
      },
      body: JSON.stringify({ method: 'GET', url: 'http://example.com' }),
    });
    assert.equal(res.status, 403);
  } finally {
    await close(bridge);
  }
});

test('POST /relay rejects a missing/incorrect token with 401, even from an allowed origin', async () => {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', url: 'http://example.com' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await close(bridge);
  }
});

test('POST /relay rejects invalid JSON bodies with 400', async () => {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'X-Wayfarer-Bridge-Token': TOKEN },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  } finally {
    await close(bridge);
  }
});

test('POST /relay rejects an unparseable/unsupported target URL with 400', async () => {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Wayfarer-Bridge-Token': TOKEN,
      },
      body: JSON.stringify({ method: 'GET', url: 'not-a-url' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close(bridge);
  }
});

test('POST /relay forwards a GET to the target and wraps its response', async () => {
  const target = await startTarget((req, res) => {
    assert.equal(req.headers['x-probe'], 'yes');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hello: 'world' }));
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Wayfarer-Bridge-Token': TOKEN,
      },
      body: JSON.stringify({
        method: 'GET',
        url: target.url,
        headers: { 'X-Probe': 'yes' },
      }),
    });
    assert.equal(res.status, 200);
    const envelope = await res.json();
    assert.equal(envelope.status, 200);
    assert.equal(envelope.bodyEncoding, 'utf8');
    assert.deepEqual(JSON.parse(envelope.body), { hello: 'world' });
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('POST /relay forwards method/body and reports non-2xx target statuses as a successful relay', async () => {
  const target = await startTarget((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      assert.equal(req.method, 'POST');
      assert.equal(raw, JSON.stringify({ name: 'jane' }));
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'validation failed' }));
    });
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Wayfarer-Bridge-Token': TOKEN,
      },
      body: JSON.stringify({ method: 'POST', url: target.url, body: { name: 'jane' } }),
    });
    // The bridge call itself succeeded — it's the *target* that returned 422.
    assert.equal(res.status, 200);
    const envelope = await res.json();
    assert.equal(envelope.status, 422);
    assert.deepEqual(JSON.parse(envelope.body), { error: 'validation failed' });
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('POST /relay reports an unreachable target as a 502 with a readable error', async () => {
  // Port 1 is a reserved/typically-unbound port — connecting to it on
  // 127.0.0.1 fails fast with ECONNREFUSED in CI sandboxes.
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Wayfarer-Bridge-Token': TOKEN,
      },
      body: JSON.stringify({ method: 'GET', url: 'http://127.0.0.1:1' }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.ok(body.error && body.error.message);
  } finally {
    await close(bridge);
  }
});

test('OPTIONS preflight only sets CORS headers for allowed origins', async () => {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const allowed = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN },
    });
    assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);

    const denied = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally {
    await close(bridge);
  }
});
