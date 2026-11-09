// The site (phase W, rebuilt in Astro): every page is prerendered to files in out/, which scripts/build-deploy.mjs puts
// at the deploy's root beside the app (/app/). No adapter: nothing is rendered on request, and the Worker serves files.
// The site's policy has no 'unsafe-inline' (security/csp-site.json), so nothing is inlined: stylesheets are files,
// and a script is a file of public/ (no Astro-processed <script>, no island, no client router).
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://wayfarer.ashwinsathian.com",
  // SITE_OUT lets two builds run side by side while the site is worked on; the deploy reads out/.
  outDir: process.env.SITE_OUT ?? "out",
  trailingSlash: "always",
  compressHTML: true,
  build: { format: "directory", inlineStylesheets: "never", assets: "_astro" },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
    server: { fs: { allow: ["../.."] } },
  },
});
