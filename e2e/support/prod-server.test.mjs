// Unit tests for the `_headers` parser in prod-server.mjs (P1.1), covering
// the rule shapes Cloudflare documents for Workers static assets
// (https://developers.cloudflare.com/workers/static-assets/headers/):
// exact paths, splats, and :placeholders, plus absolute-URL rules, detaching
// with `! Name`, and multiple matching rules. Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { encodingFor, headersFor, parseHeadersFile, startServer } from "./prod-server.mjs";

const URL_BASE = "http://localhost:4200";
const apply = (text, path) => Object.fromEntries(headersFor(parseHeadersFile(text), new URL(path, URL_BASE)));

test("exact path rule matches only that path", () => {
  const text = "# comment\n/secure/page\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n";
  assert.deepEqual(apply(text, "/secure/page"), { "x-frame-options": "DENY", "referrer-policy": "no-referrer" });
  assert.deepEqual(apply(text, "/secure/page/more"), {});
  assert.deepEqual(apply(text, "/secure"), {});
});

test("splat rule matches any suffix, including nested paths, and :splat substitutes into values", () => {
  const text = "/static/*\n  X-Robots-Tag: nosnippet\n  X-Asset: :splat\n";
  assert.deepEqual(apply(text, "/static/a/b.js"), { "x-robots-tag": "nosnippet", "x-asset": "a/b.js" });
  assert.deepEqual(apply(text, "/static/"), { "x-robots-tag": "nosnippet", "x-asset": "" });
  assert.deepEqual(apply(text, "/other/a.js"), {});
});

test("placeholder rule matches exactly one segment and substitutes its value", () => {
  const text = '/movies/:title\n  x-movie-name: You are watching ":title"\n';
  assert.deepEqual(apply(text, "/movies/up"), { "x-movie-name": 'You are watching "up"' });
  assert.deepEqual(apply(text, "/movies/up/extra"), {});
});

test("placeholder values in headers are decoded path segments, not regex syntax", () => {
  const text = "/a.b/:id\n  X-Id: :id\n";
  assert.deepEqual(apply(text, "/a.b/42"), { "x-id": "42" });
  assert.deepEqual(apply(text, "/aXb/42"), {}, "a literal dot must not match any character");
});

test("headers from several matching rules combine, and a repeated name is joined with a comma", () => {
  const text = "/*\n  X-A: 1\n  Cache-Control: public\n/assets/*\n  Cache-Control: immutable\n";
  assert.deepEqual(apply(text, "/assets/x.js"), { "x-a": "1", "cache-control": "public, immutable" });
});

test("`! Name` detaches a header set by a broader rule", () => {
  const text = "/*\n  Content-Security-Policy: default-src 'self'\n  X-A: 1\n/*.jpg\n  ! Content-Security-Policy\n";
  assert.deepEqual(apply(text, "/img/cat.jpg"), { "x-a": "1" });
  assert.deepEqual(apply(text, "/index.html"), { "content-security-policy": "default-src 'self'", "x-a": "1" });
});

test("absolute-URL rules only match their own host", () => {
  const text = "https://example.workers.dev/*\n  X-Robots-Tag: noindex\n";
  assert.deepEqual(apply(text, "/"), {});
  assert.deepEqual(Object.fromEntries(headersFor(parseHeadersFile(text), new URL("https://example.workers.dev/x"))), {
    "x-robots-tag": "noindex",
  });
});

test("a header line with a colon in its value keeps the whole value", () => {
  const text = "/*\n  Link: <https://a.test/x>; rel=preload\n";
  assert.deepEqual(apply(text, "/"), { link: "<https://a.test/x>; rel=preload" });
});

