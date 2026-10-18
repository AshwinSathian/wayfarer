// Tests for externalize-scripts.mjs (PLAN-design 1.8). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { externalize } from "../externalize-scripts.mjs";

test("an inline script becomes a file named by its hash, in its place, without async", () => {
  const files = new Map();
  const html = externalize('<p>a</p><script>self.x=1</script><script id="k">self.y=2</script><p>b</p>', files);
  const names = [...files.keys()];
  assert.equal(names.length, 2);
  assert.equal(html, `<p>a</p><script src="/_next/static/inline/${names[0]}"></script><script id="k" src="/_next/static/inline/${names[1]}"></script><p>b</p>`);
  assert.equal(files.get(names[0]), "self.x=1");
  assert.match(names[0], /^[0-9a-f]{32}\.js$/);
});

test("a script with a source, one that is data and an empty one stay as they are; the same text is one file", () => {
  const files = new Map();
  const kept = '<script src="/a.js"></script><script type="application/ld+json">{"a":1}</script><script></script>';
  assert.equal(externalize(kept, files), kept);
  externalize("<script>same</script><script>same</script>", files);
  assert.equal(files.size, 1);
});

test("a script written in capitals, or closed with a space, is moved too", () => {
  const files = new Map();
  const html = externalize('<SCRIPT>a()</SCRIPT ><script >b()</script\n>', files);
  assert.equal(files.size, 2);
  assert.doesNotMatch(html, /a\(\)|b\(\)/);
});
