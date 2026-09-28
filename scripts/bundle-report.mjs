#!/usr/bin/env node
// Bundle report (P1.12): raw and gzip size of the initial files (what
// index.html loads) and of every lazy chunk. Writes bundle-report.json and
// prints a table. CI uploads the JSON as the `bundle-report` artifact.
//
// With --max-initial-gzip=<bytes> it also fails (exit 1) when the initial
// gzip total exceeds that budget; angular.json's budgets only see raw bytes.
//
// Usage: node scripts/bundle-report.mjs [root] [out] [--max-initial-gzip=<bytes>]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const maxGzip = Number(process.argv.find((a) => a.startsWith("--max-initial-gzip="))?.split("=")[1] ?? Infinity);
const root = args[0] ?? "dist/wayfarer/browser";
const out = args[1] ?? "bundle-report.json";

const index = readFileSync(join(root, "index.html"), "utf8");
const initial = new Set([...index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1].replace(/^\//, "")));
const size = (file) => {
  const bytes = readFileSync(join(root, file));
  return { file, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
};
const all = readdirSync(root).filter((f) => /\.(js|css)$/.test(f) && f !== "sw.js" && f !== "ngsw-worker.js");
const initialFiles = all.filter((f) => initial.has(f)).map(size);
const lazyFiles = all.filter((f) => !initial.has(f)).map(size).sort((a, b) => b.raw - a.raw);
const sum = (files, key, ext) => files.filter((f) => !ext || f.file.endsWith(ext)).reduce((s, f) => s + f[key], 0);

const report = {
  initial: {
    raw: sum(initialFiles, "raw"),
    gzip: sum(initialFiles, "gzip"),
    js: { raw: sum(initialFiles, "raw", ".js"), gzip: sum(initialFiles, "gzip", ".js") },
    css: { raw: sum(initialFiles, "raw", ".css"), gzip: sum(initialFiles, "gzip", ".css") },
    files: initialFiles,
  },
  lazy: lazyFiles,
};
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`initial: ${kb(report.initial.raw)} raw, ${kb(report.initial.gzip)} gzip (JS ${kb(report.initial.js.gzip)}, CSS ${kb(report.initial.css.gzip)} gzip)`);
for (const f of initialFiles) console.log(`  ${f.file.padEnd(28)} ${kb(f.raw).padStart(10)} ${kb(f.gzip).padStart(10)}`);
console.log(`lazy: ${lazyFiles.length} files, largest ${lazyFiles[0]?.file} ${kb(lazyFiles[0]?.raw ?? 0)}`);
if (report.initial.gzip > maxGzip) {
  console.error(`Initial bundle is ${report.initial.gzip} bytes gzip, over the ${maxGzip}-byte budget (PLAN Appendix A baseline x 1.10).`);
  process.exit(1);
}
