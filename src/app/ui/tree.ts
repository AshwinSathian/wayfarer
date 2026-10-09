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
} from "@angular/core";
import { Icon } from "../shared/icon/icon";

export interface UiTreeNode<T = unknown> {
  key: string;
  label: string;
  data: T;
  children?: UiTreeNode<T>[];
  /** Whether the node starts expanded. The tree remembers what the user does after that. */
  expanded?: boolean;
}

/** One visible node. */
interface Row<T> {
  node: UiTreeNode<T>;
  level: number;
  parent: UiTreeNode<T> | null;
  siblings: UiTreeNode<T>[];
  index: number;
  expandable: boolean;
  expanded: boolean;
}

/**
 * A single-select tree (WAI-ARIA tree view pattern) whose nodes can be
 * reordered among their siblings by drag and drop or Alt+Arrow keys.
 *
 *   <ui-tree [nodes]="nodes()" ariaLabel="Collections" [group]="kind"
 *            (selected)="…" (edit)="…" (reorder)="…">
 *     <ng-template let-node>{{ node.label }}</ng-template>
 *   </ui-tree>
 *
 * One row is in the tab order. Arrow keys move between visible rows, Right
 * and Left expand, collapse or step to a child or parent, Home and End jump,
 * Enter or Space selects, F2 asks to edit. A right-click selects the row and
 * goes on up as a `contextmenu` event; Shift+F10 sends the row the same event.
 */
@Component({
  selector: "ui-tree",
  imports: [NgTemplateOutlet, Icon],
  template: `
    @for (row of rows(); track row.node.key) {
      <!-- A tree row takes its keys from the tree (see onKeydown); it is not a button. -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
      <div
        class="ui-tree-row"
        role="treeitem"
        draggable="true"
        [attr.data-key]="row.node.key"
        [attr.aria-label]="row.node.label"
        [attr.aria-level]="row.level"
        [attr.aria-posinset]="row.index + 1"
        [attr.aria-setsize]="row.siblings.length"
        [attr.aria-expanded]="row.expandable ? row.expanded : null"
        [attr.aria-selected]="row.node.key === selectedKey()"
        [tabindex]="row.node.key === tabStop() ? 0 : -1"
        [style.margin-inline-start.px]="(row.level - 1) * 16"
        [class.ui-tree-row--selected]="row.node.key === selectedKey()"
        [class.ui-tree-row--drop-before]="dropTarget()?.key === row.node.key && dropTarget()?.before"
        [class.ui-tree-row--drop-after]="dropTarget()?.key === row.node.key && !dropTarget()?.before"
        (click)="select(row)"
        (contextmenu)="select(row)"
        (focus)="activeKey.set(row.node.key)"
        (dragstart)="onDragStart(row, $event)"
        (dragover)="onDragOver(row, $event)"
        (dragleave)="dropTarget.set(null)"
        (drop)="onDrop(row, $event)"
        (dragend)="endDrag()"
      >
        <!-- The arrow keys do this for keyboard users. -->
        <span class="ui-tree-toggle" aria-hidden="true" [class.ui-tree-toggle--hidden]="!row.expandable" (click)="toggle(row); $event.stopPropagation()">
          <app-icon [name]="row.expanded ? 'keyboard_arrow_down' : 'chevron_right'" />
        </span>
        <span class="ui-tree-label"><ng-container *ngTemplateOutlet="rowTemplate(); context: { $implicit: row.node }" /></span>
      </div>
    }
  `,
  host: { class: "ui-tree", role: "tree", "[attr.aria-label]": "ariaLabel()", "(keydown)": "onKeydown($event)" },
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
  protected readonly activeKey = signal<string | null>(null);
  protected readonly dropTarget = signal<{ key: string; before: boolean } | null>(null);
  /** What the user expanded or collapsed, by key; other nodes follow their `expanded` field. */
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());
  private dragged: Row<T> | null = null;
  /** A row to focus again once the nodes have been rendered in their new order. */
  private refocus: string | null = null;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly rows = computed<Row<T>[]>(() => {
    const toggled = this.toggled();
    const rows: Row<T>[] = [];
    const walk = (siblings: UiTreeNode<T>[], parent: UiTreeNode<T> | null, level: number) => {
      siblings.forEach((node, index) => {
        const expandable = !!node.children?.length;
        const expanded = expandable && (toggled.get(node.key) ?? !!node.expanded);
        rows.push({ node, level, parent, siblings, index, expandable, expanded });
        if (expanded) walk(node.children!, node, level + 1);
      });
    };
    walk(this.nodes(), null, 1);
    return rows;
  });

  /** The row in the tab order: the last one focused, else the selected one, else the first. */
  protected readonly tabStop = computed(() => {
    const keys = this.rows().map((row) => row.node.key);
    return [this.activeKey(), this.selectedKey()].find((key) => key !== null && keys.includes(key)) ?? keys[0] ?? null;
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

  protected select(row: Row<T>): void {
    this.selectedKey.set(row.node.key);
    this.activeKey.set(row.node.key);
    this.selected.emit(row.node);
  }

  protected toggle(row: Row<T>): void {
    if (!row.expandable) return;
    this.toggled.update((map) => new Map(map).set(row.node.key, !row.expanded));
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    // Keys typed into something inside a row (an inline rename) are not for the tree.
    if (target.getAttribute("role") !== "treeitem") return;
    const rows = this.rows();
    const index = rows.findIndex((row) => row.node.key === target.dataset["key"]);
    const row = rows[index];
    if (!row) return;
    const focus = (to: Row<T> | undefined) => to && this.focusNode(to.node.key);

    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      this.moveByKey(row, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      // A real event, so it goes the way a right-click does: to the row, then up to whatever opens the menu.
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left + 24, clientY: rect.bottom }));
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowDown":
        focus(rows[index + 1]);
        break;
      case "ArrowUp":
        focus(rows[index - 1]);
        break;
      case "Home":
        focus(rows[0]);
        break;
      case "End":
        focus(rows[rows.length - 1]);
        break;
      case "ArrowRight":
        if (row.expanded) focus(rows[index + 1]);
        else this.toggle(row);
        break;
      case "ArrowLeft":
        if (row.expanded) this.toggle(row);
        else focus(rows.find((candidate) => candidate.node === row.parent));
        break;
      case "Enter":
      case " ":
        this.select(row);
        break;
      case "F2":
        this.edit.emit(row.node);
        break;
      default:
        return;
    }
    event.preventDefault();
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

  protected onDragStart(row: Row<T>, event: DragEvent): void {
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

  protected onDragOver(row: Row<T>, event: DragEvent): void {
    if (!this.accepts(row)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const before = this.isBefore(event);
    const current = this.dropTarget();
    if (current?.key !== row.node.key || current.before !== before) this.dropTarget.set({ key: row.node.key, before });
  }

  protected onDrop(row: Row<T>, event: DragEvent): void {
    const dragged = this.dragged;
    if (!dragged || !this.accepts(row)) return this.endDrag();
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
