import { fileURLToPath } from "node:url";

// The site is files (W1 of PLAN-design.md): `next build` writes them to out/, which scripts/build-deploy.mjs puts at
// the deploy's root. React renders the pages there and is not sent (PLAN-design 1.9): strip-scripts.mjs takes Next's
// scripts out.
export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};
