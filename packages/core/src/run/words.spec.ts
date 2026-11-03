import { describe, expect, it } from "vitest";
import { runCounts, runEnding, sharedErrorHeading, sharedErrors } from "./words";

const result = (error?: string, tests: boolean[] = []) => ({
  id: "r",
  name: "R",
  iteration: 0,
  ...(error !== undefined && { error }),
  tests: tests.map((passed, i) => ({ name: `t${i}`, passed })),
});

describe("what a run says (D4.9)", () => {
  it("says how it ended", () => {
    expect(runEnding({ ended: "completed" })).toBe("The run is complete.");
    expect(runEnding({ ended: "cancelled" })).toBe("The run was cancelled.");
    expect(runEnding({ ended: "failed" })).toBe("The run stopped at the first failure.");
    expect(runEnding({ ended: "ended", reason: "setNextRequest named no request." })).toBe(
      "The run was stopped. setNextRequest named no request.",
    );
  });

  it("counts results, failures and tests, each noun agreeing with its count", () => {
    expect(runCounts({ iterations: 1, results: [result(undefined, [true, false]), result("gone")] })).toBe(
      "2 results in 1 iteration; 2 failed; 1 of 2 tests passed.",
    );
    expect(runCounts({ iterations: 2, results: [result(undefined, [true])] })).toBe(
      "1 result in 2 iterations; 0 failed; 1 of 1 tests passed.",
    );
  });

  it("says an error that two or more results share once, the most frequent first", () => {
    expect(sharedErrors([result("a"), result("b"), result("b"), result("a"), result("b"), result("c")])).toEqual([
      { error: "b", count: 3 },
      { error: "a", count: 2 },
    ]);
    expect(sharedErrors([result("a"), result()])).toEqual([]);
    expect(sharedErrorHeading(3)).toBe("3 requests failed with the same error.");
  });
});
