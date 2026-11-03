import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { Route } from "@wayfarer/core";
import type { AiProviderKind } from "@wayfarer/core/ai";
import { AiSettings, type AiActions } from "../../services/ai-settings";
import { SecretsVault } from "../../services/secrets-vault";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { Confirm } from "../../ui/confirm";
import { UiInput } from "../../ui/input";
import { UiSegmented, type UiSegment } from "../../ui/segmented";

const ANTHROPIC_ADDRESS = "https://api.anthropic.com";

/**
 * Settings › AI (D4.10, docs/design/ai/setup.md): the one place that mentions AI until a provider is saved. The key
 * goes to the vault on Save and is never in the setting (AI-6); Remove provider deletes it (AI-7).
 */
@Component({
  selector: "app-ai-pane",
  imports: [FormsModule, UiButton, UiCheckbox, UiInput, UiSegmented],
  templateUrl: "./ai-pane.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class AiPane {
  protected readonly ai = inject(AiSettings);
  protected readonly vault = inject(SecretsVault);
  private readonly confirm = inject(Confirm);

  protected readonly kinds: UiSegment<AiProviderKind>[] = [
    { value: "openai", label: "OpenAI-compatible" },
    { value: "anthropic", label: "Anthropic" },
  ];
  protected readonly routes: UiSegment<Route>[] = [
    { value: "auto", label: "Auto" },
    { value: "direct", label: "Direct" },
    { value: "bridge", label: "Local Bridge" },
  ];

  /** The form is drawn: a provider is saved, or Add a provider was chosen. */
  protected readonly editing = signal(!!this.ai.provider());
  protected readonly kind = signal<AiProviderKind>(this.ai.provider()?.kind ?? "openai");
  protected readonly address = signal(this.ai.provider()?.address ?? "");
  protected readonly model = signal(this.ai.provider()?.model ?? "");
  protected readonly route = signal<Route>(this.ai.provider()?.route ?? "auto");
  protected readonly actions = signal<AiActions>(
    this.ai.provider()?.actions ?? { tests: true, draft: true, explain: true },
  );
  protected readonly key = signal("");
  /** Change key draws the field over a key in the vault. */
  protected readonly changingKey = signal(false);
  protected readonly showKey = signal(false);
  /** What the pane says after an act, in its status region. */
  protected readonly said = signal("");
  protected readonly saveError = signal("");
  protected readonly tried = signal(false);

  protected readonly endpoint = computed(() => {
    const base = this.address().trim().replace(/\/+$/, "");
    return base ? (this.kind() === "openai" ? `${base}/chat/completions` : `${base}/v1/messages`) : "";
  });
  protected readonly addressError = computed(() =>
    this.address().includes("{{")
      ? "An address here cannot hold a variable."
      : this.tried() && !this.address().trim()
        ? "Type the provider's address."
        : "",
  );
  protected readonly modelError = computed(() =>
    this.tried() && !this.model().trim() ? "Type the model's name." : "",
  );
  protected readonly keyError = computed(() =>
    this.tried() && this.kind() === "anthropic" && !this.key().trim() && !this.ai.keyStored()
      ? "Anthropic's API needs a key."
      : "",
  );
  /** Why Save is disabled, said on its wrapper. */
  protected readonly cannotSave = computed(() =>
    !this.address().trim() || this.address().includes("{{")
      ? "Add the provider's address to save."
      : !this.model().trim()
        ? "Add the model's name to save."
        : this.kind() === "anthropic" && !this.key().trim() && !this.ai.keyStored()
          ? "Add the key to save."
          : this.key().trim() && !this.vault.isUnlocked()
            ? "Unlock the vault to save the key."
            : "",
  );

  protected add(): void {
    this.editing.set(true);
    this.said.set("");
  }

  protected chooseKind(kind: AiProviderKind): void {
    this.kind.set(kind);
    if (kind === "anthropic" && !this.address().trim()) this.address.set(ANTHROPIC_ADDRESS);
    if (kind === "openai" && this.address() === ANTHROPIC_ADDRESS) this.address.set("");
  }

  protected setAction(name: keyof AiActions, on: boolean): void {
    this.actions.update((actions) => ({ ...actions, [name]: on }));
  }

  protected async save(): Promise<void> {
    this.tried.set(true);
    if (this.cannotSave()) return;
    this.saveError.set("");
    try {
      await this.ai.save(
        {
          kind: this.kind(),
          address: this.address().trim(),
          model: this.model().trim(),
          route: this.route(),
          actions: this.actions(),
        },
        this.key().trim(),
      );
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : String(error));
      return;
    }
    this.key.set("");
    this.changingKey.set(false);
    this.said.set("Saved.");
  }

  protected async removeProvider(): Promise<void> {
    const host = this.address().trim() || "this address";
    const yes = await this.confirm.confirm({
      title: `Remove the provider at ${host}?`,
      message:
        "Its key is deleted from the vault, and AI is off again. History keeps the model calls already made. This cannot be undone.",
      acceptLabel: "Remove provider",
    });
    if (!yes) return;
    const gone = await this.ai.remove();
    this.editing.set(false);
    this.address.set("");
    this.model.set("");
    this.key.set("");
    this.kind.set("openai");
    this.route.set("auto");
    this.actions.set({ tests: true, draft: true, explain: true });
    this.tried.set(false);
    this.said.set(
      gone
        ? "The provider is removed."
        : "The provider is removed. The key is deleted from the vault the next time it is unlocked.",
    );
  }

  protected edited(): void {
    this.said.set("");
  }
}
