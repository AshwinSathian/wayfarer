import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

// Every Markdown file under the repository's docs/ is a page of the site (W2.2), and so is its changelog (W2.4).
export const collections = {
  docs: defineCollection({ loader: glob({ pattern: "**/*.md", base: "../../docs" }) }),
  changelog: defineCollection({ loader: glob({ pattern: "CHANGELOG.md", base: "../.." }) }),
};
