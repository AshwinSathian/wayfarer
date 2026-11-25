import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * The route strip's path as a small picture (overhaul BB1): an origin, a block on the line, the host. Only the line
 * has the brand hue, as in the mark; the nodes and the block are ink. It is still: nothing here moves. `lit` rings one
 * node (0 origin, 1 block, 2 host), for the first-run walk. A picture only: whatever it sits beside says the words.
 */
@Component({
  selector: "app-route-glyph",
  templateUrl: "./route-glyph.html",
  styleUrl: "./route-glyph.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "route-glyph block", "aria-hidden": "true" },
})
export class RouteGlyph {
  readonly lit = input<number | null>(null);
}
