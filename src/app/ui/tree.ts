import { NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, ElementRef, Injector, TemplateRef, afterNextRender, computed, contentChild, effect, inject, input, output, signal, untracked, viewChild, viewChildren } from "@angular/core";
import { MatTree, MatTreeNode, MatTreeNodeDef } from "@angular/material/tree";
import { Icon } from "../shared/icon/icon";

export interface UiTreeNode<T = unknown> {
  key: string;
  label: string;
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
 * Material's tree, with what the collections list adds to it: one selected
 * node, and nodes that can be reordered among their siblings by drag and
 * drop or Alt+Arrow keys.
 *
 *   <ui-tree [nodes]="nodes()" ariaLabel="Collections" [group]="kind"
 *            (selected)="…" (edit)="…" (reorder)="…">
 *     <ng-template let-node>{{ node.label }}</ng-template>
 *   </ui-tree>
 *
 * Material gives the tree its roles, levels and keys: one row is in the tab
 * order, arrow keys move between visible rows, Right and Left expand,
 * collapse or step to a child or parent, Home and End jump, a letter jumps
 * to the next row that starts with it, Enter or Space selects. Here: F2
 * asks to edit; a right-click selects the row and goes on up as a
 * `contextmenu` event, and Shift+F10 sends the row the same event.
 */
@Component({
  selector: "ui-tree",
  imports: [MatTree, MatTreeNode, MatTreeNodeDef, NgTemplateOutlet, Icon],
  template: `
    <mat-tree class="ui-tree" [dataSource]="nodes()" [childrenAccessor]="children" [expansionKey]="key" [trackBy]="trackByKey" [attr.aria-label]="ariaLabel()">
      <mat-tree-node
        *matTreeNodeDef="let node"
        #row="matTreeNode"
        class="ui-tree-row"
        draggable="true"
        [attr.data-key]="node.key"
        [attr.aria-label]="node.label"
        [attr.aria-selected]="node.key === selectedKey()"
        [isExpandable]="!!node.children?.length"
        [style.margin-inline-start.px]="row.level * 16"
        [class.ui-tree-row--selected]="node.key === selectedKey()"
        [class.ui-tree-row--drop-before]="dropTarget()?.key === node.key && dropTarget()?.before"
        [class.ui-tree-row--drop-after]="dropTarget()?.key === node.key && !dropTarget()?.before"
        (expandedChange)="setExpanded(node, $event)"
        (activation)="select(node)"
        (click)="select(node)"
        (contextmenu)="select(node)"
        (keydown)="onKeydown(node, $event)"
        (dragstart)="onDragStart(node, $event)"
        (dragover)="onDragOver(node, $event)"
        (dragleave)="dropTarget.set(null)"
        (drop)="onDrop(node, $event)"
        (dragend)="endDrag()"
      >
        <!-- The arrow keys do this for keyboard users. -->
        <span class="ui-tree-toggle" aria-hidden="true" [class.ui-tree-toggle--hidden]="!node.children?.length" (click)="setExpanded(node, !isExpanded(node)); $event.stopPropagation()">
          <app-icon [name]="isExpanded(node) ? 'keyboard_arrow_down' : 'chevron_right'" />
        </span>
        <span class="ui-tree-label"><ng-container *ngTemplateOutlet="rowTemplate(); context: { $implicit: node }" /></span>
      </mat-tree-node>
    </mat-tree>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tree<T> {
  readonly nodes = input.required<UiTreeNode<T>[]>();
  readonly ariaLabel = input.required<string>();
  /** Siblings can be reordered only among those this returns the same value for. */
  readonly group = input<(node: UiTreeNode<T>) => unknown>(() => null);

  readonly selected = output<UiTreeNode<T>>();
  /** F2: the user wants to edit the node. */
  readonly edit = output<UiTreeNode<T>>();
  /** `node` moved; `siblings` are the nodes of its group under the same parent, in their new order. */
  readonly reorder = output<{ node: UiTreeNode<T>; siblings: UiTreeNode<T>[] }>();

  protected readonly rowTemplate = contentChild.required<TemplateRef<{ $implicit: UiTreeNode<T> }>>(TemplateRef);
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly dropTarget = signal<{ key: string; before: boolean } | null>(null);
  /** What the user expanded or collapsed, by key; other nodes follow their `expanded` field. */
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());
  private dragged: Row<T> | null = null;
  /** A row to focus again once the nodes have been rendered in their new order. */
  private refocus: string | null = null;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  /**
   * A node's children, looked up by key: Material keeps the node object a
   * row was first drawn with, which knows nothing of children added since.
   */
  protected readonly children = (node: UiTreeNode<T>): UiTreeNode<T>[] => this.rows().get(node.key)?.node.children ?? [];
  protected readonly key = (node: UiTreeNode<T>): string => node.key;
  protected readonly trackByKey = (_index: number, node: UiTreeNode<T>): string => node.key;

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

  private readonly tree = viewChild.required<MatTree<UiTreeNode<T>, string>>(MatTree);
  private readonly rendered = viewChildren(MatTreeNode);
  private tabStopSet = false;

  constructor() {
    // Material puts the first row it hears of in the tab order, and under an
    // expanded node that is a child. Once, when the rows first appear, the
    // tab stop is moved to the top one.
    effect(() => {
      const rendered = this.rendered();
      if (this.tabStopSet || !rendered.length) return;
      this.tabStopSet = true;
      rendered.forEach((row, index) => (index === 0 ? row.makeFocusable() : row.unfocus()));
    });
    // Which nodes are open is told to Material here, after it has rendered,
    // not through a row's isExpanded input: that input is set while the
    // tree is rendering, and a node opened then (one that has just been
    // given its first child) was marked open without its children drawn.
    effect(() => {
      const open = [...this.rows().values()].map(({ node }) => [node, this.isExpanded(node)] as const);
      const tree = this.tree();
      afterNextRender(
        () => {
          for (const [node, expanded] of open) {
            if (tree.isExpanded(node) === expanded) continue;
            if (expanded) tree.expand(node);
            else tree.collapse(node);
          }
        },
        { injector: this.injector }
      );
    });
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

  protected isExpanded(node: UiTreeNode<T>): boolean {
    return !!node.children?.length && (this.toggled().get(node.key) ?? !!node.expanded);
  }

  protected setExpanded(node: UiTreeNode<T>, expanded: boolean): void {
    if (expanded !== this.isExpanded(node)) this.toggled.update((map) => new Map(map).set(node.key, expanded));
  }

  protected select(node: UiTreeNode<T>): void {
    this.selectedKey.set(node.key);
    this.selected.emit(node);
  }

  /** The keys Material's tree has no meaning for. It reads the rest from the same event, further up. */
  protected onKeydown(node: UiTreeNode<T>, event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    // Keys typed into something inside a row (an inline rename) are not for the tree.
    if (target !== event.currentTarget) return;
    const row = this.rows().get(node.key);
    if (!row) return;

    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      // Material would move focus on the same key.
      event.stopPropagation();
      this.moveByKey(row, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      // A real event, so it goes the way a right-click does: to the row, then up to whatever opens the menu.
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left + 24, clientY: rect.bottom }));
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
    return !!dragged && dragged.node !== row.node && dragged.parent === row.parent && this.group()(dragged.node) === this.group()(row.node);
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
