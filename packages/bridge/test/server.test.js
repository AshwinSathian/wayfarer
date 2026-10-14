'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
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

/** POSTs a relay request as the page does. */
function relay(port, payload) {
  return fetch(`http://127.0.0.1:${port}/relay`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Wayfarer-Bridge-Token': TOKEN },
    body: JSON.stringify(payload),
  });
}

const b64 = (value) => Buffer.from(value).toString('base64');
const text64 = (value) => Buffer.from(value, 'base64').toString('utf8');

/** Spins up a tiny target server the bridge relays requests to. */
function startTarget(handler) {
  const server = http.createServer(handler);
  return listen(server).then((port) => ({ server, port, url: `http://127.0.0.1:${port}` }));
}

test('sanitizeOutgoingHeaders drops hop-by-hop headers and keeps a repeated name as often as it was given', () => {
  const out = sanitizeOutgoingHeaders([
    ['Authorization', 'Bearer xyz'],
    ['Content-Length', '999'],
    ['Connection', 'keep-alive'],
    ['Host', 'api.internal'],
    ['X-Twice', 'one'],
    ['X-Twice', 'two'],
  ]);
  // A name that repeats is sent as often: Node takes a list of values.
  // A Host of the user's is theirs to send (2.1.0): the target's name is not always the address's.
  assert.deepEqual(out, { Authorization: ['Bearer xyz'], Host: 'api.internal', 'X-Twice': ['one', 'two'] });
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
    assert.equal(body.name, 'wayfarer-bridge');
    // What the page reads (P6.3): no protocol number, no list of capabilities.
    assert.deepEqual(Object.keys(body).sort(), ['name', 'ok', 'version']);
    assert.match(body.version, /^3\.0\./);
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
      body: JSON.stringify({ method: 'GET', url: 'http://example.com', headers: [] }),
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
      body: JSON.stringify({ method: 'GET', url: 'http://example.com', headers: [] }),
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
      body: JSON.stringify({ method: 'GET', url: 'not-a-url', headers: [] }),
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
        headers: [['X-Probe', 'yes']],
      }),
    });
    assert.equal(res.status, 200);
    const envelope = await res.json();
    assert.equal(envelope.status, 200);
    assert.deepEqual(JSON.parse(text64(envelope.bodyB64)), { hello: 'world' });
    assert.equal(envelope.encodedSize, 17);
    assert.equal(envelope.decodedSize, 17);
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
      body: JSON.stringify({ method: 'POST', url: target.url, headers: [], bodyB64: b64(JSON.stringify({ name: 'jane' })) }),
    });
    // The bridge call itself succeeded — it's the *target* that returned 422.
    assert.equal(res.status, 200);
    const envelope = await res.json();
    assert.equal(envelope.status, 422);
    assert.deepEqual(JSON.parse(text64(envelope.bodyB64)), { error: 'validation failed' });
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
      body: JSON.stringify({ method: 'GET', url: 'http://127.0.0.1:1', headers: [] }),
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
      body: JSON.stringify({ method: 'GET', url: `http://127.0.0.1:${targetPort}/big`, headers: [] }),
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

