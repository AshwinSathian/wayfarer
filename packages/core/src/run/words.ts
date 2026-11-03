import { runFailed, type RunReport, type RunResult } from "./runner";

// What a run says, in the app's run view and in the CLI's terminal and reports alike (D4.9): one set of sentences.

/** How the run ended: "The run is complete.", "The run was cancelled." and so on. */
export function runEnding(report: Pick<RunReport, "ended" | "reason">): string {
  switch (report.ended) {
    case "completed":
      return "The run is complete.";
    case "cancelled":
      return "The run was cancelled.";
    case "failed":
      return "The run stopped at the first failure.";
    case "ended":
      return `The run was stopped. ${report.reason ?? ""}`.trim();
  }
}

/** "4 results in 1 iteration; 1 failed; 4 of 5 tests passed." */
export function runCounts(report: Pick<RunReport, "results" | "iterations">): string {
  const { results, iterations } = report;
  const tests = results.flatMap((result) => result.tests);
  const failed = results.filter(runFailed).length;
  const passed = tests.filter((test) => test.passed).length;
  return `${results.length} ${results.length === 1 ? "result" : "results"} in ${iterations} ${iterations === 1 ? "iteration" : "iterations"}; ${failed} failed; ${passed} of ${tests.length} tests passed.`;
}

/** The errors two or more results share, the most frequent first: one cause is said once, not on every row (U-014). */
export function sharedErrors(results: readonly Pick<RunResult, "error">[]): { error: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { error } of results) if (error !== undefined) counts.set(error, (counts.get(error) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([error, count]) => ({ error, count }));
}

/** "3 requests failed with the same error." */
export function sharedErrorHeading(count: number): string {
  return `${count} requests failed with the same error.`;
}
