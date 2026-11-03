import { test, expect } from "@playwright/test";
import { runReportHtml } from "../packages/core/src/run/report";
import type { RunReport } from "../packages/core/src/run/runner";
import { axe } from "./support/axe";

// D4.9: the CLI's HTML report is held to what the app's views are held to: WCAG 2.2 AA in both themes, and nothing
// wider than the window from 320 px.

const report: RunReport = {
  iterations: 2,
  ended: "failed",
  results: [
    {
      id: "1",
      name: "List pets",
      iteration: 0,
      status: 200,
      statusText: "OK",
      durationMs: 13,
      tests: [{ name: "status is 200", passed: true }],
    },
    {
      id: "2",
      name: "A request with a long name that has to wrap somewhere in a narrow window, and does",
      iteration: 0,
      status: 404,
      statusText: "Not Found",
      durationMs: 9,
      tests: [{ name: "Status code equals 200", passed: false, error: "expected 404 to equal 200" }],
    },
    {
      id: "3",
      name: "Health",
      iteration: 1,
      error: "The request got no response: connect ECONNREFUSED 127.0.0.1:9.",
      tests: [],
    },
    {
      id: "4",
      name: "Stats",
      iteration: 1,
      error: "The request got no response: connect ECONNREFUSED 127.0.0.1:9.",
      tests: [],
    },
  ],
};
const page = runReportHtml(report, { name: "Pet store", startedAt: "2026-11-03T10:00:00.000Z" });

for (const scheme of ["light", "dark"] as const) {
  test(`the HTML report is free of WCAG 2.2 AA violations in the ${scheme} theme and fits from 320 px`, async ({
    page: browser,
  }) => {
    await browser.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 820, 1440]) {
      await browser.setViewportSize({ width, height: 800 });
      await browser.setContent(page);
      await expect(browser.getByRole("heading", { name: "Run Pet store" })).toBeVisible();
      const results = await axe(browser).analyze();
      expect(
        results.violations.flatMap((v) => v.nodes.map((node) => `${width}: ${v.id}: ${node.target.join(" ")}`)),
      ).toEqual([]);
      expect(
        await browser.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        `at ${width} px`,
      ).toBeLessThanOrEqual(0);
    }
  });
}
