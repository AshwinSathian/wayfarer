import { Injectable, inject, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

const TIMEOUT_KEY = "wayfarer:request-timeout-ms";

/** How requests are sent from this browser profile. Kept in `localStorage`; Reset all data clears it. */
@Injectable({ providedIn: "root" })
export class RequestSettings {
  private readonly diagnostics = inject(Diagnostics);

  /** Milliseconds before a request is given up; 0 (the default) waits for as long as it takes. */
  readonly timeoutMs = signal(this.load());

  setTimeoutMs(value: number): void {
    const next = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    this.timeoutMs.set(next);
    try {
      if (next) localStorage.setItem(TIMEOUT_KEY, String(next));
      else localStorage.removeItem(TIMEOUT_KEY);
    } catch (error) {
      // The timeout just won't survive a reload.
      this.diagnostics.record(error, "request settings: could not save the timeout");
    }
  }

  private load(): number {
    try {
      const stored = Number(localStorage.getItem(TIMEOUT_KEY));
      return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
    } catch (error) {
      this.diagnostics.record(error, "request settings: stored timeout unreadable, using none");
      return 0;
    }
  }
}
