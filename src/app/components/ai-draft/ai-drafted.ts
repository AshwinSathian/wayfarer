import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { WorkspaceStore } from "../../state/workspace-store";
import { Tabs } from "../../state/tabs";
import { UiButton } from "../../ui/button";

/**
 * The line under the address after a drafted request was accepted (D4.10, actions.md 2): "Drafted from your
 * description." and Undo, which puts the tab's draft back as it was (AI-5). It goes when the draft changes again.
 * The status region is in the page from the first render, so Undo's words are heard.
 */
@Component({
  selector: "app-ai-drafted",
  imports: [UiButton],
  template: `<p class="sr-only" role="status">{{ said() }}</p>
    @if (shown()) {
      <p class="ai-drafted type-footnote text-label-secondary flex flex-wrap items-center gap-x-1.5 -mt-2">
        Drafted from your description.
        <button #undoButton uiButton class="btn-sm" type="button" (click)="undo()">Undo</button>
      </p>
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "contents" },
})
export class AiDrafted {
  private readonly tabs = inject(Tabs);
  private readonly store = inject(WorkspaceStore);
  private readonly injector = inject(Injector);
  private readonly undoButton = viewChild<ElementRef<HTMLButtonElement>>("undoButton");
  /** Undo was pressed: the composer moves focus to the address. */
  readonly undone = output<void>();
  protected readonly said = signal("");
  private readonly announced = new WeakSet<object>();
  /** Drawn while the open tab's draft is the one accepted. */
  protected readonly shown = computed(() => {
    const tab = this.tabs.active();
    const drafted = tab.drafted();
    return !!drafted && tab.draft() === drafted.after;
  });

  constructor() {
    // Accepted: said, and focus on Undo once it is drawn (the dialog has given focus back by then).
    effect(() => {
      const drafted = this.tabs.active().drafted();
      // Once per acceptance: switching back to the tab does not take focus again.
      if (!drafted || this.announced.has(drafted) || !untracked(this.shown)) return;
      this.announced.add(drafted);
      untracked(() => {
        this.said.set("Drafted from your description.");
        afterNextRender(() => this.undoButton()?.nativeElement.focus(), { injector: this.injector });
      });
    });
  }

  protected undo(): void {
    const tab = this.tabs.active();
    const drafted = tab.drafted();
    if (!drafted) return;
    tab.draft.set(drafted.before);
    tab.drafted.set(null);
    this.store.refreshVariablePreview();
    this.said.set("Put back as it was.");
    this.undone.emit();
  }
}
