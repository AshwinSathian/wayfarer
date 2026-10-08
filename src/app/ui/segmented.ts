import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from "@angular/core";

/**
 * A small set of mutually exclusive choices shown side by side (WAI-ARIA
 * radio group): arrow keys move and select, one option is always selected.
 */
@Component({
  selector: "ui-segmented",
  template: `
    @for (option of options(); track option.value) {
      <button
        type="button"
        class="ui-segmented-option"
        role="radio"
        [class.ui-segmented-option--checked]="option.value === value()"
        [attr.aria-checked]="option.value === value()"
        [attr.tabindex]="option.value === value() ? 0 : -1"
        (click)="select(option.value)"
      >
        <span class="ui-segmented-label">{{ option.label }}</span>
      </button>
    }
  `,
  host: { class: "ui-segmented", role: "radiogroup", "(keydown)": "onKeydown($event)" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Segmented<T> {
  readonly options = input.required<readonly { label: string; value: T }[]>();
  readonly value = input<T>();
  readonly valueChange = output<T>();
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected select(value: T): void {
    if (value !== this.value()) this.valueChange.emit(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const buttons = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="radio"]'));
    const current = buttons.indexOf(event.target as HTMLElement);
    const next = buttons[(current + step + buttons.length) % buttons.length];
    next.focus();
    next.click();
  }
}
