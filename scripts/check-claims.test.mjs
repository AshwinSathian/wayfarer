// Tests for scripts/check-claims.mjs (P1.4). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkClaims, parseLedger, testTitles } from "./check-claims.mjs";

const LEDGER = `# Claims

| ID | Statement | Source | Test |
|---|---|---|---|
| C-001 | No telemetry. | README.md | e2e/a.spec.ts |
| C-002 | Secrets are encrypted. | docs/x.md | src/app/x.spec.ts |
`;

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "claims-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const GOOD = {
  "docs/claims.md": LEDGER,
  "README.md": "No telemetry. <!-- claim:C-001 -->\n",
  "docs/x.md": "Secrets are encrypted. <!-- claim:C-002 -->\n",
  "e2e/a.spec.ts": 'test("@claim:C-001 no third-party requests", async () => {});\n',
  "src/app/x.spec.ts": "it('encrypts @claim:C-002', () => {});\n",
  "docs/threat-model.md": "| Boundary | STRIDE | Threat | Mitigation | Claims |\n|---|---|---|---|---|\n| Page and network | I | Telemetry | None is sent | C-001 |\n",
};

test("parseLedger reads ID, source and test columns", () => {
  assert.deepEqual(parseLedger(LEDGER), [
    { id: "C-001", statement: "No telemetry.", source: "README.md", tests: ["e2e/a.spec.ts"] },
    { id: "C-002", statement: "Secrets are encrypted.", source: "docs/x.md", tests: ["src/app/x.spec.ts"] },
  ]);
});

test("testTitles finds test/it titles in any quote style, including modifiers", () => {
  const src = "test('a @claim:C-001', f);\nit(\"b\", f);\ntest.skip(`c @claim:C-002`, f);\ntest.describe('d', f);\n// test('e @claim:C-003')\n";
  assert.deepEqual(testTitles(src), ["a @claim:C-001", "b", "c @claim:C-002", "d"]);
});

test("testTitles finds the title of a table-driven test, which follows the table", () => {
  const src = 'it.each(ROWS.map((row) => [row.api, row] as const))("@claim:C-040 %s", async (_api, row) => {});\ntest.each([1, 2])(`n %d`, () => {});\nit("plain", () => { each(a)("not a title"); });';
  assert.deepEqual(testTitles(src), ["@claim:C-040 %s", "n %d", "plain"]);
});

test("testTitles finds a title on the line after its call, where a formatter puts a long one", () => {
  const src = 'it.each(cases)(\n  "@claim:C-061 %s: the signature is the suite\'s",\n  async (name) => {},\n);\ntest(\n  `@claim:C-007 long`,\n  () => {},\n);\n// test(\n//   "not a title",\n';
  assert.deepEqual(testTitles(src), ["@claim:C-061 %s: the signature is the suite's", "@claim:C-007 long"]);
});

test("a consistent tree has no errors", () => {
  assert.deepEqual(checkClaims(fixture(GOOD)), []);
});

test("the threat model must exist (P7.4)", () => {
  const { ["docs/threat-model.md"]: _, ...without } = GOOD;
  assert.match(checkClaims(fixture(without)).join("\n"), /docs\/threat-model\.md is missing/);
});

test("a threat model row with no claim, or a claim with no ledger row, fails (P7.4)", () => {
  const model = (row) => ({ ...GOOD, "docs/threat-model.md": `| Boundary | STRIDE | Threat | Mitigation | Claims |\n|---|---|---|---|---|\n${row}\n` });
  assert.match(checkClaims(fixture(model("| Page and bridge | S | Another site | Origin check | |"))).join("\n"), /threat-model\.md: the row "Page and bridge \/ S" links no claim/);
  assert.match(checkClaims(fixture(model("| Page and bridge | S | Another site | Origin check | C-009 |"))).join("\n"), /threat-model\.md: the row "Page and bridge \/ S" links C-009, which has no row/);
  assert.deepEqual(checkClaims(fixture(model("| Page and bridge | S, T | Another site | Origin check | C-001, C-002 |"))), []);
});

test("a doc marker with no ledger row fails", () => {
  const dir = fixture({ ...GOOD, "docs/y.md": "Fast. <!-- claim:C-009 -->\n" });
  assert.match(checkClaims(dir).join("\n"), /C-009.*docs\/y\.md.*no row/);
});

test("a ledger row without a test titled @claim:<id> fails (deleted test)", () => {
  const dir = fixture({ ...GOOD, "e2e/a.spec.ts": 'test("no third-party requests", async () => {});\n' });
  assert.match(checkClaims(dir).join("\n"), /C-001.*no test/);
});

test("a claim ID mentioned only in a comment does not count as a test", () => {
  const dir = fixture({ ...GOOD, "e2e/a.spec.ts": "// @claim:C-001\ntest('x', f);\n" });
  assert.match(checkClaims(dir).join("\n"), /C-001.*no test/);
});

test("a test in a file other than the ledger's Test column fails", () => {
  const dir = fixture({ ...GOOD, "e2e/a.spec.ts": "", "e2e/b.spec.ts": 'test("@claim:C-001 x", f);\n' });
  assert.match(checkClaims(dir).join("\n"), /C-001.*e2e\/a\.spec\.ts/);
});

test("a ledger row with no doc marker fails", () => {
  const dir = fixture({ ...GOOD, "README.md": "No telemetry.\n" });
  assert.match(checkClaims(dir).join("\n"), /C-001.*no doc marker/);
});

test("a test tagged @claim without an ID, or with an unknown ID, fails", () => {
  const dir = fixture({ ...GOOD, "e2e/c.spec.ts": 'test("@claim something", f);\ntest("@claim:C-777 y", f);\n' });
  const errors = checkClaims(dir).join("\n");
  assert.match(errors, /e2e\/c\.spec\.ts.*"@claim something".*no claim ID/);
  assert.match(errors, /C-777.*no ledger row/);
});

test("duplicate ledger IDs fail", () => {
  const dir = fixture({ ...GOOD, "docs/claims.md": LEDGER + "| C-001 | Again. | README.md | e2e/a.spec.ts |\n" });
  assert.match(checkClaims(dir).join("\n"), /C-001.*more than once/);
});

test("the CLI exits 1 with the errors on stderr", () => {
  const dir = fixture({ ...GOOD, "README.md": "" });
  assert.throws(
    () => execFileSync(process.execPath, [join(process.cwd(), "scripts/check-claims.mjs")], { cwd: dir, stdio: "pipe" }),
    (error) => error.status === 1 && /no doc marker/.test(String(error.stderr))
  );
});

test("the repository itself passes", () => {
  assert.deepEqual(checkClaims(process.cwd()), []);
});
