// Tests for scripts/check-site-links.mjs (W2.2 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brokenLinks } from "./check-site-links.mjs";

function site(files) {
  const root = mkdtempSync(join(tmpdir(), "site-links-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

test("a link to a page, a file or an anchor that is there is not broken; others are, each named", () => {
  const root = site({
    "index.html": '<a href="/docs/">docs</a><a href="/docs/auth/#oauth">x</a><link href="/a.css"><a href="/docs/gone/">g</a><a href="/docs/auth/#nope">n</a><img src="/b.png">',
    "docs/index.html": '<a href="auth/">relative</a><a href="#top">self</a><h1 id="top">Docs</h1>',
    "docs/auth/index.html": '<h2 id="oauth">OAuth</h2>',
    "a.css": "",
  });
  assert.deepEqual(brokenLinks(root), ["/index.html: /docs/gone/ (no such page)", "/index.html: /docs/auth/#nope (no id \"nope\")", "/index.html: /b.png (no such page)"]);
});

test("links to another site, and into the app, are not followed", () => {
  const root = site({ "index.html": '<a href="https://github.com/x">gh</a><a href="mailto:a@b.c">m</a><a href="/app/">app</a>' });
  assert.deepEqual(brokenLinks(root), []);
});
