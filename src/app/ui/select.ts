import { CdkConnectedOverlay, ConnectedPosition } from "@angular/cdk/overlay";
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
  viewChildren,
} from "@angular/core";
import { Combobox, ComboboxPopup, ComboboxWidget } from "@angular/aria/combobox";
import { Listbox, Option } from "@angular/aria/listbox";
import { Icon } from "../shared/icon/icon";

export interface UiSelectOption<T> {
  value: T;
  label: string;
}

/** Below the select, else above it. */
const POSITIONS: ConnectedPosition[] = [
  { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top" },
  { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom" },
];

/** A letter typed within this long of the last one goes on the same word. */
const TYPEAHEAD_MS = 500;

/**
 * A select: Angular Aria's combobox (D1.5) on this element, its list Aria's
 * listbox in the CDK's overlay, with the app's styles (D3.3f).
 *
 *   <span id="route-label">Route</span>
 *   <ui-select aria-labelledby="route-label" [options]="routes" [value]="route()" (valueChange)="route.set($event)" />
 *
 * An option may stand for `null` (an optional choice): its label is shown
 * when it is chosen. A value that no option has shows the `placeholder`.
 * Focus stays on the select while its list is open (`aria-activedescendant`).
 *
 * Aria opens the list on a click, Enter, Space or ArrowDown, moves in it
 * (the arrows, Home, End, typeahead) and closes it on Escape or focus
 * leaving. What it does not do, each with a test in `select.spec.ts`:
 * - closed, the arrows, Home, End and a letter choose an option without
 *   opening the list, as Material's select and the native one did; Alt+Arrow
 *   opens it. Aria opened it on ArrowDown, and did nothing for the others.
 * - it chooses nothing: Enter, Space, a click and Tab choose the option the
 *   list is on, and close it. Enter on the option already chosen closes it
 *   too: Aria unchose it, and the list stayed open.
 * - it hands a key to the list at the next render, and its list comes a
 *   render after it opens: in Chromium a key within 10 ms of the one that
 *   opened it was lost (D1.5). A key it took is drawn at once.
 * - the list is placed when it is drawn, not before: Aria draws it a
 *   render after the overlay, which the CDK placed by then as empty, below a
 *   select that had no room under it. Here the overlay is made with its list.
 * - the option the keys are on is not scrolled into a list too short for it.
 * - a mouse press in the list moved focus into it, and the list took it
 *   away when it closed: focus was left on nothing.
 * - its popup reads its required `combobox` input when it is destroyed, and
 *   threw for a select destroyed before its first render: it is made in that
 *   render.
 */
@Component({
  selector: "ui-select",
  imports: [CdkConnectedOverlay, ComboboxPopup, ComboboxWidget, Icon, Listbox, Option],
  hostDirectives: [Combobox],
  template: `
    <span class="ui-select-value">{{ shown() }}</span>
    <app-icon class="ui-select-chevron" name="keyboard_arrow_down" />
    <!-- Made in the first render: Aria's popup reads its combobox when destroyed, and threw before one. -->
    @if (options().length) {
      <ng-template ngComboboxPopup [combobox]="combobox">
        <ng-template
          [cdkConnectedOverlay]="{ origin: host, usePopover: 'inline', matchWidth: true }"
          [cdkConnectedOverlayOpen]="true"
          [cdkConnectedOverlayPositions]="positions"
          [cdkConnectedOverlayDisableClose]="true"
          (overlayOutsideClick)="outside($event)"
        >
          <div
            ngListbox
            ngComboboxWidget
            #list="ngListbox"
            class="ui-select-panel"
            tabindex="-1"
            focusMode="activedescendant"
            selectionMode="explicit"
            [wrap]="false"
            [attr.aria-label]="host.getAttribute('aria-label')"
            [attr.aria-labelledby]="host.getAttribute('aria-labelledby')"
            [activeDescendant]="list.activeDescendant()"
            [value]="chosen()"
            (mousedown)="$event.preventDefault()"
            (click)="clicked($event)"
            (keydown)="listKey($event)"
          >
            @for (option of options(); track $index) {
              <div ngOption class="ui-select-option" [value]="option.value" [label]="option.label">
                <span class="ui-select-option-label">{{ option.label }}</span>
                <app-icon class="ui-select-check" name="check" />
              </div>
            }
          </div>
        </ng-template>
      </ng-template>
    }
  `,
  styleUrl: "./select.css",
  // The panel is in the overlay, and a place that holds a select (the toolbar) restyles it.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // After Aria's own listeners: a host directive's come first.
  host: { class: "ui-select", "(keydown)": "afterKey($event)", "(click)": "app.tick()" },
})
export class UiSelect<T> {
  readonly options = input.required<readonly UiSelectOption<T>[]>();
  /** The chosen option's value. */
  readonly value = input.required<T>();
  /** Shown when no option has the value. */
  readonly placeholder = input("");
  /** An option was chosen by a click or a key. */
  readonly valueChange = output<T>();

  protected readonly combobox = inject(Combobox);
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly app = inject(ApplicationRef);
  protected readonly positions = POSITIONS;

  private readonly list = viewChild<Listbox<T>>("list");
  private readonly items = viewChildren<Option<T>>(Option);

  protected readonly chosen = computed(() => [this.value()]);
  protected readonly shown = computed(
    () => this.options().find((option) => option.value === this.value())?.label ?? this.placeholder(),
  );

  private typed = "";
  private typedAt = 0;

  constructor() {
    // In the capture phase, before Aria's own listener on this element.
    this.host.addEventListener("keydown", (event) => this.beforeKey(event), { capture: true });
    afterRenderEffect(() => {
      const list = this.list();
      if (list?.activeDescendant()) list.scrollActiveItemIntoView();
    });
  }

  private choose(option: UiSelectOption<T>): void {
    this.close();
    if (option.value !== this.value()) this.valueChange.emit(option.value);
  }

  /** A click on the select is Aria's, which opens and closes the list. */
  protected outside(event: MouseEvent): void {
    if (!this.host.contains(event.target as Node)) this.close();
  }

  private beforeKey(event: KeyboardEvent): void {
    if (this.combobox.expanded() || event.ctrlKey || event.metaKey) return;
    if (event.altKey) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      this.take(event);
      this.combobox.expanded.set(true);
      this.app.tick();
      return;
    }
    const options = this.options();
    const at = options.findIndex((option) => option.value === this.value());
    const to = this.closedStep(event.key, at);
    if (to === null) return;
    this.take(event);
    const option = options[Math.max(0, Math.min(to, options.length - 1))];
    if (option && option.value !== this.value()) {
      this.valueChange.emit(option.value);
      this.app.tick();
    }
  }

  /** The option a key on the closed select moves to, or null for a key it leaves to Aria. */
  private closedStep(key: string, at: number): number | null {
    switch (key) {
      case "ArrowDown":
      case "ArrowRight":
        return at + 1;
      case "ArrowUp":
      case "ArrowLeft":
        return at < 0 ? 0 : at - 1;
      case "Home":
        return 0;
      case "End":
        return this.options().length - 1;
    }
    if (key.length !== 1 || key === " ") return null;
    return this.typeahead(key, at);
  }

  /** The next option whose label starts with what was typed; one letter typed again goes on to the next. */
  private typeahead(key: string, at: number): number | null {
    const now = performance.now();
    this.typed = now - this.typedAt < TYPEAHEAD_MS ? this.typed + key.toLowerCase() : key.toLowerCase();
    this.typedAt = now;
    const repeated = [...this.typed].every((letter) => letter === this.typed[0]);
    const term = repeated ? this.typed[0] : this.typed;
    const options = this.options();
    const from = repeated ? at + 1 : Math.max(at, 0);
    for (let step = 0; step < options.length; step++) {
      const index = (from + step) % options.length;
      if (options[index].label.toLowerCase().startsWith(term)) return index;
    }
    return null;
  }

  /**
   * After Aria's listener. Returns nothing: Angular prevents the default of an
   * event whose listener returns false, and Tab would not leave the select.
   */
  protected afterKey(event: KeyboardEvent): void {
    // Aria leaves Tab alone: the option the list is on is chosen, and focus goes on from the select.
    if (event.key === "Tab" && this.combobox.expanded()) {
      this.chooseActive();
      this.app.tick();
      return;
    }
    // Aria hands a key to the list at the next render: now.
    if (event.defaultPrevented) this.app.tick();
  }

  /** A key Aria handed to the list, after the list's own listener: in a render already. */
  protected listKey(event: KeyboardEvent): void {
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (plain && (event.key === "Enter" || event.key === " ")) this.chooseActive();
  }

  /** A click on an option, after Aria made it the active one; not one on the list's padding. */
  protected clicked(event: MouseEvent): void {
    if (!(event.target as Element).closest('[role="option"]')) return;
    this.chooseActive();
    this.app.tick();
  }

  private chooseActive(): void {
    const active = this.items().find((item) => item.active());
    const option = active && this.options().find((candidate) => candidate.value === active.value());
    if (option) this.choose(option);
    else this.close();
  }

  private close(): void {
    this.combobox.expanded.set(false);
  }

  private take(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
