// The blog (W2.5 of PLAN-design.md): one Markdown file a post under content/blog, named for its date and its slug,
// with its title, date and description at the top.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "../markdown.mjs";
import { SCREENS, screenHtml } from "../whats-new.mjs";
import sizes from "../whats-new-images.mjs";

const DIR = "content/blog";

export interface Post {
  slug: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  description: string;
  body: string;
  file: string;
}

/** A post's head: `key: value` lines between two `---` lines. */
export function parse(file: string, text: string): Post {
  const head = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!head) throw new Error(`${file}: no --- head`);
  const fields = Object.fromEntries(
    head[1]
      .split("\n")
      .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]),
  );
  for (const key of ["title", "date", "description"]) if (!fields[key]) throw new Error(`${file}: no ${key}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) throw new Error(`${file}: date ${fields.date} is not YYYY-MM-DD`);
  const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
  // The slug goes into the page's links and the feed's <link> and <guid> as it is: letters, digits and hyphens only.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    throw new Error(`${file}: the slug "${slug}" is not lower-case letters, digits and hyphens`);
  return {
    slug,
    title: fields.title,
    date: fields.date,
    description: fields.description,
    body: text.slice(head[0].length),
    file,
  };
}

/** Every post, newest first. */
export function posts(): Post[] {
  return readdirSync(DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => parse(file, readFileSync(join(DIR, file), "utf8")))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Claim chips as `Claims` draws them, for a post's `<!-- claims C-001 C-002 -->`. */
function claimsHtml(ids: string[], claimText: (id: string) => string): string {
  const chips = ids.map(
    (id) =>
      `<a href="/docs/claims/#${id}" aria-label="${escape(`Claim ${id}: ${claimText(id)}`)}" class="inline-flex min-h-6 items-center rounded-xs border border-line-strong px-1 font-code type-site-caption text-ink-muted no-underline hover:border-action hover:text-action">${id}</a>`,
  );
  return `<span class="claims ml-1 inline-flex flex-wrap gap-1 align-[0.1em]" data-claims="${ids.join(" ")}">${chips.join("")}</span>`;
}

/**
 * A post's HTML. Two comments are filled in: `<!-- claims C-001 -->` with the claims a sentence names, and
 * `<!-- screen <id> -->` with that screen's before and after from "What changed in 3.0" (src/whats-new.mjs).
 * `claimText` is the ledger's (lib/content.ts), which throws for an ID it has not got.
 */
export function postHtml(post: Post, claimText: (id: string) => string): string {
  return renderMarkdown(post.body, `packages/site/${DIR}/${post.file}`)
    .replace(/<!-- claims ((?:C-\d{3} ?)+) -->/g, (_, ids: string) => claimsHtml(ids.trim().split(" "), claimText))
    .replace(/<!-- screen ([a-z0-9-]+) -->/g, (_, id: string) => {
      const screen = SCREENS.find((s) => s.id === id);
      if (!screen) throw new Error(`${post.file}: no screen ${id} in whats-new.mjs`);
      return `<div>${screenHtml(screen, sizes)}</div>`;
    });
}

/** A date as the posts show it: 19 October 2026. */
export function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
