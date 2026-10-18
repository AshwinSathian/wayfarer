#!/usr/bin/env node
// Moves every script Next writes into a page to a file of its own (PLAN-design 1.8). The site's CSP has no
// 'unsafe-inline', and a page built ahead of time cannot carry a nonce. Each script becomes
// /_next/static/inline/<its SHA-256>.js, in the same place and order, without async or defer, so it runs when it
// did. A script that is data (JSON) is left where it is: a policy does not apply to what is not run.
//
// Usage: node externalize-scripts.mjs <out>
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIR = "_next/static/inline";

/** The page with each inline script replaced by a reference to its file; `files` maps each file's name to its text. */
export function externalize(html, files) {
  return html.replace(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script[^>]*>/gi, (whole, attributes, body) => {
    if (/\ssrc=/i.test(attributes) || /\stype="(application\/(ld\+)?json|importmap)"/i.test(attributes) || body === "") return whole;
    const name = `${createHash("sha256").update(body).digest("hex").slice(0, 32)}.js`;
    files.set(name, body);
    return `<script${attributes} src="/${DIR}/${name}"></script>`;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node externalize-scripts.mjs <out>");
  const files = new Map();
  const pages = readdirSync(out, { recursive: true }).map(String).filter((name) => name.endsWith(".html"));
  for (const page of pages) {
    const path = join(out, page);
    writeFileSync(path, externalize(readFileSync(path, "utf8"), files));
  }
  mkdirSync(join(out, DIR), { recursive: true });
  for (const [name, body] of files) writeFileSync(join(out, DIR, name), body);
  console.log(`externalize-scripts: ${files.size} scripts of ${pages.length} pages moved to /${DIR}/`);
}
