import type { AssertionOperator, AssertionTarget, TestAssertion } from "../model/request";
import { parseJson } from "../safe-json";
import { evaluatePath } from "../view/json-path";

/** One row of a send's Tests: an assertion of the request's, or a `pm.test` of a script. */
export interface TestResult {
  label: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  error?: string;
  /** "assertion" = visual builder row; "script" = pm.test() call from a script */
  source: "assertion" | "script";
}

export interface AssertionResponseContext {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  durationMs?: number;
}

/** The request's assertions (the Tests tab's rows) against a response. */
export function runAssertions(assertions: TestAssertion[], response: AssertionResponseContext): TestResult[] {
  return assertions.map((assertion) => evaluate(assertion, response));
}

function evaluate(assertion: TestAssertion, response: AssertionResponseContext): TestResult {
  const label = buildLabel(assertion);
  try {
    const actual = resolveActual(assertion.target, assertion.key, response);
    const passed = applyOperator(assertion.operator, actual, assertion.expected);
    return {
      label,
      passed,
      actual,
      expected: assertion.expected,
      source: "assertion",
    };
  } catch (err) {
    return {
      label,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      source: "assertion",
    };
  }
}

function resolveActual(target: AssertionTarget, key: string | undefined, response: AssertionResponseContext): unknown {
  switch (target) {
    case "status":
      return response.statusCode;
    case "duration":
      return response.durationMs ?? 0;
    case "header": {
      if (!key) {
        return undefined;
      }
      const lk = key.toLowerCase();
      const match = Object.entries(response.headers).find(([k]) => k.toLowerCase() === lk);
      return match?.[1] ?? undefined;
    }
    case "body": {
      const parsed = parseBody(response.body);
      if (!key?.trim()) {
        return parsed;
      }
      return evaluatePath(parsed, key);
    }
  }
}

function parseBody(body: unknown): unknown {
  if (body === undefined || body === null) {
    return null;
  }
  if (typeof body === "string") {
    const parsed = parseJson(body);
    return parsed.ok ? parsed.value : body;
  }
  return body;
}

function applyOperator(operator: AssertionOperator, actual: unknown, expected: string | undefined): boolean {
  switch (operator) {
    case "equals":
      return coerce(actual) === coerce(expected);
    case "not-equals":
      return coerce(actual) !== coerce(expected);
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "not-contains":
      return !String(actual ?? "").includes(String(expected ?? ""));
    case "exists":
      return actual !== undefined && actual !== null;
    case "not-exists":
      return actual === undefined || actual === null;
    case "is-array":
      return Array.isArray(actual);
    case "is-object":
      return typeof actual === "object" && actual !== null && !Array.isArray(actual);
    case "less-than": {
      const n = Number(expected);
      return typeof actual === "number" && actual < n;
    }
    case "greater-than": {
      const n = Number(expected);
      return typeof actual === "number" && actual > n;
    }
  }
}

/** Coerce both sides to the same primitive for equality checks. */
function coerce(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    const n = Number(value);
    if (!isNaN(n) && value.trim() !== "") {
      return n;
    }
  }
  return value;
}

function buildLabel(assertion: TestAssertion): string {
  const targetLabel = labelOfTarget(assertion.target, assertion.key);
  const opLabel = OPERATOR_LABELS[assertion.operator] ?? assertion.operator;
  const expectLabel = assertion.expected !== undefined && assertion.expected !== "" ? ` ${assertion.expected}` : "";
  return `${targetLabel} ${opLabel}${expectLabel}`;
}

function labelOfTarget(target: AssertionTarget, key?: string): string {
  switch (target) {
    case "status":
      return "Status code";
    case "duration":
      return "Duration (ms)";
    case "header":
      return key ? `Header "${key}"` : "Header";
    case "body":
      return key ? `Body.${key}` : "Body";
  }
}

const OPERATOR_LABELS: Record<AssertionOperator, string> = {
  equals: "equals",
  "not-equals": "does not equal",
  contains: "contains",
  "not-contains": "does not contain",
  exists: "exists",
  "not-exists": "does not exist",
  "is-array": "is an array",
  "is-object": "is an object",
  "less-than": "is less than",
  "greater-than": "is greater than",
};
