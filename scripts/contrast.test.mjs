// The status, method and button colours that carry text must be readable on
// every surface they sit on, in both themes (WCAG 2.1 AA, 4.5:1). The e2e
// accessibility sweep sees only what one session draws (a GET, a 200); this
// checks every pair from the stylesheets. Run by `npm run test:scripts`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test as node, test } from "node:test";
import { LEVELS, cssValues } from "../packages/tokens/tokens.mjs";

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
const stylesheet = (path) => readFileSync(new URL(`../src/app/${path}`, import.meta.url), "utf8");

/** The custom property a rule's declaration takes its colour from: `border: 1px solid var(--x)` gives `--x`. */
function declared(css, selector, property) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} not found`);
  const body = css.slice(start, css.indexOf("}", start));
  const value = new RegExp(`\\n\\s*${property}:([^;]+);`).exec(body)?.[1];
  const token = value && /var\((--[\w-]+)\)/.exec(value)?.[1];
  assert.ok(token, `${selector} has no ${property} from a custom property`);
  return token;
}
const SURFACES = [
  "--canvas-app",
  "--canvas-sidebar",
  "--canvas-panel",
  "--canvas-elevated",
  "--canvas-overlay",
  "--surface-overlay",
  "--surface-dialog",
];

for (const [name, level] of ["dark", "light"].flatMap((name) => LEVELS.map((level) => [name, level]))) {
  // The tokens come from packages/tokens, at each contrast level; the controls' variables are built on them in controls.css.
  const vars = { ...cssValues(name, level), ...theme(controls, name) };
  const test = (title, fn) => node(`${name}, ${level} contrast: ${title}`, fn);
  const colour = (token) =>
    parse(resolve(vars, vars[token] ?? assert.fail(`${token} is not defined in the ${name} theme`)));

  test(`status and method text reads on its own fill, on every surface`, () => {
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

  test(`status text reads on every surface without a fill`, () => {
    for (const kind of ["success", "warning", "error", "info"]) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(`--status-${kind}-text`), colour(surface));
        assert.ok(ratio >= 4.5, `--status-${kind}-text on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`method text reads on every surface without a fill`, () => {
    for (const kind of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(`--method-${kind}-text`), colour(surface));
        assert.ok(ratio >= 4.5, `--method-${kind}-text on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`every text token reads on every surface, placeholders included`, () => {
    for (const text of ["--label-primary", "--label-secondary", "--label-tertiary"]) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(text), colour(surface));
        assert.ok(ratio >= 4.5, `${text} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  // D3.6: the focus ring, the selected row's mark, a checked box and every control's edge are 3:1 on every surface.
  test(`the ink (focus ring, marks) and the control boundary stand out from every surface (3:1)`, () => {
    for (const mark of ["--ink", "--ctl-boundary"])
      for (const surface of SURFACES) {
        const ratio = contrast(colour(mark), colour(surface));
        assert.ok(ratio >= 3, `${mark} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
  });

  test(`the label tiers step down: each has less contrast than the one above, on every surface`, () => {
    for (const surface of SURFACES) {
      const [primary, secondary, tertiary] = ["--label-primary", "--label-secondary", "--label-tertiary"].map((t) =>
        contrast(colour(t), colour(surface)),
      );
      assert.ok(primary > secondary && secondary > tertiary, `${surface}: ${primary}, ${secondary}, ${tertiary}`);
    }
  });

  test(`a state shows on every surface: hover over rest, press and selection over hover`, () => {
    for (const surface of SURFACES) {
      const on = (fill) => contrast(over(colour(fill), colour(surface)), colour(surface));
      const [quiet, hover, selected, press] = [
        "--fill-secondary",
        "--fill-hover",
        "--fill-selected",
        "--fill-active",
      ].map(on);
      assert.ok(
        quiet < hover && hover < selected && selected < press,
        `${surface}: ${quiet}, ${hover}, ${selected}, ${press}`,
      );
    }
  });

  test(`the selected row's mark stands out from the selected row, hovered or not (3:1)`, () => {
    for (const surface of SURFACES)
      for (const fill of ["--fill-selected", "--fill-active"]) {
        const ratio = contrast(colour("--ink"), over(colour(fill), colour(surface)));
        assert.ok(ratio >= 3, `--ink on ${fill} over ${surface}: ${ratio.toFixed(2)}:1`);
      }
  });

  test(`the chosen segment's edge stands out from it and from the track's surface (3:1)`, () => {
    const css = stylesheet("ui/segmented.css");
    const chosen = declared(css, ".segment:has(> .segment-input:checked)", "background");
    assert.equal(
      /\n\s*background:\s*transparent;/.test(css.slice(css.indexOf(".segmented {"))),
      true,
      "the track has a fill",
    );
    for (const surface of [...SURFACES, chosen]) {
      const ratio = contrast(colour("--ctl-boundary"), colour(surface));
      assert.ok(ratio >= 3, `--ctl-boundary on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  });

  test(`what is written on the ink reads on it, at rest, hovered and pressed`, () => {
    for (const state of ["--ink", "--ink-hover", "--ink-press"]) {
      const ratio = contrast(colour("--on-ink"), colour(state));
      assert.ok(ratio >= 4.5, `--on-ink on ${state}: ${ratio.toFixed(2)}:1`);
    }
  });

  test(`what sits on the primary colour reads on it`, () => {
    const ratio = contrast(colour("--ctl-on-primary"), colour("--ctl-primary"));
    assert.ok(ratio >= 4.5, `--ctl-on-primary on --ctl-primary: ${ratio.toFixed(2)}:1`);
  });

  test(`a checkbox's tick (--ctl-on-primary) stands out from its box (--ink)`, () => {
    const ratio = contrast(colour("--ctl-on-primary"), colour("--ink"));
    assert.ok(ratio >= 3, `--ctl-on-primary on --ink: ${ratio.toFixed(2)}:1`);
  });

  test(`selected text reads on its highlight, on every surface`, () => {
    for (const surface of SURFACES) {
      const ratio = contrast(colour("--selection-text"), over(colour("--selection-bg"), colour(surface)));
      assert.ok(ratio >= 4.5, `--selection-text on --selection-bg over ${surface}: ${ratio.toFixed(2)}:1`);
    }
  });

  // D4.11 (U-106 to U-108): what the gate did not check, a control's boundary, a fill used as a state, a label on a fill.
  test(`an unchecked checkbox's border stands out from every surface (3:1)`, () => {
    const border = declared(stylesheet("ui/checkbox.css"), ".ui-checkbox", "border");
    for (const surface of SURFACES) {
      const ratio = contrast(over(colour(border), colour(surface)), colour(surface));
      assert.ok(ratio >= 3, `${border} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  });

  test(`the select's option the keys are on is marked at 3:1 on the list`, () => {
    const css = stylesheet("ui/select.css");
    const mark = declared(css, '.ui-select-option[data-active="true"]', "box-shadow");
    const list = declared(css, ".ui-select-panel", "background");
    const row = over(colour("--fill-hover"), colour(list));
    const ratio = contrast(colour(mark), row);
    assert.ok(ratio >= 3, `${mark} on --fill-hover over ${list}: ${ratio.toFixed(2)}:1`);
  });

  test(`the labels that sit on a status fill read on it (4.5:1)`, () => {
    for (const kind of ["success", "warning", "error", "info"]) {
      for (const label of ON_FILL) {
        for (const surface of SURFACES) {
          const ratio = contrast(colour(label), over(colour(`--status-${kind}-fill`), colour(surface)));
          assert.ok(ratio >= 4.5, `${label} on --status-${kind}-fill over ${surface}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
  });

  test(`what sits on a primary button reads on it, at rest, hovered and pressed`, () => {
    for (const state of ["", "-hover", "-active"]) {
      const ratio = contrast(colour("--ctl-on-primary"), colour(`--ctl-primary-fill${state}`));
      assert.ok(ratio >= 4.5, `--ctl-on-primary on --ctl-primary-fill${state}: ${ratio.toFixed(2)}:1`);
    }
  });
}

/** The labels a status fill may hold. The others are under 4.5:1 on one fill or another, in one theme or the other. */
const ON_FILL = ["--label-primary", "--label-secondary"];

test("no template puts a grey label that does not read on a status fill inside one", () => {
  const app = new URL("../src/app/", import.meta.url).pathname;
  const found = [];
  for (const file of readdirSync(app, { recursive: true })) {
    if (!/\.(html|ts)$/.test(file) || file.endsWith(".spec.ts")) continue;
    const source = readFileSync(`${app}${file}`, "utf8");
    // Each element that opens with a status fill, to the end of the element (its tag's closing name).
    for (const m of source.matchAll(/<(\w[\w-]*)\b[^>]*\bbg-status-\w+-fill\b[^>]*>/g)) {
      // The element's own static classes and what it holds; a bound ternary names a fill and a grey as alternatives.
      const close = source.indexOf(`</${m[1]}`, m.index);
      const own = / class="([^"]*)"/.exec(m[0])?.[1] ?? "";
      const inside = own + source.slice(m.index + m[0].length, close === -1 ? undefined : close);
      for (const grey of inside.matchAll(/\btext-label-tertiary\b/g))
        found.push(`${file}: ${grey[0]} on a status fill`);
    }
  }
  assert.deepEqual(found, []);
});

// D3.6 (U-109): a control's edge is the boundary token, never a separator's hairline.
test("no field, select, segmented choice, checkbox or file field reads --separator", () => {
  for (const file of ["input", "select", "segmented", "checkbox", "file"])
    assert.ok(!/--separator\b/.test(stylesheet(`ui/${file}.css`)), `ui/${file}.css reads --separator`);
});
