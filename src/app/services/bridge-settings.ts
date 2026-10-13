import { Injectable, effect, inject, signal, untracked } from "@angular/core";
import { bridgeHealthProblem, parseJson } from "@wayfarer/core";
import { Idb } from "../data/idb";
import { Diagnostics } from "./diagnostics";
import { SecretsVault } from "./secrets-vault";

const STORAGE_KEY = "wayfarer:bridge";
const DEFAULT_URL = "http://127.0.0.1:7717";
/** The vault secret that holds the token. Listed under Manage secrets by this name. */
const SECRET_NAME = "Local Bridge token";
/** Nothing answered at the bridge's address. */
export const BRIDGE_UNREACHABLE = "Not reachable. Is the bridge running, and is this page's origin one it allows?";

export interface BridgeConfig {
  enabled: boolean;
  url: string;
  token: string;
}

const DEFAULT_CONFIG: BridgeConfig = { enabled: false, url: DEFAULT_URL, token: "" };

/**
 * Local machine/browser-profile preference for routing requests through the
 * optional Local Bridge companion process (see `packages/bridge/README.md`).
 * Deliberately not per-environment: which relay to use, if any, is a
 * property of the device you're testing from, not something that should
 * sync or export with a collection/environment.
 *
 * Whether it is on and its address are in `localStorage`. The token is not
 * (F83): it is a vault secret when the vault is unlocked, and otherwise in
 * this tab's memory until the tab reloads.
 */
@Injectable({ providedIn: "root" })
export class BridgeSettings {
  private readonly diagnostics = inject(Diagnostics);
  private readonly vault = inject(SecretsVault);
  readonly config = signal<BridgeConfig>(DEFAULT_CONFIG);
  private pending = Promise.resolve();

  constructor() {
    this.config.set(this.load());
    // Unlocked: a token typed while the vault was locked goes in; with none typed, the vault's comes out.
    effect(() => {
      if (this.vault.isUnlocked()) untracked(() => this.inBackground(() => (this.config().token ? this.store(this.config().token) : this.read())));
    });
    // Another tab saved a token.
    inject(Idb).onChangeElsewhere((stores) => {
      if (stores.includes("secrets") && this.vault.isUnlocked()) this.inBackground(() => this.read());
    });
  }

  update(patch: Partial<BridgeConfig>): void {
    const next = { ...this.config(), ...patch };
    this.config.set(next);
    this.persist(next);
    if (patch.token !== undefined && this.vault.isUnlocked()) this.inBackground(() => this.store(next.token));
  }

  /**
   * The token to send a request through the bridge with. With none in this
   * tab and one in a locked vault, the user is asked to unlock it; "" when
   * they do not, or when there is none anywhere.
   */
  async tokenForSend(): Promise<string> {
    if (!this.config().token && (await this.stored()) && (await this.vault.ensureUnlocked())) await this.read();
    return this.config().token;
  }

  private async stored() {
    return (await this.vault.listSecrets()).find((secret) => secret.name === SECRET_NAME);
  }

  private async store(token: string): Promise<void> {
    const secret = await this.stored();
    if (!token) {
      if (secret) await this.vault.deleteSecret(secret.id);
    } else if (!secret || !(await this.vault.replaceSecret(secret.id, token))) {
      await this.vault.saveSecret({ name: SECRET_NAME, plaintext: token });
    }
  }

  private async read(): Promise<void> {
    const secret = await this.stored();
    const token = secret && (await this.vault.readSecret(secret.id));
    if (token) this.config.update((config) => ({ ...config, token }));
  }

  /** One after another: a save that overtook a delete would put the token back. */
  private inBackground(work: () => Promise<void>): void {
    this.pending = this.pending.then(work).catch((error: unknown) => this.diagnostics.record(error, "bridge: the token could not be kept in the vault or read from it"));
  }

  /**
   * Asks the bridge at `url` (the saved one by default) for its `/health`, without changing the saved settings.
   * What is wrong with it, as a sentence, or undefined: it answers and speaks the page's protocol (P6.3).
   */
  async checkHealth(url = this.config().url): Promise<string | undefined> {
    const base = url.replace(/\/+$/, "");
    if (!base) {
      return BRIDGE_UNREACHABLE;
    }
    let text: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${base}/health`, { signal: controller.signal });
      text = response.ok ? await response.text() : "";
      clearTimeout(timeout);
    } catch (error) {
      this.diagnostics.record(error, "bridge: health check failed");
      return BRIDGE_UNREACHABLE;
    }
    const health = parseJson(text);
    return bridgeHealthProblem(health.ok ? health.value : undefined);
  }

  private load(): BridgeConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return DEFAULT_CONFIG;
      }
      const parsed = JSON.parse(stored) as Partial<BridgeConfig>;
      const config = { enabled: parsed.enabled === true, url: typeof parsed.url === "string" && parsed.url ? parsed.url : DEFAULT_URL, token: "" };
      // A version before F83 kept the token here as plain text: it is not read, and it is taken out.
      if ("token" in parsed) this.persist(config);
      return config;
    } catch (error) {
      this.diagnostics.record(error, "bridge: stored settings unreadable, using defaults");
      return DEFAULT_CONFIG;
    }
  }

  private persist(config: BridgeConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: config.enabled, url: config.url }));
    } catch (error) {
      // The bridge preference just won't survive a reload.
      this.diagnostics.record(error, "bridge: could not save settings");
    }
  }
}
