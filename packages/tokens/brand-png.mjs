// Draws the brand's pictures from its SVGs (D2.4): the installed app's icons and the favicon's ICO in
// brand/app/, and the social image, brand/social.png. Chromium draws them, as it draws the site's pictures.
// Run after `npm run gen:tokens` when the mark or its colours change: `npm run gen:brand`.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { brandSvgs, iconPaths, wordmark } from "./brand.mjs";
import { hexColours } from "./tokens.mjs";

const out = (name) => new URL(`brand/${name}`, import.meta.url);
const svgs = brandSvgs();
const dataUri = (text) => `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`;

/** An ICO of PNGs: Windows Vista's format, which every browser reads. */
export function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map(({ data }) => data)]);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const draw = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>body{margin:0}img{display:block}</style><img src="${dataUri(svg)}" width="${size}" height="${size}">`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    return page.screenshot({ omitBackground: true });
  };

  mkdirSync(out("app"), { recursive: true });
  for (const size of [192, 512]) writeFileSync(out(`app/icon-${size}.png`), await draw(svgs["mark.svg"], size));
  writeFileSync(out("app/maskable-512.png"), await draw(svgs["maskable.svg"], 512));
  // iOS cuts its own corners and fills what is clear with black: the full square.
  writeFileSync(out("app/apple-touch-icon.png"), await draw(svgs["maskable.svg"], 180));
  const small = [];
  for (const size of [16, 32, 48]) small.push({ size, data: await draw(svgs["mark.svg"], size) });
  writeFileSync(out("app/favicon.ico"), ico(small));

  // The social image: the wordmark and the line the site's home page leads with, on the light canvas.
  const colours = hexColours("light");
  const font = () =>
    readFileSync(
      new URL(`../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2`, import.meta.url),
    ).toString("base64");
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<style>
    @font-face { font-family: A; src: url(data:font/woff2;base64,${font()}); font-weight: 400; }
    body { margin: 0; width: 1200px; height: 630px; box-sizing: border-box; padding: 96px 104px; display: flex;
      flex-direction: column; background: ${colours["canvas-app"]}; font-family: A; }
    img { display: block; align-self: flex-start; height: 104px; width: auto; }
    p { margin: 64px 0 0; font-size: 44px; line-height: 1.3; color: ${colours["label-primary"]}; max-width: 900px; }
    span { margin-top: auto; font-size: 28px; color: ${colours["label-secondary"]}; }
  </style>
  <img src="${dataUri(wordmark("light"))}" alt="">
  <p>An API client that runs in your browser and keeps your work on your device.</p>
  <span>wayfarer.ashwinsathian.com</span>`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluate((img) => img.decode());
  writeFileSync(out("social.png"), await page.screenshot());

  // The icon set's check (D2.4's AC): each icon at 16, 20 and 24 px beside 13 px text, in both themes, at 1x and
  // 2x. Read both sheets after a change to an icon.
  const icon = (d, size) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const cells = (d) =>
    [16, 20, 24].map((size) => `<td>${icon(d, size)}</td>`).join("") + `<td>${icon(d, 14)} Label</td>`;
  const rows = Object.entries(iconPaths())
    .map(([name, d]) => `<tr><th>${name}</th>${cells(d)}<td class="dark-cell"></td>${cells(d)}</tr>`)
    .join("");
  const [light, dark] = [hexColours("light"), hexColours("dark")];
  for (const scale of [1, 2]) {
    const sheet = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 640, height: 400 } });
    await sheet.setContent(`<style>
      @font-face { font-family: A; src: url(data:font/woff2;base64,${font()}); }
      body { margin: 0; background: ${light["canvas-app"]}; font: 13px A; }
      table { border-collapse: collapse; }
      th { font-weight: 400; text-align: left; padding: 4px 12px; color: ${light["label-secondary"]}; }
      td { padding: 4px 8px; color: ${light["label-primary"]}; white-space: nowrap; }
      td svg { display: block; } td:last-child svg, td:nth-child(5) svg { display: inline-block; vertical-align: -2px; }
      tr td:nth-child(n+7) { background: ${dark["canvas-app"]}; color: ${dark["label-primary"]}; }
      .dark-cell { padding: 0 4px; background: ${dark["canvas-app"]}; }
    </style><table>${rows}</table>`);
    await sheet.evaluate(() => document.fonts.ready);
    writeFileSync(out(`icons-${scale}x.png`), await sheet.screenshot({ fullPage: true }));
    await sheet.close();
  }

  await browser.close();
  console.log(
    "brand-png: the app's icons, favicon.ico, social.png and the icon sheets written to packages/tokens/brand/.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
