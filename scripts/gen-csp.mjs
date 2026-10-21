#!/usr/bin/env node
// Writes the Content-Security-Policies into packages/site/public/_headers
// (the deploy's root: the site's from security/csp-site.json under /*, the
// docs' from security/csp-docs.json under /docs/* and /pagefind/* (the
// search's worker has its own script's policy), the app's from
// security/csp.json under /app/*) and the app's into the <meta> in
// src/index.html (P1.5, W1). With --check it writes nothing and exits 1 if
// either file is out of sync.
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

/** Replaces the CSP line of the first `rule` (by default `/*`) in a `_headers` file. */
export function applyToHeaders(text, policy, rule = "/*") {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.replace(/\r$/, "") === rule);
  for (let i = start + 1; start >= 0 && i < lines.length && /^[ \t]/.test(lines[i]); i++) {
    const match = /^([ \t]+Content-Security-Policy:)/.exec(lines[i]);
    if (match) {
      lines[i] = `${match[1]} ${policy}${lines[i].endsWith("\r") ? "\r" : ""}`;
      return lines.join("\n");
    }
  }
  throw new Error(`_headers: no Content-Security-Policy line under ${rule}`);
}

/** Replaces the content attribute of the CSP <meta> in index.html. */
export function applyToIndex(text, policy) {
  const pattern = /(http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/;
  if (!pattern.test(text))
    throw new Error('src/index.html: no <meta http-equiv="Content-Security-Policy" content="…">');
  return text.replace(pattern, (_, head, tail) => `${head}${policy}${tail}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const check = process.argv.includes("--check");
  const spec = JSON.parse(readFileSync("security/csp.json", "utf8"));
  const site = JSON.parse(readFileSync("security/csp-site.json", "utf8"));
  const docs = JSON.parse(readFileSync("security/csp-docs.json", "utf8"));
  const targets = [
    [
      "packages/site/public/_headers",
      (text) =>
        [
          ["/*", site],
          ["/docs/*", docs],
          ["/pagefind/*", docs],
          ["/app/*", spec],
        ].reduce((headers, [rule, policy]) => applyToHeaders(headers, serialize(policy), rule), text),
    ],
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
    console.error(
      `CSP out of sync with security/csp.json, csp-site.json or csp-docs.json: ${stale.join(", ")}. Run npm run gen:csp.`,
    );
    process.exit(1);
  }
  console.log(check ? "CSP in sync." : stale.length ? `Updated ${stale.join(", ")}.` : "CSP already in sync.");
}
