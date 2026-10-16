// Tests for doc-links.mjs (W2.2 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { siteLink } from "./doc-links.mjs";

test("a doc's link to another doc is that doc's page, its anchor kept", () => {
  assert.equal(siteLink("auth.md#oauth", "docs/scripts.md"), "/docs/auth/#oauth");
  assert.equal(siteLink("design/research-2026.md", "docs/index.md"), "/docs/design/research-2026/");
  assert.equal(siteLink("../claims.md", "docs/design/research-2026.md"), "/docs/claims/");
});

test("a link to the rest of the repository is the file on GitHub", () => {
  assert.equal(siteLink("../SECURITY.md", "docs/trust-center.md"), "https://github.com/AshwinSathian/wayfarer/blob/main/SECURITY.md");
  assert.equal(siteLink("../../PLAN-design.md", "docs/design/research-2026.md"), "https://github.com/AshwinSathian/wayfarer/blob/main/PLAN-design.md");
  assert.equal(siteLink("../packages/bridge/README.md#pairing", "docs/cli.md"), "https://github.com/AshwinSathian/wayfarer/blob/main/packages/bridge/README.md#pairing");
});

test("an address, an anchor on the page and a mail link are left as they are", () => {
  for (const url of ["https://a.test/x.md", "#top", "mailto:a@b.c", "//cdn.test/x"]) assert.equal(siteLink(url, "docs/a.md"), url);
});
