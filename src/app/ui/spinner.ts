import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * Busy (D3.3i): a ring with a gap that turns, in the colour of the text
 * around it. In place of a button's icon it says nothing (the button's text
 * does); on its own it is a `progressbar` named by `label`.
 *
 *   <ui-spinner />                                    in a button
 *   <ui-spinner [diameter]="28" label="Loading secrets" />
 *
 * With reduced motion it stands still and still reads as busy: Material's
 * arc shrank to a dot there. It takes no focus: Material's had
 * `tabindex="-1"`, which a click can focus.
 */
@Component({
  selector: "ui-spinner",
  template: `<svg viewBox="0 0 20 20" focusable="false" aria-hidden="true"><circle cx="10" cy="10" r="8" /></svg>`,
  styleUrl: "./spinner.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "ui-spinner",
    "[attr.role]": "label() ? 'progressbar' : null",
    "[attr.aria-label]": "label() || null",
    "[attr.aria-hidden]": "label() ? null : 'true'",
    "[style.width.px]": "diameter()",
    "[style.height.px]": "diameter()",
  },
})
export class UiSpinner {
  readonly diameter = input(18);
  /** Names it, for a spinner that stands for what is loading; none in a button. */
  readonly label = input("");
}
