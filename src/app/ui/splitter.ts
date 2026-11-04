import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from "@angular/core";
import { recordDiagnostic } from "../services/diagnostics";

/** Thickness of the gutter in px. The stored percentages assume it (see `basis`). */
const GUTTER = 8;
/** One arrow key press, as a share of the splitter's length. */
const KEY_STEP = 0.02;
/** One click on a side of the gutter, as a share of the splitter's length. */
const CLICK_STEP = 0.1;
/** A pointer that moved less than this between press and release clicked; more, it dragged. */
const CLICK_SLOP = 3;

/**
 * Two panes with a draggable gutter between them (WAI-ARIA window splitter
 * pattern): side by side, or with `orientation="horizontal"` one above the
 * other (the gutter's own orientation, as `aria-orientation` says it). Drag
 * the gutter, or focus it and use the arrow keys along its axis, Home and
 * End. Without a drag (WCAG 2.5.7, U-064): a click on one half of the gutter
 * moves it that way, and a double click puts the sizes back as they were
 * given.
 *
 *   <ui-splitter storageKey="app:split" [sizes]="[55, 45]" [minSizes]="[28, 22]" ariaLabel="Resize panes">
 *     <div uiSplitterStart>…</div>
 *     <div uiSplitterEnd>…</div>
 *   </ui-splitter>
 *
 * Sizes are each pane's length along the axis as a percentage of the
 * splitter's. With `storageKey` the chosen sizes are kept in localStorage as
 * `[start, end]`; a new key or new sizes read them again, so one splitter
 * can keep a ratio per orientation under two keys.
 */
@Component({
  selector: "ui-splitter",
  template: `
    <div class="ui-splitter-pane" [style.flex-basis]="basis(0)"><ng-content select="[uiSplitterStart]" /></div>
    <div
      class="ui-splitter-gutter"
      role="separator"
      tabindex="0"
      [attr.aria-orientation]="orientation()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-valuenow]="round(current()[0])"
      [attr.aria-valuemin]="round(minSizes()[0])"
      [attr.aria-valuemax]="round(100 - minSizes()[1])"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      (keydown)="onKeydown($event)"
      (dblclick)="reset()"
    ></div>
    <div class="ui-splitter-pane" [style.flex-basis]="basis(1)"><ng-content select="[uiSplitterEnd]" /></div>
  `,
  host: {
    class: "ui-splitter",
    "[class.ui-splitter--horizontal]": "orientation() === 'horizontal'",
    "[class.ui-splitter--resizing]": "grabOffset() !== null",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Splitter {
  readonly sizes = input<readonly [number, number]>([50, 50]);
  readonly minSizes = input<readonly [number, number]>([0, 0]);
  readonly storageKey = input<string>();
  readonly ariaLabel = input.required<string>();
  /** The gutter's: `vertical` puts the panes side by side, `horizontal` one above the other. */
  readonly orientation = input<"vertical" | "horizontal">("vertical");

  /** The stored sizes, else the given ones; read again when the key or the sizes change. */
  protected readonly current = linkedSignal<readonly [number, number]>(() => {
    const key = this.storageKey();
    const sizes = this.sizes();
    // Untracked: an unreadable value is recorded, and a computation may not write a signal.
    return (key && untracked(() => this.stored(key))) || sizes;
  });
  /** Where inside the gutter the pointer took hold, while dragging. */
  protected readonly grabOffset = signal<number | null>(null);
  /** Where the pointer was pressed, and whether it has moved enough since to be a drag. */
  private pressedAt = 0;
  private dragged = false;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected round(value: number): number {
    return Math.round(value);
  }

  /** Both panes grow equally from here, which shares out the gutter's thickness. */
  protected basis(index: 0 | 1): string {
    return `calc(${this.current()[index]}% - ${GUTTER}px)`;
  }

  private get vertical(): boolean {
    return this.orientation() === "vertical";
  }

  /** The pointer's place along the axis. */
  private along(event: PointerEvent): number {
    return this.vertical ? event.clientX : event.clientY;
  }

  /** Where a box starts along the axis, and its length. */
  private span(element: Element): { start: number; length: number } {
    const box = element.getBoundingClientRect();
    return this.vertical ? { start: box.left, length: box.width } : { start: box.top, length: box.height };
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const gutter = event.currentTarget as HTMLElement;
    gutter.setPointerCapture(event.pointerId);
    this.grabOffset.set(this.along(event) - this.span(gutter).start);
    this.pressedAt = this.along(event);
    this.dragged = false;
    // No text selection while dragging.
    event.preventDefault();
    gutter.focus({ preventScroll: true });
  }

  protected onPointerMove(event: PointerEvent): void {
    const offset = this.grabOffset();
    if (offset === null) return;
    if (Math.abs(this.along(event) - this.pressedAt) < CLICK_SLOP && !this.dragged) return;
    this.dragged = true;
    this.setStart(this.along(event) - offset - this.span(this.host.nativeElement).start);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.grabOffset() === null) return;
    const gutter = event.currentTarget as HTMLElement;
    gutter.releasePointerCapture(event.pointerId);
    this.grabOffset.set(null);
    if (!this.dragged && event.type === "pointerup") {
      // A click: a step towards the side of the gutter it landed on.
      const { start, length } = this.span(gutter);
      const towardsEnd = this.along(event) >= start + length / 2;
      const whole = this.span(this.host.nativeElement);
      this.setStart(start - whole.start + (towardsEnd ? 1 : -1) * whole.length * CLICK_STEP);
    }
    this.save();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const whole = this.span(this.host.nativeElement);
    const start = this.span(event.currentTarget as HTMLElement).start - whole.start;
    // The arrows along the gutter's axis: Left and Right side by side, Up and Down one above the other.
    const [back, forward] = this.vertical ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    switch (event.key) {
      case back:
        this.setStart(start - whole.length * KEY_STEP);
        break;
      case forward:
        this.setStart(start + whole.length * KEY_STEP);
        break;
      case "Home":
        this.setStart(0);
        break;
      case "End":
        this.setStart(whole.length);
        break;
      default:
        return;
    }
    event.preventDefault();
    this.save();
  }

  /** A double click: the sizes as they were given. */
  protected reset(): void {
    this.current.set(this.sizes());
    this.save();
  }

  /** Sets the start pane's length in px, held inside both minimum sizes. */
  private setStart(px: number): void {
    const { length } = this.span(this.host.nativeElement);
    if (length <= GUTTER) return;
    const [minStart, minEnd] = this.minSizes();
    const most = length - GUTTER - (minEnd / 100) * length;
    const start = Math.min(Math.max(px, (minStart / 100) * length), most);
    this.current.set([(start / length) * 100, ((length - GUTTER - start) / length) * 100]);
  }

  private stored(key: string): readonly [number, number] | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      const valid =
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0) &&
        value[0] + value[1] <= 100.5;
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
