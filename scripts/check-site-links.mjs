#!/usr/bin/env node
// Every link of the site's pages to the site itself leads to a page or a file
// that the build has, and to an id that the page has (W2.2 of PLAN-design.md).
// Links to other sites are not followed (a check that needs the network fails
// for the network's reasons), and nor are links into the app, /app/, which its
// own tests cover. Run on the deploy after `npm run build`.
//
// Usage: node scripts/check-site-links.mjs [root]   (default dist/deploy)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { pathToFileURL } from "node:url";

const page = (root, path) =>
  [path, join(path, "index.html"), `${path}.html`]
    .map((p) => join(root, p))
    .find((p) => existsSync(p) && statSync(p).isFile());

export function brokenLinks(root) {
  const pages = readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".html") && !name.startsWith(`app/`) && !name.startsWith("app\\"));
  const broken = [];
  for (const name of pages) {
    const from = `/${name.split("\\").join("/")}`;
    const html = readFileSync(join(root, name), "utf8");
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) continue;
      const [path, hash] = url.split("#");
      const target = path === "" ? from : posix.resolve(posix.dirname(from), path) + (path.endsWith("/") ? "/" : "");
      if (target === "/app/" || target.startsWith("/app/")) continue;
      const file = page(root, target);
      if (!file) {
        broken.push(`${from}: ${url} (no such page)`);
        continue;
      }
      if (hash && !readFileSync(file, "utf8").includes(`id="${hash}"`))
        broken.push(`${from}: ${url} (no id "${hash}")`);
    }
  }
  return broken;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = process.argv[2] ?? "dist/deploy";
  const broken = brokenLinks(root);
  if (broken.length) {
    console.error(`Broken links in ${relative(".", root)}:\n${broken.map((line) => `  - ${line}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Site links OK: every link of ${relative(".", root)} to the site leads to a page and an id it has.`);
}