test('the answer lists the headers as received, one entry for each, so that two Set-Cookie headers stay two', async () => {
  const target = await startTarget((req, res) => {
    res.writeHead(200, [
      ['Set-Cookie', 'a=1; Expires=Wed, 14 Oct 2026 00:00:00 GMT; Path=/'],
      ['Set-Cookie', 'b=2; HttpOnly'],
      ['X-Twice', 'one'],
      ['X-Twice', 'two'],
      ['Content-Type', 'text/plain'],
    ]);
    res.end('ok');
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Wayfarer-Bridge-Token': TOKEN },
      body: JSON.stringify({ method: 'GET', url: target.url, headers: [] }),
    });
    const envelope = await res.json();
    const listed = envelope.headers.filter(([name]) => /^(set-cookie|x-twice|content-type)$/i.test(name));
    assert.deepEqual(listed, [
      ['Set-Cookie', 'a=1; Expires=Wed, 14 Oct 2026 00:00:00 GMT; Path=/'],
      ['Set-Cookie', 'b=2; HttpOnly'],
      ['X-Twice', 'one'],
      ['X-Twice', 'two'],
      ['Content-Type', 'text/plain'],
    ]);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

// What the bridge reads (P6.1).

test('a request in the shape an older page wrote is refused: nothing is sent for it', async () => {
  let reached = 0;
  const target = await startTarget((req, res) => {
    reached += 1;
    res.end('ok');
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    // Headers as an object and the body as text, as Local Bridge 1 read them.
    const old = await fetch(`http://127.0.0.1:${port}/relay`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Wayfarer-Bridge-Token': TOKEN },
      body: JSON.stringify({ method: 'GET', url: target.url, headers: { A: '1' }, body: 'x' }),
    });
    assert.equal(old.status, 400);
    assert.match((await old.json()).error, /unknown field: body/);
    assert.equal(old.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(reached, 0);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('a wrong argument is refused with 400, never read as something else', async () => {
  let reached = 0;
  const target = await startTarget((req, res) => {
    reached += 1;
    res.end('ok');
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  const base = { method: 'GET', url: target.url, headers: [] };
  try {
    for (const [wrong, said] of [
      [{ ...base, headers: { A: '1' } }, /headers/],
      [{ ...base, headers: [['A', 1]] }, /headers/],
      [{ ...base, headers: [['A']] }, /headers/],
      [{ method: 'GET', url: target.url }, /headers/],
      [{ ...base, method: 7 }, /method/],
      [{ ...base, method: '' }, /method/],
      [{ ...base, bodyB64: 5 }, /bodyB64/],
      [{ ...base, bodyB64: 'not base64 !' }, /bodyB64/],
      [{ ...base, body: 'text' }, /body/],
      [{ ...base, timeoutMs: '100' }, /timeoutMs/],
      [{ ...base, timeoutMs: 0 }, /timeoutMs/],
      [{ ...base, timeoutMs: 1.5 }, /timeoutMs/],
      [{ ...base, followRedirects: true }, /followRedirects/],
      [[base], /object/],
    ]) {
      const res = await relay(port, wrong);
      assert.equal(res.status, 400, JSON.stringify(wrong));
      assert.match((await res.json()).error, said);
    }
    assert.equal(reached, 0);
    assert.equal((await relay(port, base)).status, 200);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('bytes go out and come back as they are: a body that is no UTF-8, and a type that says text', async () => {
  const bytes = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0xc3, 0x28, 0x0a]);
  const target = await startTarget((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const got = Buffer.concat(chunks);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=iso-8859-1', 'X-Got': got.toString('hex'), 'X-Length': req.headers['content-length'] });
      res.end(got);
    });
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const envelope = await (await relay(port, { method: 'PUT', url: target.url, headers: [['Content-Type', 'application/octet-stream']], bodyB64: bytes.toString('base64') })).json();
    const header = (name) => envelope.headers.find(([key]) => key.toLowerCase() === name)?.[1];
    assert.equal(header('x-got'), bytes.toString('hex'));
    assert.equal(header('x-length'), '7');
    assert.deepEqual(Buffer.from(envelope.bodyB64, 'base64'), bytes);
    assert.equal(envelope.decodedSize, 7);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

for (const [encoding, pack] of [
  ['gzip', zlib.gzipSync],
  ['deflate', zlib.deflateSync],
  ['br', zlib.brotliCompressSync],
]) {
  test(`a ${encoding} response is decoded, with both sizes, and its headers are as the server sent them`, async () => {
    const plain = JSON.stringify({ text: 'compress me '.repeat(200), snowman: '\u2603' });
    const packed = pack(Buffer.from(plain));
    let asked;
    const target = await startTarget((req, res) => {
      asked = req.headers['accept-encoding'];
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': encoding });
      res.end(packed);
    });
    const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
    const port = await listen(bridge);
    try {
      const envelope = await (await relay(port, { method: 'GET', url: target.url, headers: [] })).json();
      // As a browser does: it asks for what it can decode.
      assert.equal(asked, 'gzip, deflate, br');
      assert.equal(text64(envelope.bodyB64), plain);
      assert.equal(envelope.encodedSize, packed.length);
      assert.equal(envelope.decodedSize, Buffer.byteLength(plain));
      assert.ok(envelope.encodedSize < envelope.decodedSize);
      assert.equal(envelope.headers.find(([name]) => name.toLowerCase() === 'content-encoding')?.[1], encoding);
    } finally {
      await close(bridge);
      await close(target.server);
    }
  });
}

test("the request's own Accept-Encoding is sent as it is, and a body that is not what its header says is a 502", async () => {
  let asked;
  const target = await startTarget((req, res) => {
    asked = req.headers['accept-encoding'];
    res.writeHead(200, { 'Content-Encoding': req.url === '/bad' ? 'gzip' : 'identity' });
    res.end('plain text');
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const envelope = await (await relay(port, { method: 'GET', url: target.url, headers: [['Accept-Encoding', 'identity']] })).json();
    assert.equal(asked, 'identity');
    assert.equal(text64(envelope.bodyB64), 'plain text');

    const bad = await relay(port, { method: 'GET', url: `${target.url}/bad`, headers: [] });
    assert.equal(bad.status, 502);
    assert.equal((await bad.json()).error.code, 'RELAY_DECODE_ERROR');
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('a compressed response that decodes to more than the limit is a 502: the limit holds for what is kept, not for what came', async () => {
  // 26 MB of one letter is some 26 kB of gzip.
  const packed = zlib.gzipSync(Buffer.alloc(26 * 1024 * 1024, 'x'));
  assert.ok(packed.length < 1024 * 1024);
  const target = await startTarget((req, res) => {
    res.writeHead(200, { 'Content-Encoding': 'gzip' });
    res.end(packed);
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const res = await relay(port, { method: 'GET', url: target.url, headers: [] });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, 'RELAY_RESPONSE_TOO_LARGE');
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test("the request's timeout is the one that holds: a target that answers after it is a 504", async () => {
  const target = await startTarget((req, res) => {
    const timer = setTimeout(() => res.end('late'), 2000);
    res.on('close', () => clearTimeout(timer));
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    const started = Date.now();
    const res = await relay(port, { method: 'GET', url: target.url, headers: [], timeoutMs: 150 });
    assert.equal(res.status, 504);
    assert.equal((await res.json()).error.code, 'RELAY_TIMEOUT');
    assert.ok(Date.now() - started < 1500);
  } finally {
    target.server.closeAllConnections();
    await close(bridge);
    await close(target.server);
  }
});

test('a header Node refuses to write (a line break in its value, a name that is no token) is a 400, and the bridge goes on', async () => {
  const target = await startTarget((req, res) => res.end('ok'));
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    for (const header of [['X-Split', 'a\r\nX-Injected: 1'], ['Bad Name', '1'], ['', '1']]) {
      const res = await relay(port, { method: 'GET', url: target.url, headers: [header] });
      assert.equal(res.status, 400, JSON.stringify(header));
      assert.match((await res.json()).error, /header/i);
    }
    assert.equal((await relay(port, { method: 'GET', url: target.url, headers: [] })).status, 200);
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

test('a response with no body is not decoded, whatever its Content-Encoding says: HEAD, 204 and 304', async () => {
  const packed = zlib.gzipSync('hello');
  const target = await startTarget((req, res) => {
    if (req.url === '/204' || req.url === '/304') {
      res.writeHead(Number(req.url.slice(1)), { 'Content-Encoding': 'gzip' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': packed.length });
    res.end(req.method === 'HEAD' ? undefined : packed);
  });
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN] });
  const port = await listen(bridge);
  try {
    for (const [method, path, status] of [['HEAD', '/', 200], ['GET', '/204', 204], ['GET', '/304', 304]]) {
      const res = await relay(port, { method, url: `${target.url}${path}`, headers: [] });
      assert.equal(res.status, 200, `${method} ${path}`);
      const envelope = await res.json();
      assert.equal(envelope.status, status);
      assert.equal(envelope.bodyB64, '');
      assert.equal(envelope.encodedSize, 0);
      assert.equal(envelope.decodedSize, 0);
    }
  } finally {
    await close(bridge);
    await close(target.server);
  }
});

// A certificate for localhost and 127.0.0.1, signed by a CA no machine trusts: made once with openssl, for these tests only.
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

/** An HTTPS target whose certificate only `fixtures/ca.pem` vouches for. */
function startTlsTarget(handler) {
  const server = https.createServer({ key: fixture('key.pem'), cert: fixture('cert.pem') }, handler);
  return listen(server).then((port) => ({ server, port, url: `https://127.0.0.1:${port}` }));
}

async function withBridge(options, run) {
  const bridge = createServer({ token: TOKEN, allowedOrigins: [ORIGIN], ...options });
  const port = await listen(bridge);
  try {
    await run(port);
  } finally {
    await close(bridge);
  }
}

test('timings: the answer says how long the connection, the wait for the first byte and the body took', async () => {
  const target = await startTarget((req, res) => {
    setTimeout(() => {
      res.writeHead(200);
      res.write('first');
      setTimeout(() => res.end('last'), 60);
    }, 60);
  });
  try {
    await withBridge({}, async (port) => {
      const body = await (await relay(port, { method: 'GET', url: `${target.url}/slow`, headers: [] })).json();
      assert.equal(text64(body.bodyB64), 'firstlast');
      const { timings } = body;
      for (const [name, value] of Object.entries(timings)) assert.ok(typeof value === 'number' && value >= 0, `${name}: ${value}`);
      assert.ok(Object.keys(timings).every((name) => ['dns', 'tcp', 'tls', 'ttfb', 'content'].includes(name)), Object.keys(timings).join());
      // A connection of its own for every relay, so its making is always measured.
      assert.equal(typeof timings.tcp, 'number');
      assert.equal(timings.tls, undefined);
      assert.ok(timings.ttfb >= 50, `ttfb ${timings.ttfb}`);
      assert.ok(timings.content >= 50, `content ${timings.content}`);
      const again = await (await relay(port, { method: 'GET', url: `${target.url}/slow`, headers: [] })).json();
      assert.equal(typeof again.timings.tcp, 'number');
    });
  } finally {
    await close(target.server);
  }
});

test('tls.insecure: a certificate nobody vouches for is a 502, and is accepted for the one request that says so', async () => {
  const target = await startTlsTarget((req, res) => res.end('over tls'));
  try {
    await withBridge({}, async (port) => {
      const refused = await relay(port, { method: 'GET', url: target.url, headers: [] });
      assert.equal(refused.status, 502);
      assert.match((await refused.json()).error.code, /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED|UNABLE_TO_GET_ISSUER_CERT/);

      const accepted = await relay(port, { method: 'GET', url: target.url, headers: [], tls: { insecure: true } });
      assert.equal(accepted.status, 200);
      const body = await accepted.json();
      assert.equal(text64(body.bodyB64), 'over tls');
      assert.equal(typeof body.timings.tls, 'number');

      // It held for that request alone.
      assert.equal((await relay(port, { method: 'GET', url: target.url, headers: [] })).status, 502);

      for (const tls of [true, 'insecure', { insecure: 'yes' }, { insecure: 1 }, { insecure: true, ca: 'x' }, [], null]) {
        const wrong = await relay(port, { method: 'GET', url: target.url, headers: [], tls });
        assert.equal(wrong.status, 400, JSON.stringify(tls));
      }
    });
  } finally {
    await close(target.server);
  }
});

test('--ca: a certificate signed by the given authority is verified and accepted, and the public authorities still are', async () => {
  const target = await startTlsTarget((req, res) => res.end('vouched for'));
  try {
    await withBridge({ ca: fixture('ca.pem') }, async (port) => {
      const res = await relay(port, { method: 'GET', url: target.url, headers: [] });
      assert.equal(res.status, 200);
      assert.equal(text64((await res.json()).bodyB64), 'vouched for');
    });
    // The given authority is added to Node's own, it does not replace them.
    const { tlsOptions } = require('../src/server');
    const { ca } = tlsOptions(fixture('ca.pem'));
    assert.ok(ca.length > 50, `${ca.length} authorities`);
    assert.equal(ca.at(-1), fixture('ca.pem'));
    assert.deepEqual(tlsOptions(undefined), {});
  } finally {
    await close(target.server);
  }
});

test("a Host of the user's is sent as written", async () => {
  const seen = [];
  const target = await startTarget((req, res) => {
    seen.push(req.headers.host);
    res.end('ok');
  });
  try {
    await withBridge({}, async (port) => {
      await relay(port, { method: 'GET', url: target.url, headers: [['Host', 'api.internal']] });
      await relay(port, { method: 'GET', url: target.url, headers: [] });
      // Two would be two answers to "which site": refused, not chosen between.
      assert.equal((await relay(port, { method: 'GET', url: target.url, headers: [['Host', 'a.internal'], ['host', 'b.internal']] })).status, 400);
    });
    assert.deepEqual(seen, ['api.internal', `127.0.0.1:${target.port}`]);
  } finally {
    await close(target.server);
  }
});

/** A forward proxy: answers a plain request itself, and tunnels a CONNECT to where it says. */
function startProxy() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.end('from the proxy');
  });
  server.on('connect', (req, socket, head) => {
    seen.push(`CONNECT ${req.url}`);
    const [host, port] = req.url.split(':');
    const upstream = net.connect(Number(port), host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    // When either side is done the tunnel is: a half-open one would keep this server from closing.
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
  });
  return listen(server).then((port) => ({ server, seen, url: `http://127.0.0.1:${port}` }));
}

test('HTTP_PROXY, HTTPS_PROXY and NO_PROXY are honoured: a request goes through the proxy, an https one through its tunnel, and a host that is excepted goes direct', async () => {
  const proxy = await startProxy();
  const target = await startTarget((req, res) => res.end('from the target'));
  const secure = await startTlsTarget((req, res) => res.end('from the tls target'));
  try {
    await withBridge({ env: { HTTP_PROXY: proxy.url, HTTPS_PROXY: proxy.url }, ca: fixture('ca.pem') }, async (port) => {
      const plain = await (await relay(port, { method: 'GET', url: 'http://wayfarer.invalid/x', headers: [] })).json();
      assert.equal(text64(plain.bodyB64), 'from the proxy');
      const tunnelled = await (await relay(port, { method: 'GET', url: secure.url, headers: [] })).json();
      assert.equal(text64(tunnelled.bodyB64), 'from the tls target');
    });
    assert.deepEqual(proxy.seen, ['GET http://wayfarer.invalid/x', `CONNECT 127.0.0.1:${secure.port}`]);

    // Through the tunnel the target's certificate is still verified.
    await withBridge({ env: { HTTPS_PROXY: proxy.url } }, async (port) => {
      assert.equal((await relay(port, { method: 'GET', url: secure.url, headers: [] })).status, 502);
      assert.equal((await relay(port, { method: 'GET', url: secure.url, headers: [], tls: { insecure: true } })).status, 200);
    });

    proxy.seen.length = 0;
    await withBridge({ env: { http_proxy: proxy.url, NO_PROXY: '127.0.0.1' } }, async (port) => {
      const direct = await (await relay(port, { method: 'GET', url: target.url, headers: [] })).json();
      assert.equal(text64(direct.bodyB64), 'from the target');
    });
    assert.deepEqual(proxy.seen, []);

    // No variable, no proxy.
    await withBridge({ env: {} }, async (port) => {
      assert.equal(text64((await (await relay(port, { method: 'GET', url: target.url, headers: [] })).json()).bodyB64), 'from the target');
    });
    assert.deepEqual(proxy.seen, []);
  } finally {
    await close(proxy.server);
    await close(target.server);
    await close(secure.server);
  }
});

test('a preflight that asks for the private network is told yes, for an allowed origin only (PNA)', async () => {
  await withBridge({}, async (port) => {
    const ask = (origin) => fetch(`http://127.0.0.1:${port}/relay`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Private-Network': 'true', 'Access-Control-Request-Method': 'POST' } });
    const allowed = await ask(ORIGIN);
    assert.equal(allowed.headers.get('access-control-allow-private-network'), 'true');
    assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal((await ask('https://evil.example.com')).headers.get('access-control-allow-private-network'), null);
    // A preflight that does not ask is not told.
    const plain = await fetch(`http://127.0.0.1:${port}/relay`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    assert.equal(plain.headers.get('access-control-allow-private-network'), null);
  });
});

/** A GET or POST over HTTPS that trusts the test authority, as a browser trusts a certificate the user installed. */
function overTls(port, { method = 'GET', path: target = '/health', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: '127.0.0.1', servername: 'localhost', port, method, path: target, ca: fixture('ca.pem'), headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('HTTPS on loopback: with a certificate given the bridge speaks HTTPS only, and its rules hold the same', async () => {
  await withBridge({ tls: { cert: fixture('cert.pem'), key: fixture('key.pem') } }, async (port) => {
    const health = await overTls(port);
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.text).name, 'wayfarer-bridge');
    // The Host rule and the token rule are the same over HTTPS.
    assert.equal((await overTls(port, { headers: { Host: 'rebound.example.com' } })).status, 421);
    assert.equal((await overTls(port, { method: 'POST', path: '/relay', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    // Plain HTTP is not answered.
    await assert.rejects(fetch(`http://127.0.0.1:${port}/health`));
  });
});

const pair = (port, body, origin = ORIGIN) =>
  fetch(`http://127.0.0.1:${port}/pair`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('pairing: the code from the terminal is exchanged once for the token, from an allowed origin; written with a dash or in lower case it is the same code', async () => {
  await withBridge({ pairing: { code: 'ABCD2345' } }, async (port) => {
    assert.equal((await pair(port, { code: 'ABCD2345' }, 'https://evil.example.com')).status, 403);
    const paired = await pair(port, { code: 'abcd-2345' });
    assert.equal(paired.status, 200);
    assert.equal(paired.headers.get('access-control-allow-origin'), ORIGIN);
    assert.deepEqual(await paired.json(), { token: TOKEN });
    // Once.
    const again = await pair(port, { code: 'ABCD2345' });
    assert.equal(again.status, 410);
    assert.match((await again.json()).error, /used/);
  });
  // A bridge started with no code has no pairing.
  await withBridge({}, async (port) => assert.equal((await pair(port, { code: 'ABCD2345' })).status, 410));
});

test('pairing with a wrong code 3 times locks pairing for 60 s, the right code included; then it may be tried again', async () => {
  let now = 1_000_000;
  await withBridge({ pairing: { code: 'ABCD2345' }, clock: () => now }, async (port) => {
    for (let i = 0; i < 3; i += 1) assert.equal((await pair(port, { code: 'WRONG234' })).status, 401);
    const locked = await pair(port, { code: 'ABCD2345' });
    assert.equal(locked.status, 429);
    assert.equal(locked.headers.get('retry-after'), '60');
    now += 59_000;
    assert.equal((await pair(port, { code: 'ABCD2345' })).status, 429);
    now += 1_000;
    // The lock is over, and the count starts again.
    assert.equal((await pair(port, { code: 'WRONG234' })).status, 401);
    assert.equal((await pair(port, { code: 'ABCD2345' })).status, 200);
  });
});

test('a pairing request of the wrong shape is a 400 and not a try', async () => {
  await withBridge({ pairing: { code: 'ABCD2345' } }, async (port) => {
    for (const body of [{}, { code: 1 }, { code: 'ABCD2345', token: 'x' }, [], 'ABCD2345', { code: 'x'.repeat(100) }]) {
      assert.equal((await pair(port, body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await pair(port, { code: 'ABCD2345' })).status, 200);
  });
});
