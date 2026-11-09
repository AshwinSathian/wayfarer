// W5.3 of PLAN-design.md: a doc names only controls the app has. A name in the
// docs is one of four shapes, which the user guides use for a control:
//   - bold inside a sentence ("choose **Collection settings…**"). Bold that
//     starts a paragraph, a list item or a table cell is a lead-in
//     ("**Files.** A file is named…"), not a control, and is skipped;
//   - a short phrase in quotes that starts with a capital ("Include
//     credentials"), up to five words and not a sentence: longer, it is a
//     message or a sentence quoted;
//   - a Settings path ("Settings › Local Bridge", "Settings → Reset all data");
//   - a capitalised word before "tab" ("the Network tab").
// The app's names are the strings of src/app (templates and code) and of the
// e2e suite (its roles and labels); a doc's own headings count too, since a
// quote may name a section ("see "Collection runs""). A name that none holds
// is a control the app no longer has, or never had. The test reads files only,
// so it is quick and needs no browser.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url).pathname;
const files = (dir, ext) =>
  readdirSync(join(root, dir), { recursive: true })
    .map(String)
    .filter((f) => ext.test(f))
    .map((f) => join(dir, f));

/**
 * The docs a person reads to use the app. Not the operations docs, which name the controls of Cloudflare's and
 * GitHub's dashboards, nor the compatibility matrix, generated from `pm`'s API, nor the benchmark, which names the
 * rivals' controls.
 */
const DOCS = [
  "README.md",
  ...files("docs", /^[^/]+\.md$/).filter(
    (f) => !/\/(runbook|deployment|self-hosting|postman-compatibility|benchmark)\.md$/.test(f),
  ),
];

/** Phrases of those shapes that name no control of the app. Each says what it is. */
const NOT_CONTROLS = new Set([
  "Postman's globals become an environment too", // import.md: bold for its weight
  "Script exceeded the stack limit", // scripts.md: the start of the engine's message, quoted
  "Local Network Access detected", // browser-limits.md: Firefox's words, not ours
  "CAIQ-lite", // trust-center.md: the name of a questionnaire
]);

/** Every string literal and text node of the app's code and templates and of the e2e suite. */
function appNames() {
  const names = new Set();
  // A placeholder is `{}` on both sides: the code's `Send to ${to}` is the doc's "Send to {host}".
  const add = (s) => {
    const t = s
      .replace(/\$\{[^}]*\}/g, "{}")
      .replace(/\s+/g, " ")
      .trim();
    if (t) names.add(t);
  };
  // Core's messages are the app's words too ("Script exceeded memory limit (64 MB)"); not its tests.
  const core = files("packages/core/src", /\.ts$/).filter((f) => !/\.(spec|test)\.ts$/.test(f));
  for (const file of [...files("src/app", /\.(ts|html)$/), ...files("e2e", /\.ts$/), ...core]) {
    const text = readFileSync(join(root, file), "utf8");
    if (file.endsWith(".ts")) {
      const visit = (node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text);
        if (ts.isTemplateExpression(node))
          add(node.head.text + node.templateSpans.map((s) => `{}${s.literal.text}`).join(""));
        ts.forEachChild(node, visit);
      };
      visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest));
      continue;
    }
    // A template: its text, its attributes, and the literals of a bound attribute's expression.
    for (const m of text.matchAll(/>([^<>]+)</g)) add(m[1].replace(/\{\{[^}]*\}\}/g, "{}"));
    for (const [, value] of text.matchAll(/="([^"]*)"/g)) {
      add(value);
      for (const m of value.matchAll(/'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
    }
    for (const m of text.matchAll(/\{\{([^}]*)\}\}/g))
      for (const s of m[1].matchAll(/"([^"]*)"|'([^']*)'/g)) add(s[1] ?? s[2]);
  }
  return names;
}

/** A line that begins an item of its own: a list item, a quote, a table row. A paragraph's other lines join it. */
const ITEM = /^\s*([-*>|]|\d+\.)\s/;

/** `markdown`'s paragraphs and list items outside code fences, each as one line of text, with the line it starts on. */
function items(markdown) {
  const out = [];
  let fenced = false;
  markdown.split("\n").forEach((line, i) => {
    const fence = line.startsWith("```");
    if (fence) fenced = !fenced;
    const last = out.at(-1);
    if (fenced || fence || line.trim() === "") out.push({ line: i + 1, text: "" });
    else if (!last || last.text === "" || ITEM.test(line)) out.push({ line: i + 1, text: line });
    else last.text += ` ${line.trim()}`;
  });
  return out.filter((item) => item.text !== "");
}

