import type { MetadataRoute } from "next";
import { posts } from "../lib/blog";
import { docs, indexed, lastChanged } from "../lib/content";
import { SITE } from "../lib/meta";
import { RIVALS } from "../lib/rivals";
import { newestRead } from "../lib/structured-data";

export const dynamic = "force-static";

/**
 * Every page search engines should list (W3.1), with the day it last changed where the site knows it: a doc's from
 * git, a comparison's from the newest source it read, a post's its date. The working notes (design records, the
 * operations docs) are pages, but `noindex` and not here. The app at /app/ is one address, its own page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const allRead = RIVALS.flatMap((rival) => [...rival.facts, ...rival.ahead].map((fact) => fact.source));
  const pages: [string, string | undefined][] = [
    ["/", undefined],
    ["/app/", undefined],
    ["/docs/", undefined],
    ...docs()
      .filter(indexed)
      .map((doc): [string, string | undefined] => [`/docs/${doc.id}/`, lastChanged(`docs/${doc.id}.md`)]),
    ["/compare/", newestRead(allRead)],
    ...RIVALS.map((rival): [string, string | undefined] => [
      `/compare/${rival.id}/`,
      newestRead([...rival.facts, ...rival.ahead].map((fact) => fact.source)),
    ]),
    ["/compare/moving-from-postman/", undefined],
    ["/blog/", posts()[0]?.date],
    ...posts().map((post): [string, string | undefined] => [`/blog/${post.slug}/`, post.date]),
    ["/changelog/", lastChanged("CHANGELOG.md")],
    ["/roadmap/", lastChanged("PLAN-design.md")],
  ];
  return pages.map(([path, modified]) => ({ url: `${SITE}${path}`, ...(modified ? { lastModified: modified } : {}) }));
}
