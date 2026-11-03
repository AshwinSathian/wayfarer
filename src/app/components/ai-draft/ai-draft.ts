import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from "@angular/core";
import type { RequestContent } from "@wayfarer/core";
import type { ModelCallOutcome } from "@wayfarer/core/ai";
import { ModelCalls, type PreparedCall } from "../../services/model-calls";
import { parseParamsFromUrl } from "../../shared/http/request-url";
import { WorkspaceStore } from "../../state/workspace-store";
import { Tabs } from "../../state/tabs";
import { TabState, emptyDraft } from "../../state/tab-state";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { Dialog } from "../../ui/dialog";
import { UiInput } from "../../ui/input";
import { UiTooltip } from "../../ui/tooltip";
import { ModelCall } from "../model-call/model-call";

/** One field of the proposal that differs from the draft: what is there now ("" for nothing) and what would be. */
interface ProposedField {
  name: string;
  now: string;
  proposed: string;
}

/**
 * Draft a request from a description (D4.10, actions.md 2): a dialog with the description, then the model call's
 * preview (AI-3), then the proposal against the open tab's draft. Nothing changes until Accept (AI-5); Accept fills
 * the tab when it holds nothing, otherwise a new tab, and never sends. The answer is checked as an imported request
 * is, and one that names a vault secret is refused (AI-10).
 */
@Component({
  selector: "app-ai-draft",
  imports: [ModelCall, UiButton, UiCheckbox, Dialog, UiInput, UiTooltip],
  templateUrl: "./ai-draft.html",
  styleUrl: "../ai-tests/ai-tests.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiDraft {
  protected readonly calls = inject(ModelCalls);
  private readonly tabs = inject(Tabs);
  private readonly store = inject(WorkspaceStore);

  /** The description typed in each tab, kept for the next opening in that tab. */
  private readonly descriptions = new WeakMap<TabState, string>();
  /** The tab the dialog was opened in, held from the first step. */
  private tab: TabState | null = null;
  protected readonly description = signal("");
  protected readonly withNames = signal(true);
  protected readonly names = signal<string[]>([]);
  protected readonly call = signal<PreparedCall | null>(null);
  protected readonly redrawing = signal(false);
  protected readonly proposal = signal<{ request: RequestContent; fields: ProposedField[] } | null>(null);
  protected readonly refused = signal<{ text: string; answer: string } | null>(null);
  private preparing = 0;

  constructor() {
    // Opened: the tab it was opened in, its description, and the names of the variables in use there.
    effect(() => {
      if (!this.calls.draftOpen()) return;
      untracked(() => {
        this.tab = this.tabs.active();
        this.description.set(this.descriptions.get(this.tab) ?? "");
        this.names.set(this.store.variableNames());
        this.withNames.set(true);
        this.back();
      });
    });
  }

  protected readonly namesLine = computed(() => this.names().join(", "));

  protected typed(text: string): void {
    this.description.set(text);
    if (this.tab) this.descriptions.set(this.tab, text);
  }

  protected close(): void {
    this.calls.draftOpen.set(false);
  }

  /** Back to the description, kept. */
  protected back(): void {
    this.preparing++;
    this.call.set(null);
    this.proposal.set(null);
    this.refused.set(null);
  }

  protected async preview(): Promise<void> {
    if (!this.description().trim()) return;
    await this.prepare();
  }

  protected tickNames(on: boolean): void {
    this.withNames.set(on);
    void this.prepare();
  }

  /** The latest prepare wins, and Send waits for it: what is sent is what is shown (AI-3). */
  private async prepare(): Promise<void> {
    const mine = ++this.preparing;
    this.redrawing.set(true);
    const { draftPrompt } = await import("@wayfarer/core/ai");
    const call = await this.calls.prepare(
      "draft",
      draftPrompt(this.description(), this.withNames() ? this.names() : []),
      false,
    );
    if (mine !== this.preparing) return;
    this.call.set(call);
    this.redrawing.set(false);
  }

  protected async answered(outcome: ModelCallOutcome): Promise<void> {
    if (outcome.answer === undefined) return;
    const { requestProposal } = await import("@wayfarer/core/ai");
    const made = requestProposal(outcome.answer);
    if ("refused" in made) {
      this.refused.set({
        text: made.refused.includes("vault secret")
          ? "The answer names a vault secret ({{$secret.…}}), which only you can place. It was not offered."
          : "The answer held no request.",
        answer: outcome.answer,
      });
      return;
    }
    const now = (request: Pick<RequestContent, "method" | "url" | "headers" | "body"> | undefined) => ({
      Method: request?.method ?? "",
      Address: request?.url ?? "",
      Headers: (request?.headers ?? [])
        .filter((row) => row.enabled && row.key)
        .map((row) => `${row.key}: ${row.value}`)
        .join("\n"),
      Body: request?.body.mode === "raw" ? (request.body.raw?.text ?? "") : "",
    });
    // Against what the tab Accept fills holds: the open tab's draft, or a new tab's.
    const before = now(this.fillsTab() ? this.tab?.draft() : emptyDraft());
    const after = now(made.request);
    const fields = (Object.keys(after) as (keyof typeof after)[])
      .filter((name) => after[name] !== before[name])
      .map((name) => ({ name, now: before[name], proposed: after[name] }));
    this.proposal.set({ request: made.request, fields });
  }

  /** The held tab holds nothing typed: Accept fills it rather than opening another. */
  private fillsTab(): boolean {
    const tab = this.tab;
    return !!tab && !tab.document && !tab.bound() && !tab.draft().url.trim() && this.tabs.tabs().includes(tab);
  }

  protected accept(): void {
    const proposal = this.proposal();
    if (!proposal) return;
    let tab = this.tab;
    if (!tab || !this.fillsTab()) {
      tab = new TabState();
      this.tabs.open(tab);
    } else this.tabs.activate(tab.id);
    const before = tab.draft();
    const { method, url, headers, body } = proposal.request;
    tab.draft.set({ ...before, method, url, params: parseParamsFromUrl(url, []), headers, body });
    tab.drafted.set({ before, after: tab.draft() });
    this.store.refreshVariablePreview();
    this.close();
  }
}
