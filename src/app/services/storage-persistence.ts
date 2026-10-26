import { Injectable, inject, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

const FIRST_SAVE_KEY = "wayfarer:first-save";

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
  /** When something was first saved here, in this browser: the first backup reminder may come then (U-137). */
  readonly firstSave = signal(this.readFirstSave());
  /** Bytes used and bytes allowed, as the browser estimates them. */
  readonly estimate = signal<{ usage: number; quota: number } | null>(null);

  /** Safari in a tab, not installed to the Dock or the Home Screen: the seven-day rule applies. */
  readonly safariNotInstalled =
    navigator.vendor === "Apple Computer, Inc." && !matchMedia("(display-mode: standalone)").matches;

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
    if (!this.firstSave()) this.noteFirstSave();
    if (this.persisted() || !navigator.storage?.persist) return;
    try {
      this.persisted.set(await navigator.storage.persist());
    } catch (error) {
      this.diagnostics.record(error, "storage: the browser refused to answer a persistence request");
    }
  }

  private readFirstSave(): number {
    try {
      return Number(localStorage.getItem(FIRST_SAVE_KEY)) || 0;
    } catch (error) {
      this.diagnostics.record(error, "storage: could not read when the first save was");
      return 0;
    }
  }

  private noteFirstSave(): void {
    const now = Date.now();
    this.firstSave.set(now);
    try {
      localStorage.setItem(FIRST_SAVE_KEY, String(now));
    } catch (error) {
      this.diagnostics.record(error, "storage: could not keep when the first save was");
    }
  }
}
