#!/usr/bin/env node
// Writes the Content-Security-Policy from security/csp.json into
// public/_headers and the <meta> in src/index.html (P1.5). With --check it
// writes nothing and exits 1 if either file is out of sync.
//
// Usage: node scripts/gen-csp.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// A <meta> policy ignores these (CSP3 §3.3); they only work as a header.
const HEADER_ONLY = new Set(["frame-ancestors", "report-uri", "sandbox"]);

export function serialize(spec, { meta = false } = {}) {
  return Object.entries(spec.directives)
    .filter(([name]) => !(meta && HEADER_ONLY.has(name)))
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

/** Replaces the CSP line of the first `/*` rule in a `_headers` file. */
export function applyToHeaders(text, policy) {
  const pattern = /^(\/\*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+Content-Security-Policy:)[^\r\n]*/m;
  if (!pattern.test(text)) throw new Error("public/_headers: no Content-Security-Policy line under /*");
  return text.replace(pattern, (_, head) => `${head} ${policy}`);
}

/** Replaces the content attribute of the CSP <meta> in index.html. */
export function applyToIndex(text, policy) {
  const pattern = /(http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/;
  if (!pattern.test(text)) throw new Error('src/index.html: no <meta http-equiv="Content-Security-Policy" content="…">');
  return text.replace(pattern, (_, head, tail) => `${head}${policy}${tail}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const check = process.argv.includes("--check");
  const spec = JSON.parse(readFileSync("security/csp.json", "utf8"));
  const targets = [
    ["public/_headers", (text) => applyToHeaders(text, serialize(spec))],
    ["src/index.html", (text) => applyToIndex(text, serialize(spec, { meta: true }).replaceAll('"', "&quot;"))],
  ];
  let stale = [];
  for (const [path, apply] of targets) {
    const current = readFileSync(path, "utf8");
    const next = apply(current);
    if (next === current) continue;
    stale.push(path);
    if (!check) writeFileSync(path, next);
  }
  if (check && stale.length) {
    console.error(`CSP out of sync with security/csp.json: ${stale.join(", ")}. Run npm run gen:csp.`);
    process.exit(1);
  }
  console.log(check ? "CSP in sync." : stale.length ? `Updated ${stale.join(", ")}.` : "CSP already in sync.");
}
