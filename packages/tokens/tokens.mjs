// Wayfarer's design tokens (PLAN-design D3.1): DTCG 2025.10 files, read and
// resolved here, for the build that writes them as CSS (build.mjs) and for
// the tests that hold them to their contrast (scripts/contrast.test.mjs).
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`./${name}.tokens.json`, import.meta.url), "utf8"));

export const THEMES = ["dark", "light"];

/** Every token of a file, by its name (the key is the CSS name without `--`), with the group it is in. */
function tokensOf(file) {
  const out = new Map();
  for (const [group, entries] of Object.entries(file)) {
    if (group.startsWith("$")) continue;
    for (const [name, token] of Object.entries(entries)) {
      if (name.startsWith("$")) continue;
      if (out.has(name)) throw new Error(`${name} is defined twice`);
      out.set(name, { ...token, group });
    }
  }
  return out;
}

/** The names of the tokens both themes share. */
export const sharedNames = () => new Set(tokensOf(read("base")).keys());

/** The contrast levels: `normal`, and `more` for `prefers-contrast: more` (D3.6, U-110). */
export const LEVELS = ["normal", "more"];

/** The shared tokens, then the theme's: what one theme holds, with its derived colours solved at a contrast level. */
export function theme(name, level = "normal") {
  if (!THEMES.includes(name)) throw new Error(`no theme ${name}`);
  if (!LEVELS.includes(level)) throw new Error(`no contrast level ${level}`);
  const base = read("base");
  const file = read(name);
  const shared = tokensOf(base);
  const own = tokensOf(file);
  for (const key of own.keys()) if (shared.has(key)) throw new Error(`${key} is in base and in ${name}`);
  const tokens = new Map([...shared, ...own]);
  derive(tokens, file.$extensions["com.wayfarer.inputs"], base.$extensions["com.wayfarer.contrast"][level], name);
  return tokens;
}

/** The names of the colours a theme derives: what the `prefers-contrast: more` block writes again. */
export const derivedNames = (name) =>
  [...theme(name)].filter(([, token]) => token.$extensions?.["com.wayfarer.derive"]).map(([key]) => key);

/**
 * U-149: the label tiers, the control boundary, the state fills and the ink action's states are not
 * hand-set. Each is the neutral of the theme's inputs (hue and chroma) at the lightness, or the ink at the
 * opacity, that just meets its contrast target on every surface it is drawn on (or on the colours its
 * `against` names). Lighter than the surfaces in dark, darker in light. The increased-contrast theme is the
 * same inputs at the `more` targets.
 */
function derive(tokens, inputs, targets, name) {
  const resolved = (key) => {
    const token = tokens.get(key) ?? fail(`${key} names no token`);
    if (typeof token.$value === "string") return resolved(token.$value.slice(1, -1).split(".").pop());
    if (!token.$value) fail(`${key} is used before it is derived`);
    return token.$value;
  };
  const fail = (message) => {
    throw new Error(`${name}: ${message}`);
  };
  const surfaces = [...tokens].filter(([, t]) => t.group === "canvas" || t.group === "surface").map(([key]) => key);
  const lighter = name === "dark";
  for (const [key, token] of tokens) {
    const spec = token.$extensions?.["com.wayfarer.derive"];
    if (!spec) continue;
    const target = targets[spec.contrast] ?? fail(`${key}: no contrast target ${spec.contrast}`);
    const against = (spec.against ?? surfaces).map((k) => luminanceOf(resolved(k)));
    const meets = (lum) => against.every((other) => ratio(lum, other) >= target);
    if (spec.alpha) {
      // The ink at the least opacity that meets the target over each surface.
      const ink = resolved(spec.alpha.slice(1, -1).split(".").pop());
      const over = (alpha) => (k) =>
        luminanceOfRgb(blend(toSrgbFloat(ink.components), alpha, toSrgbFloat(resolved(k).components)));
      const fits = (alpha) => (spec.against ?? surfaces).every((k, i) => ratio(over(alpha)(k), against[i]) >= target);
      if (!fits(1)) fail(`${key} cannot reach ${target}:1`);
      let [lo, hi] = [0, 1];
      for (let i = 0; i < 40; i++) [lo, hi] = fits((lo + hi) / 2) ? [lo, (lo + hi) / 2] : [(lo + hi) / 2, hi];
      token.$value = { colorSpace: "oklch", components: ink.components, alpha: Math.ceil(hi * 1000) / 1000 };
    } else {
      // The lightness nearest the surfaces that still meets the target.
      // The chroma tapers to none at the ends of the lightness range, where sRGB has no room for it.
      const at = (l) => [
        l,
        Math.round(inputs.chroma * Math.min(1, l / 0.1, (1 - l) / 0.1) * 10000) / 10000,
        inputs.hue,
      ];
      const lum = (l) => luminanceOfRgb(toSrgbFloat(at(l)));
      const far = lighter ? 1 : 0;
      if (!meets(lum(far))) fail(`${key} cannot reach ${target}:1`);
      let [near, ok] = [lighter ? 0 : 1, far];
      for (let i = 0; i < 40; i++) {
        const mid = (near + ok) / 2;
        if (meets(lum(mid))) ok = mid;
        else near = mid;
      }
      // Rounded away from the surfaces, so the rounding never takes it under its target.
      const l = lighter ? Math.ceil(ok * 1000) / 1000 : Math.floor(ok * 1000) / 1000;
      token.$value = { colorSpace: "oklch", components: at(l) };
    }
  }
}

