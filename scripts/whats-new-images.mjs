#!/usr/bin/env node
// Makes the pictures of "What changed in 3.0" (W5.5 of PLAN-design.md) from the design baseline's: each PNG that
// packages/site/src/whats-new.mjs names, at most 1,080 px wide (a 1,440 px capture shown at half a page's width, at
// twice its pixels), cropped where the screen says so, as a JPEG in packages/site/public/whats-new/. It writes their
// sizes to packages/site/src/whats-new-images.mjs, which the page reads for each <img>'s width and height. Chromium
// does the scaling and the encoding: the repository has no image library of its own. Run it again when a capture in
// docs/design/baseline/ changes; scripts/whats-new.test.mjs fails when a picture the page names is missing.
//
// Usage: node scripts/whats-new-images.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { BASELINE, imageName, pictures } from "../packages/site/src/whats-new.mjs";

const OUT = "packages/site/public/whats-new/";
const SIZES = "packages/site/src/whats-new-images.mjs";
const MAX_WIDTH = 1080;
const QUALITY = 78;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const sizes = {};
try {
  const page = await browser.newPage();
  for (const { from, crop } of pictures()) {
    const png = readFileSync(BASELINE + from);
    // A PNG's width and height are in its IHDR chunk.
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    const width = Math.min(w, MAX_WIDTH);
    const height = Math.round((Math.min(h, crop ?? h) * width) / w);
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<body style="margin:0"><img style="display:block;width:${width}px" src="data:image/png;base64,${png.toString("base64")}"></body>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    const name = imageName(from);
    await page.screenshot({ path: OUT + name, type: "jpeg", quality: QUALITY });
    sizes[name] = { width, height, bytes: statSync(OUT + name).size };
  }
} finally {
  await browser.close();
}

const lines = Object.entries(sizes).map(
  ([name, s]) => `  "${name}": { width: ${s.width}, height: ${s.height}, bytes: ${s.bytes} },`,
);
writeFileSync(
  SIZES,
  `// Written by scripts/whats-new-images.mjs: the pictures of "What changed in 3.0", their size in pixels and bytes.\nexport default {\n${lines.join("\n")}\n};\n`,
);
const total = readdirSync(OUT).reduce((sum, file) => sum + statSync(OUT + file).size, 0);
console.log(`whats-new-images: ${Object.keys(sizes).length} pictures, ${Math.round(total / 1024)} kB, in ${OUT}`);
