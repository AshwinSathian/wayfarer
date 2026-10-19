import { ChangeDetectionStrategy, Component, ViewEncapsulation } from "@angular/core";
import { AriaCandidate } from "./aria";
import { MaterialCandidate } from "./material";
import { PlatformCandidate } from "./platform";

/** `/app/?bakeoff=material|aria|platform`: one candidate, alone on the page. */
@Component({
  selector: "app-root",
  imports: [MaterialCandidate, AriaCandidate, PlatformCandidate],
  template: `
    <main class="bake-page">
      <h1>D1.5: {{ candidate }}</h1>
      @switch (candidate) {
        @case ("material") { <bake-material /> }
        @case ("aria") { <bake-aria /> }
        @case ("platform") { <bake-platform /> }
      }
      <!-- Something after the tree to Tab to: with nothing there Firefox leaves focus where it is. -->
      <button type="button" class="bake-after">After the tree</button>
    </main>
  `,
  styleUrl: "./bakeoff.css",
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BakeoffPage {
  protected readonly candidate = new URLSearchParams(location.search).get("bakeoff") ?? "material";
}
