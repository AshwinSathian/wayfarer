// D4.9: the run's HTML report is in the app's colours. `packages/core` reads no stylesheet of the app, so the report
// holds the values; this holds them equal to the tokens the app is drawn with.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tokens = read("src/design-system/tokens.ts");
const report = read("packages/core/src/run/report.ts");

const token = (theme, name) => {
  const block = tokens.slice(tokens.indexOf(`${theme}: {`));
  return block.match(new RegExp(`"?${name}"?: "(#[0-9A-F]{6})"`))[1];
};
const reported = (theme, name) => {
  const block = report.slice(report.indexOf(`${theme}: {`, report.indexOf("REPORT_COLOURS")));
  return block.match(new RegExp(`${name}: "(#[0-9A-F]{6})"`))[1];
};

const PAIRS = {
  canvas: "canvas-app",
  panel: "canvas-elevated",
  primary: "label-primary",
  secondary: "label-secondary",
  tertiary: "label-tertiary",
  line: "separator-opaque",
  error: "status-error-text",
};

test("the run report's colours are the app's tokens, light and dark", () => {
  for (const theme of ["light", "dark"])
    for (const [name, tokenName] of Object.entries(PAIRS))
      assert.equal(reported(theme, name), token(theme, tokenName), `${theme} ${name} is ${tokenName}`);
});
