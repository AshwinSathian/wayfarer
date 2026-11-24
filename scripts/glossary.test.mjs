// The glossary (overhaul S1a): the words a user reads, the same everywhere. Reads what a person sees (templates,
// pages of the site, docs, README, the strings file) and refuses a banned word or an internal ID. CHANGELOG.md and
// docs/claims.md are history and the ledger: exempt. Run by `npm run test:scripts`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import * as strings from "../packages/core/src/strings.ts";

const root = new URL("../", import.meta.url).pathname;
const read = (dir, pattern) =>
  readdirSync(join(root, dir), { recursive: true })
    .filter((file) => pattern.test(file))
    .map((file) => `${dir}/${file}`);

/** A text without its `<!-- -->` comments: cut where each opens and resumes after where it closes. */
const noComments = (text) =>
  text
    .split("<!--")
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf("-->") + 3)))
    .join("");

/** What a person reads of an Angular or Astro template: text nodes and the words in a label, a placeholder or a tooltip. */
function templateText(source) {
  const markup = noComments(source.replace(/^---[\s\S]*?---/, ""));
  const out = [];
  for (const m of markup.matchAll(/>([^<>]+)</g)) out.push(m[1]);
  const named = "(?:aria-label|aria-description|placeholder|title|header|label|alt|acceptLabel|uiTooltip|text)";
  for (const m of markup.matchAll(new RegExp(`(?:\\[(?:attr\\.)?${named}\\]|(?<![\\w-])${named})="([^"]*)"`, "g")))
    out.push(m[1]);
  for (const m of markup.matchAll(/\{\{([^}]*)\}\}/g)) for (const s of m[1].matchAll(/'([^']*)'/g)) out.push(s[1]);
  return out.join("\n");
}

/** What a person reads of a Markdown file: the prose, not the code or the link targets. */
const markdownText = (source) =>
  noComments(source)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/\]\([^)]*\)/g, "]");

/** The strings file's values, all of them. */
function stringsText() {
  const out = [];
  const walk = (value) => {
    if (typeof value === "string") out.push(value);
    else if (typeof value === "function") {
      // Filled in with a word, then (for one that wants a list) with a list.
      for (const arg of ["x", ["x"]]) {
        try {
          out.push(value(...Array(6).fill(arg)));
          break;
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
        }
      }
    } else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(strings);
  return out.join("\n");
}

const EXEMPT = new Set(["CHANGELOG.md", "docs/claims.md"]);

/** Every file a person reads, with its text. */
function readable() {
  const files = [];
  const add = (path, text) => files.push({ path, text });
  for (const f of read("src", /\.html$/)) add(`src/${f.slice(4)}`, templateText(readFileSync(join(root, f), "utf8")));
  for (const f of read("packages/site/src", /\.astro$/)) add(f, templateText(readFileSync(join(root, f), "utf8")));
  for (const f of read("docs", /\.md$/)) if (!EXEMPT.has(f)) add(f, markdownText(readFileSync(join(root, f), "utf8")));
  add("README.md", markdownText(readFileSync(join(root, "README.md"), "utf8")));
  add("packages/core/src/strings.ts", stringsText());
  return files;
}

// Only templates (.html, .astro), docs and the strings file are scanned: a user string written in a .ts file is not (S5d
// extends this when it sweeps the copy).
// A word is matched whole and without regard to case. `where` says the files that may still use it.
const BANNED = [
  { name: "Verdict", re: /\bverdicts?\b/i },
  { name: "Depart", re: /\bdepart(?:s|ed|ing|ure|ures)?\b/i },
  { name: "Direct to", re: /\bdirect to\b/i },
  { name: "Route: direct", re: /\broute:\s*direct\b/i },
  { name: "Retry", re: /\bretr(?:y|ies|ied|ying)\b/i },
  { name: "Wire", re: /\bwire\b/i },
  {
    name: "Postman",
    re: /\bpostman\b/i,
    where:
      /^(docs\/(import|export|postman-compatibility|getting-started)\.md|docs\/benchmark|README\.md|packages\/site\/src\/(pages\/compare|components\/CompareClose)|src\/app\/components\/(import[\w-]*\/|collections\/export-dialog\.html|environments\/environment-export-dialog\.html))/,
  },
  { name: "Create vault", re: /\bcreate vault\b/i },
  { name: "No vault", re: /\bno vault\b(?! yet\.)/i },
  { name: "Manage secrets", re: /\bmanage secrets\b/i },
  { name: "journey, station", re: /\b(?:journey|station)s?\b/i },
  { name: "internal ID", re: /\b(?:U-\d{2,3}|C-\d{3}|P\d\.\d+|Task D|plan row|design plan)\b/ },
];

// Offenders today, by file. Each is a word `S5d` (the copy sweep) takes out, and a line leaves this list when it does:
// the test fails on an entry that no longer offends, so the list only shrinks. Nothing new goes in.
const ALLOWED_UNTIL_S5D = {
  "src/app/components/app-shell/app-shell.html": ["Create vault", "No vault"],
  "src/app/components/exchange-record/exchange-record.html": ["Wire"],
  "src/app/components/secrets/secrets-manager.html": ["Create vault"],
  "src/app/components/settings/settings.html": ["Postman", "No vault", "Manage secrets"],
  "src/app/components/variables/variable-rows.html": ["Create vault"],
  "packages/site/src/pages/index.astro": ["Postman"],
  "docs/auth.md": ["Postman", "No vault", "Manage secrets"],
  "docs/benchmark.md": ["No vault", "internal ID"],
  "docs/cli.md": ["Postman"],
  "docs/collections-schema.md": ["Postman"],
  "docs/deployment.md": ["internal ID"],
  "docs/getting-started.md": ["Create vault"],
  "docs/graphql.md": ["Postman"],
  "docs/runbook.md": ["Retry", "internal ID"],
  "docs/scripts.md": ["Postman"],
  "docs/secrets.md": ["Wire"],
  "docs/threat-model.md": ["internal ID"],
  "docs/trust-center.md": ["Postman", "No vault"],
  "docs/variables.md": ["Postman"],
  "README.md": ["No vault"],
};

function offences() {
  const found = {};
  for (const { path, text } of readable())
    for (const { name, re, where } of BANNED) {
      if (where?.test(path)) continue;
      if (re.test(text)) (found[path] ??= []).push(name);
    }
  return found;
}

test("no page, template or doc uses a banned word or an internal ID, but the ones S5d still has to take out", () => {
  const found = offences();
  const fresh = [];
  for (const [path, names] of Object.entries(found))
    for (const name of names) if (!ALLOWED_UNTIL_S5D[path]?.includes(name)) fresh.push(`${path}: ${name}`);
  assert.deepEqual(fresh, [], "a banned word; use the glossary's word (packages/core/src/strings.ts)");
  const stale = [];
  for (const [path, names] of Object.entries(ALLOWED_UNTIL_S5D))
    for (const name of names) if (!found[path]?.includes(name)) stale.push(`${path}: ${name}`);
  assert.deepEqual(stale, [], "no longer offends: take it off the S5d list");
});

test("the strings file is itself clean, and names no Postman, wire or direct", () => {
  assert.deepEqual(offences()["packages/core/src/strings.ts"] ?? [], []);
});

test("every string is plain text: no internal ID, no template left unfilled", () => {
  assert.doesNotMatch(stringsText(), /undefined|\[object/);
});

if (process.env.GLOSSARY_LIST) console.log(JSON.stringify(offences(), null, 2));
