import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { importWorker } from "./build-sw.mjs";

const folder = (files) => {
  const root = mkdtempSync(join(tmpdir(), "build-sw-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return { root, files: Object.keys(files) };
};

test("the import worker is the worker that holds the collection format's id, with what it imports", () => {
  const { root, files } = folder({
    "worker-AAAAAAAA.js": 'import{a}from"./worker-chunk-BBBBBBBB.js";const f="wayfarer/collection";',
    "worker-chunk-BBBBBBBB.js": 'import("./chunk-CCCCCCCC.js")',
    "chunk-CCCCCCCC.js": "",
    "worker-DDDDDDDD.js": 'import"./worker-chunk-EEEEEEEE.js"',
    "worker-chunk-EEEEEEEE.js": "",
  });
  assert.deepEqual(importWorker(root, files).sort(), [
    "chunk-CCCCCCCC.js",
    "worker-AAAAAAAA.js",
    "worker-chunk-BBBBBBBB.js",
  ]);
});

test("a build with no import worker, or two, stops", () => {
  const none = folder({ "worker-AAAAAAAA.js": "" });
  assert.throws(() => importWorker(none.root, none.files), /expected one import worker, found 0/);
  const two = folder({ "worker-AAAAAAAA.js": '"wayfarer/collection"', "worker-BBBBBBBB.js": '"wayfarer/collection"' });
  assert.throws(() => importWorker(two.root, two.files), /found 2/);
});
