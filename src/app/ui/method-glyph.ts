import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { methodGlyph } from "../shared/http/method-glyph";

/**
 * The mark before a method's name (S2b): a ring, a dot or a bar, an inline SVG in the text's colour
 * (`currentColor`; `CanvasText` in forced colours, where the method's hue is taken away). It is decorative: the
 * method's name beside it is the text.
 *
 *   <ui-method-glyph [method]="request.method" />
 */
@Component({
  selector: "ui-method-glyph",
  template: `<svg viewBox="0 0 10 10" focusable="false" aria-hidden="true">
    @switch (glyph()) {
      @case ("ring") {
        <circle cx="5" cy="5" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5" />
      }
      @case ("bar") {
        <rect x="0.5" y="3.75" width="9" height="2.5" rx="1.25" fill="currentColor" />
      }
      @default {
        <circle cx="5" cy="5" r="3.5" fill="currentColor" />
      }
    }
  </svg>`,
  styleUrl: "./method-glyph.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "ui-method-glyph", "[attr.data-glyph]": "glyph()" },
})
export class UiMethodGlyph {
  readonly method = input.required<string>();
  protected readonly glyph = computed(() => methodGlyph(this.method()));
}
