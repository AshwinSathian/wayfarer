import { DestroyRef, inject, signal, type Signal } from "@angular/core";

/** How long a note stays: long enough to read, gone before it is stale. */
const SHOWN_MS = 8000;

/**
 * A short note that says what an action did (U-050, "Copied as cURL."), shown
 * for a few seconds. Called in an injection context; the timer ends with it.
 */
export function transientNote(): { text: Signal<string>; show(text: string): void } {
  const text = signal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  return {
    text: text.asReadonly(),
    show(note: string) {
      clearTimeout(timer);
      text.set(note);
      timer = setTimeout(() => text.set(""), SHOWN_MS);
    },
  };
}
