// The docs are written to be read on GitHub (W2.2 of PLAN-design.md): a link to
// another doc is its file (`auth.md#oauth`), and a link to the rest of the
// repository is a path from docs/ (`../SECURITY.md`). On the site a doc is its
// page, `/docs/auth/#oauth`, and anything else is the file on GitHub.
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const REPO = "https://github.com/AshwinSathian/wayfarer/blob/main";

/** Where `url`, written in the doc at `from` (a path from the repository's root), leads on the site. */
export function siteLink(url, from) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(url)) return url;
  const [path, hash = ""] = url.split(/(?=#)/);
  const target = posix.normalize(posix.join(posix.dirname(from), path));
  if (target.startsWith("docs/") && target.endsWith(".md")) return `/docs/${target.slice(5, -3)}/${hash}`;
  return `${REPO}/${target}${hash}`;
}

/** The Sätteri hast plugin, for one doc (`fileURL`): every link's `href` and image's `src` through `siteLink`, and every table focusable. */
export function docLinks({ fileURL }) {
  if (!fileURL) return null;
  const from = posix.relative(REPO_ROOT, fileURLToPath(fileURL));
  return {
    name: "doc-links",
    element: {
      filter: ["a", "img", "table"],
      visit(node, context) {
        // A table scrolls sideways when it is wider than the page: it takes focus, so a keyboard can scroll it.
        if (node.tagName === "table") return context.setProperty(node, "tabindex", "0");
        const key = node.tagName === "a" ? "href" : "src";
        const url = node.properties[key];
        if (typeof url === "string") context.setProperty(node, key, siteLink(url, from));
      },
    },
  };
}
