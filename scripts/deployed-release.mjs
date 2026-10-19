#!/usr/bin/env node
// Prints the tag of the release a site runs, read from its /version.json
// (build-deploy.mjs writes it). synthetic.yml checks that tag out, so
// production is held to its own release's tests: the newest tag may not be
// deployed yet (v2.6.0's tests failed against v2.5.0, #398).
//
// It asks through Chromium: Cloudflare answers a client from GitHub's
// runners that runs no script with a challenge (403, `cf-mitigated:
// challenge`), whatever its User-Agent; a browser passes it.
//
// Usage: node scripts/deployed-release.mjs https://wayfarer.ashwinsathian.com
import { pathToFileURL } from "node:url";

export async function deployedRelease(site, get) {
  const response = await get(new URL("/version.json", site).href);
  // ponytail: the two releases before the file; drop these lines once one that writes it is deployed.
  // v2.6.0 answers a missing path with the site's 404, v2.5.0 with the app's shell.
  if (response.status === 404) return "v2.6.0";
  if (!response.ok) throw new Error(`deployed-release: ${site}/version.json answered ${response.status}`);
  if (!response.headers.get("content-type")?.includes("json")) return "v2.5.0";
  const { version } = await response.json();
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    throw new Error(`deployed-release: ${site}/version.json names no version: ${JSON.stringify(version)}`);
  }
  return `v${version}`;
}

async function throughBrowser(site) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(site);
    await page.waitForFunction(() => document.title !== "Just a moment...");
    // The page's request carries the cookie the challenge set.
    return await deployedRelease(site, async (url) => {
      const answer = await page.request.get(url);
      return new Response(await answer.body(), { status: answer.status(), headers: answer.headers() });
    });
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(await throughBrowser(process.argv[2]));
}
