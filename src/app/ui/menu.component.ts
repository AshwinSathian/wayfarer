import { CdkMenu, CdkMenuItem } from "@angular/cdk/menu";
import { Overlay, OverlayRef } from "@angular/cdk/overlay";
import { TemplatePortal } from "@angular/cdk/portal";
import { ChangeDetectionStrategy, Component, OnDestroy, TemplateRef, ViewContainerRef, afterNextRender, inject, input, signal, viewChild, Injector } from "@angular/core";
import { IconComponent } from "../shared/icon/icon.component";
import { IconName } from "../shared/icon/icon-paths";

/** One row of a menu: an action, or a separator line. */
export type UiMenuItem = { label: string; icon?: IconName; command: () => void } | { separator: true };

/**
 * A popup menu (WAI-ARIA menu pattern). It renders nothing until opened:
 *
 *   <button (click)="menu.toggle($event)">Export</button>
 *   <ui-menu #menu [items]="items" />
 *
 * `toggle(event)` opens it under the element that was clicked; `show(event)`
 * opens it at the pointer, for a context menu (`show(event, items)` when the
 * items depend on what was clicked). Focus moves to the first
 * item; arrow keys, Home, End and typing move; Enter and Space run an item;
 * Escape, Tab and a click outside close it. Focus then returns to where it was.
 */
@Component({
  selector: "ui-menu",
  imports: [CdkMenu, CdkMenuItem, IconComponent],
  template: `
    <ng-template #panel>
      <div class="ui-menu" cdkMenu tabindex="-1" (keydown.escape)="$event.stopPropagation(); hide()" (keydown.tab)="hide()">
        @for (item of shown(); track $index) {
          @if ("separator" in item) {
            <div class="ui-menu-separator" role="separator"></div>
          } @else {
            <button type="button" class="ui-menu-item" cdkMenuItem (cdkMenuItemTriggered)="run(item.command)">
              @if (item.icon; as icon) {
                <app-icon class="ui-menu-icon" [name]="icon" />
              }
              <span>{{ item.label }}</span>
            </button>
          }
        }
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuComponent implements OnDestroy {
  readonly items = input.required<readonly UiMenuItem[]>();
  /** The items of the open menu, fixed when it opens. */
  protected readonly shown = signal<readonly UiMenuItem[]>([]);

  private readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild.required<TemplateRef<unknown>>("panel");
  private readonly menu = viewChild(CdkMenu);
  private overlayRef: OverlayRef | null = null;
  private returnFocusTo: HTMLElement | null = null;
  private anchor: HTMLElement | null = null;
  private stopListening: () => void = () => undefined;

  private listen(onPress: (event: PointerEvent) => void): () => void {
    document.addEventListener("pointerdown", onPress, true);
    return () => document.removeEventListener("pointerdown", onPress, true);
  }

  /** Opens under the clicked element, or closes if already open. */
  toggle(event: Event): void {
    if (this.overlayRef) return this.hide();
    const anchor = event.currentTarget as HTMLElement;
    this.anchor = anchor;
    this.shown.set(this.items());
    this.open(
      this.overlay
        .position()
        .flexibleConnectedTo(anchor)
        .withPositions([
          { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top", offsetY: 2 },
          { originX: "end", originY: "bottom", overlayX: "end", overlayY: "top", offsetY: 2 },
          { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom", offsetY: -2 },
        ]),
      "ui-menu-panel"
    );
  }

  /** Opens at the pointer (a context menu) and suppresses the browser's own menu. */
  show(event: MouseEvent, items: readonly UiMenuItem[] = this.items()): void {
    event.preventDefault();
    event.stopPropagation();
    this.hide();
    this.anchor = null;
    this.shown.set(items);
    this.open(
      this.overlay
        .position()
        .flexibleConnectedTo({ x: event.clientX, y: event.clientY })
        .withPositions([
          { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top" },
          { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom" },
          { originX: "end", originY: "bottom", overlayX: "end", overlayY: "top" },
        ]),
      ["ui-menu-panel", "ui-menu-panel--context"]
    );
  }

  hide(): void {
    const ref = this.overlayRef;
    if (!ref) return;
    this.overlayRef = null;
    this.stopListening();
    ref.dispose();
    this.returnFocusTo?.focus();
    this.returnFocusTo = null;
  }

  protected run(command: () => void): void {
    this.hide();
    command();
  }

  private open(positionStrategy: ReturnType<ReturnType<Overlay["position"]>["flexibleConnectedTo"]>, panelClass: string | string[]): void {
    this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ref = this.overlay.create({
      positionStrategy: positionStrategy.withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass,
    });
    ref.attach(new TemplatePortal(this.panel(), this.viewContainer));
    ref.detachments().subscribe(() => this.hide());
    // Escape closes the menu wherever focus is, and nothing under it: a
    // dialog or drawer the menu was opened from stays open.
    ref.keydownEvents().subscribe((event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.hide();
    });
    this.overlayRef = ref;
    // Close on the next press outside. A press, not a click: the click or
    // right-click that opened the menu is still being released.
    // Not a press on the trigger either: its click toggles the menu shut.
    const trigger = this.anchor;
    this.stopListening = this.listen((event) => {
      const target = event.target as Node;
      if (!ref.overlayElement.contains(target) && !trigger?.contains(target)) this.hide();
    });
    // Through the menu, so its arrow-key navigation starts from this item.
    afterNextRender(() => this.menu()?.focusFirstItem("keyboard"), { injector: this.injector });
  }

  ngOnDestroy(): void {
    this.stopListening();
    this.overlayRef?.dispose();
  }
}
