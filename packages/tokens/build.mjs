// Writes src/design-system/tokens.css from the token files. `--check` fails
// when the file in the tree is not what the tokens give (CI runs it).
import { readFileSync, writeFileSync } from "node:fs";
import { THEMES, cssValues, hexColours, sharedNames, theme, typeClasses } from "./tokens.mjs";

const target = new URL("../../src/design-system/tokens.css", import.meta.url);
const SELECTORS = { dark: '[data-theme="dark"],\n:root', light: '[data-theme="light"]' };

function block(name) {
  const values = cssValues(name);
  const tokens = theme(name);
  // The dark block is also :root's, so it holds the shared tokens; the light block only what differs.
  const shared = sharedNames();
  const keys = [...tokens.keys()].filter((key) => name === "dark" || !shared.has(key));
  const lines = [`${SELECTORS[name]} {`, `  color-scheme: ${name};`];
  let group = null;
  for (const key of keys) {
    if (tokens.get(key).group !== group) {
      group = tokens.get(key).group;
      lines.push("", `  /* ${group} */`);
    }
    const names =
      tokens.get(key).$type === "typography"
        ? ["size", "line", "weight", "tracking"].map((part) => `--${key}-${part}`)
        : [`--${key}`];
    for (const prop of names) lines.push(`  ${prop}: ${values[prop]};`);
  }
  return [...lines, "}"].join("\n");
}

const css = [
  "/* Generated from packages/tokens (DTCG 2025.10) by `npm run gen:tokens`. Do not edit:",
  "   change the token files and run it again. What each group is for is in their $description. */",
  "",
  ...THEMES.map(block).join("\n\n").split("\n"),
  "",
].join("\n");

const ts = [
  "// Generated from packages/tokens by `npm run gen:tokens`. Do not edit.",
  "// The colour tokens as hex, for what cannot read a CSS variable: Monaco's themes.",
  `export const TOKEN_COLOURS = ${JSON.stringify(Object.fromEntries(THEMES.map((name) => [name, hexColours(name)])), null, 2).replace(/"([\w-]+)":/g, (m, k) => (/^[a-z]+$/.test(k) ? `${k}:` : m))} as const;`,
  "",
].join("\n");

const typography = [
  "/* Generated from packages/tokens by `npm run gen:tokens`. Do not edit. The app's type",
  "   scale (D3.2): each class reads its style's custom properties in tokens.css. */",
  ...typeClasses().flatMap(({ name, declarations }) => [
    "",
    `.${name} {`,
    ...declarations.map(([prop, value]) => `  ${prop}: ${value};`),
    "}",
  ]),
  "",
].join("\n");

const outputs = [
  [target, css],
  [new URL("../../src/design-system/typography.css", import.meta.url), typography],
  [new URL("../../src/design-system/tokens.ts", import.meta.url), ts],
];

if (process.argv.includes("--check")) {
  const stale = outputs.filter(([file, text]) => readFileSync(file, "utf8") !== text);
  if (stale.length) {
    console.error(
      `${stale.map(([file]) => file.pathname.split("/src/")[1]).join(" and ")}: not what packages/tokens gives; run \`npm run gen:tokens\`.`,
    );
    process.exit(1);
  }
  console.log("tokens.css, typography.css and tokens.ts are what packages/tokens gives.");
} else {
  for (const [file, text] of outputs) writeFileSync(file, text);
  console.log("tokens.css, typography.css and tokens.ts written from packages/tokens.");
}
