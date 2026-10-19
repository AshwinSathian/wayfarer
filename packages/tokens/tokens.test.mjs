// The token files: their shape, their colours, and that the app uses each one.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { THEMES, cssValues, sharedNames, theme, toSrgb } from "./tokens.mjs";

const TYPES = new Set(["color", "dimension", "duration", "cubicBezier", "fontFamily", "shadow", "typography"]);

test("OKLCH becomes the sRGB it names", () => {
  assert.deepEqual(toSrgb([1, 0, "none"]), [255, 255, 255]);
  assert.deepEqual(toSrgb([0, 0, "none"]), [0, 0, 0]);
  // CSS Color 4's own example: oklch(62.8% 0.2577 29.23) is sRGB red.
  assert.deepEqual(toSrgb([0.627955, 0.257683, 29.2339]), [255, 0, 0]);
  assert.throws(() => toSrgb([0.7, 0.4, 145], "--too-green"), /--too-green is outside sRGB/);
});

test("both themes name the same tokens, and none is also shared", () => {
  const [dark, light] = THEMES.map((name) => [...theme(name).keys()].sort());
  assert.deepEqual(dark, light);
  for (const name of sharedNames()) assert.ok(dark.includes(name));
});

test("every token has a DTCG type this build writes, or is an alias", () => {
  for (const name of THEMES) {
    for (const [key, token] of theme(name)) {
      const alias = typeof token.$value === "string" && /^\{[\w.-]+\}$/.test(token.$value);
      assert.ok(alias || TYPES.has(token.$type), `${key}: $type ${token.$type}`);
      if (token.$type === "color") assert.equal(token.$value.colorSpace, "oklch", `${key} is not OKLCH`);
    }
    // Every colour is inside sRGB and every alias names a token: both would throw.
    assert.doesNotThrow(() => cssValues(name));
  }
});

const root = new URL("../../src/", import.meta.url).pathname;
const sources = (pattern, skip = () => false) =>
  readdirSync(root, { recursive: true })
    .filter((file) => pattern.test(file) && !skip(file))
    .map((file) => [file, readFileSync(join(root, file), "utf8")]);

test("the app uses every token", () => {
  const files = sources(/\.(css|scss|html|ts)$/, (file) => /design-system\/(tokens|typography)\.css$/.test(file))
    .map(([, text]) => text)
    .join("\n");
  // A type style is used by its class (`type-body`); any other token by its custom property.
  const used = (key, token) =>
    token.$type === "typography" ? new RegExp(`(?<![\\w-])${key}(?![\\w-])|--${key}-`).test(files) : new RegExp(`--${key}(?![\\w-])`).test(files);
  const unused = [...theme("dark")].filter(([key, token]) => !used(key, token)).map(([key]) => key);
  assert.deepEqual(unused, [], "tokens nothing reads: delete them");
});

test("no text is under 12 px: the scale, every font-size in the stylesheets, and Tailwind sizes", () => {
  for (const [key, token] of theme("dark")) if (token.$type === "typography") assert.ok(token.$value.fontSize.value >= 12, `${key} is ${token.$value.fontSize.value} px`);
  const small = [];
  for (const [file, text] of sources(/\.(css|scss)$/)) {
    for (const [line, n] of text.split("\n").map((line, i) => [line, i + 1])) {
      // The icon sizes are an SVG's, not text's.
      if (/^\.icon-/.test(line.trim())) continue;
      const m = line.match(/font-size:\s*([\d.]+)(px|rem)\b/);
      if (m && Number(m[1]) * (m[2] === "rem" ? 16 : 1) < 12) small.push(`${file}:${n}: ${line.trim()}`);
    }
  }
  for (const [file, text] of sources(/\.(html|ts)$/)) for (const m of text.matchAll(/text-\[([\d.]+)px\]/g)) if (Number(m[1]) < 12) small.push(`${file}: ${m[0]}`);
  assert.deepEqual(small, []);
});
