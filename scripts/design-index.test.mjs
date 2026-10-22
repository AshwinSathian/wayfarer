// D0.1: docs/design/baseline/index.md lists the screens e2e/design/screens.ts captures, no more and no fewer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the baseline's index lists every screen the design spec captures", () => {
  const captured = [...read("e2e/design/screens.ts").matchAll(/\{\s*id: "([^"]+)",\s*shows: "([^"]+)",?\s*\}/g)].map(
    ([, id, shows]) => `${id}: ${shows}`,
  );
  const listed = [...read("docs/design/baseline/index.md").matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)].map(
    ([, id, shows]) => `${id}: ${shows}`,
  );
  assert.ok(captured.length > 40, "the index of screens.ts was not read");
  assert.deepEqual(listed, captured);
});
