// Tests for changelog.mjs (W2.4 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changelogOf } from "./changelog.mjs";

test("one entry a version, without the file's head, Unreleased named for a reader", () => {
  const file = [
    "# Changelog",
    "",
    "All notable changes to this project will be documented in this file.",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "- A thing.",
    "",
    "## [2.6.0] - 2026-10-19",
    "",
    "The website, and the app at `/app/`. More words.",
    "",
    "### Added",
    "",
    '- **Renamed from "API Sandbox" to "Wayfarer."** Same app.',
  ].join("\n");
  const versions = changelogOf(file);
  assert.deepEqual(
    versions.map(({ id, title, date, summary }) => ({ id, title, date, summary })),
    [
      { id: "unreleased", title: "Coming in the next release", date: null, summary: null },
      { id: "260---2026-10-19", title: "2.6.0", date: "2026-10-19", summary: "The website, and the app at /app/." },
    ],
  );
  assert.match(versions[0].html, /^<h3 id="added">Added<\/h3>/);
  // The second "Added" is the page's second: its id is unique over the page, as GitHub's is.
  assert.match(versions[1].html, /<h3 id="added-1">/);
  for (const { html } of versions) assert.doesNotMatch(html, /<h2|notable changes/);
});

// D5-d: on the day of a release, [Unreleased] has nothing in it yet; the page then has no "Coming in the next
// release" with nothing under it.
test("an empty Unreleased is left out", () => {
  const versions = changelogOf("# Changelog\n\n## [Unreleased]\n\n## [3.0.0] - 2026-11-05\n\nThe redesign.\n");
  assert.deepEqual(
    versions.map((v) => v.title),
    ["3.0.0"],
  );
});

test("the repository's changelog gives every version, newest first", () => {
  const file = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8");
  const versions = changelogOf(file);
  const empty = /^## \[Unreleased\]\n\n## /m.test(file) ? 1 : 0;
  assert.equal(versions.length, (file.match(/^## \[/gm)?.length ?? 0) - empty);
  assert.ok(versions.some((v) => v.title === "2.0.0" && v.date === "2026-10-10" && v.summary));
  for (const v of versions) assert.ok(v.id && v.html, v.title);
});
