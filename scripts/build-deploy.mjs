#!/usr/bin/env node
// Puts the deploy together (W1 of PLAN-design.md): the site's build at the
// root, with its _headers, and the app's under app/. `npm run build` runs it
// last; wrangler.jsonc serves the folder, and the e2e tests are run against it.
//
// Usage: node scripts/build-deploy.mjs
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SITE = "packages/site/out";
const APP = "dist/wayfarer/browser";
const OUT = "dist/deploy";

for (const dir of [SITE, APP]) {
  if (!existsSync(`${dir}/index.html`)) {
    console.error(`build-deploy: no ${dir}/index.html; run npm run build`);
    process.exit(1);
  }
}
rmSync(OUT, { recursive: true, force: true });
cpSync(SITE, OUT, { recursive: true });
cpSync(APP, `${OUT}/app`, { recursive: true });
// The release this is, for the synthetic monitor (scripts/deployed-release.mjs).
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync(`${OUT}/version.json`, JSON.stringify({ version }) + "\n");
console.log(`build-deploy: ${SITE} and ${APP} in ${OUT}`);
