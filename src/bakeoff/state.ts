import { signal } from "@angular/core";
import { BakeNode, locate, menuItems, moveBy, moveTo, sample, setOrder } from "./model";

/** One candidate's page state. Each candidate makes its own; none of it depends on a widget library. */
export class BakeState {
  /** `?n=1000` adds a large collection, every folder open, for the timing test. */
  readonly size = Number(new URLSearchParams(location.search).get("n") ?? 0);
  readonly started = performance.now();
  readonly nodes = signal<BakeNode[]>(sample(this.size));
  readonly selected = signal<string | null>(null);
  readonly env = signal<string | null>(null);
  /** The row the context menu is for. */
  readonly target = signal<BakeNode | null>(null);
  /** What the last action was, in words: the tests read it. */
  readonly log = signal("");

  /** Whether a node starts open: collections do, folders do only in the large tree. */
  startsOpen(node: BakeNode): boolean {
    return node.kind === "collection" || (this.size > 0 && node.kind === "folder");
  }

  find(key: string): BakeNode | null {
    return locate(this.nodes(), key)?.siblings.find((node) => node.key === key) ?? null;
  }

  items(): string[] {
    const target = this.target();
    return target ? menuItems(target) : [];
  }

  open(node: BakeNode): void {
    this.selected.set(node.key);
    this.log.set(`opened ${node.label}`);
  }

  moveBy(key: string, delta: -1 | 1): void {
    this.nodes.update((nodes) => moveBy(nodes, key, delta));
    this.log.set(`moved ${key}`);
  }

  drop(key: string, target: string, before: boolean): void {
    const moved = moveTo(this.nodes(), key, target, before);
    if (!moved) return;
    this.nodes.set(moved);
    this.log.set(`moved ${key}`);
  }

  order(key: string, keys: string[]): void {
    this.nodes.update((nodes) => setOrder(nodes, key, keys));
    this.log.set(`moved ${key}`);
  }

  act(item: string): void {
    this.log.set(`${item}: ${this.target()?.label ?? "?"}`);
  }
}
