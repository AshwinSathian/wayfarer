// Tests for benchmark.mjs (W5.4 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { benchmarkOf, plain, urls } from "./benchmark.mjs";

const doc = benchmarkOf(readFileSync("docs/design/benchmark.md", "utf8"));

test("every task of the summary has Wayfarer's measure, with its recording, and the rivals' documented rows", () => {
  assert.deepEqual(
    doc.tasks.map((task) => task.n),
    ["1", "2", "3", "4", "5", "6", "7", "8"],
  );
  for (const task of doc.tasks) {
    assert.ok(task.measured.length > 0, task.n);
    for (const row of task.measured) assert.match(row.recording, /^\/benchmark\/task-\d[a-c]?\.webm$/);
    assert.ok(task.documented.length >= 5, task.n);
    for (const row of task.documented) assert.ok(row.sources.length > 0, `${task.n} ${row.rival}`);
  }
  assert.deepEqual(
    doc.tasks.find((task) => task.n === "5")?.measured.map((row) => row.id),
    ["5a", "5b", "5c"],
  );
});

test("a task's anchor is the id GitHub gives its heading", () => {
  assert.equal(doc.tasks[1].anchor, "task-2-import-a-postman-collection-with-scripts-and-run-it");
});

test("a cell is read as text, and a source cell as its addresses", () => {
  assert.equal(plain("**8** and `pm.*` in [a](b)"), "8 and pm.* in a");
  assert.deepEqual(urls("https://a.test/x ; https://b.test/y (7 Oct 2026)"), ["https://a.test/x", "https://b.test/y"]);
});

test("a missing table fails", () => {
  assert.throws(() => benchmarkOf("# Nothing\n"), /no "## Wayfarer, measured"/);
});

test("each rival's version is read to its first parenthesis", () => {
  assert.equal(doc.versions.Bruno, "v4.3.0, 22 Oct 2026");
  assert.equal(doc.versions.Postman, "v12");
});
