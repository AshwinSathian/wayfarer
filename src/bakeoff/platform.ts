import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from "@angular/core";
import { BakeNode, ENVIRONMENTS, METHOD_SHORT, markRendered } from "./model";
import { BakeState } from "./state";

interface Visible {
  node: BakeNode;
  level: number;
  parent: string | null;
  setSize: number;
  position: number;
}

/**
 * Candidate 3: the platform. A native <select>; the tree is ours, written to
 * WAI-ARIA's tree pattern; the context menu is a popover (top layer, light
 * dismiss and Escape from the browser), placed at the pointer by us.
 */
@Component({
  selector: "bake-platform, app-root",
  template: `
    <div class="bake-field">
      <label for="env">Environment</label>
      <select id="env" class="bake-native-select" [value]="state.env() ?? ''" (change)="pickEnv($event)">
        <option value="">No environment</option>
        @for (env of environments; track env.id) {
          <option [value]="env.id">{{ env.name }}</option>
        }
      </select>
    </div>

    <ul role="tree" class="bake-tree" aria-label="Collections" (keydown)="onKeydown($event)">
      @for (row of rows(); track row.node.key) {
        <li
          role="treeitem"
          class="bake-row"
          draggable="true"
          [attr.data-key]="row.node.key"
          [attr.aria-label]="ariaName(row.node)"
          [attr.aria-level]="row.level"
          [attr.aria-setsize]="row.setSize"
          [attr.aria-posinset]="row.position"
          [attr.aria-expanded]="row.node.children?.length ? isOpen(row.node) : null"
          [attr.aria-selected]="state.selected() === row.node.key"
          [tabIndex]="row.node.key === active() ? 0 : -1"
          [style.padding-inline-start.px]="8 + (row.level - 1) * 16"
          [class.bake-drop-before]="drop()?.key === row.node.key && drop()?.before"
          [class.bake-drop-after]="drop()?.key === row.node.key && !drop()?.before"
          (focus)="active.set(row.node.key)"
          (click)="select(row.node); state.open(row.node)"
          (contextmenu)="openMenu(row.node, $event)"
          (dragstart)="dragged = row.node.key"
          (dragover)="onDragOver(row.node, $event)"
          (dragleave)="drop.set(null)"
          (drop)="onDrop(row.node, $event)"
          (dragend)="dragged = null; drop.set(null)"
        >
          <span class="bake-toggle" aria-hidden="true" (click)="toggle(row.node); $event.stopPropagation()">{{
            row.node.children?.length ? (isOpen(row.node) ? "▾" : "▸") : ""
          }}</span>
          @if (row.node.method; as method) {
            <span class="bake-method">{{ short(method) }}</span>&ngsp;
          }
          {{ row.node.label }}
        </li>
      }
    </ul>

    <div #menu popover role="menu" class="bake-menu bake-popover" [style.left.px]="menuAt().x" [style.top.px]="menuAt().y" (toggle)="onMenuToggle($event)" (keydown)="onMenuKeydown($event)">
      @for (entry of state.items(); track entry) {
        <div role="menuitem" tabindex="-1" class="bake-menu-item" (click)="choose(entry)">{{ entry }}</div>
      }
    </div>
    <p class="bake-log" data-testid="log">{{ state.log() }}</p>
    <p class="bake-log" data-testid="env">{{ state.env() ?? "none" }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformCandidate {
  protected readonly state = new BakeState();
  protected readonly environments = ENVIRONMENTS;
  /** The row in the tab order: one row of the tree is, as the pattern asks. */
  protected readonly active = signal<string>("shop");
  protected readonly menuAt = signal({ x: 0, y: 0 });
  protected readonly drop = signal<{ key: string; before: boolean } | null>(null);
  protected dragged: string | null = null;
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly menu = viewChild.required<ElementRef<HTMLElement>>("menu");
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private typed = "";
  private typedAt = 0;

  /** The rows that are drawn: every node whose ancestors are all open, in order. */
  protected readonly rows = computed<Visible[]>(() => {
    const rows: Visible[] = [];
    const walk = (nodes: BakeNode[], level: number, parent: string | null) => {
      nodes.forEach((node, index) => {
        rows.push({ node, level, parent, setSize: nodes.length, position: index + 1 });
        if (node.children?.length && this.isOpen(node)) walk(node.children, level + 1, node.key);
      });
    };
    walk(this.state.nodes(), 1, null);
    return rows;
  });

  constructor() {
    afterNextRender(() => markRendered(this.state.started));
  }

  protected short(method: string): string {
    return METHOD_SHORT[method] ?? method;
  }

  protected ariaName(node: BakeNode): string | null {
    return node.method ? `${this.short(node.method)} ${node.label}` : null;
  }

  protected pickEnv(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.env.set(value || null);
  }

  protected isOpen(node: BakeNode): boolean {
    return !!node.children?.length && (this.toggled().get(node.key) ?? this.state.startsOpen(node));
  }

  protected toggle(node: BakeNode, open = !this.isOpen(node)): void {
    if (node.children?.length && open !== this.isOpen(node)) this.toggled.update((map) => new Map(map).set(node.key, open));
  }

  protected select(node: BakeNode): void {
    this.state.selected.set(node.key);
    this.setActive(node.key);
  }

  /**
   * The row in the tab order, written at once: the template writes it at the next render, and a
   * Tab that comes first (a quick Tab after a click, in Chromium under load) found the old one.
   */
  private setActive(key: string): void {
    this.active.set(key);
    for (const row of this.host.nativeElement.querySelectorAll<HTMLElement>("[role=treeitem]")) row.tabIndex = row.dataset["key"] === key ? 0 : -1;
  }

  private focusRow(key: string): void {
    this.setActive(key);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus(), { injector: this.injector });
  }

  /** WAI-ARIA's tree keys, and ours: Alt+Arrow moves a row, Shift+F10 opens the menu. */
  protected onKeydown(event: KeyboardEvent): void {
    const rows = this.rows();
    const index = rows.findIndex((row) => row.node.key === this.active());
    const row = rows[index];
    if (!row || (event.target as HTMLElement).getAttribute("role") !== "treeitem") return;
    const go = (to: Visible | undefined) => to && this.focusRow(to.node.key);
    const key = event.key;
    if (event.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
      this.state.moveBy(row.node.key, key === "ArrowUp" ? -1 : 1);
      this.focusRow(row.node.key);
    } else if (key === "ContextMenu" || (event.shiftKey && key === "F10")) {
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      this.showMenu(row.node, rect.left + 24, rect.bottom);
    } else if (key === "ArrowDown") go(rows[index + 1]);
    else if (key === "ArrowUp") go(rows[index - 1]);
    else if (key === "Home") go(rows[0]);
    else if (key === "End") go(rows[rows.length - 1]);
    else if (key === "ArrowRight") {
      if (!row.node.children?.length) return;
      if (this.isOpen(row.node)) go(rows[index + 1]);
      else this.toggle(row.node, true);
    } else if (key === "ArrowLeft") {
      if (this.isOpen(row.node)) this.toggle(row.node, false);
      else if (row.parent) this.focusRow(row.parent);
      else return;
    } else if (key === "Enter") {
      this.select(row.node);
      this.state.open(row.node);
    } else if (key === " ") this.select(row.node);
    else if (key === "*") {
      for (const sibling of rows.filter((other) => other.parent === row.parent)) this.toggle(sibling.node, true);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = performance.now();
      this.typed = now - this.typedAt < 500 ? this.typed + key.toLowerCase() : key.toLowerCase();
      this.typedAt = now;
      const after = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
      go(after.find((other) => other.node.label.toLowerCase().startsWith(this.typed)));
    } else return;
    event.preventDefault();
  }

  protected openMenu(node: BakeNode, event: MouseEvent): void {
    event.preventDefault();
    this.select(node);
    const show = () => this.showMenu(node, event.clientX, event.clientY);
    // On Linux and macOS the event comes with the button's press: shown then, the popover's
    // light dismiss takes the release that follows for a click outside and closes it.
    if (event.buttons & 2) addEventListener("pointerup", show, { once: true });
    else show();
  }

  private showMenu(node: BakeNode, x: number, y: number): void {
    this.state.target.set(node);
    // Kept inside the window: the menu is measured once drawn.
    this.menuAt.set({ x, y });
    afterNextRender(
      () => {
        const menu = this.menu().nativeElement;
        menu.showPopover();
        const rect = menu.getBoundingClientRect();
        this.menuAt.set({ x: Math.max(0, Math.min(x, innerWidth - rect.width - 4)), y: Math.max(0, Math.min(y, innerHeight - rect.height - 4)) });
        menu.querySelector<HTMLElement>("[role=menuitem]")?.focus();
      },
      { injector: this.injector }
    );
  }

  protected onMenuToggle(event: Event): void {
    // Closed by Escape, by a click outside or by a choice: focus goes back to the row.
    if ((event as ToggleEvent).newState === "closed") {
      const key = this.state.target()?.key;
      if (key) this.focusRow(key);
    }
  }

  protected choose(entry: string): void {
    this.state.act(entry);
    this.menu().nativeElement.hidePopover();
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = [...this.menu().nativeElement.querySelectorAll<HTMLElement>("[role=menuitem]")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const go = (to: number) => items[(to + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Enter" || event.key === " ") items[index]?.click();
    else if (event.key === "Tab") this.menu().nativeElement.hidePopover();
    else if (event.key.length === 1) go(items.findIndex((item) => item.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase())));
    else return;
    event.preventDefault();
  }

  protected onDragOver(node: BakeNode, event: DragEvent): void {
    if (!this.dragged || this.dragged === node.key) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    const current = this.drop();
    if (current?.key !== node.key || current.before !== before) this.drop.set({ key: node.key, before });
  }

  protected onDrop(node: BakeNode, event: DragEvent): void {
    event.preventDefault();
    const key = this.dragged;
    const before = this.drop()?.before ?? true;
    this.dragged = null;
    this.drop.set(null);
    if (key) this.state.drop(key, node.key, before);
  }
}
