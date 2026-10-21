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

/** Whether a <script> opening tag is the site's own file or data, not one of Next's. */
function kept(tag) {
  const src = /\ssrc="([^"]*)"/i.exec(tag)?.[1];
  if (src !== undefined) return !src.startsWith("/_next/");
  return /\stype="application\/ld\+json"/i.test(tag);
}

/**
 * The page without Next's scripts and their preloads. Each `<script` is read from its opening to its `</script>`, or
 * to the end of the page when it has none, as a browser reads it: a script left unclosed would still run. Taken out
 * again until nothing changes, so the text around one taken out cannot make another.
 */
export function strip(html) {
  const once = pass(html);
  return once === html ? html : strip(once);
}

function pass(html) {
  const lower = html.toLowerCase();
  let out = "";
  let at = 0;
  for (let open = lower.indexOf("<script", at); open !== -1; open = lower.indexOf("<script", at)) {
    const close = lower.indexOf("</script", open);
    const end = close === -1 ? html.length : lower.indexOf(">", close) + 1 || html.length;
    const tag = html.slice(open, end);
    out += html.slice(at, open) + (kept(tag.slice(0, tag.indexOf(">") + 1 || tag.length)) ? tag : "");
    at = end;
  }
  return (out + html.slice(at)).replace(/<link\b[^>]*\bas="script"[^>]*>/gi, "");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node strip-scripts.mjs <out>");
  const files = readdirSync(out, { recursive: true }).map(String);
  const pages = files.filter((name) => name.endsWith(".html"));
  for (const page of pages) writeFileSync(join(out, page), strip(readFileSync(join(out, page), "utf8")));
  // Next's scripts, and the page data its router would have fetched: nothing asks for them now.
  const unused = files.filter(
    (name) => /^_next[\\/]static[\\/].*\.js$/.test(name) || /(^|[\\/])(index|__next\.[^\\/]*)\.txt$/.test(name),
  );
  for (const name of unused) rmSync(join(out, name));
  console.log(`strip-scripts: Next's scripts out of ${pages.length} pages, ${unused.length} files removed`);
}
