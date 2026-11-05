// U-166 of docs/design/audit.md: every link the app makes to the site's docs leads to a doc that exists, at a heading
// it has. The app's links are in one file, src/app/shared/docs.ts, as addresses beside the app (`../docs/<name>/`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { renderMarkdown } from "../packages/site/src/markdown.mjs";

const root = new URL("..", import.meta.url);
const source = readFileSync(new URL("src/app/shared/docs.ts", root), "utf8");
const links = [...source.matchAll(/"\.\.\/docs\/([^"#]*)(?:#([^"]*))?"/g)].map(([, path, hash]) => ({ path, hash }));

test("the app's links to the docs are found", () => {
  assert.ok(links.length >= 4, `found ${links.length} links in src/app/shared/docs.ts`);
});

for (const { path, hash } of links) {
  test(`../docs/${path}${hash ? `#${hash}` : ""} is a page of the site's docs`, () => {
    // `../docs/` is the docs' index; `../docs/<name>/` is docs/<name>.md, with the slash the site's pages end in.
    if (path === "") return;
    assert.match(path, /^[a-z-]+\/$/);
    const name = `docs/${path.slice(0, -1)}.md`;
    assert.ok(existsSync(new URL(name, root)), `${name} exists`);
    if (hash) assert.ok(renderMarkdown(readFileSync(new URL(name, root), "utf8"), name).includes(`id="${hash}"`), hash);
  });
}
