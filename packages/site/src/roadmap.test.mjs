// Tests for roadmap.mjs. Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roadmapOf } from "./roadmap.mjs";

const ROADMAP = readFileSync(new URL("../../../docs/roadmap.md", import.meta.url), "utf8");

test("each heading is a list of its items, with the claims each names; a Shipped list is done", () => {
  const doc = [
    "# Roadmap",
    "",
    "Intro.",
    "",
    "## Shipped in 3.0",
    "",
    "- A. <!-- claims C-001 C-002 -->",
    "## Next",
    "- B.",
    "## Empty",
  ].join("\n");
  assert.deepEqual(roadmapOf(doc), [
    { title: "Shipped in 3.0", shipped: true, items: [{ text: "A.", claims: ["C-001", "C-002"] }] },
    { title: "Next", shipped: false, items: [{ text: "B.", claims: [] }] },
  ]);
});

test("docs/roadmap.md gives the four lists: sharing shipped since 3.0, Git next", () => {
  const sections = roadmapOf(ROADMAP);
  assert.deepEqual(
    sections.map((s) => s.title),
    ["Shipped in 3.0", "Shipped since 3.0", "Next", "Later"],
  );
  assert.ok(sections[1].items.some((i) => /link/.test(i.text)));
  assert.ok(sections[2].items.some((i) => /Git/.test(i.text)));
  // A sentence of the page is for a reader: no plan IDs, finding numbers or claim IDs in it.
  for (const item of sections.flatMap((s) => s.items))
    assert.doesNotMatch(item.text, /\b([DWT]\d|U-\d|C-\d)/, item.text);
});

test("each claim an item names is a row of the claims ledger", () => {
  const ledger = readFileSync(new URL("../../../docs/claims.md", import.meta.url), "utf8");
  const rows = new Set([...ledger.matchAll(/^\| (C-\d{3}) \|/gm)].map((m) => m[1]));
  const named = roadmapOf(ROADMAP).flatMap((s) => s.items.flatMap((i) => i.claims));
  assert.ok(named.length > 5);
  assert.deepEqual(
    named.filter((id) => !rows.has(id)),
    [],
  );
});
