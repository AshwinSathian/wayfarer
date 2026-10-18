// Tests for strip-scripts.mjs (PLAN-design 1.8). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { strip } from "../strip-scripts.mjs";

test("Next's scripts, inline or from /_next/, and their preloads go; the site's own files stay", () => {
  const html = [
    '<link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/a.js"/>',
    '<script src="/app/theme.js"></script>',
    '<script src="/_next/static/chunks/b.js" async=""></script>',
    "<script>self.__next_f.push([1])</script>",
    '<SCRIPT id="_R_">x()</SCRIPT >',
    '<script src="/site.js" defer></script>',
    '<script type="application/ld+json">{"@type":"SoftwareApplication"}</script>',
  ].join("");
  assert.equal(
    strip(html),
    '<script src="/app/theme.js"></script><script src="/site.js" defer></script><script type="application/ld+json">{"@type":"SoftwareApplication"}</script>'
  );
});
