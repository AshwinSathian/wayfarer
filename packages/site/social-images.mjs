#!/usr/bin/env node
// Draws each page's social image (W3.1 of PLAN-design.md): 1200 by 630, the page's own title and description on the
// site's paper, in the site's face, with the mark. Run after `astro build`; it reads the titles from the built pages, so
// an image says what its page says. The card is SVG text, laid out here by measuring each word with resvg, and resvg
// draws it, in this process, no browser.
//
// Usage: node social-images.mjs <out>
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { ogImagePath } from "./src/og-path.mjs";
import { hexColours } from "../tokens/tokens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = join(HERE, "../../node_modules/@fontsource");
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

/**
 * A WOFF 1.0 font as the TrueType file it wraps (resvg reads TrueType, and @fontsource ships WOFF): each table is
 * inflated if it was compressed, and laid out again after a new table directory, four-byte aligned.
 */
export function woffToSfnt(woff) {
  if (woff.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF 1.0 file");
  const count = woff.readUInt16BE(12);
  const tables = Array.from({ length: count }, (_, i) => {
    const at = 44 + i * 20;
    const [offset, compressed, length] = [
      woff.readUInt32BE(at + 4),
      woff.readUInt32BE(at + 8),
      woff.readUInt32BE(at + 12),
    ];
    const raw = woff.subarray(offset, offset + compressed);
    return {
      tag: woff.subarray(at, at + 4),
      checksum: woff.readUInt32BE(at + 16),
      data: compressed < length ? inflateSync(raw) : raw,
    };
  });
  const power = 2 ** Math.floor(Math.log2(count));
  const head = Buffer.alloc(12 + 16 * count);
  head.writeUInt32BE(woff.readUInt32BE(4), 0);
  head.writeUInt16BE(count, 4);
  head.writeUInt16BE(power * 16, 6);
  head.writeUInt16BE(Math.log2(power), 8);
  head.writeUInt16BE(count * 16 - power * 16, 10);
  let offset = head.length;
  const bodies = tables.map((table, i) => {
    table.tag.copy(head, 12 + i * 16);
    head.writeUInt32BE(table.checksum, 16 + i * 16);
    head.writeUInt32BE(offset, 20 + i * 16);
    head.writeUInt32BE(table.data.length, 24 + i * 16);
    const padded = Buffer.alloc(Math.ceil(table.data.length / 4) * 4);
    table.data.copy(padded);
    offset += padded.length;
    return padded;
  });
  return Buffer.concat([head, ...bodies]);
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The card's typesetter: words measured once each with resvg (at 100 px, scaled), and lines broken greedily. */
function typesetter(fontFiles) {
  const font = { fontFiles, loadSystemFonts: false, defaultFontFamily: "Figtree" };
  const widths = new Map();
  const measure = (word, weight) => {
    const key = `${weight} ${word}`;
    if (!widths.has(key)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text x="0" y="150" font-family="${weight === 700 ? "Bricolage Grotesque" : "Figtree"}" font-size="100" font-weight="${weight}">${escape(word)}</text></svg>`;
      widths.set(key, new Resvg(svg, { font }).getBBox()?.width ?? 0);
    }
    return widths.get(key);
  };
  const space = (weight) => measure("n n", weight) - 2 * measure("n", weight);
  /** `text` in lines of at most `width` px at `size`; past `max` lines, the last ends on a whole word and "…". */
  const lines = (text, size, weight, width, max) => {
    const scale = size / 100;
    const out = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      const w =
        next.split(" ").reduce((sum, part) => sum + measure(part, weight), 0) +
        (next.split(" ").length - 1) * space(weight);
      if (w * scale <= width || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    if (out.length <= max) return out;
    const kept = out.slice(0, max);
    kept[max - 1] = `${kept[max - 1].replace(/[\s,;:.]*$/, "")}…`;
    return kept;
  };
  return { font, lines };
}

/** The card: the mark and the name, the title large, the description, and the page's address at the foot. */
function card({ title, description }, mark, path, { lines }) {
  const address = `wayfarer.ashwinsathian.com${path === "/" ? "" : path}`;
  const [left, width] = [88, 1200 - 2 * 88];
  const titleSize = title.length > 48 ? 64 : 80;
  const titleLines = lines(title, titleSize, 700, width, 3);
  const titleTop = 72 + 48 + 64;
  const descTop = titleTop + titleLines.length * titleSize * 1.05 + 28;
  const descLines = lines(
    fit(description, title.length > 48 ? 110 : 150),
    32,
    400,
    width,
    titleLines.length > 2 ? 1 : 2,
  );
  const text = (content, x, y, size, weight, colour) =>
    `<text x="${x}" y="${y}" font-family="${weight === 700 ? "Bricolage Grotesque" : "Figtree"}" font-size="${size}" font-weight="${weight}" fill="${colour}">${escape(content)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">`,
    `<rect width="1200" height="630" fill="${C["canvas-app"]}"/>`,
    `<image href="${mark}" x="${left}" y="72" width="48" height="48"/>`,
    text("Wayfarer", left + 66, 72 + 36, 36, 700, C["label-primary"]),
    ...titleLines.map((line, i) =>
      text(line, left, titleTop + titleSize * (0.82 + i * 1.05), titleSize, 700, C["label-primary"]),
    ),
    ...descLines.map((line, i) => text(line, left, descTop + 32 * (0.82 + i * 1.35), 32, 400, C["label-secondary"])),
    text(address, left, 630 - 72, 26, 400, C["label-secondary"]),
    `</svg>`,
  ].join("");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node social-images.mjs <out>");
  // The faces as the site sets them: Bricolage Grotesque for the title and the name, Figtree for the rest, written as
  // TrueType for resvg. The latin files first, latin-ext after them for a glyph the first has not got.
  const dir = mkdtempSync(join(tmpdir(), "wayfarer-og-"));
  const fontFiles = ["latin", "latin-ext"].flatMap((subset) =>
    [
      ["bricolage-grotesque", 700],
      ["figtree", 400],
    ].map(([face, weight]) => {
      const file = join(dir, `${face}-${subset}-${weight}.ttf`);
      writeFileSync(file, woffToSfnt(readFileSync(`${FONTS}/${face}/files/${face}-${subset}-${weight}-normal.woff`)));
      return file;
    }),
  );
  const type = typesetter(fontFiles);
  const mark = `data:image/svg+xml;base64,${readFileSync(MARK).toString("base64")}`;
  const pages = readdirSync(out, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".html"));
  for (const file of pages) {
    const path = pagePath(file);
    const svg = card(cardText(readFileSync(join(out, file), "utf8")), mark, path, type);
    const target = join(out, ogImagePath(path));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, new Resvg(svg, { font: type.font }).render().asPng());
  }
  console.log(`social-images: ${pages.length} images in ${out}/og/`);
}
