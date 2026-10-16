// Tests for scripts/check-lighthouse.mjs (P7.2). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { judge, judgeSite } from "./check-lighthouse.mjs";

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

// W2.1 (PLAN-design.md, section 1): the site, on Lighthouse's mobile preset.
const site = (performance, accessibility, seo) => ({ categories: { performance: { score: performance }, accessibility: { score: accessibility }, seo: { score: seo } } });

test("the site needs 95 for performance and 100 for accessibility and search, by the median", () => {
  assert.deepEqual(judgeSite([site(0.99, 1, 1), site(0.5, 0.8, 0.9), site(0.96, 1, 1)]).failures, []);
  assert.deepEqual(judgeSite([site(0.94, 0.98, 0.92)]).failures, ["performance 94 is under 95", "accessibility 98 is under 100", "seo 92 is under 100"]);
  assert.deepEqual(judgeSite([]).failures, ["no Lighthouse report to judge"]);
});
