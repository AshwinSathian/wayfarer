// Tests for markdown.mjs (W2.2 of PLAN-design.md, Next since its 1.8). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, titleOf } from "./markdown.mjs";

test("a heading has the id GitHub gives it, repeated ones numbered", () => {
  const html = renderMarkdown("## OAuth 2.0 & `pm.cookies`\n\n## Setup\n\n## Setup\n", "docs/auth.md");
  assert.match(html, /<h2 id="oauth-20--pmcookies">/);
  assert.match(html, /<h2 id="setup">Setup<\/h2>\n<h2 id="setup-1">/);
});

test("a link to another doc is its page, and one to the rest of the repository is the file on GitHub", () => {
  const html = renderMarkdown("[a](auth.md#oauth) [b](../SECURITY.md) [c](https://x.test/y.md)", "docs/scripts.md");
  assert.match(html, /href="\/docs\/auth\/#oauth"/);
  assert.match(html, /href="https:\/\/github.com\/AshwinSathian\/wayfarer\/blob\/main\/SECURITY.md"/);
  assert.match(html, /href="https:\/\/x.test\/y.md"/);
});

test("a table takes focus, and quotes stay as written", () => {
  const html = renderMarkdown('| a |\n|---|\n| "b" -- c |\n', "docs/a.md");
  assert.match(html, /<table tabindex="0">/);
  assert.match(html, /&quot;b&quot; -- c|"b" -- c/);
});

test("a title is the first heading without code marks, or the fallback", () => {
  assert.equal(titleOf("intro\n# The `pm` API\n## x", "f"), "The pm API");
  assert.equal(titleOf("no heading", "f"), "f");
});
