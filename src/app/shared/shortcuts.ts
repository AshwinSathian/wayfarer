/**
 * The app's keyboard shortcuts, and how each is written (docs/design/voice.md, Shortcuts): the keys of the
 * system the app runs on, and only those. `mod` is ⌘ on a Mac and Ctrl elsewhere; either is accepted on both.
 */
export interface Shortcut {
  /** `KeyboardEvent.key` for a named key ("Enter", "Delete"), else the letter in capitals. */
  key: string;
  mod?: boolean;
  alt?: boolean;
}

export const SHORTCUTS = {
  palette: { key: "K", mod: true },
  send: { key: "Enter", mod: true },
  save: { key: "S", mod: true },
  newTab: { key: "T", alt: true },
  closeTab: { key: "W", alt: true },
} satisfies Record<string, Shortcut>;

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "⌘↵" on a Mac, "Ctrl+Enter" elsewhere; a key alone is its name. */
export function keysOf(shortcut: Shortcut, mac = MAC): string {
  const { key, mod, alt } = shortcut;
  if (mac) return `${mod ? "⌘" : ""}${alt ? "⌥" : ""}${(mod || alt) && key === "Enter" ? "↵" : key}`;
  return [mod && "Ctrl", alt && "Alt", key].filter(Boolean).join("+");
}

/** The value of `aria-keyshortcuts`. */
export function ariaKeysOf(shortcut: Shortcut, mac = MAC): string {
  const { key, mod, alt } = shortcut;
  return [mod && (mac ? "Meta" : "Control"), alt && "Alt", key].filter(Boolean).join("+");
}

/**
 * A letter with ⌘ or Ctrl is read from `key`, so that it follows the keyboard's layout; with Alt alone from `code`,
 * its place on the keyboard: on macOS Option+T is the character "†". Shift is never part of one.
 */
export function matches(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const { key, mod = false, alt = false } = shortcut;
  if ((event.metaKey || event.ctrlKey) !== mod || event.altKey !== alt || event.shiftKey) return false;
  if (key.length > 1) return event.key === key;
  return mod ? event.key.toUpperCase() === key : event.code === `Key${key}`;
}
