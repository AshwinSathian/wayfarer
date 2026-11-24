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
        d="M5.7 17.85V8.45H16.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="5.7" cy="17.85" r="2.3" fill="currentColor" />
      <rect x="8.5" y="5.85" width="6.2" height="5.2" rx="0.8" fill="currentColor" />
      <circle cx="19.5" cy="8.45" r="3.1" fill="currentColor" />
    </g>
  </svg>`,
  host: { class: "brand-mark", "aria-hidden": "true" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mark {}
