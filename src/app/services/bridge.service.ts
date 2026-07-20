import { Injectable, signal } from "@angular/core";

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
export class BridgeService {
  readonly config = signal<BridgeConfig>(DEFAULT_CONFIG);

  constructor() {
    this.config.set(this.load());
  }

  update(patch: Partial<BridgeConfig>): void {
    const next = { ...this.config(), ...patch };
    this.config.set(next);
    this.persist(next);
  }

  /** Base URL with any trailing slash removed, for building `${base}/relay` etc. */
  get baseUrl(): string {
    return this.config().url.replace(/\/+$/, "");
  }

  async checkHealth(): Promise<boolean> {
    const base = this.baseUrl;
    if (!base) {
      return false;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return response.ok;
    } catch {
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
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  private persist(config: BridgeConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // localStorage unavailable — bridge preference just won't survive a reload
    }
  }
}
