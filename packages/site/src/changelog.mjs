// The changelog page (W2.4 of PLAN-design.md): CHANGELOG.md, one entry a version. The file's head (Keep a
// Changelog's two sentences) is for GitHub and left out. "[Unreleased]" is "Coming in the next release", and is
// left out while it is empty (the day of a release). Each
// version keeps the id GitHub gives its heading, so a link to CHANGELOG.md#260---2026-10-19 still finds it.
import { renderMarkdown } from "./markdown.mjs";

/** @returns {{ id: string, title: string, date: string | null, summary: string | null, html: string }[]} */
export function changelogOf(markdown) {
  const body = markdown.slice(markdown.search(/^## /m));
  // One render, so that each heading's id is unique over the page (the second "Added" is `added-1`), split at the
  // versions' headings.
  const parts = renderMarkdown(body, "CHANGELOG.md").split(/^<h2 id="([^"]*)">.*<\/h2>\n/m);
  const sections = body.split(/^(?=## )/m);
  return sections
    .map((section, i) => {
      const heading = /^## \[([^\]]+)\](?: - (\S+))?/.exec(section);
      const version = heading?.[1] ?? "";
      return {
        id: parts[1 + 2 * i],
        title: version === "Unreleased" ? "Coming in the next release" : version,
        date: heading?.[2] ?? null,
        summary: summaryOf(section),
        html: parts[2 + 2 * i],
      };
    })
    .filter((version) => version.html.trim() !== "");
}

/** The first sentence of a version's opening paragraph, as plain text; null when it opens with a list. */
function summaryOf(section) {
  const paragraph = section.split(/\n\s*\n/)[1]?.trim();
  if (!paragraph || /^(#|[-*] |\|)/.test(paragraph)) return null;
  const text = paragraph
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ");
  return /^.+?[.!?]["”)]?(?=\s|$)/.exec(text)?.[0] ?? text;
}
