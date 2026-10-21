// Tests for roadmap.mjs (W2.4 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roadmapOf } from "./roadmap.mjs";

test("phases, tasks, ticks and each task's first sentence, over its wrapped lines", () => {
  const plan = [
    "## 9. Phases",
    "### Phase W: The website (3 sessions)",
    "- [x] **W0.1** Re-read the phase and split it.",
    "  - AC: a row.",
    "- [ ] **W2.1** Landing page: a hero line that says",
    "  what Wayfarer is.",
    "### Phase T: Teams (4 or more sessions, after D5)",
    "- [ ] **T1** Files and links: share a `collection`.",
    "## 10. Testing strategy",
    "- [ ] **X1** Not a task of a phase.",
  ].join("\n");
  assert.deepEqual(roadmapOf(plan), [
    {
      title: "Phase W: The website",
      tasks: [
        { id: "W0.1", done: true, text: "Re-read the phase and split it." },
        { id: "W2.1", done: false, text: "Landing page." },
      ],
    },
    { title: "Phase T: Teams", tasks: [{ id: "T1", done: false, text: "Files and links." }] },
  ]);
});

test("the repository's plan gives every phase it has, each with its tasks", () => {
  const phases = roadmapOf(readFileSync(new URL("../../../PLAN-design.md", import.meta.url), "utf8"));
  assert.deepEqual(
    phases.map((p) => p.title.split(":")[0]),
    ["Phase D0", "Phase D1", "Phase D2", "Phase D3", "Phase D4", "Phase D5", "Phase W", "Phase T"],
  );
  for (const phase of phases) assert.ok(phase.tasks.length > 0, phase.title);
  assert.ok(phases.flatMap((p) => p.tasks).some((t) => t.id === "W1.1" && t.done));
});
