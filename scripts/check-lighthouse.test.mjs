// Tests for scripts/check-lighthouse.mjs (P7.2). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { judge } from "./check-lighthouse.mjs";

const report = (performance, lcp, tbt) => ({
  categories: { performance: { score: performance } },
  audits: { "largest-contentful-paint": { numericValue: lcp }, "total-blocking-time": { numericValue: tbt } },
});

test("the median of the runs is judged: one slow run among three passes", () => {
  assert.deepEqual(judge([report(0.99, 700, 0), report(0.6, 4000, 900), report(0.98, 750, 10)]).failures, []);
});

test("each budget that the median breaks is named, with its value", () => {
  assert.deepEqual(judge([report(0.85, 2100, 250)]).failures, [
    "performance 85 is under 90",
    "largest contentful paint 2100 ms is over 2000 ms",
    "total blocking time 250 ms is over 200 ms",
  ]);
});

test("no report is a failure, not a pass", () => {
  assert.deepEqual(judge([]).failures, ["no Lighthouse report to judge"]);
});
