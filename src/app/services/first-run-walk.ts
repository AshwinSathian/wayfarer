import { Injectable, inject, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

const STORAGE_KEY = "wayfarer:first-walk";
export const WALK_STEPS = 3;

/**
 * The walk of the route strip after a profile's first example send (overhaul BB1). It starts only from "Try an
 * example" (`start`), which is what a new profile is offered, and ends once: Done, Dismiss or Escape writes the key,
 * and Reset all data removes it with the other `wayfarer:` keys. Nothing is stored in IndexedDB. A browser that
 * cannot store the key shows the walk again at the next load, which costs a dismissal.
 */
@Injectable({ providedIn: "root" })
export class FirstRunWalk {
  private readonly diagnostics = inject(Diagnostics);
  private readonly finished = signal(this.read());
  private readonly started = signal(false);
  /** The stop being described: 0 the origin, 1 the block, 2 the host. */
  readonly step = signal(0);
  readonly active = () => this.started() && !this.finished();

  start(): void {
    if (this.finished()) return;
    this.step.set(0);
    this.started.set(true);
  }

  next(): void {
    if (this.step() < WALK_STEPS - 1) this.step.update((step) => step + 1);
    else this.finish();
  }

  finish(): void {
    this.finished.set(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch (error) {
      this.diagnostics.record(error, "first-run walk: the end of it was not stored");
    }
  }

  private read(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch (error) {
      this.diagnostics.record(error, "first-run walk: localStorage unavailable");
      return false;
    }
  }
}
