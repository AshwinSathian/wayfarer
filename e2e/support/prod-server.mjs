#!/usr/bin/env node
// Prod-parity static server for e2e: serves the production build and applies
// its `_headers` file the way Cloudflare Workers static assets do, so tests
// see the same CSP as production (worker scripts included). `python3 -m
// http.server` applied no headers at all, which hid the script-sandbox CSP
// failure (F01) from CI.
//
// ponytail: minimal version pulled forward from P1.1 for the Phase 0
// tripwires. Handles path patterns with `*` splats and `:placeholders`, and
// joins duplicate headers with ", ". P1.1 adds detach rules (`! Header`) and
// the parser unit test.
//
// Usage: node e2e/support/prod-server.mjs [root] [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "dist/wayfarer/browser");
const port = Number(process.argv[3] ?? process.env.PORT ?? 4200);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

function parseHeadersFile(text) {
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: toRegExp(line.trim()), headers: [] });
      continue;
    }
    const colon = line.indexOf(":");
    if (colon > 0 && rules.length) {
      rules.at(-1).headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
    }
  }
  return rules;
}

function toRegExp(pattern) {
  const source = pattern
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part) =>
      part === "*" ? ".*" : part.startsWith(":") ? "[^/]+" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("");
  return new RegExp(`^${source}$`);
}

let rules = [];
try {
  rules = parseHeadersFile(await readFile(join(root, "_headers"), "utf8"));
} catch {
  console.error(`prod-server: no _headers in ${root}; build first (npm run build)`);
  process.exit(1);
}

function headersFor(pathname) {
  const out = new Map();
  for (const rule of rules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      out.set(key, out.has(key) ? `${out.get(key)}, ${value}` : value);
    }
  }
  return out;
}

async function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed escape: fall through to the SPA shell, don't crash
  }
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  for (const file of [candidate, join(candidate, "index.html")]) {
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      // not found; try the next candidate
    }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  // Cloudflare never serves the _headers file itself.
  const found = pathname === "/_headers" ? null : await resolveFile(pathname);
  // wrangler.jsonc: not_found_handling = "single-page-application".
  const file = found ?? join(root, "index.html");
  const body = await readFile(file);
  res.statusCode = 200;
  for (const [name, value] of headersFor(pathname)) res.setHeader(name, value);
  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  res.end(req.method === "HEAD" ? undefined : body);
}).listen(port, () => console.log(`prod-server: ${root} on http://localhost:${port}`));
