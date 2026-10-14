#!/usr/bin/env node
// Link gate for the docs (P7.6), offline: no request is made. Fails (exit 1)
// when a Markdown file links a repository file that is not there, or when a
// doc under docs/ is not linked from the README. A link to another site, or
// to a heading of the same file, is not checked.
//
// Usage: node scripts/check-links.mjs   (from the repo root)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".angular", "test-results", "playwright-report", "coverage", "fixtures", "vm-libs"]);
// History: written as it was, about files that may since have gone (CLAUDE.md: do not rewrite history).
const HISTORY = new Set(["CHANGELOG.md", "PLAN-airtight-remediation.md", "e2e/FLAKES.md"]);
// Written by the build next to the file that links it (THIRD_PARTY_NOTICES.md is served beside it).
const BUILT = new Set(["3rdpartylicenses.txt"]);

function markdownFiles(root, dir = "") {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return markdownFiles(root, path);
    return path.endsWith(".md") ? [path] : [];
  });
}

/** The targets of a file's inline links, outside code blocks and code spans. */
export function linkTargets(text) {
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((match) => match[1]);
}

export function checkLinks(root) {
  const errors = [];
  const files = markdownFiles(root);
  for (const file of files) {
    if (HISTORY.has(file)) continue;
    for (const target of linkTargets(readFileSync(join(root, file), "utf8"))) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
      const path = normalize(join(dirname(file), decodeURIComponent(target.split("#")[0]))).replaceAll("\\", "/");
      if (!BUILT.has(path) && !existsSync(join(root, path))) errors.push(`${file}: links ${path}, which does not exist`);
    }
  }
  const readme = existsSync(join(root, "README.md")) ? linkTargets(readFileSync(join(root, "README.md"), "utf8")) : [];
  const linked = new Set(readme.map((target) => normalize(target.split("#")[0]).replaceAll("\\", "/")));
  const docs = existsSync(join(root, "docs")) && statSync(join(root, "docs")).isDirectory() ? files.filter((file) => file.startsWith("docs/") && !file.startsWith("docs/archive/")) : [];
  for (const doc of docs) if (!linked.has(doc)) errors.push(`README.md does not link ${doc}`);
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const errors = checkLinks(process.cwd());
  if (errors.length) {
    console.error(`Link check failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log("Links OK: every link leads to a file, and the README links every doc.");
}
