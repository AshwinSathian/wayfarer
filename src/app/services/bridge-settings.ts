import { Injectable, effect, inject, signal, untracked } from "@angular/core";
import { bridgeHealthProblem, parseJson, type Route } from "@wayfarer/core";
import { IdbCore } from "../data/idb-core";
import { Diagnostics } from "./diagnostics";
import { SecretsVault } from "./secrets-vault";

const STORAGE_KEY = "wayfarer:bridge";
const DEFAULT_URL = "http://127.0.0.1:7717";
/** The vault secret that holds the token. Listed under Manage secrets by this name. */
const SECRET_NAME = "Local Bridge token";
/** Nothing answered at the bridge's address. */
export const BRIDGE_UNREACHABLE = "Not reachable. Is the bridge running, and is this page's origin one it allows?";

export interface BridgeConfig {
  /** The device's route (P6.4): what a request is sent by when neither it nor its collection names one. */
  route: Route;
  url: string;
  token: string;
}

const DEFAULT_CONFIG: BridgeConfig = { route: "auto", url: DEFAULT_URL, token: "" };
const ROUTES: readonly string[] = ["auto", "direct", "bridge"];

/**
 * Local machine/browser-profile preference for routing requests through the
 * optional Local Bridge companion process (see `packages/bridge/README.md`).
 * Deliberately not per-environment: which relay to use, if any, is a
 * property of the device you're testing from, not something that should
 * sync or export with a collection/environment.
 *
 * The route and the address are in `localStorage`. The token is not
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
    inject(IdbCore).onChangeElsewhere((stores) => {
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

  /** A token is in this tab or in the vault, locked or not: `auto` has a bridge to send to. */
  async hasToken(): Promise<boolean> {
    return !!this.config().token || !!(await this.stored());
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
   * What is wrong with it, as a sentence, or undefined: it answers as a Local Bridge (P6.3).
   */
  async checkHealth(url = this.config().url): Promise<string | undefined> {
    return (await this.health(url)).problem;
  }

  /** What the bridge at `url` says of itself: its version, or what is wrong with it (P6.3, P7.3). */
  async health(url = this.config().url): Promise<{ problem?: string; version?: string }> {
    const base = url.replace(/\/+$/, "");
    if (!base) {
      return { problem: BRIDGE_UNREACHABLE };
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
      return { problem: BRIDGE_UNREACHABLE };
    }
    const health = parseJson(text);
    const value = health.ok ? health.value : undefined;
    const problem = bridgeHealthProblem(value);
    if (problem) return { problem };
    // Another program's text: repeated only when it is a version, and short.
    const version = (value as { version?: unknown }).version;
    return typeof version === "string" && version.length <= 40 && /^\d+\.\d+\.\d+[0-9A-Za-z.+-]*$/.test(version) ? { version } : {};
  }

  /**
   * Exchanges the code the bridge printed for its token (P6.2), at `url`,
   * without saving either. The bridge gives the token once, and after three
   * wrong codes takes none for a minute.
   */
  async pair(url: string, code: string): Promise<{ token: string } | { problem: string }> {
    let response: Response;
    try {
      response = await fetch(`${url.trim().replace(/\/+$/, "")}/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      this.diagnostics.record(error, "bridge: pairing failed");
      return { problem: BRIDGE_UNREACHABLE };
    }
    if (response.status === 401) return { problem: "That is not the code the bridge shows. After three wrong codes the bridge waits a minute." };
    if (response.status === 429) return { problem: `Three wrong codes: the bridge takes no code for ${Number.parseInt(response.headers.get("Retry-After") ?? "", 10) || 60} s.` };
    if (response.status === 410) return { problem: "This bridge's code was used. Start the bridge again for a new one." };
    const answer = parseJson(response.ok ? await response.text() : "");
    const token = answer.ok && answer.value !== null && typeof answer.value === "object" ? (answer.value as { token?: unknown }).token : undefined;
    // The bridge takes no token shorter than 16 characters.
    return typeof token === "string" && token.length >= 16 ? { token } : { problem: "What answered at this address is not a Local Bridge." };
  }

  private load(): BridgeConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return DEFAULT_CONFIG;
      }
      const parsed = JSON.parse(stored) as Partial<BridgeConfig>;
      // Before P6.4 the route was a switch: on reads as "bridge", off as the default.
      const route = typeof parsed.route === "string" && ROUTES.includes(parsed.route) ? (parsed.route as Route) : (parsed as { enabled?: unknown }).enabled === true ? "bridge" : "auto";
      const config = { route, url: typeof parsed.url === "string" && parsed.url ? parsed.url : DEFAULT_URL, token: "" };
      // A version before F83 kept the token here as plain text: it is not read, and it is taken out.
      if ("token" in parsed || "enabled" in parsed) this.persist(config);
      return config;
    } catch (error) {
      this.diagnostics.record(error, "bridge: stored settings unreadable, using defaults");
      return DEFAULT_CONFIG;
    }
  }

  private persist(config: BridgeConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ route: config.route, url: config.url }));
    } catch (error) {
      // The bridge preference just won't survive a reload.
      this.diagnostics.record(error, "bridge: could not save settings");
    }
  }
}
