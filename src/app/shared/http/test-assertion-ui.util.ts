import { AssertionOperator, AssertionTarget } from "../../models/test-assertion.models";

/** Static option lists + pure eligibility rules for the composer's Tests (assertion builder) tab. */

export const ASSERTION_TARGET_OPTIONS: { label: string; value: AssertionTarget }[] = [
  { label: "Status Code", value: "status" },
  { label: "Body", value: "body" },
  { label: "Header", value: "header" },
  { label: "Duration (ms)", value: "duration" },
];

const ALL_OPERATOR_OPTIONS: { label: string; value: AssertionOperator }[] = [
  { label: "equals", value: "equals" },
  { label: "does not equal", value: "not-equals" },
  { label: "contains", value: "contains" },
  { label: "does not contain", value: "not-contains" },
  { label: "exists", value: "exists" },
  { label: "does not exist", value: "not-exists" },
  { label: "is array", value: "is-array" },
  { label: "is object", value: "is-object" },
  { label: "less than", value: "less-than" },
  { label: "greater than", value: "greater-than" },
];

/** Which operators make sense for a given assertion target (status/duration are numeric-ish; array/object shape checks only apply to a body). */
export function operatorsFor(target: AssertionTarget): { label: string; value: AssertionOperator }[] {
  const numericOnly: AssertionOperator[] = ["less-than", "greater-than"];
  if (target === "status" || target === "duration") {
    return ALL_OPERATOR_OPTIONS.filter((o) => !["is-array", "is-object"].includes(o.value));
  }
  return ALL_OPERATOR_OPTIONS.filter((o) => !numericOnly.includes(o.value));
}

/** Whether the target needs a JSON-path/header-name "key" field (body/header do; status/duration don't). */
export function needsKey(target: AssertionTarget): boolean {
  return target === "body" || target === "header";
}

/** Whether the operator needs an "expected value" field (existence/shape checks don't). */
export function needsExpected(operator: AssertionOperator): boolean {
  return !["exists", "not-exists", "is-array", "is-object"].includes(operator);
}
