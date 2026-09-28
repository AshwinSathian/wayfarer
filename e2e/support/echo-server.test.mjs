// Contract tests for the e2e echo-server (P1.2). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rewritePostmanEcho, startEchoServer } from "./echo-server.mjs";

const server = await startEchoServer(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const get = (path, init) => fetch(`${BASE}${path}`, init);

test("/echo reflects method, duplicate headers in order, and the body", async () => {
  const headers = new Headers([["x-dup", "a"], ["content-type", "text/plain"]]);
  headers.append("x-dup", "b");
  const res = await get("/echo?q=1", { method: "PURGE", headers, body: "hello" });
  const echo = await res.json();
  assert.equal(echo.method, "PURGE");
  assert.equal(echo.url, "/echo?q=1");
  assert.equal(echo.body, "hello");
  assert.ok(echo.headers.some(([k, v]) => k === "x-dup" && v === "a, b"));
});

test("/echo returns non-UTF-8 bodies as base64", async () => {
  const echo = await (await get("/echo", { method: "POST", body: new Uint8Array([0xff, 0x00, 0xfe]) })).json();
  assert.equal(echo.body, null);
  assert.equal(echo.bodyBase64, Buffer.from([0xff, 0x00, 0xfe]).toString("base64"));
});

test("/content/:type serves each fixture type", async () => {
  for (const [type, mime] of [["json", "application/json"], ["html", "text/html"], ["xml", "application/xml"], ["text", "text/plain"], ["png", "image/png"]]) {
    const res = await get(`/content/${type}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), new RegExp(mime));
  }
  assert.equal((await get("/content/nope")).status, 404);
});

test("/redirect/:n follows n hops to /echo", async () => {
  const res = await get("/redirect/3");
  assert.equal(res.redirected, true);
  assert.equal(new URL(res.url).pathname, "/echo");
  const manual = await get("/redirect/3", { redirect: "manual" });
  assert.equal(manual.status, 302);
  assert.equal(manual.headers.get("location"), "/redirect/2");
});

test("/cookies/set sends one Set-Cookie header per cookie", async () => {
  const res = await get("/cookies/set?a=1&b=2");
  assert.deepEqual(res.headers.getSetCookie().map((c) => c.split(";")[0]), ["a=1", "b=2"]);
});

test("/gzip and /deflate are compressed and decode", async () => {
  const gz = await get("/gzip");
  assert.equal(gz.headers.get("content-encoding"), "gzip");
  assert.deepEqual(await gz.json(), { gzipped: true });
  assert.deepEqual(await (await get("/deflate")).json(), { deflated: true });
});

test("/delay/:ms waits at least that long", async () => {
  const start = Date.now();
  assert.deepEqual(await (await get("/delay/150")).json(), { delayMs: 150 });
  assert.ok(Date.now() - start >= 140);
});

test("/status/:code returns that status", async () => {
  assert.equal((await get("/status/418")).status, 418);
});

test("/cors variants send the documented headers", async () => {
  const origin = { origin: "http://localhost:4200" };
  assert.equal((await get("/cors/none", { headers: origin })).headers.get("access-control-allow-origin"), null);
  const simple = await get("/cors/simple", { headers: origin });
  assert.equal(simple.headers.get("access-control-allow-origin"), "http://localhost:4200");
  assert.equal(simple.headers.get("timing-allow-origin"), null);
  const simplePreflight = await get("/cors/simple", { method: "OPTIONS", headers: { ...origin, "access-control-request-method": "PUT" } });
  assert.equal(simplePreflight.headers.get("access-control-allow-methods"), null);
  const full = await get("/cors/full", { headers: origin });
  assert.equal(full.headers.get("access-control-expose-headers"), "x-custom");
  assert.equal(full.headers.get("timing-allow-origin"), "*");
  const noExpose = await get("/cors/no-expose", { headers: origin });
  assert.equal(noExpose.headers.get("access-control-expose-headers"), null);
  assert.equal(noExpose.headers.get("x-custom"), "visible-with-expose");
});

test("/sse emits count events and resumes after Last-Event-ID", async () => {
  const text = await (await get("/sse?count=3&interval=1")).text();
  assert.deepEqual([...text.matchAll(/^id: (\d+)$/gm)].map((m) => m[1]), ["1", "2", "3"]);
  const resumed = await (await get("/sse?count=2&interval=1", { headers: { "last-event-id": "7" } })).text();
  assert.deepEqual([...resumed.matchAll(/^id: (\d+)$/gm)].map((m) => m[1]), ["8", "9"]);
});

test("/oauth: auth code + PKCE, single-use code, refresh rotation", async () => {
  const verifier = "v".repeat(50);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({ response_type: "code", client_id: "c1", redirect_uri: "http://localhost:4200/oauth/callback", state: "s1", code_challenge: challenge, code_challenge_method: "S256" });
  const auth = await get(`/oauth/authorize?${q}`, { redirect: "manual" });
  const callback = new URL(auth.headers.get("location"));
  assert.equal(callback.searchParams.get("state"), "s1");
  const code = callback.searchParams.get("code");
  const exchange = (verifierValue) =>
    get("/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: "c1", redirect_uri: "http://localhost:4200/oauth/callback", code_verifier: verifierValue }) });

  const tokens = await (await exchange(verifier)).json();
  assert.match(tokens.access_token, /^at-/);
  assert.equal((await exchange(verifier)).status, 400, "codes are single use");

  const refresh = (t) => get("/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t }) });
  assert.equal((await refresh(tokens.refresh_token)).status, 200);
  assert.equal((await refresh(tokens.refresh_token)).status, 400, "refresh tokens rotate");
});

test("/oauth: wrong PKCE verifier, client_credentials and password grants", async () => {
  const q = new URLSearchParams({ response_type: "code", client_id: "c2", redirect_uri: "http://x.test/cb", code_challenge: "abc", code_challenge_method: "S256" });
  const code = new URL((await get(`/oauth/authorize?${q}`, { redirect: "manual" })).headers.get("location")).searchParams.get("code");
  const bad = await get("/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: "c2", redirect_uri: "http://x.test/cb", code_verifier: "wrong" }) });
  assert.equal(bad.status, 400);
  const cc = await get("/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "client_credentials", client_id: "c", client_secret: "s" }) });
  assert.equal(cc.status, 200);
  const pw = await get("/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "password", username: "u", password: "correct-password" }) });
  assert.equal(pw.status, 200);
});

test("/big/:mb streams exactly that many MiB", async () => {
  const buf = await (await get("/big/2")).arrayBuffer();
  assert.equal(buf.byteLength, 2 << 20);
});

test("/ws echoes text in order", { skip: typeof WebSocket === "undefined" && "needs Node 22 global WebSocket" }, async () => {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws`, ["chat"]);
  const received = [];
  await new Promise((resolve, reject) => {
    ws.onopen = () => ["one", "two", "x".repeat(70_000)].forEach((m) => ws.send(m));
    ws.onmessage = (event) => {
      received.push(event.data);
      if (received.length === 3) resolve();
    };
    ws.onerror = reject;
  });
  assert.equal(ws.protocol, "chat");
  assert.deepEqual(received.map((m) => m.length), [3, 3, 70_000]);
  ws.close(1000);
});

test("Postman Echo routes under /pm keep Postman's response shapes", async () => {
  const getRes = await (await get("/pm/get?foo=bar")).json();
  assert.deepEqual(getRes.args, { foo: "bar" });
  assert.equal(getRes.url, "https://postman-echo.com/get?foo=bar");
  const post = await (await get("/pm/post", { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}' })).json();
  assert.deepEqual(post.json, { a: 1 });
  const form = await (await get("/pm/post", { method: "POST", body: new URLSearchParams({ k: "v" }) })).json();
  assert.deepEqual(form.form, { k: "v" });
  assert.equal((await get("/pm/basic-auth")).status, 401);
  const auth = await get("/pm/basic-auth", { headers: { authorization: `Basic ${Buffer.from("postman:password").toString("base64")}` } });
  assert.deepEqual(await auth.json(), { authenticated: true });
  assert.equal((await get("/pm/response-headers?x-foo=bar")).headers.get("x-foo"), "bar");
  const cookies = await get("/pm/cookies/set?c=1", { redirect: "manual" });
  assert.equal(cookies.headers.get("location"), "/pm/cookies");
  assert.deepEqual(await (await get("/pm/cookies", { headers: { cookie: "c=1; d=2" } })).json(), { cookies: { c: "1", d: "2" } });
  assert.match(await (await get("/pm/encoding/utf8")).text(), /𝄞/);
  assert.deepEqual(await (await get("/pm/delay/0")).json(), { delay: "0" });
  assert.equal((await get("/pm/status/201")).status, 201);
  assert.equal((await get("/pm/get", { method: "POST" })).status, 404);
});

test("rewritePostmanEcho points postman-echo.com at /pm and leaves lookalikes alone", () => {
  assert.equal(rewritePostmanEcho("https://postman-echo.com/get?x=1"), "http://127.0.0.1:4300/pm/get?x=1");
  assert.equal(rewritePostmanEcho("http://POSTMAN-ECHO.com"), "http://127.0.0.1:4300/pm");
  assert.equal(rewritePostmanEcho("https://postman-echo.com.evil.test/get"), "https://postman-echo.com.evil.test/get");
});
