// Tests for roadmap.mjs (W2.4 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INTERNAL, ITEMS, phasesOf, roadmapOf } from "./roadmap.mjs";

const PLAN = readFileSync(new URL("../../../PLAN-design.md", import.meta.url), "utf8");

test("the plan's phases in section 9, each with its tasks and ticks", () => {
  const plan = [
    "## 9. Phases",
    "### Phase W: The website (3 sessions)",
    "- [x] **W0.1** Re-read the phase and split it.",
    "  - AC: a row.",
    "- [ ] **W2.1** Landing page: a hero line that says",
    "### Phase T: Teams (4 or more sessions, after D5)",
    "- [ ] **T1** Files and links.",
    "## 10. Testing strategy",
    "- [ ] **X1** Not a task of a phase.",
  ].join("\n");
  assert.deepEqual(phasesOf(plan), [
    {
      id: "W",
      tasks: [
        { id: "W0.1", done: true },
        { id: "W2.1", done: false },
      ],
    },
    { id: "T", tasks: [{ id: "T1", done: false }] },
  ]);
});

test("every task of the plan is said to a user, or is one a user never sees", () => {
  const ids = phasesOf(PLAN).flatMap((p) => p.tasks.map((t) => t.id));
  const said = new Set(ITEMS.flatMap((item) => item.tasks));
  assert.deepEqual(
    ids.filter((id) => !said.has(id) && !INTERNAL.has(id)),
    [],
    "a task of PLAN-design.md that roadmap.mjs neither words nor lists as internal",
  );
  const known = new Set(ids);
  assert.deepEqual(
    [...said, ...INTERNAL].filter((id) => !known.has(id)),
    [],
    "roadmap.mjs names a task the plan does not have",
  );
});

test("3.0's items, then Next and Later, by the phase each rests on; 3.0 is shipped once the release is ticked", () => {
  const plan = [
    "### Phase D4: Flows",
    "- [ ] **D4.3** The composer.",
    "### Phase D5: Release",
    "- [ ] **D5.2** Release v3.0.0.",
    "### Phase D6: After 3.0",
    "- [x] **D6.1** Fix.",
    "### Phase T: Teams",
    "- [ ] **T1** Files and links.",
    "- [x] **T2** Git.",
  ].join("\n");
  const text = (id) => ITEMS.find((item) => item.tasks.includes(id)).text;
  const sections = roadmapOf(plan);
  assert.deepEqual(
    sections.map((s) => [s.title, s.items.map((i) => [i.text, i.done])]),
    [
      ["Coming in 3.0", [[text("D4.3"), false]]],
      ["Next", [[text("D6.1"), true]]],
      [
        "Later",
        [
          [text("T1"), false],
          [text("T2"), true],
        ],
      ],
    ],
  );
  assert.equal(roadmapOf(plan.replace("[ ] **D5.2**", "[x] **D5.2**"))[0].title, "Shipped in 3.0");
});

test("the repository's plan gives the three lists, the teams' work in Later", () => {
  const sections = roadmapOf(PLAN);
  assert.deepEqual(
    sections.map((s) => s.title.replace(/^(Coming|Shipped) /, "")),
    ["in 3.0", "Next", "Later"],
  );
  assert.ok(sections[2].items.some((i) => /Git/.test(i.text)));
  // A sentence of the page is for a reader: no plan IDs or finding numbers in it.
  for (const item of ITEMS) assert.doesNotMatch(item.text, /\b([DWT]\d|U-\d)/, item.text);
});

test("each claim an item names is a row of the claims ledger", () => {
  const ledger = readFileSync(new URL("../../../docs/claims.md", import.meta.url), "utf8");
  const rows = new Set([...ledger.matchAll(/^\| (C-\d{3}) \|/gm)].map((m) => m[1]));
  assert.deepEqual(
    ITEMS.flatMap((item) => item.claims ?? []).filter((id) => !rows.has(id)),
    [],
  );
});
