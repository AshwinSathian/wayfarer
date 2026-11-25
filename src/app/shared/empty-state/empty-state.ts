import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouteGlyph } from "./route-glyph";

/**
 * An empty place (overhaul BB1): the strip's path drawn small, a headline, one honest sentence and the one action
 * the place offers, projected. The words are `empty` in `@wayfarer/core`'s strings. Left-aligned where the first
 * row would be; the host takes the place's padding as a class. Nothing here moves, so reduced motion needs no rule.
 */
@Component({
  selector: "app-empty-state",
  imports: [RouteGlyph],
  template: `@if (glyph()) {
      <app-route-glyph />
    }
    <h3 class="type-empty-title text-label-primary m-0">{{ headline() }}</h3>
    <p class="type-callout text-label-secondary m-0 max-w-prose">{{ body() }}</p>
    <div class="flex max-w-full flex-wrap gap-2 empty:hidden"><ng-content /></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "empty-state flex flex-col items-start gap-3 min-w-0" },
})
export class EmptyState {
  readonly headline = input.required<string>();
  readonly body = input.required<string>();
  /** The strip's path, drawn small. Off where the strip itself is drawn right above: the composer's response. */
  readonly glyph = input(true);
}
