// `npm audit`, except for the advisories listed in ALLOWED, each with a reason and a day it stops being allowed.
// CLAUDE.md: npm audit reports 0; this is the one way past it, for an advisory no release fixes yet.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Maintainer's decision, 2026-11-18: picomatch's ReDoS (no patched release; dev tooling only, nothing ships it). */
export const ALLOWED = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    expires: "2027-01-31",
    reason: "picomatch <= 4.0.7 ReDoS: no patched version exists; reached only by build and test tooling",
  },
];

/** The advisories of an `npm audit --json` report that are not allowed on `today` (a YYYY-MM-DD day). */
export function unallowed(report, today, allowed = ALLOWED) {
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {}))
    for (const via of vulnerability.via)
      if (typeof via === "object" && via.url) found.set(via.url.split("/").pop(), `${via.title} (${via.url})`);
  return [...found]
    .filter(([id]) => !allowed.some((entry) => entry.id === id && entry.expires >= today))
    .map(([, text]) => text);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let output;
  try {
    output = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm exits 1 when it finds something; its report is still on stdout.
    output = error.stdout;
    if (!output) throw error;
  }
  const left = unallowed(JSON.parse(output), new Date().toISOString().slice(0, 10));
  if (left.length) {
    console.error(`npm audit: ${left.length} advisory not allowed:\n${left.map((l) => `  ${l}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`npm audit: no advisory but the ${ALLOWED.length} allowed (${ALLOWED.map((a) => a.id).join(", ")})`);
}
