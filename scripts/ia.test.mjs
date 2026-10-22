// D4.1 of PLAN-design.md: every action of the app has a place in
// docs/design/ia.md, or a recorded removal. The inventory is read from the
// code: each control of a template (a button, a link, a select, a checkbox,
// anything with a click), each command of the palette, each shortcut that
// Settings lists and each item of a menu built in code. The test fails on an
// action the map does not name, and on a row whose action has gone, so the
// map moves with the app.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseTemplate } from "@angular/compiler";

const app = new URL("../src/app/", import.meta.url).pathname;
const doc = new URL("../docs/design/ia.md", import.meta.url).pathname;

const CONTROLS = new Set(["button", "a", "select", "ui-select", "ui-segmented"]);
const EVENTS = new Set(["click", "dblclick", "contextmenu", "valueChange", "change", "keydown.enter"]);

/**
 * The words of an expression, else the expression: `x ? 'Lock secrets' : 'Unlock secrets'` is
 * "Lock secrets / Unlock secrets". A literal that does not start with a capital is code (`'dark'`).
 */
function words(source) {
  const literals = [...source.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((m) => (m[1] ?? m[2]).trim())
    .filter((s) => /^[A-Z]/.test(s));
  return (literals.length ? literals.join(" / ") : source).replace(/\s+/g, " ").trim();
}

/** The text an element shows; of an interpolation, its words (`{{ open ? 'Close' : 'Open' }}`). */
function text(node) {
  if (node.constructor.name === "Text") return node.value;
  if (node.constructor.name === "BoundText") {
    const source = node.sourceSpan.toString();
    return words(source) === source.replace(/\s+/g, " ").trim() ? "" : words(source);
  }
  return (node.children ?? []).map(text).join(" ");
}

const attr = (element, name) => element.attributes.find((a) => a.name === name)?.value;
const bound = (element, name, template) => {
  const input = element.inputs.find((i) => i.name === name || i.keySpan?.toString() === `attr.${name}`);
  return input && words(template.slice(input.valueSpan.start.offset, input.valueSpan.end.offset));
};

/** What a person reads as the control's name; for one with none, the code it runs. */
function nameOf(element, parent, template, labels) {
  const named = (name) => attr(element, name) ?? bound(element, name, template);
  const shown = (node) => text(node).replace(/\s+/g, " ").trim() || undefined;
  const labelledBy = named("aria-labelledby");
  const handler = element.outputs.find((o) => EVENTS.has(o.name));
  return (
    named("aria-label") ??
    named("uiTooltip") ??
    shown(element) ??
    (labelledBy && (labels.get(labelledBy.replace(/^.*?(-|$)/, "")) ?? labels.get(labelledBy))) ??
    (parent?.name === "label" ? shown(parent) : undefined) ??
    (handler && template.slice(handler.handlerSpan.start.offset, handler.handlerSpan.end.offset)) ??
    element.name
  );
}

function isControl(element) {
  if (CONTROLS.has(element.name)) return true;
  const type = element.attributes.find((a) => a.name === "type")?.value;
  if (element.name === "input" && type === "checkbox") return true;
  return element.outputs.some((o) => EVENTS.has(o.name));
}

/** Each node with the element it is in. */
function* walk(nodes, parent) {
  for (const node of nodes ?? []) {
    yield [node, parent];
    const inside = node.constructor.name === "Element" ? node : parent;
    for (const key of ["children", "branches", "cases", "empty", "placeholder", "loading", "error"]) {
      const value = node[key];
      if (Array.isArray(value)) yield* walk(value, inside);
      else if (value) yield* walk([value], inside);
    }
  }
}

/** Each template of the app (its own file, or a component's inline one) with its path from `src/app`. */
function templates() {
  const out = [];
  for (const file of readdirSync(app, { recursive: true }).sort()) {
    if (file.startsWith("catalogue") || file.endsWith(".spec.ts") || !/\.(html|ts)$/.test(file)) continue;
    const source = readFileSync(join(app, file), "utf8");
    if (file.endsWith(".html")) out.push([file, source]);
    else if (file.endsWith(".ts"))
      for (const m of source.matchAll(/\btemplate:\s*`([\s\S]*?)`/g)) out.push([file, m[1]]);
  }
  return out;
}

function inventory() {
  const keys = new Set();
  for (const [file, template] of templates()) {
    const { nodes } = parseTemplate(template, file, { preserveWhitespaces: false });
    // A label's text by its id; a bound id by what follows its prefix (`idPrefix + '-type-select-label'`).
    const labels = new Map();
    for (const [node] of walk(nodes)) {
      if (node.constructor.name !== "Element") continue;
      const id = attr(node, "id") ?? bound(node, "id", template)?.replace(/^.*?(-|$)/, "");
      if (id) labels.set(id, text(node).replace(/\s+/g, " ").trim());
    }
    for (const [node, parent] of walk(nodes)) {
      if (node.constructor.name !== "Element" || !isControl(node)) continue;
      keys.add(`${file.split("/").pop()}: ${nameOf(node, parent, template, labels)}`);
    }
  }
  // The palette's commands, by id: the shell's and the sidebar's.
  for (const [file, from] of [
    ["components/app-shell/app-shell.ts", "get sidebarPaletteActions"],
    ["components/collections/collections-sidebar.ts", "private buildPaletteActions"],
  ]) {
    const source = readFileSync(join(app, file), "utf8");
    const body = source.slice(source.indexOf(from)).split(/\n  }\n/)[0];
    for (const m of body.matchAll(/\bid: ([^,\n]+),/g))
      for (const id of m[1].matchAll(/"([^"]+)"/g)) keys.add(`palette: ${id[1]}`);
  }
  // The shortcuts: the app's, by name (shared/shortcuts.ts), and the keys Settings lists besides them.
  const shortcuts = readFileSync(join(app, "shared/shortcuts.ts"), "utf8");
  for (const m of shortcuts.matchAll(/^  (\w+): \{ key:/gm)) keys.add(`shortcut: ${m[1]}`);
  const settings = readFileSync(join(app, "components/settings/settings.ts"), "utf8");
  for (const m of settings.matchAll(/\{ keys: "([^"]+)"/g)) keys.add(`shortcut: ${m[1]}`);
  // Menus built in code.
  for (const file of [
    "shared/collections/collection-context-menu.ts",
    "components/composer/address-row.ts",
    "components/response-viewer/response-viewer.ts",
  ]) {
    const source = readFileSync(join(app, file), "utf8");
    for (const m of source.matchAll(/\blabel: "([^"]+)",[^}]*command:/g))
      keys.add(`menu ${file.split("/").pop()}: ${m[1]}`);
  }
  return keys;
}

/** The first cell of each row of the inventory's tables, when it is code. */
function mapped() {
  const section = readFileSync(doc, "utf8").split(/^## Inventory$/m)[1] ?? "";
  // A `|` in a cell is written `\|`, or it would end the cell.
  return new Set([...section.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1].replaceAll("\\|", "|")));
}

test("every action of the app has a row in docs/design/ia.md", () => {
  const rows = mapped();
  assert.deepEqual(
    [...inventory()].filter((key) => !rows.has(key)),
    [],
  );
});

test("every row of docs/design/ia.md's inventory is an action the app has", () => {
  const actions = inventory();
  assert.deepEqual(
    [...mapped()].filter((key) => !actions.has(key)),
    [],
  );
});
