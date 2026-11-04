import type { Metadata } from "next";
import { ogImagePath } from "../og-path.mjs";

export const SITE = "https://wayfarer.ashwinsathian.com";

/**
 * A page's metadata for search and sharing (W3.1): its title and description, its canonical address, and its Open
 * Graph and Twitter cards with the page's own image (social-images.mjs draws it from this title and description). A
 * working note says `noindex` (search engines follow its links but do not list it); a blog post is an article with
 * its date.
 */
export function pageMeta(
  path: string,
  title: string,
  description: string,
  { noindex = false, published }: { noindex?: boolean; published?: string } = {},
): Metadata {
  const image = { url: ogImagePath(path), width: 1200, height: 630, alt: title };
  const card = { siteName: "Wayfarer", locale: "en_GB", url: path, title, description, images: [image] };
  return {
    title,
    description,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    // A page's own alternates replace the layout's, so every page names the feed itself.
    alternates: { canonical: path, types: { "application/rss+xml": "/blog/rss.xml" } },
    openGraph: published ? { ...card, type: "article", publishedTime: published } : { ...card, type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