/** The control names `markdown` uses that `names` does not hold, as `line: name`. */
function staleNames(markdown, names) {
  // A doc may name an item that asks for more without its ellipsis: "Reset all data" is "Reset all data…".
  const known = (part) => {
    // A value the doc leaves out is `{host}` or a spaced "…": "Export … as HAR…" is the code's `Export ${x} as HAR…`.
    const name = part
      .replace(/^["“]|["”]$/g, "")
      .replace(/\{\w+\}| …(?= |$)/g, (m) => (m === " …" ? " {}" : "{}"))
      .trim();
    return names.has(name) || names.has(`${name}…`);
  };
  const stale = [];
  const check = (flag, name) => {
    if (!/^([A-Z]|cURL)/.test(name) || name.length < 2 || /[.`]$|`/.test(name) || NOT_CONTROLS.has(name)) return;
    if (!name.split(/\s*[›→]\s*|: /).every(known)) flag(name);
  };
  for (const { line, text } of items(markdown)) {
    const flag = (name) => stale.push(`${line}: ${name}`);
    for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
      const before = text.slice(0, m.index);
      const name = m[1].replace(/["“”]/g, "").trim();
      if (/^\s*([-*>]|\d+\.)?\s*$/.test(before) || /\|\s*$/.test(before) || name.split(" ").length > 6) continue;
      check(flag, name);
    }
    const plain = text.replace(/\*\*/g, "");
    // Not inside code: `"$id": "wayfarer/workspace"` is a file's text.
    for (const m of plain.replace(/`[^`]*`/g, "").matchAll(/"([^"]+)"|“([^”]+)”/g)) {
      const name = (m[1] ?? m[2]).trim();
      if (name.split(" ").length <= 5) check(flag, name);
    }
    // A Settings path in running text: each step after "Settings" is a name, the longest that its words begin.
    for (const m of plain.matchAll(/\bSettings((?:\s*[›→]\s*[^›→]+)+)/g)) {
      for (const step of m[1].split(/\s*[›→]\s*/).slice(1)) {
        const words = step.split(/\s+/).slice(0, 6);
        if (
          !words.some((_, n) =>
            known(
              words
                .slice(0, n + 1)
                .join(" ")
                .replace(/[.,;:)]+$/, ""),
            ),
          )
        ) {
          flag(`Settings › ${words[0]}`);
        }
      }
    }
    // "the Body tab", "The Tests tab": the capitalised words before "tab", without a sentence's determiner.
    for (const m of plain.matchAll(/\b((?:[A-Z][\w-]*)(?: [A-Z][\w-]*)*) tab\b/g)) {
      const name = m[1].replace(/^(The|This|That|Its|Each|Every|Another|A|An)( |$)/, "");
      if (name !== "" && !known(name)) flag(`${name} tab`);
    }
  }
  return stale;
}

test("every control a user doc names is one the app has", () => {
  const names = appNames();
  const texts = DOCS.map((doc) => [doc, readFileSync(join(root, doc), "utf8")]);
  for (const [, text] of texts) for (const [, heading] of text.matchAll(/^#+ (.+)$/gm)) names.add(heading.trim());
  const stale = texts.flatMap(([doc, text]) => staleNames(text, names).map((s) => `${doc}:${s}`));
  assert.deepEqual(stale, [], "a doc names a control no template and no e2e spec holds: write the app's name");
});

test("the check finds a name the app does not have, in each shape", () => {
  const names = new Set([
    "Network",
    "Local Bridge",
    "Collection settings…",
    "Client sent in",
    "Request body",
    "Reset all data…",
    "Send to {} for this run",
  ]);
  const doc = [
    "**Lead-in.** Open the **Network** tab, or **Request settings**.",
    "- **A list item's lead-in** is not a name. Choose **Collection settings…**.",
    "Set **Client sent in: Request body**, then Settings › Local Bridge says so. Its",
    "**Network** tab is a name inside a paragraph.",
    "",
    "Settings › General holds it, and the Options tab too; Settings → Reset all data empties it.",
    '"Export with credentials" writes them; "Send to {host} for this run" asks; "A long quoted sentence of the app" is not a name.',
    "```",
    "**Not read** in a fence, nor the Fenced tab",
    "```",
  ].join("\n");
  assert.deepEqual(staleNames(doc, names), [
    "1: Request settings",
    "6: Export with credentials",
    "6: Settings › General",
    "6: Options tab",
  ]);
});
