export type { AssertionOperator, AssertionTarget, TestAssertion } from "@wayfarer/core";

export interface TestResult {
  label: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  error?: string;
  /** "assertion" = visual builder row; "script" = pm.test() call from a script */
  source: "assertion" | "script";
}
