import type { Metadata } from "next";
import { ogImagePath } from "../og-path.mjs";

export const SITE = "https://wayfarer.ashwinsathian.com";

/**
 * A page's metadata for search and sharing (W3.1): its title and description, its canonical address, and its Open
 * Graph and Twitter cards with the page's own image (social-images.mjs draws it from this title and description).
 */
export function pageMeta(path: string, title: string, description: string): Metadata {
  const image = { url: ogImagePath(path), width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    // A page's own alternates replace the layout's, so every page names the feed itself.
    alternates: { canonical: path, types: { "application/rss+xml": "/blog/rss.xml" } },
    openGraph: { type: "website", siteName: "Wayfarer", locale: "en_GB", url: path, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
