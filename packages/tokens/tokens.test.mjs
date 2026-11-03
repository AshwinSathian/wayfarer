// The token files: their shape, their colours, and that the app uses each one.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { LEVELS, THEMES, cssValues, derivedNames, hexColours, sharedNames, theme, toSrgb } from "./tokens.mjs";

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
      if (!alias && token.$type === "color") assert.equal(token.$value.colorSpace, "oklch", `${key} is not OKLCH`);
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
    token.$type === "typography"
      ? new RegExp(`(?<![\\w-])${key}(?![\\w-])|--${key}-`).test(files)
      : new RegExp(`--${key}(?![\\w-])`).test(files);
  const unused = [...theme("dark")].filter(([key, token]) => !used(key, token)).map(([key]) => key);
  assert.deepEqual(unused, [], "tokens nothing reads: delete them");
});

test("no text is under 12 px: the scale, every font-size in the stylesheets, and Tailwind sizes", () => {
  for (const [key, token] of theme("dark"))
    if (token.$type === "typography")
      assert.ok(token.$value.fontSize.value * 16 >= 12, `${key} is ${token.$value.fontSize.value} rem`);
  const small = [];
  for (const [file, text] of sources(/\.(css|scss)$/)) {
    for (const [line, n] of text.split("\n").map((line, i) => [line, i + 1])) {
      // The icon sizes are an SVG's, not text's.
      if (/^\.icon-/.test(line.trim())) continue;
      const m = line.match(/font-size:\s*([\d.]+)(px|rem)\b/);
      if (m && Number(m[1]) * (m[2] === "rem" ? 16 : 1) < 12) small.push(`${file}:${n}: ${line.trim()}`);
    }
  }
  for (const [file, text] of sources(/\.(html|ts)$/))
    for (const m of text.matchAll(/text-\[([\d.]+)px\]/g)) if (Number(m[1]) < 12) small.push(`${file}: ${m[0]}`);
  assert.deepEqual(small, []);
});

// D3.7 (U-123): a transition names what it moves. `all`, or none named, moves whatever changes, a theme's
// colours among them, and Tailwind's `transition` and `transition-all` are both that.
test("every transition names the properties it moves: no transition-all, and no transition without one", () => {
  const vague = [];
  for (const [file, text] of sources(/\.(css|scss)$/, (file) => /design-system\/tokens\.css$/.test(file))) {
    for (const m of text.matchAll(/\btransition(-property)?\s*:([^;{}]*);/g)) {
      const items = m[2].split(",").map((item) => item.trim());
      // Each item starts with the property it moves; `none` moves nothing.
      const unnamed = items.some((item) => {
        const first = item.split(/\s+/)[0];
        return first === "all" || !/^[a-z-]+$/.test(first);
      });
      if (unnamed) vague.push(`${file}: ${m[0].replace(/\s+/g, " ").trim()}`);
    }
  }
  for (const [file, text] of sources(/\.(html|ts)$/))
    for (const m of text.matchAll(/\bclass(?:Name)?=["']([^"']*)["']/g))
      for (const token of m[1].split(/\s+/))
        if (/^(?:[\w-]+:)*transition(-all)?$/.test(token)) vague.push(`${file}: ${token}`);
  assert.deepEqual(vague, []);
});

