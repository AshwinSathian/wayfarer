// The status, method and button colours that carry text must be readable on
// every surface they sit on, in both themes (WCAG 2.1 AA, 4.5:1). The e2e
// accessibility sweep sees only what one session draws (a GET, a 200); this
// checks every pair from the stylesheets. Run by `npm run test:scripts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cssValues } from "../packages/tokens/tokens.mjs";

/** The custom properties of one theme of controls.css: the dark block is the default, the light block overrides it. */
function theme(css, name) {
  const block = (selector) => {
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `${selector} not found`);
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const dark = block('[data-theme="dark"],\n:root');
  return name === "dark" ? dark : { ...dark, ...block('[data-theme="light"]') };
}

const resolve = (vars, value) => (value.startsWith("var(") ? resolve(vars, vars[value.slice(4, -1).trim()]) : value);

/** `#rrggbb` or `rgba(r, g, b, a)` as [r, g, b, a]. */
function parse(colour) {
  if (colour.startsWith("#")) return [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)).concat(1);
  const parts = colour.match(/[\d.]+/g).map(Number);
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];

function luminance([r, g, b]) {
  const channel = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const controls = readFileSync(new URL("../src/design-system/controls.css", import.meta.url), "utf8");
const SURFACES = ["--canvas-app", "--canvas-sidebar", "--canvas-panel", "--canvas-elevated", "--canvas-overlay"];

for (const name of ["dark", "light"]) {
  // The tokens come from packages/tokens; the controls' variables are built on them in controls.css.
  const vars = { ...cssValues(name), ...theme(controls, name) };
  const colour = (token) =>
    parse(resolve(vars, vars[token] ?? assert.fail(`${token} is not defined in the ${name} theme`)));

  test(`${name}: status and method text reads on its own fill, on every surface`, () => {
    const kinds = [
      ...["success", "warning", "error", "info"].map((k) => [`--status-${k}-text`, `--status-${k}-fill`]),
      ...["get", "post", "put", "patch", "delete", "head", "options"].map((k) => [
        `--method-${k}-text`,
        `--method-${k}-fill`,
      ]),
    ];
    for (const [text, fill] of kinds) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(text), over(colour(fill), colour(surface)));
        assert.ok(ratio >= 4.5, `${text} on ${fill} over ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${name}: status text reads on every surface without a fill`, () => {
    for (const kind of ["success", "warning", "error", "info"]) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(`--status-${kind}-text`), colour(surface));
        assert.ok(ratio >= 4.5, `--status-${kind}-text on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${name}: method text reads on every surface without a fill`, () => {
    for (const kind of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(`--method-${kind}-text`), colour(surface));
        assert.ok(ratio >= 4.5, `--method-${kind}-text on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${name}: every text token reads on every surface, placeholders included`, () => {
    for (const text of [
      "--label-primary",
      "--label-secondary",
      "--label-secondary-on-fill",
      "--label-tertiary",
      "--label-placeholder",
      "--accent-text",
    ]) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(text), colour(surface));
        assert.ok(ratio >= 4.5, `${text} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${name}: the focus ring (--accent) stands out from every surface`, () => {
    for (const surface of SURFACES) {
      const ratio = contrast(colour("--accent"), colour(surface));
      assert.ok(ratio >= 3, `--accent on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: white reads on the accent's fill, at rest, hovered and pressed`, () => {
    for (const state of ["", "-hover", "-active"]) {
      const ratio = contrast([255, 255, 255, 1], colour(`--accent-solid${state}`));
      assert.ok(ratio >= 4.5, `white on --accent-solid${state}: ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: what sits on the primary colour reads on it`, () => {
    const ratio = contrast(colour("--ctl-on-primary"), colour("--ctl-primary"));
    assert.ok(ratio >= 4.5, `--ctl-on-primary on --ctl-primary: ${ratio.toFixed(2)}:1`);
  });

  test(`${name}: a checkbox's tick (--ctl-on-primary) stands out from its box (--accent)`, () => {
    const ratio = contrast(colour("--ctl-on-primary"), colour("--accent"));
    assert.ok(ratio >= 3, `--ctl-on-primary on --accent: ${ratio.toFixed(2)}:1`);
  });

  test(`${name}: selected text reads on its highlight, on every surface`, () => {
    for (const surface of SURFACES) {
      const ratio = contrast(colour("--selection-text"), over(colour("--selection-bg"), colour(surface)));
      assert.ok(ratio >= 4.5, `--selection-text on --selection-bg over ${surface}: ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: white reads on a primary button, at rest, hovered and pressed`, () => {
    for (const state of ["", "-hover", "-active"]) {
      const ratio = contrast([255, 255, 255, 1], colour(`--ctl-primary-fill${state}`));
      assert.ok(ratio >= 4.5, `white on --ctl-primary-fill${state}: ${ratio.toFixed(2)}:1`);
    }
  });
}
