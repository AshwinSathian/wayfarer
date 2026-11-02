import { Injectable, signal } from "@angular/core";
import { recordDiagnostic } from "./diagnostics";

/** How long an Undo is offered: long enough to read the line and reach the button (WCAG 2.2.1 lets it be extended). */
export const UNDO_MS = 10_000;

/**
 * The one Undo the app offers at a time (U-080): what was just deleted, said in the shell's status region with an
 * Undo button for a few seconds. ⌘Z or Ctrl+Z outside a field does the same. A newer delete takes the place of the
 * last; what it replaces can no longer be undone.
 */
@Injectable({ providedIn: "root" })
export class UndoNotice {
  readonly current = signal<{ message: string; undo: () => Promise<void> } | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  offer(message: string, undo: () => Promise<void>): void {
    clearTimeout(this.timer);
    this.current.set({ message, undo });
    this.timer = setTimeout(() => this.current.set(null), UNDO_MS);
  }

  /** Keeps the Undo while the pointer or focus is on it (WCAG 2.2.1): it goes when they leave. */
  hold(held: boolean): void {
    clearTimeout(this.timer);
    if (!held && this.current()) this.timer = setTimeout(() => this.current.set(null), UNDO_MS);
  }

  async undo(): Promise<void> {
    const current = this.current();
    if (!current) return;
    clearTimeout(this.timer);
    this.current.set(null);
    try {
      await current.undo();
    } catch (error) {
      recordDiagnostic(error, "undo");
    }
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }
}
