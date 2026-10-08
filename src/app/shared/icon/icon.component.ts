import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { ICON_PATHS, IconName } from "./icon-paths";

/**
 * Inline SVG icon, sized by the surrounding font-size (the `icon-*` classes)
 * and coloured by `currentColor`. Replaces the Material Symbols webfont,
 * which loaded from Google and whose ligature text ("bolt") became the
 * accessible name of icon-only buttons (F18, F33). Always decorative: name
 * the owning button with `aria-label`.
 */
@Component({
  selector: "app-icon",
  template: `<svg viewBox="0 -960 960 960" width="1em" height="1em" fill="currentColor" focusable="false"><path [attr.d]="path()" /></svg>`,
  host: { class: "app-icon", "aria-hidden": "true" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}
