export type AssertionTarget = "status" | "body" | "header" | "duration";

export type AssertionOperator =
  | "equals"
  | "not-equals"
  | "contains"
  | "not-contains"
  | "exists"
  | "not-exists"
  | "is-array"
  | "is-object"
  | "less-than"
  | "greater-than";

export interface TestAssertion {
  id: string;
  target: AssertionTarget;
  /** JSON dot-path for body target (e.g. "data.users[0].id"), header name, or empty for status/duration */
  key?: string;
  operator: AssertionOperator;
  /** Expected value (string representation; compared after coercion) */
  expected?: string;
}

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
