// The token files: their shape, their colours, and that the app uses each one.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { THEMES, cssValues, sharedNames, theme, toSrgb } from "./tokens.mjs";

const TYPES = new Set(["color", "dimension", "duration", "cubicBezier", "fontFamily", "shadow"]);

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

test("the app uses every token", () => {
  const root = new URL("../../src/", import.meta.url).pathname;
  const files = readdirSync(root, { recursive: true })
    .filter((file) => /\.(css|scss|html|ts)$/.test(file) && !file.endsWith("design-system/tokens.css"))
    .map((file) => readFileSync(join(root, file), "utf8"))
    .join("\n");
  const unused = [...theme("dark").keys()].filter((key) => !new RegExp(`--${key}(?![\\w-])`).test(files));
  assert.deepEqual(unused, [], "tokens nothing reads: delete them");
});
