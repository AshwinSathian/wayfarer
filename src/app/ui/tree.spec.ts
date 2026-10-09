import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { Tree, UiTreeNode } from "./tree";

type Kind = "folder" | "file";
const node = (key: string, data: Kind, children?: UiTreeNode<Kind>[], expanded?: boolean): UiTreeNode<Kind> => ({ key, label: key, data, children, expanded });

@Component({
  imports: [Tree],
  template: `
    <ui-tree ariaLabel="Files" [nodes]="nodes()" [group]="kind" (selected)="selected.push($event.key)" (contextmenu)="menus.push($event)" (edit)="edits.push($event.key)" (reorder)="onReorder($event)">
      <ng-template let-node><span class="name">{{ node.label }}</span></ng-template>
    </ui-tree>
  `,
})
class TestHost {
  readonly nodes = signal<UiTreeNode<Kind>[]>([
    node("src", "folder", [node("app", "folder", [node("main.ts", "file")]), node("lib", "folder"), node("a.ts", "file"), node("b.ts", "file"), node("c.ts", "file")], true),
    node("docs", "folder"),
  ]);
  readonly kind = (n: UiTreeNode<Kind>) => n.data;
  readonly selected: string[] = [];
  readonly menus: MouseEvent[] = [];
  readonly edits: string[] = [];
  readonly reorders: { node: string; siblings: string[] }[] = [];
  /** Applies a reorder the way an owner would: the same nodes, in the new order. */
  apply = true;

  onReorder(event: { node: UiTreeNode<Kind>; siblings: UiTreeNode<Kind>[] }): void {
    this.reorders.push({ node: event.node.key, siblings: event.siblings.map((n) => n.key) });
    if (!this.apply) return;
    const src = this.nodes()[0];
    const others = src.children!.filter((n) => !event.siblings.includes(n));
    const children = event.node.data === "folder" ? [...event.siblings, ...others] : [...others, ...event.siblings];
    this.nodes.set([{ ...src, children }, this.nodes()[1]]);
  }
}