test("no stylesheet or template writes a duration or an easing of its own: they are the motion tokens", () => {
  const own = [];
  for (const [file, text] of sources(/\.(css|scss)$/, (file) => /design-system\/tokens\.css$/.test(file))) {
    // A declaration of motion runs on until its semicolon: a transition list spans lines.
    for (const m of text.matchAll(/\b(transition|animation)(-[a-z-]+)?\s*:([^;{}]*);/g)) {
      const value = m[3].replace(/var\(--[\w-]+\)/g, "");
      // 0s is no time at all, which needs no token.
      if (
        /(?<![\w.-])(?!0s\b)[\d.]+m?s\b|\b(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)\b|cubic-bezier|steps\(/.test(
          value,
        )
      )
        own.push(`${file}: ${m[0].replace(/\s+/g, " ").trim()}`);
    }
  }
  for (const [file, text] of sources(/\.(html|ts)$/))
    for (const m of text.matchAll(/(?<![\w-])(duration|delay|ease)-(\d+|in|out|in-out|linear)(?![\w-])/g))
      own.push(`${file}: ${m[0]}`);
  assert.deepEqual(own, []);
});

// D3.6 (U-118): the design system's and the widgets' stylesheets take every colour and shadow from a token.
test("no stylesheet in src/design-system or src/app/ui writes a colour or a shadow of its own", () => {
  const own = [];
  for (const [file, text] of sources(/^(design-system|app\/ui)\/[\w-]+\.css$/, (f) => f === "design-system/tokens.css"))
    for (const [line, n] of text.split("\n").map((line, i) => [line, i + 1])) {
      // A data: URL's mask names its stroke colour, which the mask does not draw; forced colours are system names.
      const code = line.replace(/url\("data:[^"]*"\)/g, "");
      if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/i.test(code))
        own.push(`${file}:${n}: ${line.trim()}`);
    }
  assert.deepEqual(own, []);
});

// DQ11 (U-147): chrome and actions are ink; only a method or a status carries a hue.
test("no colour token outside method and status carries a hue", () => {
  for (const name of THEMES)
    for (const level of LEVELS)
      for (const [key, token] of theme(name, level)) {
        if (token.group === "method" || token.group === "status") continue;
        const colours =
          token.$type === "color" && typeof token.$value === "object"
            ? [token.$value]
            : token.$type === "shadow"
              ? token.$value.map((s) => s.color)
              : [];
        for (const colour of colours)
          assert.ok(colour.components[1] <= 0.015, `${name} ${level}: ${key} has chroma ${colour.components[1]}`);
      }
});

// U-036, U-128: the status colours are the product's own, and a method is not a status.
test("no status colour is one of Apple's system colours, and GET is not success's colour", () => {
  const apple = new Set(
    [
      "FF3B30",
      "FF453A",
      "FF9500",
      "FF9F0A",
      "FFCC00",
      "FFD60A",
      "34C759",
      "30D158",
      "007AFF",
      "0A84FF",
      "5856D6",
      "5E5CE6",
      "AF52DE",
      "BF5AF2",
    ].map((hex) => `#${hex}`),
  );
  for (const name of THEMES) {
    const hex = hexColours(name);
    for (const [key, value] of Object.entries(hex))
      if (key.startsWith("status-")) assert.ok(!apple.has(value.slice(0, 7)), `${name}: ${key} is Apple's ${value}`);
    assert.notEqual(hex["method-get"], hex["status-success"], `${name}: GET is success's colour`);
    assert.notEqual(hex["method-get-text"], hex["status-success-text"], `${name}: GET's text is success's`);
  }
});

// U-149: the increased-contrast theme is the same inputs at the higher targets, not a list of its own.
test("prefers-contrast: more gives every derived colour more contrast, from the same inputs", () => {
  for (const name of THEMES) {
    const [normal, more] = LEVELS.map((level) => theme(name, level));
    for (const key of derivedNames(name)) {
      const [a, b] = [normal, more].map((t) => t.get(key).$value);
      assert.equal(a.components[2], b.components[2], `${name}: ${key} changed its hue`);
      assert.notDeepEqual(a, b, `${name}: ${key} is the same at both levels`);
    }
  }
});

// U-124: a button, a field and a select take their height from a control-height token.
test("every button, field and select takes its height from a control-height token", () => {
  const css = Object.fromEntries(sources(/^app\/ui\/(button|input|select)\.css$/));
  const loose = [];
  for (const [file, text] of Object.entries(css))
    for (const m of text.matchAll(/(?<![\w-])(min-)?height:\s*([^;]+);/g))
      if (!/^(var\(--ctl-height-(sm|md|lg)\)|auto|0|100%)$/.test(m[2].trim())) loose.push(`${file}: ${m[0]}`);
  assert.deepEqual(loose, []);
});

// U-126: three radii and a circle; a corner is never written in px of its own.
test("every corner is a radius token: no other radius, and none in px", () => {
  const off = [];
  for (const [file, text] of sources(/\.(css|html|ts)$/, (f) => /design-system\/tokens\.(css|ts)$/.test(f))) {
    for (const m of text.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g))
      if (/\d+(px|rem)/.test(m[1].replace(/calc\(.*\)/g, ""))) off.push(`${file}: ${m[0]}`);
    for (const m of text.matchAll(/(?<![\w-])rounded(?:-[a-z]{1,2})?-(md|xl|2xl|3xl|4xl)(?![\w-])/g))
      off.push(`${file}: ${m[0]}`);
  }
  assert.deepEqual(off, []);
});

// U-073: text follows the reader's text size. A font size in px stays put at 200% while the boxes in rem grow.
test("no stylesheet writes a font size in px", () => {
  const px = [];
  for (const [file, text] of sources(/\.(css|scss)$/, (f) => f === "design-system/tokens.css"))
    for (const [line, n] of text.split("\n").map((line, i) => [line, i + 1]))
      if (/font-size:\s*[\d.]+px/.test(line)) px.push(`${file}:${n}: ${line.trim()}`);
  for (const [file, text] of sources(/\.(html|ts)$/))
    for (const m of text.matchAll(/text-\[[\d.]+px\]/g)) px.push(`${file}: ${m[0]}`);
  assert.deepEqual(px, []);
});

// U-151: JetBrains Mono's 0 and O are a device pixel apart at 12 px. No element is monospace and a 12 px type class.
test("no monospace text is set under 13 px", () => {
  const small = [];
  for (const [file, text] of sources(/\.(html|ts)$/, (f) => f.endsWith(".spec.ts")))
    for (const m of text.matchAll(/class(?:Name)?="([^"]*)"/g)) {
      const classes = m[1].split(/\s+/);
      if (classes.includes("font-mono") && classes.some((c) => /^type-(footnote|subhead)$/.test(c)))
        small.push(`${file}: ${m[1]}`);
    }
  for (const [key, token] of theme("dark"))
    if (token.$type === "typography" && token.$value.fontFamily === "{font.font-mono}")
      assert.ok(token.$value.fontSize.value * 16 >= 13, `${key} is under 13 px`);
  assert.deepEqual(small, []);
});
