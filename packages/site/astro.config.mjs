import { satteri } from "@astrojs/markdown-satteri";
import { defineConfig } from "astro/config";
import { docLinks } from "./src/doc-links.mjs";

// The site's CSP (security/csp-site.json) allows no inline style and no
// script: Astro writes its CSS to files, and Markdown's syntax highlighting,
// which writes style attributes, is off. Smart punctuation is off too: the
// docs quote commands and code in their prose, which must stay as written.
export default defineConfig({
  site: "https://wayfarer.ashwinsathian.com",
  build: { inlineStylesheets: "never" },
  markdown: {
    syntaxHighlight: false,
    processor: satteri({ hastPlugins: [docLinks], features: { smartPunctuation: false } }),
  },
});
