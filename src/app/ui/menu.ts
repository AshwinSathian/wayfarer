import { CdkConnectedOverlay, ConnectedPosition } from "@angular/cdk/overlay";
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, signal, viewChild } from "@angular/core";
import { Menu, MenuItem, MenuTrigger } from "@angular/aria/menu";
import { Icon } from "../shared/icon/icon";
import { UiMenuItem } from "./menu-item";

/** Below the origin, else above it; from its start, else from its end. Against it, as Material's were. */
const POSITIONS: ConnectedPosition[] = [
  { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top" },
  { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom" },
  { originX: "end", originY: "bottom", overlayX: "end", overlayY: "top" },
  { originX: "end", originY: "top", overlayX: "end", overlayY: "bottom" },
];

/**
 * Angular Aria's menu (D1.5) in the CDK's overlay, with the app's styles.
 * Opened by a button:
 *
 *   <button ngMenuTrigger #trigger="ngMenuTrigger" [menu]="menu.menu()">…</button>
 *   <ui-menu #menu [trigger]="trigger" [items]="items" />
 *
 * Aria's trigger opens it on a click, Enter, Space or ArrowDown (ArrowUp: at
 * its last item), and closes it on Escape, a choice or focus leaving, with
 * focus back on the button. Or at the pointer, by a right-click or Shift+F10:
 *
 *   <div (contextmenu)="menu.openAt($event, restore)">…</div>
 *   <ui-menu #menu [items]="items" />
 *
 * where the menu closes on Escape, a choice, Tab or a click outside, and
 * `restore` gives focus back. The panel and its items are made when it opens,
 * so a menu whose items depend on what was clicked shows that one's. The panel's
 * `tabindex` is Aria's: the one written here is for the template's linter.
 */
@Component({
  selector: "ui-menu",
  imports: [CdkConnectedOverlay, Icon, Menu, MenuItem],
  template: `
    <ng-template
      [cdkConnectedOverlay]="{ origin: origin(), usePopover: trigger() ? 'inline' : popover }"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayDisableClose]="true"
      (overlayOutsideClick)="outside($event)"
    >
      <div
        ngMenu
        #menu="ngMenu"
        class="ui-menu"
        tabindex="-1"
        [class.ui-menu--context]="!trigger()"
        (itemSelected)="choose($event)"
        (keydown.escape)="trigger() || close(true)"
        (keydown)="$event.key === 'Tab' && tab()"
        (focusout)="leave($event)"
      >
        <!-- Not in ngMenuContent: its items come a render after the panel, which the CDK has
             placed by then as empty, below the button even where the menu does not fit. -->
        @for (item of items(); track $index) {
          @if ("separator" in item) {
            <div class="ui-menu-separator" role="separator"></div>
          } @else {
            <div ngMenuItem class="ui-menu-item" [value]="$index" [searchTerm]="item.label">
              @if (item.icon; as icon) {
                <app-icon class="ui-menu-icon" [name]="icon" />
              }
              {{ item.label }}
            </div>
          }
        }
      </div>
    </ng-template>
  `,
  styleUrl: "./menu.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMenu {
  readonly items = input.required<UiMenuItem[]>();
  /** The button that opens the menu, if it is not opened at the pointer. */
  readonly trigger = input<MenuTrigger<number>>();

  /** For the trigger's `[menu]`. */
  readonly menu = viewChild<Menu<number>>("menu");

  protected readonly positions = POSITIONS;
  /** Where a menu opened at the pointer is, while it is open. */
  private readonly at = signal<{ x: number; y: number } | null>(null);
  private restore: (() => void) | null = null;
  private openedAt = 0;
  /** A menu opened at the pointer focuses its first item once that is drawn. */
  private focusFirst = false;

  protected readonly open = computed(() => this.trigger()?.expanded() ?? this.at() !== null);
  protected readonly origin = computed(() => this.trigger()?.element ?? this.at() ?? { x: 0, y: 0 });
  /**
   * A menu at the pointer is drawn in this element, not in the CDK's container at the end of the
   * body: in a modal dialog (the navigation drawer) the page outside the dialog is inert, and a menu
   * there took no pointer. A button's menu is drawn beside the button ('inline'); a point is no element.
   */
  protected readonly popover = { type: "parent" as const, element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement };

  constructor() {
    // The items are drawn a render after the panel: this runs again when they are.
    afterRenderEffect(() => {
      const first = this.menu()?._items()[0];
      if (!first || !this.focusFirst) return;
      this.focusFirst = false;
      first.element.focus();
    });
    // A menu that opens under a pointer that has not moved gets a mouseover from the browser,
    // and Aria moves focus to the item there: opened from the keyboard after a click in the same
    // place, the menu started at that item, not its first. Aria hears mouseover only after a move.
    afterRenderEffect((onCleanup) => {
      const element = this.menu()?.element;
      if (!element) return;
      let moved = false;
      const move = () => (moved = true);
      const over = (event: MouseEvent) => {
        if (!moved) event.stopPropagation();
      };
      element.addEventListener("mousemove", move, true);
      element.addEventListener("mouseover", over, true);
      onCleanup(() => {
        element.removeEventListener("mousemove", move, true);
        element.removeEventListener("mouseover", over, true);
      });
    });
  }

  /** Opens the menu at the event's point, with focus on its first item. `restore` gives focus back when it closes. */
  openAt(event: MouseEvent, restore: () => void): void {
    event.preventDefault();
    this.restore = restore;
    this.openedAt = performance.now();
    this.focusFirst = true;
    this.at.set({ x: event.clientX, y: event.clientY });
  }

  protected choose(index: number | undefined): void {
    const item = index === undefined ? undefined : this.items()[index];
    if (!this.trigger()) this.close(true);
    if (item && !("separator" in item)) item.command();
  }

  /** On Linux and macOS a context menu opens on the right button's press: its release is not a click outside. */
  protected outside(event: MouseEvent): void {
    if (this.trigger()) return;
    if (event.button === 2 && performance.now() - this.openedAt < 1000) return;
    this.close(false);
  }

  /**
   * Tab closes the menu and goes on from what opened it, as in WAI-ARIA's menu
   * button pattern. The key's own move happens after this: from the button or
   * the row. Left to the browser, Firefox kept focus in the menu and Chromium
   * moved it to the button.
   */
  protected tab(): void {
    const trigger = this.trigger();
    if (!trigger) return this.close(true);
    trigger.element.focus();
    trigger.close();
  }

  /** Focus taken elsewhere closes a menu opened at the pointer. Aria's trigger does it for its own. */
  protected leave(event: FocusEvent): void {
    if (this.trigger() || !this.at()) return;
    const next = event.relatedTarget as Node | null;
    if (next && !this.menu()?.element.contains(next)) this.close(false);
  }

  private close(refocus: boolean): void {
    if (!this.at()) return;
    this.at.set(null);
    const restore = this.restore;
    this.restore = null;
    if (refocus) restore?.();
  }
}
