#!/usr/bin/env node
// The site is built with React and sends none of it (PLAN-design 1.8): Next renders each page to HTML, and this takes
// out every script Next adds to it, with their files. React in the browser cost the landing 1.1 s of mobile LCP. What
// the pages do in the browser is the site's own scripts (public/site.js, the docs' search, the claims page's
// column), each a file. A script that is data (JSON-LD) stays: it is not run.
//
// Usage: node strip-scripts.mjs <out>
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Whether a <script> tag is the site's own file or data, not one of Next's. */
function kept(tag) {
  const src = /\ssrc="([^"]*)"/i.exec(tag)?.[1];
  if (src !== undefined) return !src.startsWith("/_next/");
  return /\stype="application\/ld\+json"/i.test(tag);
}

/** The page without Next's scripts and their preloads. */
export function strip(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, (tag) => (kept(tag) ? tag : ""))
    .replace(/<link\b[^>]*\bas="script"[^>]*>/gi, "");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node strip-scripts.mjs <out>");
  const files = readdirSync(out, { recursive: true }).map(String);
  const pages = files.filter((name) => name.endsWith(".html"));
  for (const page of pages) writeFileSync(join(out, page), strip(readFileSync(join(out, page), "utf8")));
  // Next's scripts, and the page data its router would have fetched: nothing asks for them now.
  const unused = files.filter((name) => /^_next[\\/]static[\\/].*\.js$/.test(name) || /(^|[\\/])(index|__next\.[^\\/]*)\.txt$/.test(name));
  for (const name of unused) rmSync(join(out, name));
  console.log(`strip-scripts: Next's scripts out of ${pages.length} pages, ${unused.length} files removed`);
}
