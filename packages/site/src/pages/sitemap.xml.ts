import { posts } from "../lib/blog";
import { docs, indexed, lastChanged } from "../lib/content";
import { SITE } from "../lib/meta";
import { RIVALS } from "../lib/rivals";
import { newestRead } from "../lib/structured-data";

/**
 * /sitemap.xml: every page search engines should list (W3.1), with the day it last changed where the site knows it: a
 * doc's from git, a comparison's from the newest source it read, a post's its date. The working notes (the operations
 * docs) are pages, but `noindex` and not here. The app at /app/ is one address, its own page.
 */
export function GET() {
  const read = (rival: (typeof RIVALS)[number]) => [...rival.facts, ...rival.ahead].map((fact) => fact.source);
  const pages: [string, string | undefined][] = [
    ["/", undefined],
    ["/app/", undefined],
    ["/docs/", undefined],
    ...docs()
      .filter(indexed)
      .map((doc): [string, string | undefined] => [`/docs/${doc.id}/`, lastChanged(`docs/${doc.id}.md`)]),
    ["/compare/", newestRead(RIVALS.flatMap(read))],
    ...RIVALS.map((rival): [string, string | undefined] => [`/compare/${rival.id}/`, newestRead(read(rival))]),
    ["/compare/moving-from-postman/", undefined],
    ["/blog/", posts()[0]?.date],
    ...posts().map((post): [string, string | undefined] => [`/blog/${post.slug}/`, post.date]),
    ["/what-changed-in-3-0/", lastChanged("packages/site/src/whats-new.mjs")],
    ["/changelog/", lastChanged("CHANGELOG.md")],
    ["/roadmap/", lastChanged("docs/roadmap.md")],
  ];
  const urls = pages.map(
    ([path, modified]) => `<url><loc>${SITE}${path}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ""}</url>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
