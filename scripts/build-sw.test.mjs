import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { importWorker, precacheList } from "./build-sw.mjs";

const folder = (files) => {
  const root = mkdtempSync(join(tmpdir(), "build-sw-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
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

test("of the stylesheets, only the page's and Monaco's are precached: the CSS Monaco's modules import is never loaded", () => {
  const { root } = folder({
    "index.html": '<link rel="stylesheet" href="styles-AAAAAAAA.css"><script src="main-BBBBBBBB.js"></script>',
    "styles-AAAAAAAA.css": "",
    "main-BBBBBBBB.js": "",
    "monaco.css": "",
    "main-CCCCCCCC.css": ".monaco-editor{}",
    "chunk-DDDDDDDD.css": ".monaco-list{}",
    "oauth/callback.css": "",
    "media/face.woff2": "",
    "worker-EEEEEEEE.js": '"wayfarer/collection"',
  });
  const list = precacheList(root);
  for (const kept of ["/styles-AAAAAAAA.css", "/monaco.css", "/media/face.woff2", "/main-BBBBBBBB.js"]) {
    assert.ok(list.includes(kept), kept);
  }
  for (const left of ["/main-CCCCCCCC.css", "/chunk-DDDDDDDD.css", "/oauth/callback.css"]) {
    assert.ok(!list.includes(left), left);
  }
});
