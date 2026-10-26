// D4.11 of PLAN-design.md (U-075, WCAG 4.1.3): a live region is heard when
// its text changes, not when it is made. One made inside an @if together with
// its message is often skipped by a screen reader. Every `role="status"` and
// `role="alert"` of the app's templates is in the page from its view's first
// render, and only its text changes. A region inside a block is allowed only
// when the block is a container that is there before any message is (a
// dialog's body, a tab's pane), listed below with the reason.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseTemplate } from "@angular/compiler";

const app = new URL("../src/app/", import.meta.url).pathname;

/** `file: the block's expression` of each block that is made before the messages of the regions in it. */
const CONTAINERS = new Map([
  [
    "composer.html: @else",
    "the request's view (not a run's), made when the tab is shown, before a send, a paste or an edit",
  ],
  ["response-viewer.html: @else", "the response's view, made when the response arrives, before a copy or a filter"],
  ["response-viewer.html: @if (statusCode !== undefined)", "the status line, made with the response, before a copy"],
  ["response-viewer.html: @if (canExport)", "the status line's export, made with the response, before a copy"],
  ["vault-actions.html: @if (mode())", "the form of a vault action, made when it is chosen, before it is submitted"],
]);

const BLOCKS = new Set(["IfBlockBranch", "ForLoopBlock", "SwitchBlockCase", "DeferredBlock", "ForLoopBlockEmpty"]);

/** Each node with the blocks it is in, the outermost first. */
function* walk(nodes, blocks = []) {
  for (const node of nodes ?? []) {
    yield [node, blocks];
    const kind = node.constructor.name;
    const inner = BLOCKS.has(kind) ? [...blocks, node] : blocks;
    for (const key of ["children", "branches", "cases", "empty", "placeholder", "loading", "error"]) {
      const value = node[key];
      if (Array.isArray(value)) yield* walk(value, inner);
      else if (value) yield* walk([value], inner);
    }
  }
}

function expression(block, template) {
  const kind = block.constructor.name;
  if (kind === "IfBlockBranch")
    return block.expression
      ? `@if (${block.expression.source ?? block.expression.ast?.source ?? template.slice(block.expression.sourceSpan.start, block.expression.sourceSpan.end)})`
      : "@else";
  if (kind === "SwitchBlockCase")
    return `@case (${block.expression ? template.slice(block.expression.sourceSpan.start, block.expression.sourceSpan.end) : "default"})`;
  if (kind === "ForLoopBlock") return "@for";
  return `@${kind}`;
}

function templates() {
  const out = [];
  for (const file of readdirSync(app, { recursive: true }).sort()) {
    if (file.startsWith("catalogue") || file.endsWith(".spec.ts") || !/\.(html|ts)$/.test(file)) continue;
    const source = readFileSync(join(app, file), "utf8");
    if (file.endsWith(".html")) out.push([file, source]);
    else for (const m of source.matchAll(/\btemplate:\s*`([\s\S]*?)`/g)) out.push([file, m[1]]);
  }
  return out;
}

test("every live region is in the page from its view's first render, not made with its message", () => {
  const made = [];
  for (const [file, template] of templates()) {
    const { nodes } = parseTemplate(template, file, { preserveWhitespaces: false });
    for (const [node, blocks] of walk(nodes)) {
      if (node.constructor.name !== "Element") continue;
      const role = node.attributes.find((a) => a.name === "role")?.value;
      if (role !== "status" && role !== "alert") continue;
      const inside = blocks.map((block) => `${file.split("/").pop()}: ${expression(block, template)}`);
      const open = inside.filter((key) => !CONTAINERS.has(key));
      if (open.length)
        made.push(`${file.split("/").pop()}:${node.sourceSpan.start.line + 1} role="${role}" in ${open.join(" > ")}`);
    }
  }
  assert.deepEqual(made, []);
});
