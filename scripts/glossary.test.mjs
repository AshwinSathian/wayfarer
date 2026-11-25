// The glossary (overhaul S1a): the words a user reads, the same everywhere. Reads what a person sees (templates,
// pages of the site, docs, README, the strings file, and the prose strings of the app's and the core's .ts files:
// errors, labels, toasts, confirms) and refuses a banned word or an internal ID. CHANGELOG.md and
// docs/claims.md are history and the ledger: exempt. Run by `npm run test:scripts`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import * as strings from "../packages/core/src/strings.ts";

const root = new URL("../", import.meta.url).pathname;
const read = (dir, pattern) =>
  readdirSync(join(root, dir), { recursive: true })
    .filter((file) => pattern.test(file))
    .map((file) => `${dir}/${file}`);

/** A text without its `<!-- -->` comments: cut where each opens and resumes after where it closes. */
const noComments = (text) =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
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

/**
 * What a person may read in a .ts file: each string literal of two words or more (an identifier, a key or a path has
 * none), not the imports, the types or the comments. A literal that holds markup (an inline template) is read as a
 * template is.
 */
function codeText(source, path) {
  const out = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const text = node.text;
      if (/<\/?[a-z][\w-]*[\s>/]/i.test(text)) out.push(templateText(text));
      else if (/\s/.test(text.trim())) out.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true));
  return out.join("\n");
}

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
  // Not the specs, the dev catalogue or the test helpers: a person reads none of them.
  for (const dir of ["src", "packages/core/src", "packages/site/src"])
    for (const f of read(dir, /\.ts$/))
      if (
        !/\.(spec|test|worker|d)\.ts$|(^|\/)(catalogue|testing|test|vm-libs)\/|(^|\/)(strings|vm-bootstrap)\.ts$/.test(
          f,
        )
      )
        add(f, codeText(readFileSync(join(root, f), "utf8"), f));
  add("README.md", markdownText(readFileSync(join(root, "README.md"), "utf8")));
  add("packages/core/src/strings.ts", stringsText());
  return files;
}

// A word is matched whole and without regard to case. `where` says the files that may still use it.
const BANNED = [
  { name: "Verdict", re: /\bverdicts?\b/i },
  { name: "Depart", re: /\bdepart(?:s|ed|ing|ure|ures)?\b/i },
  { name: "Direct to", re: /\bdirect to\b/i },
  { name: "Route: direct", re: /\broute:\s*direct\b/i },
  { name: "Retry", re: /\bretr(?:y|ies|ied|ying)\b/i },
  { name: "Wire", re: /\bwire\b/i },
  {
    // Where the file format or the API Wayfarer reads, writes or emulates is the subject: the importers and exporters,
    // the scripts' `pm` and the docs that name them. Not Settings, not the composer.
    name: "Postman",
    re: /\bpostman\b/i,
    where:
      /^(docs\/(import|export|postman-compatibility|getting-started|scripts|auth|cli|collections-schema|graphql|trust-center)\.md|docs\/benchmark|README\.md|packages\/site\/src\/(pages\/(compare|index\.astro|llms\.txt\.ts)|lib\/rivals\.ts|components\/CompareClose)|packages\/core\/src\/(import|export)\/|packages\/core\/src\/(ai\/model-call|send\/exchange)\.ts|src\/app\/components\/(import[\w-]*\/|collections\/export-dialog\.(html|ts)|environments\/environment-export-dialog\.html))/,
  },
  { name: "Create vault", re: /\bcreate vault\b/i },
  { name: "No vault", re: /\bno vault\b(?! yet\.)/i },
  { name: "Manage secrets", re: /\bmanage secrets\b/i },
  { name: "journey, station", re: /\b(?:journey|station)s?\b/i },
  {
    name: "internal ID",
    re: /\b(?:U-\d{2,3}|C-\d{3}|[PTW]\d\.\d+|D\d-[a-z]|Task D|plan row|design plan|PLAN-\w+)\b/,
  },
];

function offences() {
  const found = {};
  for (const { path, text } of readable())
    for (const { name, re, where } of BANNED) {
      if (where?.test(path)) continue;
      if (re.test(text)) (found[path] ??= []).push(name);
    }
  return found;
}

test("no page, template, doc or message of the app uses a banned word or an internal ID", () => {
  const fresh = [];
  for (const [path, names] of Object.entries(offences())) for (const name of names) fresh.push(`${path}: ${name}`);
  assert.deepEqual(fresh, [], "a banned word; use the glossary's word (packages/core/src/strings.ts)");
});

test("the strings file is itself clean, and names no Postman, wire or direct", () => {
  assert.deepEqual(offences()["packages/core/src/strings.ts"] ?? [], []);
});

test("every string is plain text: no internal ID, no template left unfilled", () => {
  assert.doesNotMatch(stringsText(), /undefined|\[object/);
});

if (process.env.GLOSSARY_LIST) console.log(JSON.stringify(offences(), null, 2));
