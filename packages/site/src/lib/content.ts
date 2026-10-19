// What the site's pages are made of, read from the repository when the site is built. The build runs in
// packages/site (`npm -w packages/site run build`), so the repository is two folders up.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown, titleOf } from "../markdown.mjs";
import { roadmapOf } from "../roadmap.mjs";

const ROOT = join(process.cwd(), "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

export const REPO = "https://github.com/AshwinSathian/wayfarer";

export interface Doc {
  /** Its path under docs/, without `.md`: `auth`, `design/research-2026`. */
  id: string;
  title: string;
}

/** Every Markdown file under docs/, each a page at `/docs/<id>/`. */
export function docs(): Doc[] {
  return readdirSync(join(ROOT, "docs"), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const id = name.split("\\").join("/").slice(0, -3);
      return { id, title: titleOf(read(`docs/${id}.md`), id) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function docHtml(id: string): string {
  return renderMarkdown(read(`docs/${id}.md`), `docs/${id}.md`);
}

export function changelogHtml(): string {
  return renderMarkdown(read("CHANGELOG.md"), "CHANGELOG.md");
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
  return [...read("docs/claims.md").matchAll(/^\| (C-\d{3}) \| (.+?) \| .+? \| (.+?) \|$/gm)].map(([, id, text, tests]) => ({
    id,
    text: text.replace(/`/g, ""),
    tests: tests.split(", "),
  }));
}
