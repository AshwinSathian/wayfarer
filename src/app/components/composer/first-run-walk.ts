import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from "@angular/core";
import { firstRunWalk } from "@wayfarer/core";
import { FirstRunWalk, WALK_STEPS } from "../../services/first-run-walk";
import { WorkspaceStore } from "../../state/workspace-store";
import { RouteGlyph } from "../../shared/empty-state/route-glyph";
import { KEYS_OWNED } from "../../services/jump-keys";
import { UiButton } from "../../ui/button";

/**
 * Under the route strip, after the first example's response: the strip's three stops, one sentence each, Next to
 * go on, Dismiss to end it. Inline and not modal: nothing is inert, focus is never moved to it, and the sentence is
 * said by a polite region. Escape ends it only when it is the page's own: not in a field or an editor, not with a
 * dialog, a popover or a tooltip open (each takes the key first and the walk stays).
 */
@Component({
  selector: "app-first-run-walk",
  imports: [RouteGlyph, UiButton],
  templateUrl: "./first-run-walk.html",
  styleUrl: "./first-run-walk.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // No box while there is nothing to show: an empty block would still take its gap in the composer's column.
    "[class.block]": "shown()",
    "[class.contents]": "!shown()",
  },
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

  /** On the capture phase, ahead of a tooltip, which closes itself on this key and does not stop it. */
  private readonly escapeListener = (() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !this.shown()) return;
      if (document.querySelector("dialog:modal, :popover-open")) return;
      if (event.target instanceof HTMLElement && event.target.closest(KEYS_OWNED)) return;
      this.walk.finish();
    };
    document.addEventListener("keydown", keydown, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener("keydown", keydown, true));
  })();
}
