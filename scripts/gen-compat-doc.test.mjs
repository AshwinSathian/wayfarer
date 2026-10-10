// Tests for scripts/gen-compat-doc.mjs (P3.11). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CASES } from "../packages/core/test/pm-compat/cases.ts";
import { render, sectionOf } from "./gen-compat-doc.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("@claim:C-040 the document is what the matrix gives: a row changed without `npm run gen:compat` fails here", () => {
  assert.equal(read("docs/postman-compatibility.md"), render(CASES));
});

test("a row is one line with its status and its note, and the counts are the rows'", () => {
  const text = render([
    { api: "pm.cookies.get", status: "unsupported", script: "" },
    { api: "pm.test.skip", status: "partial", note: "Listed as passed | skipped.", script: "" },
    { api: "atob / btoa", status: "supported", script: "" },
  ]);
  assert.match(text, /^3 rows: 1 supported, 1 partial, 1 not supported\.$/m);
  assert.ok(text.includes('<a id="pm-cookies"></a>\n\n## `pm.cookies`\n\n| API | Status | Note |\n|---|---|---|\n| `pm.cookies.get` | Not supported | Throws `WayfarerUnsupportedError`, which names what was called. |'));
  assert.ok(text.includes("| `pm.test.skip` | Partial | Listed as passed \\| skipped. |"));
  assert.ok(text.includes("| `atob / btoa` | Supported |  |"));
});

test("rows are filed under the object they belong to", () => {
  const anchor = (api) => sectionOf(api).anchor;
  assert.equal(anchor("pm.sendRequest (callback)"), "pm-sendrequest");
  assert.equal(anchor("pm.expect(pm.response)"), "pm-expect");
  assert.equal(anchor("require('lodash')"), "require");
  for (const api of ["postman.setNextRequest", "tests[name] = boolean", "responseBody", "request (legacy global)", "iteration", "legacy library globals (_, CryptoJS)"]) assert.equal(anchor(api), "legacy", api);
  for (const api of ["console.log / info / warn / error", "setTimeout", "atob / btoa"]) assert.equal(anchor(api), "globals", api);
});

test("@claim:C-040 every section an error message of the app links to is in the document", () => {
  const bootstrap = read("packages/core/src/scripting/vm-bootstrap.ts");
  const linked = new Set([
    // unsupported(what, "anchor")
    ...[...bootstrap.matchAll(/unsupported\([^;]*?, "([a-z][a-z-]*)"\)/g)].map((match) => match[1]),
    // refusing("pm.cookies", …) links to the name in lower case with dashes, as the function there builds it
    ...[...bootstrap.matchAll(/refusing\("([^"]+)"/g)].map((match) => match[1].toLowerCase().replace(/[^a-z]+/g, "-")),
    // written out in full, anywhere in the app or the engine
    ...["packages/core/src/scripting/vm-bootstrap.ts", "packages/core/src/scripting/host.ts", "src/app/services/request-executor.ts"].flatMap((path) =>
      [...read(path).matchAll(/postman-compatibility\.md#([a-z-]+)/g)].map((match) => match[1])
    ),
  ]);
  // The list is not empty by accident: these are the ones known today.
  for (const anchor of ["require", "pm-cookies", "pm-visualizer", "pm-vault", "pm-require", "pm-response", "pm-request", "pm-sendrequest"]) assert.ok(linked.has(anchor), anchor);
  const document = read("docs/postman-compatibility.md");
  for (const anchor of linked) assert.ok(document.includes(`<a id="${anchor}"></a>`), `no section #${anchor}`);
});
