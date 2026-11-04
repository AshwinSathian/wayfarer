import { ChangeDetectionStrategy, Component } from "@angular/core";

/**
 * Wayfarer's mark (packages/tokens/brand/mark.svg), drawn inline so that it takes the theme the app draws:
 * the tile is the ink and the glyph the colour on it, as Send is. Its size is the host's (`brand-mark`).
 */
@Component({
  selector: "app-mark",
  template: `<svg viewBox="0 0 26 26" width="100%" height="100%" focusable="false">
    <rect class="brand-mark-tile" width="26" height="26" rx="6" />
    <g class="brand-mark-glyph">
      <path
        d="M5.1 9.2L8.3 18.3L11.9 11.2L15.5 18.3L18.1 12.4"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="19.1" cy="9.4" r="3" fill="currentColor" />
    </g>
  </svg>`,
  host: { class: "brand-mark", "aria-hidden": "true" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mark {}
