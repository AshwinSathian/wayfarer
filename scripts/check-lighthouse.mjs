#!/usr/bin/env node
// Performance budgets (P7.2), judged on Lighthouse's JSON reports of the
// desktop preset: the median run must score 90 or more, with a largest
// contentful paint of at most 2,000 ms and a total blocking time of at most
// 200 ms. The site (W2.1 of PLAN-design.md), on the mobile preset, with
// --site: 95 or more for performance, 100 for accessibility and search.
// Lighthouse itself runs from a pinned `npx` in CI and is not a dependency
// of the project.
//
// Usage: node scripts/check-lighthouse.mjs [--site] report-1.json report-2.json report-3.json
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

const SITE = { performance: 95, accessibility: 100, seo: 100 };

export function judgeSite(reports) {
  if (!reports.length) return { failures: ["no Lighthouse report to judge"] };
  const scores = Object.fromEntries(
    Object.keys(SITE).map((name) => [
      name,
      Math.round(median(reports.map((report) => report.categories[name].score)) * 100),
    ]),
  );
  return {
    ...scores,
    failures: Object.entries(SITE).flatMap(([name, least]) =>
      scores[name] < least ? [`${name} ${scores[name]} is under ${least}`] : [],
    ),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href && process.argv[2] === "--site") {
  const result = judgeSite(process.argv.slice(3).map((file) => JSON.parse(readFileSync(file, "utf8"))));
  console.log(
    `Lighthouse, the site (mobile, median of ${process.argv.length - 3}): performance ${result.performance}, accessibility ${result.accessibility}, seo ${result.seo}`,
  );
  if (result.failures.length) {
    console.error(`Site budget broken:\n${result.failures.map((failure) => `  - ${failure}`).join("\n")}`);
    process.exit(1);
  }
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = judge(process.argv.slice(2).map((file) => JSON.parse(readFileSync(file, "utf8"))));
  console.log(
    `Lighthouse (desktop, median of ${process.argv.length - 2}): performance ${result.performance}, LCP ${result.lcp} ms, TBT ${result.tbt} ms`,
  );
  if (result.failures.length) {
    console.error(`Performance budget broken:\n${result.failures.map((failure) => `  - ${failure}`).join("\n")}`);
    process.exit(1);
  }
}
