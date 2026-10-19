import type { MetadataRoute } from "next";
import { posts } from "../lib/blog";
import { docs } from "../lib/content";
import { SITE } from "../lib/meta";
import { RIVALS } from "../lib/rivals";

export const dynamic = "force-static";

/** Every page of the site (W3.1); the app at /app/ is one address, its own page. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/app/",
    "/docs/",
    ...docs().map((doc) => `/docs/${doc.id}/`),
    "/compare/",
    ...RIVALS.map((rival) => `/compare/${rival.id}/`),
    "/compare/moving-from-postman/",
    "/blog/",
    ...posts().map((post) => `/blog/${post.slug}/`),
    "/changelog/",
    "/roadmap/",
  ];
  return paths.map((path) => ({ url: `${SITE}${path}` }));
}
