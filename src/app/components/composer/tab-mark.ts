import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { Icon } from "../../shared/icon/icon";

/** What a request tab holds (U-170): how many of its parts are in use, or that scripts are held back, or nothing. */
export type TabMarkValue = number | "held" | null;

/**
 * Drawn after a request tab's name, on the desktop's tab and the phone's section header: one grammar, a count or
 * nothing, in a slot of a fixed width that is there when it is empty (audit 9), so a tab does not change its width
 * as a header is added or a body chosen. Scripts held back (U-158) put the panel's warning glyph in the same slot,
 * and say so after the name for a screen reader ("Scripts (not reviewed)"). The digit is drawn for the eye only: a
 * screen reader hears words ("Body (1 set)", "Tests (2 run, 1 failed)"), not a number stuck to the name. The slot holds
 * two digits, and a count over 99 is "99+".
 */
@Component({
  selector: "app-tab-mark",
  imports: [Icon],
  template: `@let m = mark();
    <span class="tab-badge">
      @if (typeof m === "number") {
        <span class="tab-count" aria-hidden="true" [class]="failed() ? 'text-status-error' : 'text-label-secondary'">{{
          m > 99 ? "99+" : m
        }}</span
        ><span class="sr-only"> ({{ m }} {{ unit() }}{{ failed() ? ", " + failed() + " failed" : "" }})</span>
      } @else if (m === "held") {
        <app-icon name="warning" class="icon-xs text-status-warning" /><span class="sr-only">(not reviewed)</span>
      }
    </span>`,
  // A custom element is inline: Firefox gives an inline box a client width of 0, so its badge read as cut off.
  host: { class: "contents" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabMark {
  readonly mark = input<TabMarkValue>(null);
  /** How many of the counted things failed (the response's Tests tab): the count is red, and says so after the name. */
  readonly failed = input(0);
  /** What the count counts, said after the name: "set" for a request's parts, "run" for the tests. */
  readonly unit = input("set");
}
