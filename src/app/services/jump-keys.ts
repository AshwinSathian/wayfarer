import { Injectable, inject, signal } from "@angular/core";
import { JUMPS } from "../shared/shortcuts";
import { Diagnostics } from "./diagnostics";

const STORAGE_KEY = "wayfarer:jump-keys";
/** How long the first key waits for the second: long enough for a switch or a screen reader to say the hint (WCAG 2.2.1). */
const ARMED_MS = 5000;

/** Where a key is typed, or chooses an item of a list: the letters are the field's or the list's there. */
export const KEYS_OWNED =
  "input, textarea, select, .monaco-editor, [contenteditable], [role=combobox], [role=listbox], [role=menu], [role=tree], [role=treeitem]";

/**
 * The jump keys (BB2): G, then a letter, goes to a place (`JUMPS`). A single character key, so (WCAG 2.1.4) it can be
 * turned off in Settings › Shortcuts, and it is read only where nothing owns the letters: never in a field, an editor,
 * a menu, list or tree, a dialog or the variable's popover, never with a modifier, never while a text is being composed.
 * The shell reads it on the window in the capture phase, ahead of the collections panel's own letters (C, N).
 */
@Injectable({ providedIn: "root" })
export class JumpKeys {
  private readonly diagnostics = inject(Diagnostics);
  readonly enabled = signal(true);
  /** G was pressed and a letter is awaited: the shell says so. */
  readonly armed = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "off") this.enabled.set(false);
    } catch (error) {
      this.diagnostics.record(error, "jump keys: localStorage unavailable, they stay on");
    }
  }

  choose(on: boolean): void {
    this.enabled.set(on);
    this.disarm();
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch (error) {
      this.diagnostics.record(error, "jump keys: the choice was not stored");
    }
  }

  private disarm(): void {
    clearTimeout(this.timer);
    this.armed.set(false);
  }

  /**
   * Reads one key. Returns the palette command to run when this key finished a jump; `swallow` is true for a key the
   * jump took (G, and the letter after it), which the caller stops so that nothing else reads it.
   */
  read(event: KeyboardEvent): { command?: string; swallow: boolean } {
    const armed = this.armed();
    this.disarm();
    if (!this.enabled() || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return { swallow: false };
    if (event.repeat || event.isComposing || event.key.length !== 1) return { swallow: false };
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest(`${KEYS_OWNED}, [popover]:popover-open`))
    )
      return { swallow: false };
    if (document.querySelector("dialog:modal")) return { swallow: false };
    const letter = event.key.toUpperCase();
    if (armed) {
      const jump = JUMPS.find((entry) => entry.key === letter);
      return jump ? { command: jump.command, swallow: true } : { swallow: false };
    }
    if (letter !== "G") return { swallow: false };
    this.armed.set(true);
    this.timer = setTimeout(() => this.armed.set(false), ARMED_MS);
    return { swallow: true };
  }
}
