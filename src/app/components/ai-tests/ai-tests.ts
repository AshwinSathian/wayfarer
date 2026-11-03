import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from "@angular/core";
import type { PastRequest } from "@wayfarer/core";
import type { ModelCallOutcome } from "@wayfarer/core/ai";
import { HistoryRepository } from "../../data/history-repository";
import { ModelCalls, type PreparedCall } from "../../services/model-calls";
import { Tabs } from "../../state/tabs";
import type { TabState } from "../../state/tab-state";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { ModelCall } from "../model-call/model-call";

/** A line of the added script a person should read before accepting (docs/design/ai/actions.md). */
interface ReadNote {
  text: string;
}

const READ_FIRST: [RegExp, string][] = [
  [/pm\.sendRequest/, "This script sends a request of its own"],
  [/require\(/, "This script loads a library"],
  [/pm\.(environment|globals|collectionVariables|variables)\.set/, "This script changes a variable"],
];

/**
 * Write tests from this response (D4.10, actions.md 1): in the response's Tests tab. The call is previewed (AI-3),
 * its answer is a proposal added after the post-response script, and nothing changes until Accept (AI-5). Accept
 * writes into the tab the action was asked in, as if typed: `ScriptTrust` still decides whether it runs (AI-11).
 */
@Component({
  selector: "app-ai-tests",
  imports: [ModelCall, UiButton, UiCheckbox],
  templateUrl: "./ai-tests.html",
  styleUrl: "./ai-tests.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class AiTests {
  private readonly tabs = inject(Tabs);
  private readonly history = inject(HistoryRepository);
  private readonly calls = inject(ModelCalls);

  /** The tab the action was asked in, held from the first step. */
  private tab: TabState | null = null;
  private readonly entry = signal<PastRequest | null>(null);
  protected readonly withBody = signal(false);
  protected readonly call = signal<PreparedCall | null>(null);
  protected readonly problem = signal("");
  protected readonly proposal = signal<{ current: string; added: string; notes: ReadNote[]; count: number } | null>(
    null,
  );
  protected readonly refused = signal<{ text: string; answer: string } | null>(null);
  /** After Accept: what was there before, and the line that says what changed. */
  protected readonly accepted = signal<{ previous: string; line: string } | null>(null);
  protected readonly bodyKept = computed(() => !!this.entry()?.response?.body);

  constructor() {
    // A tick redraws what is sent at once.
    effect(() => {
      const entry = this.entry();
      const withBody = this.withBody();
      if (entry) untracked(() => void this.prepare(entry, withBody));
    });
    // The palette's Write tests from the response… asks here.
    effect(() => {
      if (this.calls.asked() !== "tests") return;
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
    this.proposal.set(null);
    this.refused.set(null);
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

  /** Which prepare is the latest: an earlier one that ends later must not put back a call the person changed (AI-3). */
  private preparing = 0;

  /** A redraw is on its way: the preview's Send waits for it. */
  protected readonly redrawing = signal(false);

  private async prepare(entry: PastRequest, withBody: boolean): Promise<void> {
    const mine = ++this.preparing;
    this.redrawing.set(true);
    const { testsPrompt } = await import("@wayfarer/core/ai");
    const script = this.tab?.draft().scripts.post ?? "";
    const call = await this.calls.prepare("tests", testsPrompt(entry, script, withBody), withBody);
    if (mine !== this.preparing) return;
    this.call.set(call);
    this.redrawing.set(false);
  }

  protected close(): void {
    this.entry.set(null);
    this.call.set(null);
  }

  protected async answered(outcome: ModelCallOutcome): Promise<void> {
    // The record stays where the preview was; the proposal comes under it.
    if (outcome.answer === undefined) return;
    const { scriptProposal } = await import("@wayfarer/core/ai");
    const made = scriptProposal(outcome.answer);
    if ("refused" in made) {
      this.call.set(null);
      this.refused.set({
        text: "The answer names a vault secret ({{$secret.…}}), which only you can place. It was not offered.",
        answer: outcome.answer,
      });
      return;
    }
    if (!made.script) {
      this.call.set(null);
      this.refused.set({ text: "The answer held no script.", answer: outcome.answer });
      return;
    }
    const current = this.tab?.draft().scripts.post ?? "";
    const offset = current ? current.split("\n").length + 1 : 0;
    const notes = made.script.split("\n").flatMap((line, index) =>
      READ_FIRST.filter(([pattern]) => pattern.test(line)).map(([, text]) => ({
        text: `${text}, on line ${offset + index + 1}.`,
      })),
    );
    const count = (made.script.match(/pm\.test\(/g) ?? []).length;
    this.proposal.set({ current, added: made.script, notes, count });
  }

  /** Discard closes the proposal; the call stays in history. */
  protected discard(): void {
    this.proposal.set(null);
    this.call.set(null);
  }

  protected accept(): void {
    const proposal = this.proposal();
    const tab = this.tab;
    if (!proposal || !tab || !this.tabs.tabs().includes(tab)) return;
    const previous = tab.draft().scripts.post;
    const joined = previous.trim() ? `${previous.replace(/\s+$/, "")}\n\n${proposal.added}\n` : `${proposal.added}\n`;
    tab.draft.update((draft) => ({ ...draft, scripts: { ...draft.scripts, post: joined } }));
    this.proposal.set(null);
    this.call.set(null);
    this.accepted.set({
      previous,
      line: proposal.count
        ? `Added ${proposal.count} ${proposal.count === 1 ? "test" : "tests"} to the post-response script.`
        : "Added lines to the post-response script.",
    });
  }

  protected undo(): void {
    const accepted = this.accepted();
    const tab = this.tab;
    if (!accepted || !tab) return;
    tab.draft.update((draft) => ({ ...draft, scripts: { ...draft.scripts, post: accepted.previous } }));
    this.accepted.set({ previous: accepted.previous, line: "Put back as it was." });
  }

  protected readonly tabGone = computed(() => !!this.proposal() && !!this.tab && !this.tabs.tabs().includes(this.tab));
}
