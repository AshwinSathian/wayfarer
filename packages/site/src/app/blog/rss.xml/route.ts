import { posts } from "../../../lib/blog";

export const dynamic = "force-static";

const SITE = "https://wayfarer.ashwinsathian.com";
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The blog's feed, RSS 2.0: each post's title, address, date and description. */
export function GET() {
  const items = posts()
    .map(
      (post) => `    <item>
      <title>${escape(post.title)}</title>
      <link>${SITE}/blog/${post.slug}/</link>
      <guid>${SITE}/blog/${post.slug}/</guid>
      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escape(post.description)}</description>
    </item>`
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Wayfarer blog</title>
    <link>${SITE}/blog/</link>
    <description>Release notes and write-ups about how Wayfarer is built and tested.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
