// D3.2: a value a user typed, or one a server sent or will read, is
// monospace; a name, prose, a passphrase or a number is not. Every Material
// input says which (`font-mono`, `type-mono-*` or `font-sans`), so a new
// field makes the choice instead of taking Inter by default.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../src/app/", import.meta.url).pathname;

test("every Material input says whether it holds a value (monospace) or words", () => {
  const unmarked = [];
  for (const file of readdirSync(root, { recursive: true }).filter((f) => /\.(html|ts)$/.test(f) && !f.endsWith(".spec.ts"))) {
    const text = readFileSync(join(root, file), "utf8");
    for (const tag of text.match(/<(?:input|textarea)\b[^>]*>/gs) ?? []) {
      if (!/\bmatInput\b/.test(tag)) continue;
      if (!/\b(font-mono|font-sans|type-mono-[\w-]+)\b/.test(tag)) unmarked.push(`${file}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  assert.deepEqual(unmarked, []);
});
