// Unit tests for the `_headers` parser in prod-server.mjs (P1.1), covering
// the rule shapes Cloudflare documents for Workers static assets
// (https://developers.cloudflare.com/workers/static-assets/headers/):
// exact paths, splats, and :placeholders, plus absolute-URL rules, detaching
// with `! Name`, and multiple matching rules. Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { headersFor, parseHeadersFile } from "./prod-server.mjs";

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
  assert.deepEqual(
    Object.fromEntries(headersFor(parseHeadersFile(text), new URL("https://example.workers.dev/x"))),
    { "x-robots-tag": "noindex" }
  );
});

test("a header line with a colon in its value keeps the whole value", () => {
  const text = "/*\n  Link: <https://a.test/x>; rel=preload\n";
  assert.deepEqual(apply(text, "/"), { link: "<https://a.test/x>; rel=preload" });
});

test("the repo's public/_headers gives every path the production CSP", () => {
  const rules = parseHeadersFile(readFileSync(new URL("../../public/_headers", import.meta.url), "utf8"));
  for (const path of ["/", "/worker-ABC123.js", "/ngsw-worker.js", "/assets/x.svg"]) {
    const headers = Object.fromEntries(headersFor(rules, new URL(path, URL_BASE)));
    assert.match(headers["content-security-policy"], /script-src 'self'/, path);
    assert.equal(headers["x-content-type-options"], "nosniff", path);
  }
});
