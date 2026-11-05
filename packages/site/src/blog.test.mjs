// Tests for lib/blog.ts (W2.5 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { parse, postHtml } from "./lib/blog.ts";

const head = "---\ntitle: T\ndate: 2026-10-19\ndescription: D\n---\nBody\n";

test("a post's claims comment becomes IDs readers do not see, and a screen comment a screen's before and after", () => {
  const post = parse("2026-11-05-a.md", `${head}Sentence. <!-- claims C-001 C-002 -->\n\n<!-- screen tree -->\n`);
  const html = postHtml(post, (id) => `text of ${id}`);
  assert.match(html, /Sentence\. <span hidden data-claims="C-001 C-002"><\/span>/);
  assert.doesNotMatch(html, /href="\/docs\/claims\/|>C-00\d</);
  assert.throws(
    () => postHtml(parse("2026-11-05-a.md", `${head}<!-- claims C-999 -->\n`), (id) => assert.fail(`no claim ${id}`)),
    /no claim C-999/,
  );
  assert.match(html, /src="\/whats-new\/tree-1440-light\.jpg" width="1080" height="675" loading="lazy"/);
  assert.doesNotMatch(html, /<!--/);
  assert.throws(() => postHtml(parse("2026-11-05-a.md", `${head}<!-- screen nope -->\n`), String), /no screen nope/);
});

test("a post's slug is its file name after the date", () => {
  assert.equal(parse("2026-10-19-the-claims-ledger.md", head).slug, "the-claims-ledger");
});

test("a file name that would make a slug of anything but a-z, 0-9 and - is refused", () => {
  // The slug goes into the page's links and the feed's <link> and <guid> as it is.
  for (const file of [
    "2026-10-19-a b.md",
    '2026-10-19-x"><script>.md',
    "2026-10-19-Upper.md",
    "2026-10-19-.md",
    "2026-10-19-a/b.md",
  ]) {
    assert.throws(() => parse(file, head), /slug/, file);
  }
});

test("a head without a title, a date or a description, or a date not YYYY-MM-DD, is refused", () => {
  assert.throws(() => parse("2026-10-19-a.md", "Body"), /head/);
  assert.throws(() => parse("2026-10-19-a.md", head.replace("title: T\n", "")), /title/);
  assert.throws(() => parse("2026-10-19-a.md", head.replace("2026-10-19", "19 Oct")), /date/);
});
