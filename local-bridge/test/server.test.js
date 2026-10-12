'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer, leavesHost, sanitizeOutgoingHeaders, timingSafeEqualStrings } = require('../src/server');

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

test('@claim:C-041 POST /relay rejects requests from an unlisted Origin with 403', async () => {
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

test('@claim:C-041 POST /relay rejects a missing/incorrect token with 401, even from an allowed origin', async () => {
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

test('@claim:C-041 POST /relay forwards a GET to the target and wraps its response', async () => {
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

test('POST /relay answers 502 instead of buffering a target response over the size limit', async () => {
  const target = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(Buffer.alloc(26 * 1024 * 1024, 'x'));
  });
  const targetPort = await listen(target);
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Wayfarer-Bridge-Token': TOKEN },
      body: JSON.stringify({ method: 'GET', url: `http://127.0.0.1:${targetPort}/big` }),
    });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, 'RELAY_RESPONSE_TOO_LARGE');
  } finally {
    target.closeAllConnections();
    await close(target);
    await close(bridge);
  }
});

test('a request whose Host is not a loopback name is refused (DNS rebinding)', async () => {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  const status = (host) =>
    new Promise((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/health', headers: { Host: host } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });
  try {
    assert.equal(await status('attacker.example:7717'), 421);
    assert.equal(await status(`127.0.0.1:${port}`), 200);
    assert.equal(await status(`localhost:${port}`), 200);
    assert.equal(await status(`[::1]:${port}`), 200);
  } finally {
    await close(bridge);
  }
});

// Redirects (protocol 1, an addition: `follow` and `stayOnHost` in the request, `chain`, `url` and `stopped` in the answer).

/** A bridge, and a function that relays `payload` through it and gives the answer's status and JSON. */
async function startBridge() {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  const relay = async (payload) => {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Wayfarer-Bridge-Token': TOKEN },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: await res.json() };
  };
  return { bridge, relay };
}

/** A target that answers `/hop/n` with a 302 to `/hop/n-1`, `/hop/0` with what it received, and anything else as `routes` says. */
function startHops(routes = {}) {
  return startTarget((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const route = routes[req.url];
      if (route) {
        res.writeHead(route.status, route.headers);
        res.end(route.body ?? '');
        return;
      }
      const n = Number(/^\/hop\/(\d+)$/.exec(req.url)?.[1]);
      if (n > 0) {
        res.writeHead(302, { Location: `/hop/${n - 1}` });
        res.end('moved');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
  });
}

test('without `follow` a redirect is the response, as before, and the answer names no chain', async () => {
  const target = await startHops();
  const { bridge, relay } = await startBridge();
  try {
    const { body } = await relay({ method: 'GET', url: `${target.url}/hop/3` });
    assert.equal(body.status, 302);
    assert.equal(body.headers.location, '/hop/2');
    assert.equal('chain' in body, false);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('with `follow` the bridge follows each hop and lists it: status, the address that answered, Location as received', async () => {
  const target = await startHops();
  const { bridge, relay } = await startBridge();
  try {
    const { body } = await relay({ method: 'GET', url: `${target.url}/hop/3`, follow: 20, headers: { 'X-Probe': 'kept' } });
    assert.equal(body.status, 200);
    assert.deepEqual(body.chain, [
      { status: 302, url: `${target.url}/hop/3`, location: '/hop/2' },
      { status: 302, url: `${target.url}/hop/2`, location: '/hop/1' },
      { status: 302, url: `${target.url}/hop/1`, location: '/hop/0' },
    ]);
    assert.equal(body.url, `${target.url}/hop/0`);
    assert.equal(JSON.parse(body.body).headers['x-probe'], 'kept');
    assert.equal('stopped' in body, false);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('the bridge follows no more hops than `follow` says, and says it stopped at the limit', async () => {
  const target = await startHops();
  const { bridge, relay } = await startBridge();
  try {
    const { body } = await relay({ method: 'GET', url: `${target.url}/hop/5`, follow: 2 });
    assert.equal(body.status, 302);
    assert.equal(body.headers.location, '/hop/2');
    assert.equal(body.chain.length, 2);
    assert.equal(body.stopped, 'limit');
    assert.equal(body.url, `${target.url}/hop/3`);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('a wrong `follow` or `stayOnHost` is refused with 400, not defaulted', async () => {
  const { bridge, relay } = await startBridge();
  try {
    for (const follow of [21, -1, 1.5, '3', true, null]) {
      const { status } = await relay({ method: 'GET', url: 'http://127.0.0.1:9/', follow });
      assert.equal(status, 400, `follow: ${JSON.stringify(follow)}`);
    }
    for (const stayOnHost of ['yes', 1, null]) {
      const { status } = await relay({ method: 'GET', url: 'http://127.0.0.1:9/', follow: 1, stayOnHost });
      assert.equal(status, 400, `stayOnHost: ${JSON.stringify(stayOnHost)}`);
    }
  } finally {
    await close(bridge);
  }
});

test('@claim:C-063 with `stayOnHost` a hop to another host is not made: the redirect is the response and the answer says why', async () => {
  let reached = 0;
  const other = await startTarget((req, res) => {
    reached += 1;
    res.end('other');
  });
  const target = await startHops({ '/away': { status: 302, headers: { Location: `${other.url}/landing` } } });
  const { bridge, relay } = await startBridge();
  try {
    const { body } = await relay({ method: 'GET', url: `${target.url}/away`, follow: 20, stayOnHost: true, headers: { Authorization: 'Bearer secret' } });
    assert.equal(body.status, 302);
    assert.equal(body.stopped, 'other-host');
    assert.deepEqual(body.chain, []);
    assert.equal(body.headers.location, `${other.url}/landing`);
    assert.equal(reached, 0);
  } finally {
    await close(bridge);
    await close(target.server);
    await close(other.server);
  }
});

test('a hop to another origin is made without Authorization and Cookie; other headers go along', async () => {
  const other = await startHops();
  const target = await startHops({ '/away': { status: 307, headers: { Location: `${other.url}/hop/0` } } });
  const { bridge, relay } = await startBridge();
  try {
    const { body } = await relay({
      method: 'POST',
      url: `${target.url}/away`,
      follow: 20,
      headers: { Authorization: 'Bearer secret', Cookie: 'sid=1', 'X-Probe': 'kept', 'Content-Type': 'text/plain' },
      body: 'payload',
    });
    const received = JSON.parse(body.body);
    assert.equal(body.status, 200);
    assert.equal(received.headers.authorization, undefined);
    assert.equal(received.headers.cookie, undefined);
    assert.equal(received.headers['x-probe'], 'kept');
    // 307 keeps the method and the body.
    assert.equal(received.method, 'POST');
    assert.equal(received.body, 'payload');
  } finally {
    await close(bridge);
    await close(target.server);
    await close(other.server);
  }
});

test('301, 302 and 303 turn a POST into a GET without its body; 307 and 308 keep both', async () => {
  const routes = Object.fromEntries([301, 302, 303, 307, 308].map((status) => [`/s${status}`, { status, headers: { Location: '/hop/0' } }]));
  const target = await startHops(routes);
  const { bridge, relay } = await startBridge();
  try {
    for (const status of [301, 302, 303, 307, 308]) {
      const { body } = await relay({ method: 'POST', url: `${target.url}/s${status}`, follow: 20, headers: { 'Content-Type': 'text/plain' }, body: 'payload' });
      const received = JSON.parse(body.body);
      const kept = status >= 307;
      assert.equal(received.method, kept ? 'POST' : 'GET', String(status));
      assert.equal(received.body, kept ? 'payload' : '', String(status));
      assert.equal(received.headers['content-type'], kept ? 'text/plain' : undefined, String(status));
    }
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('a Location that is not http or https is not followed: the redirect is the response', async () => {
  const target = await startHops({ '/file': { status: 302, headers: { Location: 'file:///etc/passwd' } }, '/none': { status: 302, headers: {} } });
  const { bridge, relay } = await startBridge();
  try {
    const file = (await relay({ method: 'GET', url: `${target.url}/file`, follow: 20 })).body;
    assert.equal(file.status, 302);
    assert.equal(file.stopped, 'location');
    const none = (await relay({ method: 'GET', url: `${target.url}/none`, follow: 20 })).body;
    assert.equal(none.status, 302);
    assert.equal('stopped' in none, false);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('a downgrade from https to http on the same host counts as another host under `stayOnHost`', () => {
  assert.equal(leavesHost(new URL('https://api.test/a'), new URL('http://api.test/b')), true);
  assert.equal(leavesHost(new URL('http://api.test/a'), new URL('https://api.test/b')), false);
  assert.equal(leavesHost(new URL('https://api.test/a'), new URL('https://api.test:8443/b')), true);
  assert.equal(leavesHost(new URL('https://api.test/a'), new URL('https://API.test/b')), false);
});
