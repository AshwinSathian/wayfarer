import { fileURLToPath } from "node:url";

// The site is files (W1 of PLAN-design.md): `next build` writes them to out/, which scripts/build-deploy.mjs puts at
// the deploy's root. Its CSP has no 'unsafe-inline' (PLAN-design 1.8): externalize-scripts.mjs moves each script
// Next writes into the page to a file of its own.
export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};
