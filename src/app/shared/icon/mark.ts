import { ChangeDetectionStrategy, Component } from "@angular/core";

/**
 * Wayfarer's mark (packages/tokens/brand/mark.svg), drawn inline so that it takes the theme the app draws:
 * the tile is the ink and the glyph the colour on it, as Send is. Its size is the host's (`brand-mark`).
 */
@Component({
  selector: "app-mark",
  template: `<svg viewBox="0 0 26 26" width="100%" height="100%" focusable="false">
    <rect class="brand-mark-tile" width="26" height="26" rx="6" />
    <path
      class="brand-mark-route"
      d="M9 17.5V13.5C9 10.7 11.2 8.5 14 8.5H17"
      fill="none"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle class="brand-mark-host" cx="17" cy="8.5" r="1.5" />
  </svg>`,
  host: { class: "brand-mark", "aria-hidden": "true" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mark {}
