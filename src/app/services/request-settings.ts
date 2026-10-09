import { Injectable, inject, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

const TIMEOUT_KEY = "wayfarer:request-timeout-ms";
const HISTORY_CAP_KEY = "wayfarer:history-cap";
const HISTORY_BODIES_KEY = "wayfarer:history-bodies";
const BLOCK_UNRESOLVED_KEY = "wayfarer:block-unresolved";

export const DEFAULT_HISTORY_CAP = 500;
const MAX_HISTORY_CAP = 5000;

/** How requests are sent and remembered in this browser profile. Kept in `localStorage`; Reset all data clears it. */
@Injectable({ providedIn: "root" })
export class RequestSettings {
  private readonly diagnostics = inject(Diagnostics);

  /** Milliseconds before a request is given up; 0 (the default) waits for as long as it takes. */
  readonly timeoutMs = signal(this.number(TIMEOUT_KEY, 0));
  /** How many exchanges history keeps; the oldest go when a new one is written. */
  readonly historyCap = signal(this.number(HISTORY_CAP_KEY, DEFAULT_HISTORY_CAP) || DEFAULT_HISTORY_CAP);
  /** Whether history keeps response bodies (up to 1 MB each). */
  readonly historyBodies = signal(this.flag(HISTORY_BODIES_KEY));
  /** Whether a request with a `{{variable}}` that has no value is held back until the user says to send it. */
  readonly blockUnresolved = signal(this.flag(BLOCK_UNRESOLVED_KEY));

  setTimeoutMs(value: number): void {
    const next = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    this.timeoutMs.set(next);
    this.store(TIMEOUT_KEY, next ? String(next) : null);
  }

  setHistoryCap(value: number): void {
    const next = Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), MAX_HISTORY_CAP) : DEFAULT_HISTORY_CAP;
    this.historyCap.set(next);
    this.store(HISTORY_CAP_KEY, String(next));
  }

  setHistoryBodies(on: boolean): void {
    this.historyBodies.set(on);
    this.store(HISTORY_BODIES_KEY, on ? null : "off");
  }

  setBlockUnresolved(on: boolean): void {
    this.blockUnresolved.set(on);
    this.store(BLOCK_UNRESOLVED_KEY, on ? null : "off");
  }

  /** `null` removes the key: the default is then in force again. */
  private store(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (error) {
      // The setting just won't survive a reload.
      this.diagnostics.record(error, `request settings: could not save ${key}`);
    }
  }

  private number(key: string, fallback: number): number {
    try {
      const stored = Number(localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : fallback;
    } catch (error) {
      this.diagnostics.record(error, `request settings: stored ${key} unreadable, using the default`);
      return fallback;
    }
  }

  /** On unless switched off. */
  private flag(key: string): boolean {
    try {
      return localStorage.getItem(key) !== "off";
    } catch (error) {
      this.diagnostics.record(error, `request settings: stored ${key} unreadable, using the default`);
      return true;
    }
  }
}
