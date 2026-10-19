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

/** The shared tokens, then the theme's: what one theme holds. */
export function theme(name) {
  if (!THEMES.includes(name)) throw new Error(`no theme ${name}`);
  const shared = tokensOf(read("base"));
  const own = tokensOf(read(name));
  for (const key of own.keys()) if (shared.has(key)) throw new Error(`${key} is in base and in ${name}`);
  return new Map([...shared, ...own]);
}

/** A theme's tokens as CSS values, by custom property name; an alias (`{group.name}`) stays a `var()`. */
export function cssValues(name) {
  const tokens = theme(name);
  return Object.fromEntries([...tokens].flatMap(([key, token]) => (token.$type === "typography" ? typeValues(key, token) : [[`--${key}`, css(key, token, tokens)]])));
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
      return value.map((s) => [s.offsetX, s.offsetY, s.blur, s.spread].map((d) => (d.value ? `${d.value}${d.unit}` : "0")).join(" ") + ` ${colour(key, s.color)}`).join(", ");
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
    const hex = toSrgb(target.$value.components, key).map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");
    const alpha = target.$value.alpha ?? 1;
    out[key] = `#${hex}${alpha === 1 ? "" : Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase()}`;
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
