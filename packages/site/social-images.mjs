#!/usr/bin/env node
// Draws each page's social image (W3.1 of PLAN-design.md): 1200 by 630, the page's own title and description on the
// site's paper, in the site's face, with the mark. Run after `astro build`; it reads the titles from the built pages, so
// an image says what its page says. Satori lays the card out as SVG and resvg draws it, in this process, no browser.
//
// Usage: node social-images.mjs <out>
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ogImagePath } from "./src/og-path.mjs";
import { hexColours } from "../tokens/tokens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = join(HERE, "../../node_modules/@fontsource/stix-two-text/files");
const MARK = join(HERE, "../tokens/brand/mark.svg");
// The light theme's colours (W5.1): a card is the page as most people first see it.
const C = hexColours("light");

const unescape = (text) =>
  text.replace(
    /&(amp|lt|gt|quot|#39|#x27);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" })[entity],
  );

/** A built page's title (without the ": Wayfarer…" every title ends with) and description, as the page has them. */
export function cardText(html) {
  const title = unescape(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "Wayfarer").replace(
    /: Wayfarer( API client)?( [a-z]+)?$/,
    "",
  );
  const description = unescape(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "");
  return { title, description };
}

/** The page's path from its file under out/: `docs/auth/index.html` is `/docs/auth/`. */
export function pagePath(file) {
  return `/${file
    .split("\\")
    .join("/")
    .replace(/(^|\/)index\.html$/, "$1")
    .replace(/^404\.html$/, "404/")}`;
}

const el = (type, style, children, props = {}) => ({ type, props: { ...props, style, children } });

/** The card: the mark and the name, the title large, the description, and the page's address at the foot. */
/**
 * A description that fits in `max` characters: whole sentences when they fill at least half of it, else cut at a word,
 * so that a card never ends mid-word.
 */
export function fit(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = head.lastIndexOf(". ");
  if (end >= max / 2) return text.slice(0, end + 1);
  return `${text.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "")}…`;
}

function card({ title, description }, mark, path) {
  const address = `wayfarer.ashwinsathian.com${path === "/" ? "" : path}`;
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      // Satori's boxes are content-box: the padding is outside these.
      width: 1200 - 2 * 88,
      height: 630 - 2 * 72,
      background: C["canvas-app"],
      color: C["label-primary"],
      padding: "72px 88px",
      fontFamily: "STIX Two Text",
    },
    [
      el("div", { display: "flex", alignItems: "center", gap: 18, fontSize: 36, fontWeight: 600 }, [
        el("img", { borderRadius: 10 }, undefined, { src: mark, width: 48, height: 48 }),
        "Wayfarer",
      ]),
      el(
        "div",
        {
          display: "flex",
          width: "100%",
          marginTop: 64,
          fontSize: title.length > 48 ? 64 : 80,
          fontWeight: 600,
          lineHeight: 1.05,
          letterSpacing: -1,
        },
        title,
      ),
      el(
        "div",
        { display: "flex", width: "100%", marginTop: 28, fontSize: 32, lineHeight: 1.35, color: C["label-secondary"] },
        fit(description, title.length > 48 ? 110 : 150),
      ),
      el("div", { display: "flex", flexGrow: 1 }, undefined),
      el("div", { display: "flex", fontSize: 26, color: C["label-secondary"] }, address),
    ],
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node social-images.mjs <out>");
  // The latin files first, latin-ext after them for a glyph the first has not got.
  const fonts = ["latin", "latin-ext"].flatMap((subset) =>
    [400, 600].map((weight) => ({
      name: "STIX Two Text",
      data: readFileSync(`${FONTS}/stix-two-text-${subset}-${weight}-normal.woff`),
      weight,
      style: "normal",
    })),
  );
  const mark = `data:image/svg+xml;base64,${readFileSync(MARK).toString("base64")}`;
  const pages = readdirSync(out, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".html"));
  for (const file of pages) {
    const path = pagePath(file);
    const svg = await satori(card(cardText(readFileSync(join(out, file), "utf8")), mark, path), {
      width: 1200,
      height: 630,
      fonts,
    });
    const target = join(out, ogImagePath(path));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, new Resvg(svg).render().asPng());
  }
  console.log(`social-images: ${pages.length} images in ${out}/og/`);
}
