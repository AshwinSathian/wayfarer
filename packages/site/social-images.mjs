#!/usr/bin/env node
// Draws each page's social image (W3.1 of PLAN-design.md): 1200 by 630, the page's own title and description on the
// site's paper, with the app's mark. Run after `next build`; it reads the titles from the built pages, so an image says
// what its page says. next/og's ImageResponse draws them (Satori and resvg, in the page's own process, no browser).
//
// Usage: node social-images.mjs <out>
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ogImagePath } from "./src/og-path.mjs";
import { hexColours } from "../tokens/tokens.mjs";

const FONTS = "../../node_modules/@fontsource/atkinson-hyperlegible-next/files";
const MARK = "../tokens/brand/mark.svg";
// The light theme's colours (W5.1): a card is the page as most people first see it.
const C = hexColours("light");

const unescape = (text) =>
  text.replace(
    /&(amp|lt|gt|quot|#39|#x27);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" })[entity],
  );

/** A built page's title (without the ": Wayfarer…" every title ends with) and description, as the page has them. */
export function cardText(html) {
  const title = unescape(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "Wayfarer").replace(/: Wayfarer( [a-z]+)?$/, "");
  const description = unescape(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "");
  return { title, description };
}

/** The page's path from its file under out/: `docs/auth/index.html` is `/docs/auth/`. */
export function pagePath(file) {
  return `/${file
    .split("\\")
    .join("/")
    .replace(/(^|\/)index\.html$/, "$1")}`;
}

function card({ title, description }, mark, path) {
  const site = `wayfarer.ashwinsathian.com${path === "/" ? "" : path}`;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: C["canvas-app"],
        color: C["label-primary"],
        padding: "72px 80px",
        fontFamily: "Atkinson",
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 } },
      h("img", { src: mark, width: 52, height: 52, style: { borderRadius: 12 } }),
      "Wayfarer",
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          marginTop: 56,
          fontSize: title.length > 48 ? 58 : 70,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -1,
        },
      },
      title,
    ),
    h(
      "div",
      { style: { display: "flex", marginTop: 28, fontSize: 30, lineHeight: 1.35, color: C["label-secondary"] } },
      description.length > 160 ? `${description.slice(0, 157)}…` : description,
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginTop: "auto",
          fontSize: 26,
          color: C["label-secondary"],
        },
      },
      h("div", { style: { display: "flex", width: 120, height: 4, background: C.ink, borderRadius: 2 } }),
      site,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node social-images.mjs <out>");
  const fonts = [
    { name: "Atkinson", data: readFileSync(`${FONTS}/atkinson-hyperlegible-next-latin-400-normal.woff`), weight: 400 },
    { name: "Atkinson", data: readFileSync(`${FONTS}/atkinson-hyperlegible-next-latin-700-normal.woff`), weight: 700 },
  ];
  const mark = `data:image/svg+xml;base64,${readFileSync(MARK).toString("base64")}`;
  const pages = readdirSync(out, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".html") && !/^(404|_not-found)/.test(name));
  for (const file of pages) {
    const path = pagePath(file);
    const png = Buffer.from(
      await new ImageResponse(card(cardText(readFileSync(join(out, file), "utf8")), mark, path), {
        width: 1200,
        height: 630,
        fonts,
      }).arrayBuffer(),
    );
    const target = join(out, ogImagePath(path));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, png);
  }
  console.log(`social-images: ${pages.length} images in ${out}/og/`);
}
