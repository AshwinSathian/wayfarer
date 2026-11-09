import { ogImagePath } from "../og-path.mjs";

export const SITE = "https://wayfarer.ashwinsathian.com";

export interface Meta {
  /** The page's path, with its trailing slash: `/docs/auth/`. */
  path: string;
  title: string;
  description: string;
  /** A working note: search engines follow its links but do not list it, and it is not in the sitemap. */
  noindex?: boolean;
  /** A blog post's date, YYYY-MM-DD: the page is an article. */
  published?: string;
}

/**
 * What a page says about itself to search engines and to a link's card (W3.1): its title and description, its
 * canonical address, and its Open Graph and Twitter cards with the page's own image (social-images.mjs draws it from
 * this title and description).
 */
export function headOf({ path, title, description, noindex = false, published }: Meta) {
  return {
    title,
    description,
    canonical: `${SITE}${path}`,
    image: `${SITE}${ogImagePath(path)}`,
    noindex,
    type: published ? "article" : "website",
    published,
  };
}
