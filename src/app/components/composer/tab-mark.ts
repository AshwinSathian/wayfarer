import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { Icon } from "../../shared/icon/icon";

/** What a request tab holds (U-170): how many rows are sent, or that it is not at its default, and in which way. */
export type TabMarkValue = number | "set" | "changed" | "held" | null;

/**
 * Drawn after a request tab's name, on the desktop's tab and the phone's section header. A count is text; a dot is
 * drawn and its words are for a screen reader, after the name ("Body (set)"), so the name starts with what is shown.
 * Scripts held back (U-158) carry the panel's warning glyph instead of the dot.
 */
@Component({
  selector: "app-tab-mark",
  imports: [Icon],
  template: `@let m = mark();
    @if (typeof m === "number") {
      <span class="tab-count text-label-secondary">{{ m }}</span>
    } @else if (m === "held") {
      <app-icon name="warning" class="icon-xs text-status-warning" /><span class="sr-only">(not reviewed)</span>
    } @else if (m) {
      <span class="tab-dot" aria-hidden="true"></span><span class="sr-only">({{ m }})</span>
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabMark {
  readonly mark = input<TabMarkValue>(null);
}
