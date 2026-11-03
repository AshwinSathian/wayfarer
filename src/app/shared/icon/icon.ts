import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { ICON_PATHS, IconName } from "./icon-paths";

/**
 * Inline SVG icon from Wayfarer's set (packages/tokens/brand/icons, D2.4), sized by the surrounding font-size
 * (the `icon-*` classes) and stroked in `currentColor`, 2 of 24 units wide: an icon at its text's size has the
 * text's weight (U-127). Always decorative: name the owning button with `aria-label`.
 */
@Component({
  selector: "app-icon",
  template: `<svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    focusable="false"
  >
    <path [attr.d]="path()" />
  </svg>`,
  host: { class: "app-icon", "aria-hidden": "true" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}
