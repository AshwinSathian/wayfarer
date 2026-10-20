import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, inject, input, output } from "@angular/core";
import { Icon } from "../shared/icon/icon";
import { IconName } from "../shared/icon/icon-paths";

export interface UiSegment<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

let nextId = 0;

/**
 * A choice of a few, side by side: a radio group drawn as a track with the
 * chosen option raised (D3.3e).
 *
 *   <span id="route-label">Route</span>
 *   <ui-segmented aria-labelledby="route-label" [options]="routes" [value]="route()" (valueChange)="route.set($event)" />
 *
 * Each option is the browser's own radio button with none of its look
 * (maintainer, 2026-10-20: nothing may look native), so the roles, the
 * checked state and one tab stop on the chosen option are the browser's.
 * Angular Aria has no radio group.
 *
 * The arrows are the group's own, as WAI-ARIA's radio group says: each
 * moves to the next option and chooses it, wrapping at the ends. The
 * browser's did not do in WebKit: they stopped at the ends, and the option
 * they moved to lost its focus ring.
 */
@Component({
  selector: "ui-segmented",
  imports: [Icon],
  template: `
    @for (option of options(); track option.value) {
      <label class="segment">
        <input type="radio" class="segment-input" [name]="name" [value]="option.value" [checked]="option.value === value()" (change)="valueChange.emit(option.value)" />
        <span class="segment-label">
          @if (option.icon; as icon) {
            <app-icon [name]="icon" class="icon-xs" />
          }
          {{ option.label }}
        </span>
      </label>
    }
  `,
  styleUrl: "./segmented.css",
  // A pane that lays the options out (Settings, on a phone) writes rules for them.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "segmented", role: "radiogroup", "(keydown)": "move($event)" },
})
export class UiSegmented<T extends string> {
  readonly options = input.required<readonly UiSegment<T>[]>();
  /** The chosen option's value. */
  readonly value = input.required<T>();
  /** An option was chosen by a click or a key. */
  readonly valueChange = output<T>();

  protected readonly name = `ui-segmented-${nextId++}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected move(event: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const radios = [...this.host.querySelectorAll<HTMLInputElement>(".segment-input")];
    const from = radios.indexOf(event.target as HTMLInputElement);
    if (from < 0) return;
    event.preventDefault();
    const to = (from + step + radios.length) % radios.length;
    const option = this.options()[to];
    if (!option) return;
    radios[to].checked = true;
    // From the key's own listener: WebKit then draws the focus ring, as it did for Material's.
    radios[to].focus();
    this.valueChange.emit(option.value);
  }
}
