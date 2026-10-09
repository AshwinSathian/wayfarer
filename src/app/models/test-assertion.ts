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

export interface ScriptExecutionResult {
  logs: string[];
  envMutations: Record<string, string>;
  testResults: TestResult[];
  error?: string;
}
