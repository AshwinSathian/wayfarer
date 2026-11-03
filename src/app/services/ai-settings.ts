import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import type { Route } from "@wayfarer/core";
import type { AiProviderKind } from "@wayfarer/core/ai";
import { IdbCore } from "../data/idb-core";
import { Diagnostics } from "./diagnostics";
import { SecretsVault } from "./secrets-vault";

const STORAGE_KEY = "wayfarer:ai";
/** A key whose provider was removed while the vault was locked: deleted at the next unlock (docs/design/ai/setup.md). */
const DELETE_KEY = "wayfarer:ai-key-delete";
/** The vault secret that holds the provider's key. Listed under Manage secrets by this name. */
export const AI_KEY_NAME = "AI provider key";

/** Which of the three actions may be offered (D4.10). */
export interface AiActions {
  tests: boolean;
  draft: boolean;
  explain: boolean;
}

/** A provider as Settings › AI keeps it. The key is not here: it is a vault secret (AI-6). */
export interface AiProviderSetting {
  kind: AiProviderKind;
  address: string;
  model: string;
  route: Route;
  actions: AiActions;
}

const KINDS: readonly string[] = ["openai", "anthropic"];
const ROUTES: readonly string[] = ["auto", "direct", "bridge"];

/**
 * The AI provider (D1.7, D4.10): off until one is added in Settings › AI (AI-1). Everything that offers an AI
 * action reads `provider`; with none, nothing is drawn and no request goes to a model.
 */
@Injectable({ providedIn: "root" })
export class AiSettings {
  private readonly diagnostics = inject(Diagnostics);
  private readonly vault = inject(SecretsVault);
  readonly provider = signal<AiProviderSetting | null>(null);
  /** The vault holds a key under the provider's name, locked or not. */
  readonly keyStored = signal(false);
  private pending = Promise.resolve();

  constructor() {
    this.provider.set(this.load());
    this.inBackground(() => this.refreshKey());
    // Unlocked: a key whose provider was removed while it was locked goes now.
    effect(() => {
      if (this.vault.isUnlocked()) untracked(() => this.inBackground(() => this.deleteLeftKey()));
    });
    inject(IdbCore).onChangeElsewhere((stores) => {
      if (stores.includes("secrets")) this.inBackground(() => this.refreshKey());
    });
  }

  /** An action is offered: a provider is set up and the action is ticked. */
  readonly offers = computed(() => this.provider()?.actions ?? { tests: false, draft: false, explain: false });

  /** Saves the provider. A key given is written to the vault, which must be unlocked; "" leaves the stored one. */
  async save(setting: AiProviderSetting, key: string): Promise<void> {
    if (key) {
      if (!this.vault.isUnlocked())
        throw new Error("The vault locked before the key was saved. Unlock it and save again.");
      await this.storeKey(key);
    }
    this.provider.set(setting);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setting));
    } catch (error) {
      this.diagnostics.record(error, "ai: could not save the provider");
    }
  }

  /**
   * Removes the provider and its key (AI-7). With the vault locked the setting goes at once and the key at the next
   * unlock; `true` when the key is already gone.
   */
  async remove(): Promise<boolean> {
    this.provider.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      this.diagnostics.record(error, "ai: could not remove the provider");
    }
    if (!this.vault.isUnlocked()) {
      try {
        localStorage.setItem(DELETE_KEY, "1");
      } catch (error) {
        this.diagnostics.record(error, "ai: could not mark the key for deletion");
      }
      return !this.keyStored();
    }
    await this.deleteKey();
    return true;
  }

  /** The key to send a call with: read from the vault, which asks to be unlocked if it must; "" with none. */
  async keyForCall(reason: string): Promise<string> {
    const secret = await this.stored();
    if (!secret || !(await this.vault.ensureUnlocked(reason))) return "";
    return (await this.vault.readSecret(secret.id)) ?? "";
  }

  private async stored() {
    return (await this.vault.listSecrets()).find((secret) => secret.name === AI_KEY_NAME);
  }

  private async refreshKey(): Promise<void> {
    this.keyStored.set(!!(await this.stored()));
  }

  private async storeKey(key: string): Promise<void> {
    const secret = await this.stored();
    if (!secret || !(await this.vault.replaceSecret(secret.id, key)))
      await this.vault.saveSecret({ name: AI_KEY_NAME, plaintext: key });
    this.keyStored.set(true);
  }

  private async deleteKey(): Promise<void> {
    const secret = await this.stored();
    if (secret) await this.vault.deleteSecret(secret.id);
    this.keyStored.set(false);
    try {
      localStorage.removeItem(DELETE_KEY);
    } catch (error) {
      this.diagnostics.record(error, "ai: could not clear the key's deletion mark");
    }
  }

  private async deleteLeftKey(): Promise<void> {
    let marked = false;
    try {
      marked = localStorage.getItem(DELETE_KEY) === "1";
    } catch (error) {
      this.diagnostics.record(error, "ai: could not read the key's deletion mark");
    }
    if (marked && !this.provider()) await this.deleteKey();
  }

  private load(): AiProviderSetting | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const value = JSON.parse(stored) as Partial<AiProviderSetting>;
      const actions = (value.actions ?? {}) as Partial<AiActions>;
      if (
        !KINDS.includes(String(value.kind)) ||
        typeof value.address !== "string" ||
        typeof value.model !== "string" ||
        !ROUTES.includes(String(value.route))
      )
        return null;
      return {
        kind: value.kind as AiProviderKind,
        address: value.address,
        model: value.model,
        route: value.route as Route,
        actions: { tests: actions.tests === true, draft: actions.draft === true, explain: actions.explain === true },
      };
    } catch (error) {
      this.diagnostics.record(error, "ai: the stored provider is unreadable, so AI is off");
      return null;
    }
  }

  /** One after another: a save that overtook a delete would put the key back. */
  private inBackground(work: () => Promise<void>): void {
    this.pending = this.pending
      .then(work)
      .catch((error: unknown) => this.diagnostics.record(error, "ai: the key could not be read or kept"));
  }
}
