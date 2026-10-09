// F54: Playwright's default testMatch also matches `*.test.mjs`, so it
// imported e2e/support/*.test.mjs and Node's test runner ran those suites
// inside every e2e collection.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("Playwright collects only *.spec.ts and runs no Node test suite", () => {
  // Without NODE_TEST_CONTEXT a nested Node test run reports as it does in
  // a plain `playwright test`.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const out = execFileSync("npx", ["playwright", "test", "--list"], {
    encoding: "utf8",
    env: { ...env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const files = new Set([...out.matchAll(/› (\S+?):\d+:\d+ ›/g)].map((m) => m[1]));
  assert.ok(files.size > 0, "no test was listed");
  for (const file of files) assert.match(file, /\.spec\.ts$/);
  // Node's reporter prints a line starting with ✔ for each of its tests.
  assert.deepEqual(out.split("\n").filter((line) => line.startsWith("✔")), []);
});
