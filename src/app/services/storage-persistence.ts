import { Injectable, inject, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

/**
 * Whether the browser has promised to keep this site's data (P2.11).
 * Without that promise it may delete everything when the disk runs low,
 * and Safari deletes it after seven days without a visit.
 */
@Injectable({ providedIn: "root" })
export class StoragePersistence {
  private readonly diagnostics = inject(Diagnostics);

  /** `null` until asked, or when the browser cannot say. */
  readonly persisted = signal<boolean | null>(null);
  /** Bytes used and bytes allowed, as the browser estimates them. */
  readonly estimate = signal<{ usage: number; quota: number } | null>(null);

  /** Safari in a tab, not installed to the Dock or the Home Screen: the seven-day rule applies. */
  readonly safariNotInstalled = navigator.vendor === "Apple Computer, Inc." && !matchMedia("(display-mode: standalone)").matches;

  /** Reads the current state, for Settings. Asks for nothing. */
  async refresh(): Promise<void> {
    if (!navigator.storage?.persisted) return;
    try {
      this.persisted.set(await navigator.storage.persisted());
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      this.estimate.set({ usage, quota });
    } catch (error) {
      this.diagnostics.record(error, "storage: could not read the persistence state");
    }
  }

  /**
   * Asks the browser to keep the data. Called when the user first saves
   * something: a browser that asks the user (Firefox) does so on a click,
   * and one that decides by itself (Chrome, Safari) weighs how the site is used.
   */
  async request(): Promise<void> {
    if (this.persisted() || !navigator.storage?.persist) return;
    try {
      this.persisted.set(await navigator.storage.persist());
    } catch (error) {
      this.diagnostics.record(error, "storage: the browser refused to answer a persistence request");
    }
  }
}
