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

/** The site's sources (W5.1), without the tokens' output. */
const siteRoot = new URL("../site/src/", import.meta.url).pathname;
const siteSources = (pattern) =>
  readdirSync(siteRoot, { recursive: true })
    .filter((file) => pattern.test(file) && file !== "app/tokens.css")
    .map((file) => [file, readFileSync(join(siteRoot, file), "utf8")]);

test("the app or the site uses every token", () => {
  const files = [
    ...sources(/\.(css|scss|html|ts)$/, (file) => /design-system\/(tokens|typography)\.css$/.test(file)),
    ...siteSources(/\.(css|tsx?|mjs)$/),
  ]
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

// U-153: the layout follows the reader's text size. A breakpoint in px kept a 1,440 px window's wide layout for a reader
// whose default text is twice the size, where the boxes in rem had grown to fill it. In em, a query and the rem of the
// boxes are the same size: the browser's default text size.
test("no breakpoint is in px: a media query and a matchMedia are in em", () => {
  const px = [];
  for (const [file, text] of sources(/\.(css|scss|ts)$/))
    for (const [line, n] of text.split("\n").map((line, i) => [line, i + 1]))
      if (
        /(@media|matchMedia)[^{]*\b(min|max)?-?width\s*[:<>=]+\s*[\d.]+px|(@media|matchMedia)[^{]*[\d.]+px\s*[<>=]+\s*width/.test(
          line,
        )
      )
        px.push(`${file}:${n}: ${line.trim()}`);
  assert.deepEqual(px, []);
});

// W5.1: the site's colours and faces are the tokens'. Its stylesheet and its classes write none of their own.
test("the site writes no colour or face of its own", () => {
  const literal = [];
  // A stylesheet: no colour value and no family but a var(). A class: no arbitrary colour or face (`bg-[#…]`).
  const css = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|font-family:(?!\s*var\()/i;
  const classes = /-\[[^\]]*(#[0-9a-f]{3}|rgba?\(|hsla?\(|oklch\(|rgb_|hsl_)|font-\[/i;
  for (const [file, text] of siteSources(/\.(css|tsx?)$/))
    for (const [line, n] of text.split("\n").map((line, i) => [line, i + 1]))
      if ((file.endsWith(".css") ? css : classes).test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
        literal.push(`${file}:${n}: ${line.trim()}`);
  assert.deepEqual(literal, []);
});

// U-020 (reopened in D5-b): no label is upper case and letter-spaced. The Settings subheads and the section labels were.
// A method is the exception: the wire's own token, written in capitals (GET), drawn as it is sent.
test("no stylesheet or template sets words in upper case; only a method is", () => {
  const found = [];
  for (const [file, text] of sources(/\.(css|scss)$/, (f) => /design-system\/tokens\.css$/.test(f)))
    for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      if (/text-transform:\s*uppercase/.test(block[2]) && !/method/.test(block[1]))
        found.push(`${file}: ${block[1].trim()}`);
  for (const [file, text] of sources(/\.(html|ts)$/))
    for (const m of text.matchAll(/class(?:Name)?="[^"]*(?<![\w-])uppercase(?![\w-])[^"]*"/g))
      found.push(`${file}: ${m[0]}`);
  assert.deepEqual(found, []);
});

// U-181 (U-151's floor): a rule that sets the wire's face does not set it at the 12 px footnote size.
test("no rule sets the mono face at the footnote size", () => {
  const found = [];
  for (const [file, text] of sources(/\.(css|scss)$/))
    for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      if (
        /font-family:\s*var\(--font-mono\)/.test(block[2]) &&
        /font-size:\s*(var\(--type-footnote-size\)|0?\.(7\d*|80\d*)rem|1[0-2](\.\d+)?px)/.test(block[2])
      )
        found.push(`${file}: ${block[1].trim()}`);
  assert.deepEqual(found, []);
});

// U-180: a value shows its characters (U-040). JetBrains Mono joins `=>`, `!=` and `===` into one glyph unless told not
// to, so every rule that sets the mono face turns its ligatures off; Monaco turns its own off (editorText).
test("every rule that sets the mono face turns its ligatures off", () => {
  const found = [];
  const sheets = [...sources(/\.(css|scss|ts)$/, (file) => file.endsWith(".spec.ts")), ...siteSources(/\.css$/)];
  for (const [file, text] of sheets)
    for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      if (/font-family:\s*var\(--font-(mono|code)\)/.test(block[2]) && !/font-variant-ligatures:\s*none/.test(block[2]))
        found.push(`${file}: ${block[1].trim()}`);
  assert.deepEqual(found, []);
});

// U-197 (DQ11): hue means a method or a status. The device's own state (the route chosen, the vault open, the
// environment in use) is not drawn in success's green.
test("the shell's device state is not drawn in a status colour", () => {
  const [[, shell]] = sources(/^app\/components\/app-shell\/app-shell\.html$/);
  const [[, components]] = sources(/^design-system\/components\.css$/);
  const found = [...shell.matchAll(/\[class\.text-status-[a-z]+\]="[^"]*"/g)].map((m) => m[0]);
  const tag = /\.env-active-tag \{[^}]*\}/.exec(components)?.[0] ?? "";
  if (/--status-/.test(tag)) found.push(".env-active-tag uses a status token");
  assert.deepEqual(found, []);
});

// V4, V5 (D5-e): green is a status (a status code, a test that passed), never the app's own state ("Connected",
// "Paired", "Saved") and never a texture. Only the files that draw a status may name success's colour.
test("success's green is drawn only where a status is", () => {
  const draws = new Set([
    "styles.css", // the utility class itself
    "design-system/components.css", // .text-status-success, a status code, a run's passed count
    "design-system/controls.css", // btn-success, a tone of the button
    "app/components/response-viewer/response-viewer.html", // a passing test's glyph
    "app/components/settings/diagnostics-pane.html", // a self-test that passed
    "app/shared/monaco/monaco-loader.ts", // a JSON string's colour, the editor's syntax
  ]);
  const found = sources(/\.(html|ts|css)$/, (file) =>
    /\.spec\.ts$|^design-system\/tokens\.|^app\/catalogue\//.test(file),
  )
    .filter(([file, text]) => !draws.has(file) && /status-success/.test(text))
    .map(([file]) => file);
  assert.deepEqual(found, []);
});

// V5, V12 (D5-e): a status's tint is not a card. A passing test, a warning in a dialog and an option of an import were
// each a tinted, bordered box; a test is a row with its glyph, and a warning a line with its glyph.
test("no test result, import or export report is a tinted card", () => {
  const found = [];
  for (const [file, text] of sources(
    /^app\/components\/(import|collections\/export-dialog|response-viewer)[^/]*\/?[^/]*\.(html|ts|css)$/,
  ))
    for (const m of text.matchAll(/(?:bg|border)-status-[a-z]+-(?:fill|border)|--status-[a-z]+-(?:fill|border)/g))
      found.push(`${file}: ${m[0]}`);
  const [[, components]] = sources(/^design-system\/components\.css$/);
  for (const block of components.matchAll(/(\.test-result[^{]*)\{([^}]*)\}/g))
    if (/background|--status-/.test(block[2])) found.push(`components.css: ${block[1].trim()}`);
  assert.deepEqual(found, []);
});

// U-022 (reopened in D5-b): an empty state says what goes there and what to do, with no dashed box around nothing.
test("no template draws a dashed box", () => {
  const found = [];
  for (const [file, text] of sources(/\.(html|ts)$/))
    for (const m of text.matchAll(/(?<![\w-])border-dashed(?![\w-])/g)) found.push(`${file}: ${m[0]}`);
  assert.deepEqual(found, []);
});
