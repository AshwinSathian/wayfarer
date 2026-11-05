// What the site's pages are made of, read from the repository when the site is built. The build runs in
// packages/site (`npm -w packages/site run build`), so the repository is two folders up.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { benchmarkOf } from "../benchmark.mjs";
import { changelogOf } from "../changelog.mjs";
import { renderMarkdown, titleOf } from "../markdown.mjs";
import { roadmapOf } from "../roadmap.mjs";

const ROOT = join(process.cwd(), "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

export const REPO = "https://github.com/AshwinSathian/wayfarer";

/** The headings of /docs/, in order: Start first, for a reader who is new. A doc under docs/design/ is a design record; a doc not listed is a guide. */
export const DOC_GROUPS = ["Start", "Guides", "Reference", "Trust", "Operations", "Design records"] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];
const GROUP_OF: Record<string, DocGroup> = {
  "getting-started": "Start",
  "collections-schema": "Reference",
  "postman-compatibility": "Reference",
  storage: "Reference",
  "trust-center": "Trust",
  claims: "Trust",
  "threat-model": "Trust",
  runbook: "Operations",
  deployment: "Operations",
};

/**
 * The design records that back the comparison pages, which search engines may index. The other design records are
 * working notes (audits, plans, flows not built yet), as are the operations docs: their pages say `noindex`, and
 * neither the sitemap nor llms.txt's main list names them, or an assistant would read a design as a feature.
 */
const INDEXED_RECORDS = ["design/benchmark", "design/benchmark/rivals", "design/research-2026"];

const OFF_SITE = "<!-- off-site -->";

export interface Doc {
  /** Its path under docs/, without `.md`: `auth`, `design/research-2026`. */
  id: string;
  title: string;
  group: DocGroup;
}

/**
 * Every Markdown file under docs/, each a page at `/docs/<id>/`, but one marked `<!-- off-site -->`: the repository
 * keeps it and the site does not show it (the reach plan, maintainer, 2026-11-05). `scripts/check-links.mjs` reads
 * the same mark.
 */
export function docs(): Doc[] {
  return readdirSync(join(ROOT, "docs"), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.split("\\").join("/").slice(0, -3))
    .filter((id) => !read(`docs/${id}.md`).includes(OFF_SITE))
    .map((id) => {
      const group: DocGroup = id.startsWith("design/") ? "Design records" : (GROUP_OF[id] ?? "Guides");
      return { id, title: titleOf(read(`docs/${id}.md`), id), group };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Whether search engines and llms.txt are pointed at a doc. */
export function indexed(doc: Doc): boolean {
  return (doc.group !== "Design records" && doc.group !== "Operations") || INDEXED_RECORDS.includes(doc.id);
}

/**
 * A doc's description for search and sharing: the text of a `<!-- description: … -->` comment if it has one, else
 * its first paragraph or quote as plain text, up to 160 characters. A design record's status is a quote at its top
 * ("designed, not built"), so it is kept, and a design record says it is one first. Links keep their words, and code
 * and emphasis marks go.
 */
export function docDescription(id: string): string {
  const markdown = read(`docs/${id}.md`);
  const written = /<!-- description: ([\s\S]+?) -->/.exec(markdown)?.[1];
  const paragraph =
    written ??
    markdown
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block !== "" && !/^(#|\||[-*] |```|<!--|\d+\. )/.test(block))
      ?.replace(/^> ?/gm, "");
  // Plain text: a comment (a claim's marker) and anything that looks like a tag are cut by their brackets, and any
  // bracket left goes, so nothing of markup is in the description.
  const text = cutComments(paragraph ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const full = id.startsWith("design/") ? `Design record, not user documentation. ${text}` : text;
  return full.length > 160 ? `${full.slice(0, 157).replace(/\s+\S*$/, "")}…` : full;
}

/** `text` without its HTML comments, an unclosed one to the end. */
function cutComments(text: string): string {
  let out = "";
  let at = 0;
  for (let open = text.indexOf("<!--"); open !== -1; open = text.indexOf("<!--", at)) {
    out += text.slice(at, open);
    const close = text.indexOf("-->", open + 4);
    at = close === -1 ? text.length : close + 3;
  }
  return out + text.slice(at);
}

/** A doc's Markdown as the repository has it (for /llms-full.txt). */
export function docMarkdown(id: string): string {
  return read(`docs/${id}.md`);
}

export function docHtml(id: string): string {
  return renderMarkdown(read(`docs/${id}.md`), `docs/${id}.md`);
}

/**
 * The day a file of the repository last changed, as YYYY-MM-DD, for the sitemap. None in a shallow clone, where every
 * file would seem to have changed in its one commit, or where there is no repository.
 */
export function lastChanged(path: string): string | undefined {
  const run = (...args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim();
  try {
    if (run("rev-parse", "--is-shallow-repository") === "true") return undefined;
    return run("log", "-1", "--format=%cs", "--", path) || undefined;
  } catch (error) {
    console.warn(`lastmod: no date for ${path}: ${String(error)}`);
    return undefined;
  }
}

export function changelog() {
  return changelogOf(read("CHANGELOG.md"));
}

export interface Benchmark {
  tasks: {
    n: string;
    name: string;
    /** Its heading's id on /docs/design/benchmark/. */
    anchor: string;
    measured: { id: string; task: string; actions: string; seconds: string; recording: string }[];
    documented: { rival: string; steps: string; inputs: string; sources: string[]; note: string }[];
  }[];
  summary: { n: string; task: string; wayfarer: string; fewest: string; is: string }[];
  versions: Record<string, string>;
}

/** The benchmark, docs/design/benchmark.md, as the comparison pages show it (benchmark.mjs reads it). */
export function benchmark(): Benchmark {
  return benchmarkOf(read("docs/design/benchmark.md")) as Benchmark;
}

export function roadmap() {
  return roadmapOf(read("PLAN-design.md"));
}

export interface Claim {
  id: string;
  text: string;
  tests: string[];
}

/** The rows of the claims ledger, docs/claims.md. */
export function claims(): Claim[] {
  return [...read("docs/claims.md").matchAll(/^\| (C-\d{3}) \| (.+?) \| .+? \| (.+?) \|$/gm)].map(
    ([, id, text, tests]) => ({
      id,
      text: text.replace(/`/g, ""),
      tests: tests.split(", "),
    }),
  );
}

let ledger: Claim[] | undefined;

/** One claim's text; a build error for an ID the ledger does not have. */
export function claimText(id: string): string {
  ledger ??= claims();
  const claim = ledger.find((c) => c.id === id);
  if (!claim) throw new Error(`no claim ${id} in docs/claims.md`);
  return claim.text;
}
