#!/usr/bin/env node
// Performance budgets (P7.2), judged on Lighthouse's JSON reports of the
// desktop preset: the median run must score 90 or more, with a largest
// contentful paint of at most 2,000 ms and a total blocking time of at most
// 200 ms. Lighthouse itself runs from a pinned `npx` in CI and is not a
// dependency of the project.
//
// Usage: node scripts/check-lighthouse.mjs report-1.json report-2.json report-3.json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BUDGET = { performance: 90, lcpMs: 2000, tbtMs: 200 };

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function judge(reports) {
  if (!reports.length) return { failures: ["no Lighthouse report to judge"] };
  const performance = Math.round(median(reports.map((report) => report.categories.performance.score)) * 100);
  const lcp = Math.round(median(reports.map((report) => report.audits["largest-contentful-paint"].numericValue)));
  const tbt = Math.round(median(reports.map((report) => report.audits["total-blocking-time"].numericValue)));
  const failures = [
    ...(performance < BUDGET.performance ? [`performance ${performance} is under ${BUDGET.performance}`] : []),
    ...(lcp > BUDGET.lcpMs ? [`largest contentful paint ${lcp} ms is over ${BUDGET.lcpMs} ms`] : []),
    ...(tbt > BUDGET.tbtMs ? [`total blocking time ${tbt} ms is over ${BUDGET.tbtMs} ms`] : []),
  ];
  return { performance, lcp, tbt, failures };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = judge(process.argv.slice(2).map((file) => JSON.parse(readFileSync(file, "utf8"))));
  console.log(`Lighthouse (desktop, median of ${process.argv.length - 2}): performance ${result.performance}, LCP ${result.lcp} ms, TBT ${result.tbt} ms`);
  if (result.failures.length) {
    console.error(`Performance budget broken:\n${result.failures.map((failure) => `  - ${failure}`).join("\n")}`);
    process.exit(1);
  }
}