describe("ui-tree", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const rows = () => Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const labels = () => rows().map((row) => row.getAttribute("aria-label"));
    const row = (name: string) => rows().find((r) => r.getAttribute("aria-label") === name)!;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await fixture.whenStable();
    };
    const press = async (key: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      (document.activeElement as HTMLElement).dispatchEvent(event);
      await settle();
      return event;
    };
    const drag = async (from: string, to: string, where: "top" | "bottom") => {
      const dataTransfer = new DataTransfer();
      const rect = row(to).getBoundingClientRect();
      const clientY = where === "top" ? rect.top + 2 : rect.bottom - 2;
      row(from).dispatchEvent(new DragEvent("dragstart", { dataTransfer, bubbles: true, cancelable: true }));
      const over = new DragEvent("dragover", { dataTransfer, clientY, bubbles: true, cancelable: true });
      row(to).dispatchEvent(over);
      await settle();
      const indicator = row(to).className;
      row(to).dispatchEvent(new DragEvent("drop", { dataTransfer, clientY, bubbles: true, cancelable: true }));
      row(from)?.dispatchEvent(new DragEvent("dragend", { dataTransfer, bubbles: true }));
      await settle();
      return { accepted: over.defaultPrevented, indicator };
    };
    return { fixture, host: fixture.componentInstance, root, rows, labels, row, press, drag, settle };
  }

  it("renders visible nodes as tree items with level, position, set size and expanded state; one row is in the tab order", async () => {
    const { fixture, root, rows, labels, row } = await setup();
    const tree = root.querySelector('[role="tree"]')!;

    expect(tree.getAttribute("aria-label")).toBe("Files");
    // "app" is collapsed, so main.ts is not rendered.
    expect(labels()).toEqual(["src", "app", "lib", "a.ts", "b.ts", "c.ts", "docs"]);
    expect(row("src").getAttribute("aria-expanded")).toBe("true");
    expect(row("app").getAttribute("aria-expanded")).toBe("false");
    expect(row("lib").hasAttribute("aria-expanded")).toBe(false);
    expect(["aria-level", "aria-posinset", "aria-setsize"].map((a) => row("a.ts").getAttribute(a))).toEqual(["2", "3", "5"]);
    expect(row("docs").getAttribute("aria-level")).toBe("1");
    expect(rows().filter((r) => r.tabIndex === 0).map((r) => r.getAttribute("aria-label"))).toEqual(["src"]);
    expect(row("a.ts").querySelector(".name")?.textContent).toBe("a.ts");
    fixture.destroy();
  });

  it("arrow keys, Home and End move focus; Right and Left expand, collapse and step to a child or the parent", async () => {
    const { fixture, labels, row, press } = await setup();
    const focused = () => document.activeElement?.getAttribute("aria-label");
    row("src").focus();

    await press("ArrowDown");
    expect(focused()).toBe("app");
    await press("ArrowRight");
    expect(row("app").getAttribute("aria-expanded")).toBe("true");
    expect(labels()).toContain("main.ts");
    await press("ArrowRight");
    expect(focused()).toBe("main.ts");
    await press("ArrowLeft");
    expect(focused()).toBe("app");
    await press("ArrowLeft");
    expect(row("app").getAttribute("aria-expanded")).toBe("false");
    expect(labels()).not.toContain("main.ts");
    await press("ArrowLeft");
    expect(focused()).toBe("src");

    await press("End");
    expect(focused()).toBe("docs");
    await press("ArrowDown");
    expect(focused()).toBe("docs");
    await press("ArrowUp");
    expect(focused()).toBe("c.ts");
    await press("Home");
    expect(focused()).toBe("src");
    // The focused row is now the one in the tab order.
    expect(row("src").tabIndex).toBe(0);
    fixture.destroy();
  });

  it("selects on click, Enter and Space; F2 asks to edit; Shift+F10 and a right-click ask for the menu", async () => {
    const { fixture, host, row, press } = await setup();

    row("a.ts").click();
    await fixture.whenStable();
    expect(host.selected).toEqual(["a.ts"]);
    expect(row("a.ts").getAttribute("aria-selected")).toBe("true");
    expect(row("b.ts").getAttribute("aria-selected")).toBe("false");

    row("b.ts").focus();
    await press("Enter");
    await press("ArrowDown");
    await press(" ");
    expect(host.selected).toEqual(["a.ts", "b.ts", "c.ts"]);

    await press("F2");
    expect(host.edits).toEqual(["c.ts"]);

    // Shift+F10 sends the row a contextmenu event, as a right-click would, for whatever opens the menu.
    const key = await press("F10", { shiftKey: true });
    expect(key.defaultPrevented).toBe(true);
    expect(host.menus).toHaveLength(1);
    expect(host.menus[0].target).toBe(row("c.ts"));
    expect(host.menus[0].clientY).toBeCloseTo(row("c.ts").getBoundingClientRect().bottom, 0);

    row("lib").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 6 }));
    expect(host.menus).toHaveLength(2);
    expect(host.selected.at(-1)).toBe("lib");
    fixture.destroy();
  });

  it("shows the first child a node is given, when the node says it is expanded", async () => {
    const { fixture, host, labels, row, settle, press } = await setup();
    // "docs" starts empty; its owner then gives it a child and marks it expanded, as a new request in an empty collection does.
    const [src, docs] = host.nodes();
    host.nodes.set([src, { ...docs, expanded: true, children: [node("readme.md", "file")] }]);
    await settle();

    expect(row("docs").getAttribute("aria-expanded")).toBe("true");
    expect(labels()).toContain("readme.md");
    expect(row("readme.md").getAttribute("aria-level")).toBe("2");

    // Right on the open node steps into the child it did not have when it was first drawn.
    row("docs").focus();
    await press("ArrowRight");
    expect(document.activeElement).toBe(row("readme.md"));
    fixture.destroy();
  });

  it("leaves keys typed into a field inside a row alone", async () => {
    const { fixture, host, row } = await setup();
    const field = document.createElement("input");
    row("a.ts").append(field);
    field.focus();

    const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    field.dispatchEvent(event);
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field);
    expect(host.edits).toEqual([]);
    fixture.destroy();
  });

  it("keeps what the user expanded when the nodes are replaced", async () => {
    const { fixture, host, labels, row, press } = await setup();
    row("app").focus();
    await press("ArrowRight");
    expect(labels()).toContain("main.ts");

    host.nodes.set(structuredClone(host.nodes()));
    await fixture.whenStable();

    expect(labels()).toContain("main.ts");
    fixture.destroy();
  });

  it("Alt+Arrow moves a node among siblings of its own kind and keeps focus on it", async () => {
    const { fixture, host, labels, row, press } = await setup();
    row("b.ts").focus();

    await press("ArrowUp", { altKey: true });
    expect(host.reorders).toEqual([{ node: "b.ts", siblings: ["b.ts", "a.ts", "c.ts"] }]);
    expect(labels()).toEqual(["src", "app", "lib", "b.ts", "a.ts", "c.ts", "docs"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("b.ts");

    // Already first among the files: it does not jump over the folders.
    await press("ArrowUp", { altKey: true });
    expect(host.reorders).toHaveLength(1);

    await press("ArrowDown", { altKey: true });
    expect(host.reorders[1]).toEqual({ node: "b.ts", siblings: ["a.ts", "b.ts", "c.ts"] });
    fixture.destroy();
  });

  it("drag and drop reorders among siblings of the same kind, before or after the row dropped on", async () => {
    const { fixture, host, labels, drag } = await setup();

    const before = await drag("c.ts", "a.ts", "top");
    expect(before.accepted).toBe(true);
    expect(before.indicator).toContain("ui-tree-row--drop-before");
    expect(host.reorders).toEqual([{ node: "c.ts", siblings: ["c.ts", "a.ts", "b.ts"] }]);
    expect(labels()).toEqual(["src", "app", "lib", "c.ts", "a.ts", "b.ts", "docs"]);

    const after = await drag("c.ts", "b.ts", "bottom");
    expect(after.indicator).toContain("ui-tree-row--drop-after");
    expect(host.reorders[1]).toEqual({ node: "c.ts", siblings: ["a.ts", "b.ts", "c.ts"] });

    await drag("lib", "app", "top");
    expect(host.reorders[2]).toEqual({ node: "lib", siblings: ["lib", "app"] });
    fixture.destroy();
  });

  it("refuses a drop on another kind, on another parent, and one that changes nothing", async () => {
    const { fixture, host, drag, row } = await setup();

    expect((await drag("a.ts", "lib", "top")).accepted).toBe(false);
    expect((await drag("app", "docs", "top")).accepted).toBe(false);
    expect((await drag("a.ts", "a.ts", "top")).accepted).toBe(false);
    // Dropping a.ts just before b.ts leaves the order as it is.
    expect((await drag("a.ts", "b.ts", "top")).accepted).toBe(true);

    expect(host.reorders).toEqual([]);
    expect(row("lib").className).not.toContain("drop");
    fixture.destroy();
  });
});
