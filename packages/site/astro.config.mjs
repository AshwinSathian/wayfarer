import { defineConfig } from "astro/config";

// The site's CSP (security/csp-site.json) allows no inline style and no
// script: Astro writes its CSS to files, and Markdown's syntax highlighting,
// which writes style attributes, is off.
export default defineConfig({
  site: "https://wayfarer.ashwinsathian.com",
  build: { inlineStylesheets: "never" },
  markdown: { syntaxHighlight: false },
});
