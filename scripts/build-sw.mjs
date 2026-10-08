#!/usr/bin/env node
// Builds the service worker (P1.6): type-checks and compiles src/sw.ts with
// TypeScript (already a devDependency), prepends the asset manifest, and
// writes <root>/sw.js. `npm run build` runs it after `ng build`.
//
// The manifest's version is a hash of every precached file, so any deploy
// that changes them changes sw.js, which is how browsers detect an update.
//
// Usage: node scripts/build-sw.mjs [root]   (default dist/wayfarer/browser)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SOURCE = "src/sw.ts";

/** App shell, everything index.html references, all CSS, woff2 fonts, icons, manifest. */
export function precacheList(root) {
  const index = readFileSync(join(root, "index.html"), "utf8");
  const referenced = [...index.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((ref) => !/^[a-z]+:|^\/\//i.test(ref) && ref !== "/");
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1).split("\\").join("/"));
  const extra = files.filter((f) => /\.css$|^media\/.*\.(woff2|ttf)$|^icons\/|^manifest\.webmanifest$|^favicon\.ico$/.test(f));
  return ["/", ...new Set([...referenced, ...extra].map((f) => `/${f.replace(/^\//, "")}`))].sort();
}

export function compileServiceWorker() {
  const options = {
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts", "lib.webworker.d.ts"],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  const program = ts.createProgram([SOURCE], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    const host = { getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" };
    throw new Error(`${SOURCE} does not type-check:\n${ts.formatDiagnostics(diagnostics, host)}`);
  }
  return ts.transpileModule(readFileSync(SOURCE, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

export function writeServiceWorker(root) {
  const precache = precacheList(root);
  const hash = createHash("sha256");
  for (const path of precache) {
    hash.update(path);
    hash.update(readFileSync(join(root, path === "/" ? "index.html" : path.slice(1))));
  }
  const code = compileServiceWorker();
  hash.update(code);
  const manifest = { version: hash.digest("hex").slice(0, 16), precache };
  writeFileSync(join(root, "sw.js"), `const WAYFARER_SW = ${JSON.stringify(manifest)};\n${code}`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  if (args.some((a) => a.startsWith("-"))) {
    console.error("build-sw: unexpected option. Pass Angular options to ng build directly: npx ng build <options> && node scripts/build-sw.mjs");
    process.exit(1);
  }
  const root = args[0] ?? "dist/wayfarer/browser";
  // Angular writes the licences of every bundled package one level above the
  // served folder; the MIT and Apache notices must ship with the bundle.
  const licences = join(root, "..", "3rdpartylicenses.txt");
  if (existsSync(licences)) {
    // extractLicenses stops at direct dependencies. Monaco bundles other
    // projects: its own notices file covers most, and DOMPurify and marked
    // are npm packages of their own.
    const extra = ["monaco-editor/ThirdPartyNotices.txt", "dompurify/LICENSE", "marked/LICENSE.md"]
      .map((file) => `${"-".repeat(80)}\nBundled inside monaco-editor: ${file}\n\n${readFileSync(join("node_modules", file), "utf8")}`)
      .join("\n");
    writeFileSync(join(root, "3rdpartylicenses.txt"), `${readFileSync(licences, "utf8")}\n${extra}`);
  }
  const { version, precache } = writeServiceWorker(root);
  console.log(`build-sw: sw.js version ${version}, ${precache.length} precached files`);
}
