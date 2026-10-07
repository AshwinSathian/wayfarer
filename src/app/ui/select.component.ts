import { Overlay, OverlayRef } from "@angular/cdk/overlay";
import { TemplatePortal } from "@angular/cdk/portal";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { IconComponent } from "../shared/icon/icon.component";

let nextId = 0;

interface Choice {
  label: string;
  value: unknown;
}

/**
 * A select-only combobox (WAI-ARIA combobox pattern, listbox popup). Focus
 * stays on the trigger while the list is open; arrow keys, Home, End and
 * typing move the active option, Enter or Space selects it, Escape closes.
 *
 *   <ui-select [options]="methods" [(ngModel)]="method" ariaLabel="HTTP method" />
 *   <ui-select inputId="x" [options]="items" optionLabel="label" optionValue="value" placeholder="Choose" />
 *
 * Options are strings, or objects read through `optionLabel` / `optionValue`
 * (default: their `label` and `value`).
 */
@Component({
  selector: "ui-select",
  imports: [IconComponent],
  template: `
    @if (ariaLabel()) {
      <span class="sr-only" [id]="baseId + '-name'">{{ ariaLabel() }}</span>
    }
    <button
      #trigger
      type="button"
      class="ui-select-trigger"
      role="combobox"
      aria-haspopup="listbox"
      [id]="inputId() || baseId + '-trigger'"
      [disabled]="disabled()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="baseId + '-list'"
      [attr.aria-labelledby]="ariaLabel() ? baseId + '-name ' + baseId + '-value' : null"
      [attr.aria-activedescendant]="open() && active() >= 0 ? baseId + '-option-' + active() : null"
      (click)="toggle()"
      (keydown)="onKeydown($event)"
      (blur)="close()"
    >
      <span class="ui-select-label" [id]="baseId + '-value'">{{ selected() >= 0 ? choices()[selected()].label : placeholder() }}</span>
    </button>
    @if (showClear() && selected() >= 0 && !disabled()) {
      <button type="button" class="ui-select-clear" aria-label="Clear selection" (mousedown)="$event.preventDefault()" (click)="choose(-1)">
        <app-icon name="close" />
      </button>
    }
    <span class="ui-select-chevron" aria-hidden="true" (mousedown)="$event.preventDefault()" (click)="trigger.focus(); toggle()"><app-icon name="keyboard_arrow_down" /></span>

    <ng-template #panel>
      <ul class="ui-select-list" role="listbox" [id]="baseId + '-list'" (mousedown)="$event.preventDefault()">
        @for (choice of choices(); track $index) {
          <!-- Options are not focusable: focus stays on the combobox, which handles every key (aria-activedescendant). -->
          <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
          <li
            class="ui-select-option"
            role="option"
            [id]="baseId + '-option-' + $index"
            [class.ui-select-option--selected]="$index === selected()"
            [class.ui-select-option--active]="$index === active()"
            [attr.aria-selected]="$index === selected()"
            (mouseenter)="active.set($index)"
            (click)="choose($index)"
          >
            {{ choice.label }}
          </li>
        }
      </ul>
    </ng-template>
  `,
  host: { class: "ui-select", "[class.ui-select--open]": "open()", "[class.ui-select--disabled]": "disabled()" },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectComponent implements ControlValueAccessor, OnDestroy {
  readonly options = input<readonly unknown[]>([]);
  readonly optionLabel = input<string>();
  readonly optionValue = input<string>();
  readonly placeholder = input("");
  readonly inputId = input<string>();
  /** Names the control when no `<label for>` does. */
  readonly ariaLabel = input<string>();
  readonly showClear = input(false, { transform: booleanAttribute });

  protected readonly baseId = `ui-select-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly disabled = signal(false);
  private readonly value = signal<unknown>(undefined);

  protected readonly choices = computed<Choice[]>(() => {
    const labelKey = this.optionLabel() ?? "label";
    const valueKey = this.optionValue() ?? "value";
    return this.options().map((option) => {
      const record = typeof option === "object" && option !== null ? (option as Record<string, unknown>) : null;
      return {
        label: String(record ? record[labelKey] : option),
        value: record && valueKey in record ? record[valueKey] : option,
      };
    });
  });
  protected readonly selected = computed(() => this.choices().findIndex((choice) => choice.value === this.value()));

  private readonly overlay = inject(Overlay);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly panel = viewChild.required<TemplateRef<unknown>>("panel");
  private overlayRef: OverlayRef | null = null;
  private typed = "";
  private typedAt = 0;
  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.value.set(value);
  }
  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  private show(): void {
    if (this.open() || this.disabled() || !this.choices().length) return;
    const width = this.host.nativeElement.getBoundingClientRect().width;
    this.overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([
          { originX: "start", originY: "bottom", overlayX: "start", overlayY: "top", offsetY: 2 },
          { originX: "start", originY: "top", overlayX: "start", overlayY: "bottom", offsetY: -2 },
        ])
        .withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass: "ui-select-panel",
      minWidth: width,
    });
    this.overlayRef.attach(new TemplatePortal(this.panel(), this.viewContainer));
    this.overlayRef.outsidePointerEvents().subscribe((event) => {
      if (!this.host.nativeElement.contains(event.target as Node)) this.close();
    });
    this.active.set(Math.max(this.selected(), 0));
    this.open.set(true);
    this.scrollActiveIntoView();
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.onTouched();
  }

  /** Selects the option at `index` (-1 clears) and closes the list. */
  protected choose(index: number): void {
    const value = index < 0 ? null : this.choices()[index].value;
    if (value !== this.value()) {
      this.value.set(value);
      this.onChange(value);
    }
    this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const last = this.choices().length - 1;
    const opening = ["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(event.key);
    if (!this.open()) {
      if (opening) {
        event.preventDefault();
        this.show();
        if (event.key === "Home") this.move(0);
        if (event.key === "End") this.move(last);
      } else if (this.isPrintable(event)) {
        this.show();
        this.typeAhead(event.key);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        this.move(Math.min(this.active() + 1, last));
        break;
      case "ArrowUp":
        this.move(Math.max(this.active() - 1, 0));
        break;
      case "Home":
        this.move(0);
        break;
      case "End":
        this.move(last);
        break;
      case "Enter":
      case " ":
        this.choose(this.active());
        break;
      case "Escape":
        // The list closes; a dialog around the select must not close with it.
        event.stopPropagation();
        this.close();
        break;
      case "Tab":
        this.close();
        return;
      default:
        if (this.isPrintable(event)) this.typeAhead(event.key);
        return;
    }
    event.preventDefault();
  }

  private isPrintable(event: KeyboardEvent): boolean {
    return event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  /** Moves to the first option whose label starts with what was typed in the last half second. */
  private typeAhead(key: string): void {
    const now = Date.now();
    this.typed = now - this.typedAt > 500 ? key : this.typed + key;
    this.typedAt = now;
    const needle = this.typed.toLowerCase();
    const match = this.choices().findIndex((choice) => choice.label.toLowerCase().startsWith(needle));
    if (match >= 0) this.move(match);
  }

  private move(index: number): void {
    this.active.set(index);
    this.scrollActiveIntoView();
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() => document.getElementById(`${this.baseId}-option-${this.active()}`)?.scrollIntoView({ block: "nearest" }));
  }

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
  }
}
