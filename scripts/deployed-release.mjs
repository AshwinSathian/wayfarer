#!/usr/bin/env node
// Prints the tag of the release a site runs, read from its /version.json
// (build-deploy.mjs writes it). synthetic.yml checks that tag out, so
// production is held to its own release's tests: the newest tag may not be
// deployed yet (v2.6.0's tests failed against v2.5.0, #398).
//
// Usage: node scripts/deployed-release.mjs https://wayfarer.ashwinsathian.com
import { pathToFileURL } from "node:url";

export async function deployedRelease(site, fetchImpl = fetch) {
  const response = await fetchImpl(new URL("/version.json", site), { cache: "no-store" });
  // ponytail: the two releases before the file; drop these lines once one that writes it is deployed.
  // v2.6.0 answers a missing path with the site's 404, v2.5.0 with the app's shell.
  if (!response.ok) return "v2.6.0";
  if (!response.headers.get("content-type")?.includes("json")) return "v2.5.0";
  const { version } = await response.json();
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    throw new Error(`deployed-release: ${site}/version.json names no version: ${JSON.stringify(version)}`);
  }
  return `v${version}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(await deployedRelease(process.argv[2]));
}