/** WCAG 2's relative luminance and contrast ratio. */
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminanceOfRgb = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const luminanceOf = (value) => luminanceOfRgb(toSrgbFloat(value.components));
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const blend = (top, alpha, under) => top.map((c, i) => c * alpha + under[i] * (1 - alpha));
const toSrgbFloat = (components) => toSrgb(components).map((c) => c / 255);

/** A theme's tokens as CSS values, by custom property name; an alias (`{group.name}`) stays a `var()`. */
export function cssValues(name, level = "normal") {
  const tokens = theme(name, level);
  return Object.fromEntries(
    [...tokens].flatMap(([key, token]) =>
      token.$type === "typography" ? typeValues(key, token) : [[`--${key}`, css(key, token, tokens)]],
    ),
  );
}

/** A type style as the custom properties its class reads: `--type-body-size`, `-line`, `-weight`, `-tracking`. */
function typeValues(key, token) {
  const { fontSize, lineHeight, fontWeight, letterSpacing } = token.$value;
  if (fontSize.unit !== "px" || letterSpacing.unit !== "px") throw new Error(`${key}: sizes are in px`);
  return [
    [`--${key}-size`, `${fontSize.value}px`],
    // In px, as the scale was drawn: a ratio times the size can land a fraction of a pixel off.
    [`--${key}-line`, `${Math.round(lineHeight * fontSize.value * 100) / 100}px`],
    [`--${key}-weight`, String(fontWeight)],
    [`--${key}-tracking`, letterSpacing.value ? `${letterSpacing.value}px` : "0"],
  ];
}

/** The type styles, as the classes typography.css holds. */
export function typeClasses() {
  const out = [];
  for (const [key, token] of theme("dark")) {
    if (token.$type !== "typography") continue;
    const family = token.$value.fontFamily;
    const extra = token.$extensions?.["com.wayfarer.css"] ?? {};
    out.push({
      name: key,
      declarations: [
        ...(family === "{font.font-sans}" ? [] : [["font-family", `var(--${family.slice(1, -1).split(".").pop()})`]]),
        ["font-size", `var(--${key}-size)`],
        ["line-height", `var(--${key}-line)`],
        ["font-weight", `var(--${key}-weight)`],
        ["letter-spacing", `var(--${key}-tracking)`],
        ...Object.entries(extra),
      ],
    });
  }
  return out;
}

function css(key, token, tokens) {
  const value = token.$value;
  if (typeof value === "string" && /^\{[\w.-]+\}$/.test(value)) {
    const target = value.slice(1, -1).split(".").pop();
    if (!tokens.has(target)) throw new Error(`${key}: ${value} names no token`);
    return `var(--${target})`;
  }
  switch (token.$type) {
    case "color":
      return colour(key, value);
    case "dimension":
    case "duration":
      return `${value.value}${value.unit}`;
    case "cubicBezier":
      return `cubic-bezier(${value.join(", ")})`;
    case "fontFamily":
      return value.map((family) => (/^[\w-]+$/.test(family) ? family : `'${family}'`)).join(", ");
    case "shadow":
      return value
        .map(
          (s) =>
            [s.offsetX, s.offsetY, s.blur, s.spread].map((d) => (d.value ? `${d.value}${d.unit}` : "0")).join(" ") +
            ` ${colour(key, s.color)}`,
        )
        .join(", ");
    default:
      throw new Error(`${key}: no CSS for $type ${token.$type}`);
  }
}

/**
 * An OKLCH colour as sRGB: `#RRGGBB`, or `rgba()` with its alpha. Every colour
 * here is inside sRGB, so the sRGB value is the colour and no `oklch()` is
 * written beside it; a colour outside sRGB is refused until one is wanted.
 */
export function colour(key, value) {
  if (value.colorSpace !== "oklch") throw new Error(`${key}: colours are written in OKLCH`);
  const rgb = toSrgb(value.components, key);
  const alpha = value.alpha ?? 1;
  if (alpha === 1) return `#${rgb.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}

/** A theme's colours as `#RRGGBB` or `#RRGGBBAA`, by token name: for what cannot read a CSS variable (Monaco). */
export function hexColours(name) {
  const tokens = theme(name);
  const out = {};
  for (const [key, token] of tokens) {
    const target = typeof token.$value === "string" ? tokens.get(token.$value.slice(1, -1).split(".").pop()) : token;
    if (target?.$type !== "color") continue;
    const hex = toSrgb(target.$value.components, key)
      .map((c) => c.toString(16).padStart(2, "0").toUpperCase())
      .join("");
    const alpha = target.$value.alpha ?? 1;
    out[key] = `#${hex}${
      alpha === 1
        ? ""
        : Math.round(alpha * 255)
            .toString(16)
            .padStart(2, "0")
            .toUpperCase()
    }`;
  }
  return out;
}

/** OKLCH to 8-bit sRGB (Björn Ottosson's OKLab). */
export function toSrgb([l, c, h], key = "colour") {
  const hue = h === "none" ? 0 : (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return linear.map((v) => {
    if (v < -1e-4 || v > 1 + 1e-4) throw new Error(`${key} is outside sRGB`);
    const clamped = Math.min(1, Math.max(0, v));
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  });
}
