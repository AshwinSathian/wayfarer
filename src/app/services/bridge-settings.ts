import { Injectable, signal, inject } from "@angular/core";
import { Diagnostics } from "./diagnostics";

const STORAGE_KEY = "wayfarer:bridge";
const DEFAULT_URL = "http://127.0.0.1:7717";

export interface BridgeConfig {
  enabled: boolean;
  url: string;
  token: string;
}

const DEFAULT_CONFIG: BridgeConfig = { enabled: false, url: DEFAULT_URL, token: "" };

/**
 * Local machine/browser-profile preference for routing requests through the
 * optional Local Bridge companion process (see `local-bridge/README.md`).
 * Deliberately not per-environment: which relay to use, if any, is a
 * property of the device you're testing from, not something that should
 * sync or export with a collection/environment.
 */
@Injectable({ providedIn: "root" })
export class BridgeSettings {
  private readonly diagnostics = inject(Diagnostics);
  readonly config = signal<BridgeConfig>(DEFAULT_CONFIG);

  constructor() {
    this.config.set(this.load());
  }

  update(patch: Partial<BridgeConfig>): void {
    const next = { ...this.config(), ...patch };
    this.config.set(next);
    this.persist(next);
  }

  /** Probes `url` (the saved bridge URL by default) without changing the saved settings. */
  async checkHealth(url = this.config().url): Promise<boolean> {
    const base = url.replace(/\/+$/, "");
    if (!base) {
      return false;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return response.ok;
    } catch (error) {
      this.diagnostics.record(error, "bridge: health check failed");
      return false;
    }
  }

  private load(): BridgeConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return DEFAULT_CONFIG;
      }
      const parsed = JSON.parse(stored) as Partial<BridgeConfig>;
      return {
        enabled: parsed.enabled === true,
        url: typeof parsed.url === "string" && parsed.url ? parsed.url : DEFAULT_URL,
        token: typeof parsed.token === "string" ? parsed.token : "",
      };
    } catch (error) {
      this.diagnostics.record(error, "bridge: stored settings unreadable, using defaults");
      return DEFAULT_CONFIG;
    }
  }

  private persist(config: BridgeConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      // The bridge preference just won't survive a reload.
      this.diagnostics.record(error, "bridge: could not save settings");
    }
  }
}
