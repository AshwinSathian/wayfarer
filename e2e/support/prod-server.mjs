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
// A folder is its index.html, and its path without the slash a 307 to the
// path with it; an unmatched path gets the nearest 404.html with a 404, like
// wrangler.jsonc's `not_found_handling: "404-page"` without a Worker script.
//
// Text, script and wasm go compressed, brotli or gzip, as Cloudflare sends
// them (P7.2): measured without it, the page loaded a megabyte it never sends.
//
// With PROD_SERVER_LOG set to a file, each connection, request and answer is
// a line of JSON there (#228: whether a document WebKit waited for arrived).
//
// Usage: node e2e/support/prod-server.mjs [root] [port]
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

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

const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|wasm)|image\/svg\+xml)/;

/** The encoding to send a body of `type` in, for a request's `Accept-Encoding`: brotli, gzip, or none. */
export function encodingFor(accept, type) {
  if (!accept || !COMPRESSIBLE.test(type)) return null;
  const offered = new Map(
    accept.split(",").map((part) => {
      const [name, ...params] = part.trim().toLowerCase().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return [name, q ? Number(q.slice(2)) : 1];
    })
  );
  return ["br", "gzip"].find((name) => (offered.get(name) ?? 0) > 0) ?? null;
}

// Each version of a file is compressed once: a test may swap the build under a running server.
const compressed = new Map();
async function compress(file, body, encoding) {
  const key = `${encoding}:${file}:${(await stat(file)).mtimeMs}:${body.length}`;
  if (!compressed.has(key)) compressed.set(key, encoding === "br" ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) : gzipSync(body));
  return compressed.get(key);
}

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

const isFile = async (file) => (await stat(file).catch((error) => (error.code === "ENOENT" || error.code === "ENOTDIR" ? null : Promise.reject(error))))?.isFile() ?? false;

/** What `pathname` is in `root`: a file, a folder asked for without its slash, or nothing (the nearest 404.html, if any). */
async function resolveFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = null; // malformed escape: a 404, don't crash
  }
  const candidate = decoded === null ? null : normalize(join(root, decoded));
  if (candidate && (candidate === root || candidate.startsWith(root + sep))) {
    const folder = join(candidate, "index.html");
    if (pathname.endsWith("/")) {
      if (await isFile(folder)) return { file: folder };
    } else {
      // `/app/oauth/callback` is `app/oauth/callback.html`: Workers static assets serve a page without its extension (`html_handling`, the default).
      for (const file of [candidate, `${candidate}.html`]) if (await isFile(file)) return { file };
      if (await isFile(folder)) return { slash: true };
    }
  }
  for (let dir = candidate && candidate.startsWith(root) ? candidate : root; ; dir = dirname(dir)) {
    if (dir.startsWith(root) && (await isFile(join(dir, "404.html")))) return { missing: join(dir, "404.html") };
    if (!dir.startsWith(root + sep)) return { missing: null };
  }
}

/** Serves `root` on `port`; with `logFile`, appends a line of JSON to it for each connection, request and answer. */
export function startServer(root, port, logFile) {
  const log = logFile ? (event, fields) => appendFileSync(logFile, `${JSON.stringify({ t: new Date().toISOString(), event, ...fields })}\n`) : () => {};
  const sockets = new WeakMap();
  let connections = 0;
  const server = createServer(async (req, res) => {
    // A field left undefined is left out of the line.
    const request = { socket: sockets.get(req.socket), method: req.method, path: req.url, acceptEncoding: req.headers["accept-encoding"] };
    const sent = {};
    log("request", request);
    res.on("close", () => log(res.writableFinished ? "answered" : "unanswered", { ...request, status: res.statusCode, ...sent }));
    try {
      // `_headers` is re-read per request so a test can swap the build in place.
      const rules = parseHeadersFile(await readFile(join(root, "_headers"), "utf8"));
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      // Cloudflare never serves the _headers file itself.
      const found = url.pathname === "/_headers" ? { missing: join(root, "404.html") } : await resolveFile(root, url.pathname);
      for (const [name, value] of headersFor(rules, url)) res.setHeader(name, value);
      if (found.slash) {
        res.statusCode = 307;
        res.setHeader("location", `${url.pathname}/${url.search}`);
        Object.assign(sent, { bytes: 0 });
        res.end();
        return;
      }
      const file = found.file ?? found.missing;
      res.statusCode = found.file ? 200 : 404;
      if (!file || !(await isFile(file))) {
        Object.assign(sent, { bytes: 0 });
        res.end();
        return;
      }
      const raw = await readFile(file);
      const type = TYPES[extname(file)] ?? "application/octet-stream";
      const encoding = encodingFor(req.headers["accept-encoding"], type);
      const body = encoding ? await compress(file, raw, encoding) : raw;
      Object.assign(sent, { encoding: encoding ?? undefined, bytes: req.method === "HEAD" ? 0 : body.length });
      res.setHeader("content-type", type);
      if (encoding) {
        res.setHeader("content-encoding", encoding);
        res.setHeader("vary", "Accept-Encoding");
      }
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (error) {
      console.error("prod-server:", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });
  server.on("connection", (socket) => {
    // By port as well: e2e/service-worker.spec.ts starts a second server, which writes to the same file.
    const id = `${socket.localPort}#${++connections}`;
    sockets.set(socket, id);
    log("connection", { socket: id });
    socket.on("close", () => log("closed", { socket: id }));
  });
  return server.listen(port, function () {
    console.log(`prod-server: ${root} on http://localhost:${this.address().port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = resolve(process.argv[2] ?? "dist/deploy");
  const port = Number(process.argv[3] ?? process.env.PORT ?? 4200);
  await stat(join(root, "_headers")).catch(() => {
    console.error(`prod-server: no _headers in ${root}; build first (npm run build)`);
    process.exit(1);
  });
  startServer(root, port, process.env.PROD_SERVER_LOG);
}
