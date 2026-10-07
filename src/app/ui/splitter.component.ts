import { ChangeDetectionStrategy, Component, ElementRef, OnInit, inject, input, signal } from "@angular/core";
import { recordDiagnostic } from "../services/diagnostics.service";

/** Width of the gutter in px. The stored percentages assume it (see `basis`). */
const GUTTER = 8;
/** One arrow key press, as a share of the splitter's width. */
const KEY_STEP = 0.02;

/**
 * Two panes side by side with a draggable gutter between them (WAI-ARIA
 * window splitter pattern). Drag the gutter, or focus it and use the arrow
 * keys, Home and End.
 *
 *   <ui-splitter storageKey="app:split" [sizes]="[55, 45]" [minSizes]="[28, 22]" ariaLabel="Resize panes">
 *     <div uiSplitterStart>…</div>
 *     <div uiSplitterEnd>…</div>
 *   </ui-splitter>
 *
 * Sizes are each pane's width as a percentage of the splitter's width. With
 * `storageKey` the chosen sizes are kept in localStorage as `[start, end]`.
 */
@Component({
  selector: "ui-splitter",
  template: `
    <div class="ui-splitter-pane" [style.flex-basis]="basis(0)"><ng-content select="[uiSplitterStart]" /></div>
    <div
      class="ui-splitter-gutter"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-valuenow]="round(current()[0])"
      [attr.aria-valuemin]="round(minSizes()[0])"
      [attr.aria-valuemax]="round(100 - minSizes()[1])"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      (keydown)="onKeydown($event)"
    ></div>
    <div class="ui-splitter-pane" [style.flex-basis]="basis(1)"><ng-content select="[uiSplitterEnd]" /></div>
  `,
  host: { class: "ui-splitter", "[class.ui-splitter--resizing]": "grabOffset() !== null" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SplitterComponent implements OnInit {
  readonly sizes = input<readonly [number, number]>([50, 50]);
  readonly minSizes = input<readonly [number, number]>([0, 0]);
  readonly storageKey = input<string>();
  readonly ariaLabel = input.required<string>();

  protected readonly current = signal<readonly [number, number]>([50, 50]);
  /** Where inside the gutter the pointer took hold, while dragging. */
  protected readonly grabOffset = signal<number | null>(null);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  ngOnInit(): void {
    this.current.set(this.stored() ?? this.sizes());
  }

  protected round(value: number): number {
    return Math.round(value);
  }

  /** Both panes grow equally from here, which shares out the gutter's width. */
  protected basis(index: 0 | 1): string {
    return `calc(${this.current()[index]}% - ${GUTTER}px)`;
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const gutter = event.currentTarget as HTMLElement;
    gutter.setPointerCapture(event.pointerId);
    this.grabOffset.set(event.clientX - gutter.getBoundingClientRect().left);
    // No text selection while dragging.
    event.preventDefault();
    gutter.focus({ preventScroll: true });
  }

  protected onPointerMove(event: PointerEvent): void {
    const offset = this.grabOffset();
    if (offset === null) return;
    this.setStartWidth(event.clientX - offset - this.host.nativeElement.getBoundingClientRect().left);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.grabOffset() === null) return;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    this.grabOffset.set(null);
    this.save();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const { left, width } = this.host.nativeElement.getBoundingClientRect();
    const start = (event.currentTarget as HTMLElement).getBoundingClientRect().left - left;
    const towardEnd = getComputedStyle(this.host.nativeElement).direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const towardStart = towardEnd === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
    switch (event.key) {
      case towardStart:
        this.setStartWidth(start - width * KEY_STEP);
        break;
      case towardEnd:
        this.setStartWidth(start + width * KEY_STEP);
        break;
      case "Home":
        this.setStartWidth(0);
        break;
      case "End":
        this.setStartWidth(width);
        break;
      default:
        return;
    }
    event.preventDefault();
    this.save();
  }

  /** Sets the start pane's width in px, held inside both minimum sizes. */
  private setStartWidth(px: number): void {
    const width = this.host.nativeElement.getBoundingClientRect().width;
    if (width <= GUTTER) return;
    const [minStart, minEnd] = this.minSizes();
    const most = width - GUTTER - (minEnd / 100) * width;
    const start = Math.min(Math.max(px, (minStart / 100) * width), most);
    this.current.set([(start / width) * 100, ((width - GUTTER - start) / width) * 100]);
  }

  private stored(): readonly [number, number] | null {
    const key = this.storageKey();
    if (!key) return null;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      const valid =
        Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0) && value[0] + value[1] <= 100.5;
      return valid ? [value[0], value[1]] : null;
    } catch (error) {
      recordDiagnostic(error, "splitter: stored sizes unreadable, using the defaults");
      return null;
    }
  }

  private save(): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(this.current()));
    } catch (error) {
      // Storage is full or blocked: the split still works for this visit.
      recordDiagnostic(error, "splitter: sizes not stored");
    }
  }
}