test("the repo's _headers gives the site its policy at /, the docs theirs at /docs/, and the app its own at /app/", () => {
  const rules = parseHeadersFile(readFileSync(new URL("../../packages/site/public/_headers", import.meta.url), "utf8"));
  const at = (path) => Object.fromEntries(headersFor(rules, new URL(path, URL_BASE)));
  for (const path of ["/", "/404.html", "/_next/static/chunks/page.js"]) {
    assert.match(at(path)["content-security-policy"], /^default-src 'none'; script-src 'self';/, path);
    assert.doesNotMatch(at(path)["content-security-policy"], /unsafe-inline|unsafe-eval|wasm-unsafe-eval/, path);
  }
  for (const path of ["/app/", "/app/main-ABC123.js", "/app/oauth/callback"]) {
    assert.match(
      at(path)["content-security-policy"],
      /^default-src 'self'; script-src 'self' 'wasm-unsafe-eval';/,
      path,
    );
    assert.doesNotMatch(
      at(path)["content-security-policy"],
      /, /,
      `${path}: one policy, not the site's joined to the app's`,
    );
  }
  for (const path of ["/docs/", "/docs/auth/", "/pagefind/pagefind-worker.js"]) {
    assert.match(
      at(path)["content-security-policy"],
      /^default-src 'none'; script-src 'self' 'wasm-unsafe-eval';/,
      path,
    );
    assert.doesNotMatch(at(path)["content-security-policy"], /, /, `${path}: one policy`);
  }
  for (const path of ["/", "/docs/", "/app/"]) assert.equal(at(path)["x-content-type-options"], "nosniff", path);
});

// P7.2: Cloudflare compresses what it serves; a page measured without that
// is measured on a megabyte it never sends.
test("encodingFor picks brotli, then gzip, for text, script and wasm, and nothing for the rest", () => {
  assert.equal(encodingFor("gzip, deflate, br", "text/javascript; charset=utf-8"), "br");
  assert.equal(encodingFor("gzip", "text/css; charset=utf-8"), "gzip");
  assert.equal(encodingFor("br;q=0, gzip", "application/json"), "gzip");
  assert.equal(encodingFor(undefined, "text/html; charset=utf-8"), null);
  assert.equal(encodingFor("br", "application/wasm"), "br");
  assert.equal(encodingFor("br, gzip", "image/png"), null);
  assert.equal(encodingFor("br, gzip", "font/woff2"), null);
});

test("the server sends a compressed body that decompresses to the file, and says so", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { brotliDecompressSync } = await import("node:zlib");
  const root = mkdtempSync(join(tmpdir(), "prod-server-"));
  writeFileSync(join(root, "_headers"), "/*\n  X-Test: yes\n");
  writeFileSync(join(root, "index.html"), "<p>shell</p>");
  const script = "console.log('wayfarer');\n".repeat(200);
  writeFileSync(join(root, "main.js"), script);
  const server = startServer(root, 0);
  await new Promise((done) => server.once("listening", done));
  try {
    const { port } = server.address();
    const { request } = await import("node:http");
    const response = await new Promise((done, fail) =>
      request({ port, path: "/main.js", headers: { "accept-encoding": "br, gzip" } }, done)
        .on("error", fail)
        .end(),
    );
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    assert.equal(response.headers["content-encoding"], "br");
    assert.equal(response.headers["vary"], "Accept-Encoding");
    assert.equal(response.headers["x-test"], "yes");
    assert.equal(brotliDecompressSync(Buffer.concat(chunks)).toString(), script);
  } finally {
    server.close();
  }
});

