#!/usr/bin/env node
// The README's feature list is the claims ledger (P7.6): each statement of
// docs/claims.md, in its order, with its marker, between
// <!-- features:start --> and <!-- features:end -->. Every line of the list
// is a claim with a test behind it, so the list says nothing untested.
//
// Usage: node scripts/gen-readme.mjs          writes README.md
//        node scripts/gen-readme.mjs --check  exits 1 when README.md differs
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseLedger } from "./check-claims.mjs";

const START = "<!-- features:start -->";
const END = "<!-- features:end -->";

export function featureList(ledger) {
  return parseLedger(ledger)
    .map(({ id, statement }) => `- ${statement} <!-- claim:${id} -->`)
    .join("\n");
}

export function withFeatures(readme, ledger) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < start) throw new Error(`README.md needs ${START} and ${END} around its feature list`);
  return `${readme.slice(0, start + START.length)}\n${featureList(ledger)}\n${readme.slice(end)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const readme = readFileSync("README.md", "utf8");
  const next = withFeatures(readme, readFileSync("docs/claims.md", "utf8"));
  if (process.argv.includes("--check")) {
    if (next !== readme) {
      console.error("README.md's feature list is not what docs/claims.md gives. Run: npm run gen:readme");
      process.exit(1);
    }
    console.log("README.md's feature list is the claims ledger.");
  } else {
    writeFileSync("README.md", next);
  }
}
