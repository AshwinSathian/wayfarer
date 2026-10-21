import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  computed,
  contentChild,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { Tree as AriaTree, TreeItem, TreeItemGroup } from "@angular/aria/tree";
import { Icon } from "../shared/icon/icon";

export interface UiTreeNode<T = unknown> {
  key: string;
  label: string;
  /** The row's accessible name when it shows more than its label (WCAG 2.5.3: the name holds the visible text). */
  ariaLabel?: string;
  data: T;
  children?: UiTreeNode<T>[];
  /** Whether the node starts expanded. The tree remembers what the user does after that. */
  expanded?: boolean;
}

/** Where a node sits: what a drag or an Alt+Arrow move needs to know. */
interface Row<T> {
  node: UiTreeNode<T>;
  parent: UiTreeNode<T> | null;
  siblings: UiTreeNode<T>[];
}

/**
 * Angular Aria's tree (D1.5), with what the collections list adds to it: one
 * selected node, and nodes that can be reordered among their siblings by drag
 * and drop or Alt+Arrow keys.
 *
 *   <ui-tree [nodes]="nodes()" ariaLabel="Collections" [group]="kind"
 *            (selected)="…" (edit)="…" (reorder)="…">
 *     <ng-template let-node>{{ node.label }}</ng-template>
 *   </ui-tree>
 *
 * Aria gives the tree its roles, levels and keys: one row is in the tab
 * order (the selected one, until the user moves), arrow keys move between
 * visible rows, Right and Left expand, collapse or step to a child or parent,
 * Home and End jump, a letter jumps to the next row that starts with it,
 * Enter or Space selects, and a click selects and expands or collapses. Here:
 * a click, Enter or Space also opens the node (`opened`); F2 asks to edit; a
 * right-click selects the row and goes on up as a `contextmenu` event, and
 * Shift+F10 sends the row the same event.
 *
 * The rows are flat: Aria writes each row's level, set size and position, so
 * a group is layout only (`role="none"`) and sits beside its row. Inside the
 * row, the row's text would hold its children's too. Each row's `tabindex`
 * is Aria's: the one written here is for the template's linter.
 */
