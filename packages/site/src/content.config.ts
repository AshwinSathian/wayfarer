import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

// Every Markdown file under the repository's docs/ is a page of the site (W2.2).
export const collections = {
  docs: defineCollection({ loader: glob({ pattern: "**/*.md", base: "../../docs" }) }),
};
