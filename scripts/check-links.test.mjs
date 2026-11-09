// Tests for scripts/check-links.mjs (P7.6). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkLinks } from "./check-links.mjs";

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "links-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const GOOD = {
  "README.md": "[a](docs/a.md) and [b](docs/b.md#part) and [site](https://example.com) and [top](#top)\n",
  "docs/a.md": "Back to [readme](../README.md). See [b](b.md).\n",
  "docs/b.md": "# B\n",
};

test("a tree whose links all lead to files, with every doc linked from the README, has no errors", () => {
  assert.deepEqual(checkLinks(fixture(GOOD)), []);
});

test("a link to a file that is not there fails, with the file that holds it", () => {
  const dir = fixture({ ...GOOD, "docs/a.md": "See [gone](gone.md) and [also](../docs/missing.md#x).\n" });
  assert.deepEqual(checkLinks(dir), [
    "docs/a.md: links docs/gone.md, which does not exist",
    "docs/a.md: links docs/missing.md, which does not exist",
  ]);
});

test("a doc under docs/ that the README does not link fails", () => {
  const dir = fixture({ ...GOOD, "docs/c.md": "# C\n" });
  assert.deepEqual(checkLinks(dir), ["README.md does not link docs/c.md"]);
});

test("a link in a code block is not a link", () => {
  const dir = fixture({ ...GOOD, "docs/b.md": "```md\n[x](nowhere.md)\n```\nand `[y](nor-here.md)`\n" });
  assert.deepEqual(checkLinks(dir), []);
});

test("the repository itself passes", () => {
  assert.deepEqual(checkLinks(process.cwd()), []);
});
