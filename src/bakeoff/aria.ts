import { CdkConnectedOverlay, ConnectedPosition } from "@angular/cdk/overlay";
import { NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from "@angular/core";
import { Combobox, ComboboxPopup, ComboboxWidget } from "@angular/aria/combobox";
import { Listbox, Option } from "@angular/aria/listbox";
import { Menu, MenuContent, MenuItem } from "@angular/aria/menu";
import { Tree, TreeItem, TreeItemGroup } from "@angular/aria/tree";
import { BakeNode, ENVIRONMENTS, METHOD_SHORT, markRendered } from "./model";
import { BakeState } from "./state";

/**
 * Candidate 2: Angular Aria (headless patterns) with our own styles. Aria
 * gives roles, focus and keys; positioning is the CDK overlay's, and drag,
 * Alt+Arrow and the context menu's opening are ours, as they are for
 * Material's tree today.
 */
@Component({
  selector: "bake-aria, app-root",
  imports: [NgTemplateOutlet, CdkConnectedOverlay, Combobox, ComboboxPopup, ComboboxWidget, Listbox, Option, Menu, MenuContent, MenuItem, Tree, TreeItem, TreeItemGroup],
  template: `
    <div class="bake-field" #field>
      <span id="env-label">Environment</span>
      <div ngCombobox #combobox="ngCombobox" class="bake-select" aria-labelledby="env-label" [(expanded)]="envOpen">
        <span [class.bake-placeholder]="!envName()">{{ envName() ?? "No environment" }}</span>
        <span class="bake-chevron" aria-hidden="true">▾</span>
      </div>
      <ng-template [cdkConnectedOverlay]="{ origin: combobox.element, usePopover: 'inline', matchWidth: true }" [cdkConnectedOverlayOpen]="envOpen()" [cdkConnectedOverlayPositions]="below" [cdkConnectedOverlayDisableClose]="true">
        <ng-template ngComboboxPopup [combobox]="combobox">
          <!-- The page commits the choice and closes the list. Angular's example does it on the listbox's
               Enter, which a second opening by Enter also reaches: the list closed as it opened. -->
          <div ngComboboxWidget ngListbox #listbox="ngListbox" class="bake-list" focusMode="activedescendant" selectionMode="explicit"
            [activeDescendant]="listbox.activeDescendant()" [(value)]="envValues" (valueChange)="commit()" (click)="commit()" (keydown.enter)="openAtKey && close()">
            <div ngOption [value]="null" label="No environment">No environment</div>
            @for (env of environments; track env.id) {
              <div ngOption [value]="env.id" [label]="env.name">{{ env.name }}</div>
            }
          </div>
        </ng-template>
      </ng-template>
    </div>

    <ul ngTree #tree="ngTree" class="bake-tree" aria-label="Collections" [value]="selectedValue()" (valueChange)="onSelect($event)">
      <ng-template [ngTemplateOutlet]="rows" [ngTemplateOutletContext]="{ nodes: state.nodes(), parent: tree }" />
    </ul>

    <ng-template #rows let-nodes="nodes" let-parent="parent">
      @for (node of nodes; track node.key) {
        <li
          ngTreeItem
          #item="ngTreeItem"
          class="bake-item"
          draggable="true"
          [parent]="parent"
          [value]="node.key"
          [label]="node.label"
          [attr.data-key]="node.key"
          [attr.aria-labelledby]="'line-' + node.key"
          [expanded]="isOpen(node)"
          (expandedChange)="setOpen(node, $event)"
          (click)="own($event) && state.open(node)"
          (keydown)="own($event) && onKeydown(node, $event)"
          (contextmenu)="own($event) && openMenu(node, $event)"
          (dragstart)="own($event) && (dragged = node.key)"
          (dragover)="own($event) && onDragOver(node, $event)"
          (drop)="own($event) && onDrop(node, $event)"
          (dragend)="dragged = null; drop.set(null)"
        >
          <!-- Flat, as Material's tree is: Aria writes each item's level, set size and position; the group's list is only layout. -->
          <div class="bake-row" [id]="'line-' + node.key" [class.bake-drop-before]="drop()?.key === node.key && drop()?.before" [class.bake-drop-after]="drop()?.key === node.key && !drop()?.before">
            <span class="bake-toggle" aria-hidden="true">{{ node.children?.length ? (isOpen(node) ? "▾" : "▸") : "" }}</span>
            @if (node.method; as method) {
              <span class="bake-method">{{ short(method) }}</span>&ngsp;
            }
            {{ node.label }}
          </div>
        </li>
        @if (node.children?.length) {
          <ul role="none" class="bake-group" [hidden]="!isOpen(node)">
            <ng-template ngTreeItemGroup [ownedBy]="item" #group="ngTreeItemGroup">
              <ng-template [ngTemplateOutlet]="rows" [ngTemplateOutletContext]="{ nodes: node.children, parent: group }" />
            </ng-template>
          </ul>
        }
      }
    </ng-template>

    <ng-template [cdkConnectedOverlay]="{ origin: menuAt(), usePopover: 'inline' }" [cdkConnectedOverlayOpen]="menuOpen()" (overlayOutsideClick)="outside($event)" (detach)="closeMenu()">
      <div ngMenu #menu class="bake-menu" (itemSelected)="choose($event)" (keydown.escape)="closeMenu()" (keydown.tab)="closeMenu()">
        <ng-template ngMenuContent>
          @for (entry of state.items(); track entry) {
            <div ngMenuItem class="bake-menu-item" [value]="entry">{{ entry }}</div>
          }
        </ng-template>
      </div>
    </ng-template>
    <p class="bake-log" data-testid="log">{{ state.log() }}</p>
    <p class="bake-log" data-testid="env">{{ state.env() ?? "none" }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AriaCandidate {
  protected readonly state = new BakeState();
  protected readonly environments = ENVIRONMENTS;
  protected readonly envOpen = signal(false);
  protected readonly envName = computed(() => ENVIRONMENTS.find((env) => env.id === this.state.env())?.name ?? null);
  protected readonly below: ConnectedPosition[] = [{ originX: "start", originY: "bottom", overlayX: "start", overlayY: "top", offsetY: 4 }];

  protected readonly selectedValue = computed(() => {
    const key = this.state.selected();
    return key ? [key] : [];
  });
  protected readonly menuOpen = signal(false);
  private openedAt = 0;
  protected readonly menuAt = signal({ x: 0, y: 0 });
  protected readonly drop = signal<{ key: string; before: boolean } | null>(null);
  protected dragged: string | null = null;
  private readonly toggled = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly menu = viewChild<ElementRef<HTMLElement>>("menu");
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  private readonly field = viewChild.required<ElementRef<HTMLElement>>("field");

  constructor() {
    afterNextRender(() => {
      markRendered(this.state.started);
      // Noted before Aria's own handler: whether the list was open when Enter came. Aria passes
      // the same Enter on to the listbox, also the one that opens it again.
      this.field().nativeElement.addEventListener("keydown", () => (this.openAtKey = this.envOpen()), true);
    });
  }

  protected short(method: string): string {
    return METHOD_SHORT[method] ?? method;
  }

  /** Every row is named: an item's text holds its children's too. */
  protected ariaName(node: BakeNode): string {
    return node.method ? `${this.short(node.method)} ${node.label}` : node.label;
  }

  /** An event of this item, not one that bubbled up from an item inside it. */
  protected own(event: Event): boolean {
    const mine = (event.target as HTMLElement).closest("[ngTreeItem]") === event.currentTarget;
    if (mine && event.type.startsWith("drag")) event.stopPropagation();
    return mine;
  }

  protected isOpen(node: BakeNode): boolean {
    return !!node.children?.length && (this.toggled().get(node.key) ?? this.state.startsOpen(node));
  }

  protected setOpen(node: BakeNode, open: boolean): void {
    if (open !== this.isOpen(node)) this.toggled.update((map) => new Map(map).set(node.key, open));
  }

  protected readonly envValues = signal<(string | null)[]>([null]);

  private openAtKey = false;

  /** Enter on the choice already made changes no value, so nothing else closes the list. */
  protected close(): void {
    setTimeout(() => this.envOpen.set(false));
  }

  protected commit(): void {
    const values = this.envValues();
    if (!values.length) return;
    this.state.env.set(values[0] ?? null);
    this.envOpen.set(false);
  }

  protected onSelect(keys: string[]): void {
    if (keys[0]) this.state.selected.set(keys[0]);
  }

  protected onKeydown(node: BakeNode, event: KeyboardEvent): void {
    // Aria selects on Enter; opening what the row stands for is ours.
    if (event.key === "Enter") this.state.open(node);
    else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      event.stopPropagation();
      this.state.moveBy(node.key, event.key === "ArrowUp" ? -1 : 1);
      afterNextRender(() => this.focusRow(node.key), { injector: this.injector });
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      event.stopPropagation();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.showMenu(node, rect.left + 24, rect.bottom);
    }
  }

  protected openMenu(node: BakeNode, event: MouseEvent): void {
    event.preventDefault();
    this.state.selected.set(node.key);
    this.showMenu(node, event.clientX, event.clientY);
  }

  private showMenu(node: BakeNode, x: number, y: number): void {
    this.state.target.set(node);
    this.menuAt.set({ x, y });
    this.menuOpen.set(true);
    this.openedAt = performance.now();
    // The menu's first item takes focus once it is drawn.
    requestAnimationFrame(() => this.menu()?.nativeElement.querySelector<HTMLElement>("[ngMenuItem]")?.focus());
  }

  /** On Linux and macOS the menu opens on the button's press: its release is not a click outside. */
  protected outside(event: MouseEvent): void {
    if (event.button === 2 && performance.now() - this.openedAt < 1000) return;
    this.closeMenu();
  }

  protected choose(item: string | undefined): void {
    if (item) this.state.act(item);
    this.closeMenu();
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    const key = this.state.target()?.key;
    if (key) requestAnimationFrame(() => this.focusRow(key));
  }

  private focusRow(key: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
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
