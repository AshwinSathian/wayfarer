#!/usr/bin/env node
// Claims ledger gate (P1.4). docs/claims.md lists every public claim as a
// row `| C-NNN | statement | source doc | test file(s) |`. Docs mark the
// claim inline with `<!-- claim:C-NNN -->`; a test proves it by carrying
// `@claim:C-NNN` in its title. Fails (exit 1) when:
//   - a doc marker has no ledger row;
//   - a ledger row has no doc marker;
//   - a ledger row has no test titled `@claim:<id>` in the file(s) it names;
//   - a test titled `@claim` has no ID, or an ID with no ledger row;
//   - an ID appears in the ledger twice.
//
// Usage: node scripts/check-claims.mjs   (from the repo root)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const LEDGER = "docs/claims.md";
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".angular", "test-results", "playwright-report", "coverage", "archive"]);
const DOC_ROOTS = ["README.md", "SECURITY.md", "docs", "local-bridge", "packages"];
const TEST_ROOTS = ["e2e", "src", "scripts", "local-bridge", "packages"];
const TEST_FILE = /\.(spec|test)\.(ts|mjs|js)$/;
// This checker's own tests are full of fixture titles like "@claim something".
const SELF_TEST = "scripts/check-claims.test.mjs";
const ID = /C-\d{3}/;

export function parseLedger(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => new RegExp(`^\\|\\s*${ID.source}\\s*\\|`).test(line))
    .map((line) => {
      const [id, statement, source, tests] = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return { id, statement, source, tests: tests.split(/[,\s]+/).map((t) => t.replace(/`/g, "")).filter(Boolean) };
    });
}

/** Titles of test(...), it(...), test.<modifier>(...) and it.each(table)(...) calls, skipping commented-out lines. */
export function testTitles(source) {
  const titles = [];
  // The title is the first argument, or for `.each` the first argument of the call its table is followed by, on the same line.
  const call = /(?:^|[^.\w])(?:test|it)(?:\.each\(.*\)|(?:\.\w+)*)\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const match of line.matchAll(call)) titles.push(match[2]);
  }
  return titles;
}

/** Repo-relative paths under `path` (a file or directory) that satisfy `predicate`. */
function walk(root, path, predicate) {
  const full = join(root, path);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return predicate(path) ? [path] : [];
  return readdirSync(full, { withFileTypes: true })
    .filter((entry) => !SKIP_DIRS.has(entry.name))
    .flatMap((entry) => walk(root, `${path}/${entry.name}`, predicate));
}

export function checkClaims(root) {
  const errors = [];
  const ledgerPath = join(root, LEDGER);
  if (!existsSync(ledgerPath)) return [`${LEDGER} is missing`];
  const rows = parseLedger(readFileSync(ledgerPath, "utf8"));
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) errors.push(`${row.id}: appears in ${LEDGER} more than once`);
    ids.add(row.id);
  }

  // Docs → ledger.
  const markers = new Map(); // id -> [doc paths]
  const docs = DOC_ROOTS.flatMap((dir) => walk(root, dir, (p) => p.endsWith(".md") && p !== LEDGER));
  for (const doc of docs) {
    for (const match of readFileSync(join(root, doc), "utf8").matchAll(/<!--\s*claim:(C-\d{3})\s*-->/g)) {
      const id = match[1];
      if (!ids.has(id)) errors.push(`${id}: marked in ${doc} but has no row in ${LEDGER}`);
      markers.set(id, [...(markers.get(id) ?? []), doc]);
    }
  }

  // Tests → ledger.
  const titled = new Map(); // id -> [test file paths]
  const tests = TEST_ROOTS.flatMap((dir) => walk(root, dir, (p) => TEST_FILE.test(p) && p !== SELF_TEST));
  for (const file of tests) {
    for (const title of testTitles(readFileSync(join(root, file), "utf8"))) {
      if (!/@claim\b/.test(title)) continue;
      const tagged = [...title.matchAll(/@claim:(C-\d{3})/g)].map((m) => m[1]);
      if (!tagged.length) errors.push(`${file}: test "${title}" is tagged @claim but has no claim ID (@claim:C-NNN)`);
      for (const id of tagged) {
        if (!ids.has(id)) errors.push(`${id}: test in ${file} names it, but it has no ledger row in ${LEDGER}`);
        titled.set(id, [...(titled.get(id) ?? []), file]);
      }
    }
  }

  // Ledger → docs and tests.
  for (const row of rows) {
    if (!markers.has(row.id)) errors.push(`${row.id}: has no doc marker <!-- claim:${row.id} --> (ledger says ${row.source})`);
    const files = titled.get(row.id) ?? [];
    if (!files.length) errors.push(`${row.id}: no test titled @claim:${row.id}`);
    for (const expected of row.tests) {
      if (!files.includes(expected)) errors.push(`${row.id}: ${LEDGER} names ${expected}, but no test there is titled @claim:${row.id}`);
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const errors = checkClaims(process.cwd());
  if (errors.length) {
    console.error(`Claims ledger check failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  const count = parseLedger(readFileSync(LEDGER, "utf8")).length;
  console.log(`Claims ledger OK: ${count} claims, each with a doc marker and a test.`);
}
