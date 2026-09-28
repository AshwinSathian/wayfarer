#!/usr/bin/env node
// Prod-parity static server for e2e (P1.1): serves the production build and
// applies its `_headers` file the way Cloudflare Workers static assets do, so
// tests see the same headers as production (worker scripts included).
// `python3 -m http.server` applied no headers at all, which hid the
// script-sandbox CSP failure (F01) from CI. Zero dependencies.
//
// `_headers` semantics (https://developers.cloudflare.com/workers/static-assets/headers/):
// a rule is an unindented URL pattern followed by indented `Name: value`
// lines. Patterns are paths or absolute URLs, with one `*` splat and/or
// `:placeholder` segments; both can be referenced in values (`:splat`,
// `:name`). Every matching rule applies; a repeated header name is joined
// with ", "; `! Name` detaches a header set by an earlier rule.
//
// Unmatched paths get index.html with 200, like wrangler.jsonc's
// `not_found_handling: "single-page-application"` without a Worker script.
//
// Usage: node e2e/support/prod-server.mjs [root] [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

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
  ".md": "text/markdown; charset=utf-8",
};

/** @returns {{ pattern: RegExp, absolute: boolean, names: string[], headers: [string, string | null][] }[]} */
export function parseHeadersFile(text) {
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ ...compilePattern(trimmed), headers: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) continue;
    if (trimmed.startsWith("!")) {
      rule.headers.push([trimmed.slice(1).trim().toLowerCase(), null]);
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon > 0) rule.headers.push([trimmed.slice(0, colon).trim().toLowerCase(), trimmed.slice(colon + 1).trim()]);
  }
  return rules;
}

function compilePattern(pattern) {
  const names = [];
  const source = pattern
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part) => {
      if (part === "*") {
        names.push("splat");
        return "(.*)";
      }
      if (/^:[A-Za-z]/.test(part)) {
        names.push(part.slice(1));
        return "([^/]+)";
      }
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return { pattern: new RegExp(`^${source}$`), absolute: /^https?:\/\//.test(pattern), names };
}

/** Headers for a request URL, in rule order, as a Map of lower-case name → value. */
export function headersFor(rules, url) {
  const out = new Map();
  for (const rule of rules) {
    const match = rule.pattern.exec(rule.absolute ? `${url.origin}${url.pathname}` : url.pathname);
    if (!match) continue;
    const values = Object.fromEntries(rule.names.map((name, i) => [name, match[i + 1]]));
    for (const [name, raw] of rule.headers) {
      if (raw === null) {
        out.delete(name);
        continue;
      }
      const value = raw.replace(/:([A-Za-z]\w*)/g, (token, key) => (key in values ? values[key] : token));
      out.set(name, out.has(name) ? `${out.get(name)}, ${value}` : value);
    }
  }
  return out;
}

async function resolveFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed escape: fall through to the SPA shell, don't crash
  }
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  for (const file of [candidate, join(candidate, "index.html")]) {
    const info = await stat(file).catch((error) => (error.code === "ENOENT" || error.code === "ENOTDIR" ? null : Promise.reject(error)));
    if (info?.isFile()) return file;
  }
  return null;
}

function startServer(root, port) {
  return createServer(async (req, res) => {
    try {
      // `_headers` is re-read per request so a test can swap the build in place.
      const rules = parseHeadersFile(await readFile(join(root, "_headers"), "utf8"));
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      // Cloudflare never serves the _headers file itself.
      const found = url.pathname === "/_headers" ? null : await resolveFile(root, url.pathname);
      const file = found ?? join(root, "index.html");
      const body = await readFile(file);
      res.statusCode = 200;
      for (const [name, value] of headersFor(rules, url)) res.setHeader(name, value);
      res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (error) {
      console.error("prod-server:", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }).listen(port, function () {
    console.log(`prod-server: ${root} on http://localhost:${this.address().port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = resolve(process.argv[2] ?? "dist/wayfarer/browser");
  const port = Number(process.argv[3] ?? process.env.PORT ?? 4200);
  await stat(join(root, "_headers")).catch(() => {
    console.error(`prod-server: no _headers in ${root}; build first (npm run build)`);
    process.exit(1);
  });
  startServer(root, port);
}
