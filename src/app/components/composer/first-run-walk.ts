import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { firstRunWalk } from "@wayfarer/core";
import { FirstRunWalk, WALK_STEPS } from "../../services/first-run-walk";
import { WorkspaceStore } from "../../state/workspace-store";
import { RouteGlyph } from "../../shared/empty-state/route-glyph";
import { UiButton } from "../../ui/button";

/**
 * Under the route strip, after the first example's response: the strip's three stops, one sentence each, Next to
 * go on, Dismiss to end it. Inline and not modal: nothing is inert, focus is never moved to it, and the sentence is
 * said by a polite region. Escape ends it when nothing else took the key (a menu or a dialog did, then it stays).
 */
@Component({
  selector: "app-first-run-walk",
  imports: [RouteGlyph, UiButton],
  templateUrl: "./first-run-walk.html",
  styleUrl: "./first-run-walk.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(document:keydown.escape)": "escape($event)" },
})
export class FirstRunWalkPanel {
  protected readonly walk = inject(FirstRunWalk);
  private readonly store = inject(WorkspaceStore);
  protected readonly words = firstRunWalk;
  protected readonly total = WALK_STEPS;
  private readonly record = this.store.responseRecord;
  /** Shown once there is a response record for this tab to describe. */
  protected readonly shown = computed(() => this.walk.active() && !!this.record() && !this.store.loadingState());
  protected readonly sentence = computed(() => {
    const record = this.record();
    if (!record) return "";
    switch (this.walk.step()) {
      case 0:
        return this.words.origin(record.route === "bridge" ? "the Local Bridge" : "this page");
      case 1:
        return record.secrets.length ? this.words.blockSent(record.secrets.length) : this.words.block;
      default:
        return this.words.host(record.host);
    }
  });

  protected escape(event: Event): void {
    if (event.defaultPrevented || !this.shown() || document.querySelector("dialog:modal")) return;
    this.walk.finish();
  }
}
