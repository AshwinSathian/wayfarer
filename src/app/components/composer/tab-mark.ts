import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { Icon } from "../../shared/icon/icon";

/** What a request tab holds (U-170): how many of its parts are in use, or that scripts are held back, or nothing. */
export type TabMarkValue = number | "held" | null;

/**
 * Drawn after a request tab's name, on the desktop's tab and the phone's section header: one grammar, a count or
 * nothing, in a slot of a fixed width that is there when it is empty (audit 9), so a tab does not change its width
 * as a header is added or a body chosen. Scripts held back (U-158) put the panel's warning glyph in the same slot,
 * and say so after the name for a screen reader ("Scripts (not reviewed)").
 */
@Component({
  selector: "app-tab-mark",
  imports: [Icon],
  template: `@let m = mark();
    <span class="tab-badge">
      @if (typeof m === "number") {
        <span class="tab-count text-label-secondary">{{ m }}</span>
      } @else if (m === "held") {
        <app-icon name="warning" class="icon-xs text-status-warning" /><span class="sr-only">(not reviewed)</span>
      }
    </span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabMark {
  readonly mark = input<TabMarkValue>(null);
}
