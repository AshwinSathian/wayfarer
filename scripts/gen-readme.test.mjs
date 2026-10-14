// Tests for scripts/gen-readme.mjs (P7.6). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { featureList, withFeatures } from "./gen-readme.mjs";

const LEDGER = `| ID | Statement | Source | Test |
|---|---|---|---|
| C-001 | No telemetry. | README.md | e2e/a.spec.ts |
| C-002 | Secrets are encrypted. | docs/x.md | src/x.spec.ts |
`;

test("the feature list is the ledger's statements, in its order, each with its marker", () => {
  assert.equal(featureList(LEDGER), "- No telemetry. <!-- claim:C-001 -->\n- Secrets are encrypted. <!-- claim:C-002 -->");
});

test("the list goes between the markers and replaces what was there", () => {
  const readme = "# W\n\n<!-- features:start -->\n- old\n<!-- features:end -->\n\nRest.\n";
  assert.equal(withFeatures(readme, LEDGER), "# W\n\n<!-- features:start -->\n- No telemetry. <!-- claim:C-001 -->\n- Secrets are encrypted. <!-- claim:C-002 -->\n<!-- features:end -->\n\nRest.\n");
});

test("a README without the markers is an error, not a silent no-op", () => {
  assert.throws(() => withFeatures("# W\n", LEDGER), /features:start/);
});

test("the repository's README is what the ledger gives", () => {
  const readme = readFileSync("README.md", "utf8");
  assert.equal(withFeatures(readme, readFileSync("docs/claims.md", "utf8")), readme);
});
