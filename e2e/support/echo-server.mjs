#!/usr/bin/env node
// Deterministic target for e2e (P1.2): no test talks to the internet. Listens
// on 127.0.0.1:4300 and on a second origin, 127.0.0.1:4301, for cross-origin
// cases. Zero dependencies.
//
// Native routes:
//   /echo                          reflects method, url, headers, body (base64 when not UTF-8)
//   /content/:type                 json | html | xml | text | csv | png | octet | js
//   /redirect/:n                   302 chain of n hops, then /echo
//   /cookies/set?name=value        Set-Cookie per query param (one header each)
//   /gzip, /deflate                compressed JSON
//   /delay/:ms                     responds after ms milliseconds
//   /status/:code                  that status, JSON body
//   /cors/{none,simple,full,no-expose}
//   /sse?count=5                   text/event-stream, honours Last-Event-ID
//   /ws                            WebSocket echo (text and binary)
//   /oauth/authorize, /oauth/token mock IdP: auth code + PKCE (S256),
//                                  client_credentials, password, refresh_token
//   /big/:mb                       mb MiB of bytes, streamed
// Postman Echo–compatible routes live under /pm/ (see rewritePostmanEcho).
//
// CORS: every route except /cors/* answers with a permissive policy
// (origin reflected, credentials allowed, all response headers exposed).
//
// Usage: node e2e/support/echo-server.mjs [port] [secondPort]
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { deflateSync, gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const ECHO_PORT = 4300;
const ECHO_SECOND_PORT = 4301;
const MAX_BIG_MB = 100;
const MAX_DELAY_MS = 60_000;
const MAX_WS_FRAME = 16 << 20;

/** A request-supplied integer, clamped to [min, max]; `fallback` when absent or not a number. */
function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/**
 * Newman's integration collections target postman-echo.com. Fixture loaders
 * rewrite them here; Postman Echo's `/delay/:s` takes seconds while the
 * native `/delay/:ms` takes milliseconds, hence the separate /pm/ prefix.
 */
export function rewritePostmanEcho(url, base = `http://127.0.0.1:${ECHO_PORT}`) {
  return url.replace(/^https?:\/\/postman-echo\.com(?=[/?#]|$)/i, `${base}/pm`);
}

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const CONTENT = {
  json: ["application/json; charset=utf-8", '{"userId":1,"id":1,"title":"echo fixture","completed":false}'],
  html: ["text/html; charset=utf-8", "<!doctype html><html><head><title>Echo</title></head><body><h1>Echo fixture</h1></body></html>"],
  xml: ["application/xml; charset=utf-8", '<?xml version="1.0"?><fixture><name>echo</name></fixture>'],
  text: ["text/plain; charset=utf-8", "echo fixture\n"],
  csv: ["text/csv; charset=utf-8", "id,name\n1,echo\n"],
  js: ["text/javascript; charset=utf-8", "console.log('echo fixture');\n"],
  png: ["image/png", PNG],
  octet: ["application/octet-stream", Buffer.from([0, 1, 2, 3, 254, 255])],
};

// Mock IdP state. Per process; tests use unique client ids / states.
const authCodes = new Map(); // code -> { clientId, redirectUri, challenge, scope }
const refreshTokens = new Map(); // token -> { clientId, scope }

function corsHeaders(req) {
  const origin = req.headers.origin;
  return {
    "access-control-allow-origin": origin ?? "*",
    ...(origin ? { "access-control-allow-credentials": "true", vary: "Origin" } : {}),
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, PURGE",
    "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
    "access-control-expose-headers": "*",
    "access-control-max-age": "0",
    "timing-allow-origin": "*",
  };
}

function send(res, status, headers, body = "") {
  res.writeHead(status, headers);
  res.end(res.req.method === "HEAD" ? undefined : body);
}

function json(res, status, value, headers = {}) {
  send(res, status, { "content-type": "application/json; charset=utf-8", ...headers }, JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function reflect(req, url, body) {
  const text = body.toString("utf8");
  const utf8 = Buffer.from(text, "utf8").equals(body);
  return {
    method: req.method,
    url: url.pathname + url.search,
    query: Object.fromEntries(url.searchParams),
    // rawHeaders keeps duplicates and order; names lower-cased for easy asserts.
    headers: pairs(req.rawHeaders).map(([name, value]) => [name.toLowerCase(), value]),
    body: utf8 ? text : null,
    bodyBase64: utf8 ? null : body.toString("base64"),
    bodySize: body.length,
  };
}

function pairs(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

function parseForm(body) {
  return Object.fromEntries(new URLSearchParams(body.toString("utf8")));
}

function b64url(buffer) {
  return buffer.toString("base64url");
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const path = url.pathname;
  const body = await readBody(req);

  if (path.startsWith("/cors/")) return corsRoute(req, res, path.slice(6));
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return send(res, 204, cors);
  if (path.startsWith("/pm/")) return postmanEcho(req, res, url, body, cors);

  let m;
  if (path === "/echo") return json(res, 200, reflect(req, url, body), cors);
  if ((m = /^\/content\/(\w+)$/.exec(path))) {
    const entry = CONTENT[m[1]];
    if (!entry) return json(res, 404, { error: `unknown content type ${m[1]}` }, cors);
    return send(res, 200, { ...cors, "content-type": entry[0] }, entry[1]);
  }
  if ((m = /^\/redirect\/(\d+)$/.exec(path))) {
    const n = Number(m[1]);
    return send(res, 302, { ...cors, location: n > 1 ? `/redirect/${n - 1}` : "/echo" });
  }
  if (path === "/cookies/set") {
    const cookies = [...url.searchParams].map(([k, v]) => `${k}=${v}; Path=/; SameSite=Lax`);
    return json(res, 200, { set: Object.fromEntries(url.searchParams) }, { ...cors, "set-cookie": cookies });
  }
  if (path === "/gzip") {
    return send(res, 200, { ...cors, "content-type": "application/json", "content-encoding": "gzip" }, gzipSync(JSON.stringify({ gzipped: true })));
  }
  if (path === "/deflate") {
    return send(res, 200, { ...cors, "content-type": "application/json", "content-encoding": "deflate" }, deflateSync(JSON.stringify({ deflated: true })));
  }
  if ((m = /^\/delay\/(\d+)$/.exec(path))) {
    const ms = clampInt(m[1], 0, MAX_DELAY_MS, 0);
    const timer = setTimeout(() => json(res, 200, { delayMs: ms }, cors), ms);
    res.on("close", () => clearTimeout(timer));
    return;
  }
  if ((m = /^\/status\/(\d{3})$/.exec(path))) return json(res, Number(m[1]), { status: Number(m[1]) }, cors);
  if (path === "/sse") return sse(req, res, url, cors);
  if (path === "/oauth/authorize") return authorize(res, url, cors);
  if (path === "/oauth/token") return token(res, body, cors);
  if ((m = /^\/big\/(\d+)$/.exec(path))) return big(res, clampInt(m[1], 0, MAX_BIG_MB, 0), cors);
  return json(res, 404, { error: "not found", path }, cors);
}

function corsRoute(req, res, variant) {
  const origin = req.headers.origin ?? "*";
  const custom = { "x-custom": "visible-with-expose", "content-type": "application/json" };
  const base = { "access-control-allow-origin": origin };
  const policies = {
    // No CORS headers at all: the browser blocks reading the response.
    none: {},
    // ACAO only: simple requests succeed; preflighted ones fail.
    simple: base,
    // Everything, including preflight answers, exposed headers and Timing-Allow-Origin.
    full: {
      ...base,
      "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
      "access-control-expose-headers": "x-custom",
      "timing-allow-origin": "*",
    },
    // Readable, preflight allowed, but x-custom is not exposed.
    "no-expose": {
      ...base,
      "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
    },
  };
  const policy = policies[variant];
  if (!policy) return json(res, 404, { error: `unknown cors variant ${variant}` });
  if (req.method === "OPTIONS") {
    const preflightOk = variant === "full" || variant === "no-expose";
    return send(res, 204, preflightOk ? policy : variant === "simple" ? base : {});
  }
  return send(res, 200, { ...custom, ...policy }, JSON.stringify({ cors: variant }));
}

function sse(req, res, url, cors) {
  const count = clampInt(url.searchParams.get("count"), 1, 1000, 5);
  const interval = clampInt(url.searchParams.get("interval"), 1, 10_000, 50);
  const lastId = clampInt(req.headers["last-event-id"], 0, 1e9, 0);
  res.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-store" });
  let id = lastId;
  const timer = setInterval(() => {
    id += 1;
    res.write(`id: ${id}\nevent: tick\ndata: ${JSON.stringify({ n: id })}\n\n`);
    if (id >= lastId + count) {
      clearInterval(timer);
      res.end();
    }
  }, interval);
  res.on("close", () => clearInterval(timer));
}

function authorize(res, url, cors) {
  const q = url.searchParams;
  const redirectUri = q.get("redirect_uri");
  if (q.get("response_type") !== "code" || !redirectUri || !q.get("client_id")) {
    return json(res, 400, { error: "invalid_request" }, cors);
  }
  const code = b64url(randomBytes(16));
  authCodes.set(code, {
    clientId: q.get("client_id"),
    redirectUri,
    challenge: q.get("code_challenge"),
    method: q.get("code_challenge_method") ?? "plain",
    scope: q.get("scope") ?? "",
  });
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (q.has("state")) target.searchParams.set("state", q.get("state"));
  return send(res, 302, { ...cors, location: target.href });
}

function issue(res, cors, clientId, scope) {
  const refresh = b64url(randomBytes(16));
  refreshTokens.set(refresh, { clientId, scope });
  return json(
    res,
    200,
    { access_token: `at-${b64url(randomBytes(12))}`, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope },
    { ...cors, "cache-control": "no-store" }
  );
}

function token(res, body, cors) {
  const form = parseForm(body);
  const fail = (error) => json(res, 400, { error }, cors);
  switch (form.grant_type) {
    case "authorization_code": {
      const grant = authCodes.get(form.code);
      authCodes.delete(form.code); // single use
      if (!grant || grant.redirectUri !== form.redirect_uri || grant.clientId !== form.client_id) return fail("invalid_grant");
      if (grant.challenge) {
        const verifier = form.code_verifier ?? "";
        const derived = grant.method === "S256" ? b64url(createHash("sha256").update(verifier).digest()) : verifier;
        if (derived !== grant.challenge) return fail("invalid_grant");
      }
      return issue(res, cors, grant.clientId, grant.scope);
    }
    case "client_credentials":
      if (!form.client_id || !form.client_secret) return fail("invalid_client");
      return issue(res, cors, form.client_id, form.scope ?? "");
    case "password":
      if (!form.username || form.password !== "correct-password") return fail("invalid_grant");
      return issue(res, cors, form.client_id ?? "", form.scope ?? "");
    case "refresh_token": {
      const grant = refreshTokens.get(form.refresh_token);
      refreshTokens.delete(form.refresh_token); // rotation: old token is spent
      if (!grant) return fail("invalid_grant");
      return issue(res, cors, grant.clientId, grant.scope);
    }
    default:
      return fail("unsupported_grant_type");
  }
}

function big(res, mb, cors) {
  const chunk = Buffer.alloc(1 << 20, 0x61); // 1 MiB of "a"
  res.writeHead(200, { ...cors, "content-type": "application/octet-stream", "content-length": String(mb << 20) });
  if (res.req.method === "HEAD") return res.end();
  let sent = 0;
  const pump = () => {
    while (sent < mb) {
      sent += 1;
      if (!res.write(chunk)) return res.once("drain", pump);
    }
    res.end();
  };
  pump();
}

// Postman Echo–compatible subset used by Newman's integration collections,
// with the same JSON response shapes.
function postmanEcho(req, res, url, body, cors) {
  const path = url.pathname.slice(3); // strip "/pm"
  const args = Object.fromEntries(url.searchParams);
  const headers = Object.fromEntries(pairs(req.rawHeaders).map(([k, v]) => [k.toLowerCase(), v]));
  const fullUrl = `https://postman-echo.com${path}${url.search}`;
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, v.join("=")])
  );
  let m;

  const methodRoute = /^\/(get|post|put|patch|delete)$/.exec(path);
  if (methodRoute) {
    if (req.method.toLowerCase() !== methodRoute[1]) return json(res, 404, { error: "not found" }, cors);
    const out = { args, headers, url: fullUrl };
    if (methodRoute[1] !== "get") {
      const type = req.headers["content-type"] ?? "";
      const text = body.toString("utf8");
      let parsed = null;
      if (/json/.test(type)) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null; // Postman Echo reports unparseable JSON as data text, json null
        }
      }
      Object.assign(out, {
        data: /json/.test(type) ? parsed ?? text : /x-www-form-urlencoded/.test(type) ? "" : text,
        files: {},
        form: /x-www-form-urlencoded/.test(type) ? parseForm(body) : {},
        json: /x-www-form-urlencoded/.test(type) ? parseForm(body) : parsed,
      });
    }
    return json(res, 200, out, cors);
  }
  if (path === "/headers") return json(res, 200, { headers }, cors);
  if (path === "/response-headers") return json(res, 200, args, { ...cors, ...args });
  if (path === "/cookies") return json(res, 200, { cookies }, cors);
  if (path === "/cookies/set") {
    const set = [...url.searchParams].map(([k, v]) => `${k}=${v}; Path=/`);
    return send(res, 302, { ...cors, location: "/pm/cookies", "set-cookie": set });
  }
  if (path === "/cookies/delete") {
    const expired = [...url.searchParams.keys()].map((k) => `${k}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    return send(res, 302, { ...cors, location: "/pm/cookies", "set-cookie": expired });
  }
  if (path === "/basic-auth") {
    const ok = req.headers.authorization === `Basic ${Buffer.from("postman:password").toString("base64")}`;
    return ok ? json(res, 200, { authenticated: true }, cors) : send(res, 401, { ...cors, "www-authenticate": 'Basic realm="Users"' }, "Unauthorized");
  }
  if ((m = /^\/status\/(\d{3})$/.exec(path))) return json(res, Number(m[1]), { status: Number(m[1]) }, cors);
  if ((m = /^\/delay\/(\d+)$/.exec(path))) {
    const seconds = clampInt(m[1], 0, 10, 0);
    const timer = setTimeout(() => json(res, 200, { delay: m[1] }, cors), seconds * 1000);
    res.on("close", () => clearTimeout(timer));
    return;
  }
  if (path === "/gzip") {
    return send(res, 200, { ...cors, "content-type": "application/json", "content-encoding": "gzip" }, gzipSync(JSON.stringify({ gzipped: true, headers, method: req.method })));
  }
  if (path === "/deflate") {
    return send(res, 200, { ...cors, "content-type": "application/json", "content-encoding": "deflate" }, deflateSync(JSON.stringify({ deflated: true, headers, method: req.method })));
  }
  if (path === "/encoding/utf8") {
    return send(res, 200, { ...cors, "content-type": "text/html; charset=utf-8" }, "<h1>Unicode Demo</h1><p>∮ E⋅da = Q, ⌈x⌉ = −⌊−x⌋, 𝄞 ǅ ÅΩ</p>");
  }
  return json(res, 404, { error: "not found", path }, cors);
}

// Minimal RFC 6455 echo: enough for the /ws e2e (text, binary, ping, close).
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function upgrade(req, socket) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const key = req.headers["sec-websocket-key"];
  if (url.pathname !== "/ws" || !key) return socket.destroy();
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  const protocol = (req.headers["sec-websocket-protocol"] ?? "").split(",")[0].trim();
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n${protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : ""}\r\n`
  );
  let buffer = Buffer.alloc(0);
  socket.on("data", (data) => {
    buffer = Buffer.concat([buffer, data]);
    for (;;) {
      let frame;
      try {
        frame = readFrame(buffer);
      } catch (error) {
        console.error("echo-server: /ws", error.message);
        socket.destroy();
        return;
      }
      if (!frame) break;
      buffer = buffer.subarray(frame.length);
      if (frame.opcode === 0x8) {
        socket.end(writeFrame(0x8, frame.payload.subarray(0, 2)));
        return;
      }
      if (frame.opcode === 0x9) socket.write(writeFrame(0xa, frame.payload));
      else if (frame.opcode === 0x1 || frame.opcode === 0x2) socket.write(writeFrame(frame.opcode, frame.payload));
    }
  });
  socket.on("error", () => socket.destroy());
}

function readFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  if (len > MAX_WS_FRAME) throw new RangeError(`WebSocket frame over ${MAX_WS_FRAME} bytes`);
  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + len) return null;
  const mask = masked ? buf.subarray(offset, offset + 4) : null;
  const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  return { opcode, payload, length: offset + maskLen + len };
}

function writeFrame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (len >= 126 && len < 65536) {
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else if (len >= 65536) {
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

export function startEchoServer(port = ECHO_PORT, host = "127.0.0.1") {
  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error("echo-server:", error);
      if (!res.headersSent) json(res, 500, { error: String(error) });
      else res.destroy();
    });
  });
  server.on("upgrade", upgrade);
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const ports = [Number(process.argv[2] ?? ECHO_PORT), Number(process.argv[3] ?? ECHO_SECOND_PORT)];
  for (const port of ports) {
    await startEchoServer(port);
    console.log(`echo-server: http://127.0.0.1:${port}`);
  }
}