@Component({
  selector: "ui-tree",
  imports: [AriaTree, TreeItem, TreeItemGroup, NgTemplateOutlet, Icon],
  template: `
    <div
      ngTree
      #tree="ngTree"
      class="ui-tree"
      [wrap]="false"
      [attr.aria-label]="ariaLabel()"
      [value]="selectedValue()"
      (valueChange)="onValue($event)"
    >
      <ng-container *ngTemplateOutlet="rows; context: { $implicit: nodes(), parent: tree }" />
    </div>

    <ng-template #rows let-nodes let-parent="parent">
      @for (node of nodes; track node.key) {
        <div
          ngTreeItem
          #item="ngTreeItem"
          class="ui-tree-row"
          tabindex="-1"
          draggable="true"
          [parent]="parent"
          [value]="node.key"
          [label]="node.label"
          [expanded]="isExpanded(node)"
          (expandedChange)="setExpanded(node, $event)"
          [attr.data-key]="node.key"
          [attr.aria-label]="node.ariaLabel ?? node.label"
          [class.ui-tree-row--selected]="node.key === selectedKey()"
          [class.ui-tree-row--drop-before]="dropTarget()?.key === node.key && dropTarget()?.before"
          [class.ui-tree-row--drop-after]="dropTarget()?.key === node.key && !dropTarget()?.before"
          (focus)="onFocus(item)"
          (click)="onClick(node, $event)"
          (contextmenu)="select(node)"
          (keydown)="onKeydown(node, $event)"
          (dragstart)="onDragStart(node, $event)"
          (dragover)="onDragOver(node, $event)"
          (dragleave)="dropTarget.set(null)"
          (drop)="onDrop(node, $event)"
          (dragend)="endDrag()"
        >
          <span class="ui-tree-toggle" aria-hidden="true" [class.ui-tree-toggle--hidden]="!node.children?.length">
            <app-icon [name]="isExpanded(node) ? 'keyboard_arrow_down' : 'chevron_right'" />
          </span>
          <span class="ui-tree-label"
            ><ng-container *ngTemplateOutlet="rowTemplate(); context: { $implicit: node }"
          /></span>
        </div>
        @if (node.children?.length) {
          <div role="none" class="ui-tree-group">
            <ng-template ngTreeItemGroup [ownedBy]="item" #group="ngTreeItemGroup">
              <ng-container *ngTemplateOutlet="rows; context: { $implicit: node.children, parent: group }" />
            </ng-template>
          </div>
        }
      }
    </ng-template>
  `,
  styleUrl: "./tree.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tree<T> {
  readonly nodes = input.required<UiTreeNode<T>[]>();
  readonly ariaLabel = input.required<string>();
  /** Siblings can be reordered only among those this returns the same value for. */
  readonly group = input<(node: UiTreeNode<T>) => unknown>(() => null);

  readonly selected = output<UiTreeNode<T>>();
  /** A click, Enter or Space on the row: the user wants what the node stands for. From the keyboard, focus stays in the tree. */
  readonly opened = output<{ node: UiTreeNode<T>; keyboard: boolean }>();
  /** F2: the user wants to edit the node. */
  readonly edit = output<UiTreeNode<T>>();
  /** `node` moved; `siblings` are the nodes of its group under the same parent, in their new order. */
  readonly reorder = output<{ node: UiTreeNode<T>; siblings: UiTreeNode<T>[] }>();

  protected readonly rowTemplate = contentChild.required<TemplateRef<{ $implicit: UiTreeNode<T> }>>(TemplateRef);
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly selectedValue = computed(() => {
    const key = this.selectedKey();
    return key ? [key] : [];
  });
  protected readonly dropTarget = signal<{ key: string; before: boolean } | null>(null);
  /** What the user expanded or collapsed, by key; other nodes follow their `expanded` field. */
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());
  private dragged: Row<T> | null = null;
  /** A row to focus again once the nodes have been rendered in their new order. */
  private refocus: string | null = null;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly tree = viewChild.required<AriaTree<string>>(AriaTree);

  /** Every node's parent and siblings, by key. */
  private readonly rows = computed<ReadonlyMap<string, Row<T>>>(() => {
    const rows = new Map<string, Row<T>>();
    const walk = (siblings: UiTreeNode<T>[], parent: UiTreeNode<T> | null) => {
      for (const node of siblings) {
        rows.set(node.key, { node, parent, siblings });
        if (node.children) walk(node.children, node);
      }
    };
    walk(this.nodes(), null);
    return rows;
  });

  constructor() {
    effect(() => {
      this.rows();
      const key = untracked(() => this.refocus);
      if (!key) return;
      this.refocus = null;
      afterNextRender(() => this.focusNode(key), { injector: this.injector });
    });
  }

  /** Moves keyboard focus to a node's row, if it is visible. */
  focusNode(key: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  }

  /** Moves keyboard focus to the selected node's row. */
  focusSelected(): void {
    const key = this.selectedKey();
    if (key) this.focusNode(key);
  }

  /**
   * A row focused by anything but Aria's own keys (`focusNode`, the menu
   * giving focus back) becomes the row the keys move from and the one in the
   * tab order. Aria does not follow focus: after the menu closed, ArrowDown
   * moved on from the row that was focused before it.
   */
  protected onFocus(item: TreeItem<string>): void {
    const active = this.tree()._pattern.activeItem;
    if (active() !== item._pattern) active.set(item._pattern);
  }

  protected isExpanded(node: UiTreeNode<T>): boolean {
    return !!node.children?.length && (this.toggled().get(node.key) ?? !!node.expanded);
  }

  protected setExpanded(node: UiTreeNode<T>, expanded: boolean): void {
    if (expanded !== this.isExpanded(node)) this.toggled.update((map) => new Map(map).set(node.key, expanded));
  }

  protected select(node: UiTreeNode<T>): void {
    if (this.selectedKey() === node.key) return;
    this.selectedKey.set(node.key);
    this.selected.emit(node);
  }

  /** Aria selects on a click, Enter and Space, after the row has. */
  protected onValue(keys: string[]): void {
    const node = keys[0] ? this.rows().get(keys[0])?.node : undefined;
    if (node) this.select(node);
  }

  protected onClick(node: UiTreeNode<T>, event: MouseEvent): void {
    // A click into something inside a row (an inline rename) is not for the tree, nor for Aria's.
    if ((event.target as HTMLElement).closest("input")) {
      event.stopPropagation();
      return;
    }
    this.select(node);
    this.opened.emit({ node, keyboard: false });
  }

  /** The keys Aria's tree has no meaning for. Aria reads the rest from the same event, on the tree. */
  protected onKeydown(node: UiTreeNode<T>, event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget) {
      // Keys typed into something inside a row (an inline rename) are not for the tree: to Aria a
      // letter is a jump to another row. A shortcut with a modifier goes on to the window.
      if (!event.ctrlKey && !event.metaKey && !event.altKey) event.stopPropagation();
      return;
    }
    const row = this.rows().get(node.key);
    if (!row) return;

    // A space while typing a row's name is part of the name.
    if (event.key === "Enter" || (event.key === " " && !this.tree()._pattern.treeBehavior.isTyping())) {
      this.select(node);
      this.opened.emit({ node, keyboard: true });
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      // Aria would move focus on the same key.
      event.stopPropagation();
      this.moveByKey(row, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      // A real event, so it goes the way a right-click does: to the row, then up to whatever opens the menu.
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 24,
          clientY: rect.bottom,
        }),
      );
    } else if (event.key === "F2") {
      event.preventDefault();
      this.edit.emit(node);
    }
  }

  /** The siblings a row may be reordered among. */
  private peers(row: Row<T>): UiTreeNode<T>[] {
    const group = this.group();
    const kind = group(row.node);
    return row.siblings.filter((node) => group(node) === kind);
  }

  private moveByKey(row: Row<T>, delta: -1 | 1): void {
    const peers = this.peers(row);
    const from = peers.indexOf(row.node);
    const to = from + delta;
    if (to < 0 || to >= peers.length) return;
    peers.splice(to, 0, ...peers.splice(from, 1));
    this.refocus = row.node.key;
    this.reorder.emit({ node: row.node, siblings: peers });
  }

  protected onDragStart(node: UiTreeNode<T>, event: DragEvent): void {
    const row = this.rows().get(node.key);
    if (!row) return;
    // Dragging from inside a text field selects text; it does not move the row.
    if ((event.target as HTMLElement).tagName === "INPUT") {
      event.preventDefault();
      return;
    }
    this.dragged = row;
    event.dataTransfer?.setData("text/plain", row.node.label);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  /** A row accepts the dragged one only if both have the same parent and group. */
  private accepts(row: Row<T>): boolean {
    const dragged = this.dragged;
    return (
      !!dragged &&
      dragged.node !== row.node &&
      dragged.parent === row.parent &&
      this.group()(dragged.node) === this.group()(row.node)
    );
  }

  private isBefore(event: DragEvent): boolean {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  }

  protected onDragOver(node: UiTreeNode<T>, event: DragEvent): void {
    const row = this.rows().get(node.key);
    if (!row || !this.accepts(row)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const before = this.isBefore(event);
    const current = this.dropTarget();
    if (current?.key !== row.node.key || current.before !== before) this.dropTarget.set({ key: row.node.key, before });
  }

  protected onDrop(node: UiTreeNode<T>, event: DragEvent): void {
    const dragged = this.dragged;
    const row = this.rows().get(node.key);
    if (!dragged || !row || !this.accepts(row)) return this.endDrag();
    event.preventDefault();
    const peers = this.peers(row);
    const order = peers.filter((node) => node !== dragged.node);
    order.splice(order.indexOf(row.node) + (this.isBefore(event) ? 0 : 1), 0, dragged.node);
    this.endDrag();
    if (order.some((node, index) => node !== peers[index])) this.reorder.emit({ node: dragged.node, siblings: order });
  }

  protected endDrag(): void {
    this.dragged = null;
    this.dropTarget.set(null);
  }
}
