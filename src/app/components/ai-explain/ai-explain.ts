import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import type { PastRequest } from "@wayfarer/core";
import type { ModelCallOutcome } from "@wayfarer/core/ai";
import { HistoryRepository } from "../../data/history-repository";
import { ModelCalls, type PreparedCall } from "../../services/model-calls";
import { Tabs } from "../../state/tabs";
import type { TabState } from "../../state/tab-state";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { ModelCall } from "../model-call/model-call";

/**
 * Explain this response (D4.10, actions.md 3): in the exchange record's band of a response whose status is 400 or
 * more. The call is previewed (AI-3), the response body going only when ticked for that call (AI-4). The answer is
 * text, shown as it came in monospace: never rendered, and nothing to accept.
 */
@Component({
  selector: "app-ai-explain",
  imports: [ModelCall, UiButton, UiCheckbox],
  templateUrl: "./ai-explain.html",
  styleUrl: "../ai-tests/ai-tests.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block space-y-2" },
})
export class AiExplain {
  private readonly tabs = inject(Tabs);
  private readonly history = inject(HistoryRepository);
  private readonly calls = inject(ModelCalls);
  private readonly injector = inject(Injector);

  /** The tab the action was asked in, held from the first step. */
  private tab: TabState | null = null;
  private readonly entry = signal<PastRequest | null>(null);
  protected readonly withBody = signal(false);
  protected readonly call = signal<PreparedCall | null>(null);
  protected readonly redrawing = signal(false);
  protected readonly problem = signal("");
  protected readonly answer = signal<string | null>(null);
  protected readonly bodyKept = computed(() => !!this.entry()?.response?.body);
  private readonly answerHeading = viewChild<ElementRef<HTMLElement>>("answerHeading");
  private preparing = 0;

  constructor() {
    // A tick redraws what is sent at once.
    effect(() => {
      const entry = this.entry();
      const withBody = this.withBody();
      if (entry) untracked(() => void this.prepare(entry, withBody));
    });
    // The palette's Explain the response… asks here.
    effect(() => {
      if (this.calls.asked() !== "explain") return;
      untracked(() => {
        this.calls.asked.set(null);
        void this.ask();
      });
    });
  }

  protected async ask(): Promise<void> {
    this.tab = this.tabs.active();
    this.call.set(null);
    this.entry.set(null);
    this.answer.set(null);
    this.problem.set("");
    this.withBody.set(false);
    const key = this.tab.historyKey();
    const entry = key === undefined ? null : await this.history.get(key);
    if (!entry) {
      this.problem.set("This response is not in history, so there is nothing to quote. Send the request again.");
      return;
    }
    this.entry.set(entry);
  }

  /** The latest prepare wins, and Send waits for it: what is sent is what is shown (AI-3). */
  private async prepare(entry: PastRequest, withBody: boolean): Promise<void> {
    const mine = ++this.preparing;
    this.redrawing.set(true);
    const { explainPrompt } = await import("@wayfarer/core/ai");
    const call = await this.calls.prepare("explain", explainPrompt(entry, withBody), withBody);
    if (mine !== this.preparing) return;
    this.call.set(call);
    this.redrawing.set(false);
  }

  protected close(): void {
    this.preparing++;
    this.entry.set(null);
    this.call.set(null);
    this.answer.set(null);
  }

  protected answered(outcome: ModelCallOutcome): void {
    // The record stays where the preview was; the answer comes under it.
    if (outcome.answer === undefined) return;
    this.answer.set(outcome.answer);
    afterNextRender(() => this.answerHeading()?.nativeElement.focus(), { injector: this.injector });
  }
}
