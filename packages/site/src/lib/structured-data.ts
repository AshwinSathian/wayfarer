// What search engines and assistants read about the site as schema.org data (W3.1): JSON-LD, which the site's policy
// does not run (a data block, not a script). Every fact here is one the pages say: the app's features are rows of
// the claims ledger, a rival's citations are its sources. No rating or review: there are none to give.
import { REPO, claimText } from "./content";
import { SITE } from "./meta";
import type { Source } from "./rivals";

const APP = `${SITE}/#app`;
const WEBSITE = `${SITE}/#website`;
const MAINTAINER = `${SITE}/#maintainer`;

/** The claims the app's entry lists as its features. */
const FEATURES = ["C-001", "C-002", "C-003", "C-058", "C-065", "C-071", "C-084"];

/** The front page's graph: the site, its maintainer, the app and its source. */
export function homeGraph(version: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": WEBSITE, name: "Wayfarer", alternateName: "Wayfarer API client", url: `${SITE}/` },
      { "@type": "Person", "@id": MAINTAINER, name: "Ashwin Sathian", url: "https://github.com/AshwinSathian" },
      {
        "@type": "SoftwareApplication",
        "@id": APP,
        name: "Wayfarer",
        alternateName: "Wayfarer API client",
        description,
        url: `${SITE}/app/`,
        applicationCategory: "DeveloperApplication",
        applicationSubCategory: "API client",
        operatingSystem: "Any, in a web browser",
        softwareVersion: version,
        datePublished: "2026-07-20",
        license: "https://opensource.org/license/mit",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        screenshot: `${SITE}/app.jpg`,
        author: { "@id": MAINTAINER },
        sameAs: [REPO, "https://www.npmjs.com/package/wayfarer-cli", "https://www.npmjs.com/package/wayfarer-bridge"],
        featureList: FEATURES.map((id) => `${claimText(id)} (${id})`),
      },
      {
        "@type": "SoftwareSourceCode",
        codeRepository: REPO,
        programmingLanguage: "TypeScript",
        license: "https://opensource.org/license/mit",
        author: { "@id": MAINTAINER },
        targetProduct: { "@id": APP },
      },
    ],
  };
}

/** A page's trail from the front page: each step its name and its path. */
export function breadcrumbs(steps: [name: string, path: string][]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: steps.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${SITE}${path}`,
    })),
  };
}

/** A user doc: an article about the app, part of the site. */
export function docGraph(doc: { id: string; title: string }, description: string, modified?: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: doc.title,
        description,
        url: `${SITE}/docs/${doc.id}/`,
        ...(modified ? { dateModified: modified } : {}),
        isPartOf: { "@id": WEBSITE },
        about: { "@id": APP },
      },
      breadcrumbs([
        ["Docs", "/docs/"],
        [doc.title, `/docs/${doc.id}/`],
      ]),
    ],
  };
}

/** The newest day any of `sources` was read. */
export const newestRead = (sources: Source[]) =>
  sources
    .map((s) => s.read)
    .sort()
    .at(-1);

/** A comparison: a page about Wayfarer and a rival, citing the rival's own pages. */
export function comparisonGraph(rival: { id: string; name: string; url: string }, title: string, sources: Source[]) {
  const unique = [...new Map(sources.map((s) => [s.url, s])).values()];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: title,
        url: `${SITE}/compare/${rival.id}/`,
        dateModified: newestRead(unique),
        isPartOf: { "@id": WEBSITE },
        about: [{ "@id": APP }, { "@type": "SoftwareApplication", name: rival.name, url: rival.url }],
        citation: unique.map((s) => ({ "@type": "WebPage", name: s.title, url: s.url })),
      },
      breadcrumbs([
        ["Compare", "/compare/"],
        [title, `/compare/${rival.id}/`],
      ]),
    ],
  };
}

/** The comparison index: the pages it lists. */
export function compareIndexGraph(title: string, pages: [name: string, path: string][]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: title,
        url: `${SITE}/compare/`,
        isPartOf: { "@id": WEBSITE },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: pages.map(([name, path], i) => ({
            "@type": "ListItem",
            position: i + 1,
            name,
            url: `${SITE}${path}`,
          })),
        },
      },
      breadcrumbs([["Compare", "/compare/"]]),
    ],
  };
}

/** A blog post, by the maintainer. */
export function postGraph(post: { slug: string; title: string; date: string; description: string }, image: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    url: `${SITE}/blog/${post.slug}/`,
    image: `${SITE}${image}`,
    author: { "@type": "Person", "@id": MAINTAINER, name: "Ashwin Sathian", url: "https://github.com/AshwinSathian" },
    isPartOf: { "@id": WEBSITE },
  };
}