// #228: a `page.goto` in WebKit on CI waited 30 s for a document that never
// came (status -1). The log says whether the request reached the server, on
// which connection, and whether its answer was sent: with the `Accept-Encoding`
// asked for, the encoding chosen and the bytes of the body (#228, the second hang).
test("with a log file, the server writes each connection, request and answer as a line of JSON", async () => {
  const { mkdtempSync, readFileSync: read, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { Agent, request } = await import("node:http");
  const root = mkdtempSync(join(tmpdir(), "prod-server-"));
  writeFileSync(join(root, "_headers"), "/*\n  X-Test: yes\n");
  writeFileSync(join(root, "index.html"), "<p>shell</p>");
  const log = join(root, "server.log");
  const server = startServer(root, 0, log);
  await new Promise((done) => server.once("listening", done));
  const agent = new Agent({ keepAlive: true });
  const { port } = server.address();
  try {
    for (const [path, headers] of [
      ["/", { "accept-encoding": "gzip" }],
      ["/nothing", {}],
    ]) {
      const response = await new Promise((done, fail) =>
        request({ port, path, agent, headers }, done).on("error", fail).end(),
      );
      for await (const chunk of response) void chunk;
    }
  } finally {
    agent.destroy();
    await new Promise((done) => server.close(done));
  }
  // The server's `close` comes before its socket's.
  for (let wait = 0; wait < 100 && !read(log, "utf8").includes('"closed"'); wait++)
    await new Promise((done) => setTimeout(done, 10));
  const lines = read(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  for (const line of lines) assert.match(line.t, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.deepEqual(
    lines.map(({ t, ...line }) => line),
    [
      { event: "connection", socket: `${port}#1` },
      { event: "request", socket: `${port}#1`, method: "GET", path: "/", acceptEncoding: "gzip" },
      {
        event: "answered",
        socket: `${port}#1`,
        method: "GET",
        path: "/",
        acceptEncoding: "gzip",
        status: 200,
        encoding: "gzip",
        bytes: gzipSync("<p>shell</p>").length,
      },
      { event: "request", socket: `${port}#1`, method: "GET", path: "/nothing" },
      { event: "answered", socket: `${port}#1`, method: "GET", path: "/nothing", status: 404, bytes: 0 },
      { event: "closed", socket: `${port}#1` },
    ],
  );
});

/** A server on a temporary folder of `files`, and a GET of each path without following redirects. */
async function serve(files, paths) {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { dirname, join } = await import("node:path");
  const { request } = await import("node:http");
  const root = mkdtempSync(join(tmpdir(), "prod-server-"));
  for (const [name, text] of Object.entries({ _headers: "/*\n  X-Test: yes\n", ...files })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  const server = startServer(root, 0);
  await new Promise((done) => server.once("listening", done));
  try {
    const { port } = server.address();
    const answers = [];
    for (const path of paths) {
      const response = await new Promise((done, fail) => request({ port, path }, done).on("error", fail).end());
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      answers.push({
        status: response.statusCode,
        location: response.headers.location,
        test: response.headers["x-test"],
        body: Buffer.concat(chunks).toString(),
      });
    }
    return answers;
  } finally {
    server.close();
  }
}

// W1 (PLAN-design.md): wrangler.jsonc's `not_found_handling` is "404-page", and a folder is its index.html.
test("a path with no file is the nearest 404.html, with a 404 and the rules' headers", async () => {
  const files = {
    "index.html": "site",
    "404.html": "not here",
    "app/index.html": "app",
    "app/404.html": "app's not here",
  };
  assert.deepEqual(await serve(files, ["/nothing", "/docs/nothing", "/app/nothing"]), [
    { status: 404, location: undefined, test: "yes", body: "not here" },
    { status: 404, location: undefined, test: "yes", body: "not here" },
    { status: 404, location: undefined, test: "yes", body: "app's not here" },
  ]);
  assert.deepEqual(await serve({ "index.html": "site" }, ["/nothing"]), [
    { status: 404, location: undefined, test: "yes", body: "" },
  ]);
});

test("a folder is its index.html, and without its slash a 307 to it with the slash", async () => {
  const files = { "index.html": "site", "app/index.html": "app", "app/oauth/callback.html": "callback" };
  assert.deepEqual(await serve(files, ["/", "/app/", "/app", "/app?x=1", "/app/oauth/callback"]), [
    { status: 200, location: undefined, test: "yes", body: "site" },
    { status: 200, location: undefined, test: "yes", body: "app" },
    { status: 307, location: "/app/", test: "yes", body: "" },
    { status: 307, location: "/app/?x=1", test: "yes", body: "" },
    { status: 200, location: undefined, test: "yes", body: "callback" },
  ]);
});
