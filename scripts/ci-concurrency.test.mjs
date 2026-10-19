// CI's concurrency (v1.2.119): deploy.yml deploys only a successful push run
// of CI on main, so no push run may be cancelled, running or pending; a pull
// request's older run may. Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const [, group, cancel] =
  /^concurrency:\n {2}group: (.+)\n {2}cancel-in-progress: (.+)$/m.exec(
    workflow,
  ) ?? [];
// `true` written as it is, or an expression that gives a boolean.
const cancels = (github) => String(evaluate(cancel, github)) === "true";

// Evaluates the workflow's `${{ }}` expressions for one event: `github.*`,
// quoted strings, `==`, `&&` and `||`, without parentheses. Anything else
// throws, so a new form of expression needs this to learn it first.
function value(expr, github) {
  const or = expr.split("||");
  if (or.length > 1)
    return or.map((e) => value(e, github)).reduce((a, b) => a || b);
  const and = expr.split("&&");
  if (and.length > 1)
    return and.map((e) => value(e, github)).reduce((a, b) => a && b);
  const eq = expr.split("==");
  if (eq.length === 2) return value(eq[0], github) === value(eq[1], github);
  const term = expr.trim();
  const quoted = /^'([^']*)'$/.exec(term);
  if (quoted) return quoted[1];
  const field = /^github\.(\w+)$/.exec(term);
  if (field && Object.hasOwn(github, field[1])) return github[field[1]];
  throw new Error(`not understood: ${term}`);
}

function evaluate(text, github) {
  const whole = /^\$\{\{(.*)\}\}$/s.exec(text.trim());
  if (whole) return value(whole[1], github);
  return text.replace(/\$\{\{(.*?)\}\}/g, (_, expr) =>
    String(value(expr, github)),
  );
}

const push = (sha) => ({
  workflow: "CI",
  event_name: "push",
  ref: "refs/heads/main",
  sha,
});
const pr = (sha) => ({
  workflow: "CI",
  event_name: "pull_request",
  ref: "refs/pull/7/merge",
  sha,
});

test("two pushes to main never share a group, so neither cancels the other", () => {
  assert.notEqual(evaluate(group, push("a1")), evaluate(group, push("b2")));
  assert.equal(cancels(push("a1")), false);
});

test("a pull request's new commit cancels its older run", () => {
  assert.equal(evaluate(group, pr("a1")), evaluate(group, pr("b2")));
  assert.equal(cancels(pr("b2")), true);
});
