// A Markdown file of the repository as a page's HTML (W2.2 of PLAN-design.md): GitHub's dialect, each heading with
// the id GitHub gives it (a link from another doc names it), each link through `siteLink`, and each table focusable,
// since it scrolls sideways on a narrow window and a keyboard has to reach it. No smart punctuation and no
// highlighting: the docs quote commands, and highlighting writes `style` attributes the CSP refuses.
import GithubSlugger from "github-slugger";
import { Marked } from "marked";
import { siteLink } from "./doc-links.mjs";

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const textOf = (html) => html.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]);
const escape = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The HTML of `markdown`, the file at `from` (a path from the repository's root). */
export function renderMarkdown(markdown, from) {
  const slugger = new GithubSlugger();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        return `<h${depth} id="${escape(slugger.slug(textOf(html)))}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const titled = title ? ` title="${escape(title)}"` : "";
        return `<a href="${escape(siteLink(href, from))}"${titled}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, text }) {
        return `<img src="${escape(siteLink(href, from))}" alt="${escape(text)}">`;
      },
    },
  });
  return marked.parse(markdown, { async: false }).replace(/<table>/g, '<table tabindex="0">');
}

/** A Markdown file's title: its first heading, without code marks; or else `fallback`. */
export function titleOf(markdown, fallback) {
  return /^# (.+)$/m.exec(markdown)?.[1].replace(/`/g, "") ?? fallback;
}
