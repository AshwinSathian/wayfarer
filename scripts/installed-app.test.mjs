// D4.13 (U-088, U-089, U-100): what an installed Wayfarer is told about itself. The window's colours are the
// canvas tokens, not literals of their own; the manifest names and describes the app; the page is British English.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tokens = read("src/design-system/tokens.ts");
const canvas = (theme) => tokens.match(new RegExp(`${theme}: \\{[^}]*?"canvas-app": "(#[0-9A-F]{6})"`, "s"))[1];
const [dark, light] = [canvas("dark"), canvas("light")];

test("index.html: en-GB, the whole screen, and theme-color from each theme's canvas", () => {
  const html = read("src/index.html");
  assert.match(html, /<html lang="en-GB"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, new RegExp(`name="theme-color" content="${dark}" media="\\(prefers-color-scheme: dark\\)"`));
  assert.match(html, new RegExp(`name="theme-color" content="${light}" media="\\(prefers-color-scheme: light\\)"`));
});

test("theme.js sets theme-color to the canvas of the theme it draws", () => {
  const script = read("public/theme.js");
  assert.ok(script.includes(`dark ? "${dark}" : "${light}"`), "theme.js's colours are not the canvas tokens");
});

test("the manifest has an id, a description and the canvas as its colours", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.id, "./");
  assert.ok(manifest.description?.length > 0);
  assert.equal(manifest.theme_color, light);
  assert.equal(manifest.background_color, light);
});

test("the shell pads the safe area and is as tall as the dynamic viewport", () => {
  assert.match(read("src/styles.css"), /\.safe-area \{\s*padding: env\(safe-area-inset-top\)/);
  const shell = read("src/app/components/app-shell/app-shell.html");
  assert.match(shell, /'safe-area flex min-h-dvh /);
  assert.match(shell, /'safe-area flex h-dvh /);
});

// U-101 (D2.4): the full mark where a platform shows the icon as it is, and art for the safe zone only where it cuts.
test("the manifest's icons: the mark at 192 and 512 px for `any`, and one 512 px `maskable` icon", () => {
  const { icons } = JSON.parse(read("public/manifest.webmanifest"));
  assert.deepEqual(
    icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`),
    ["192x192 any", "512x512 any", "512x512 maskable"],
  );
  for (const { src } of icons)
    readFileSync(new URL(`../packages/tokens/brand/app/${src.replace(/^icons\//, "")}`, import.meta.url));
});

test("the mark drawn inline in the app and on the site is the brand's glyph", async () => {
  const { ROUTE } = await import("../packages/tokens/brand.mjs");
  for (const file of ["src/app/shared/icon/mark.ts", "packages/site/src/components/Mark.tsx"])
    assert.ok(read(file).includes(`d="${ROUTE}"`), `${file} does not draw the brand's glyph`);
});
