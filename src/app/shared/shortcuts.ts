/**
 * The app's keyboard shortcuts, and how each is written (docs/design/voice.md, Shortcuts): the keys of the
 * system the app runs on, and only those. `mod` is ⌘ on a Mac and Ctrl elsewhere; either is accepted on both.
 */
export interface Shortcut {
  /** `KeyboardEvent.key` for a named key ("Enter", "Delete"), else the letter in capitals. */
  key: string;
  mod?: boolean;
  alt?: boolean;
  /** Written only (the tree's Shift+F10): `matches` takes no shortcut with Shift. */
  shift?: boolean;
  /** A jump: this key, pressed right after that one ("G", then "H"). Read by `JumpKeys`, not by `matches`. */
  after?: string;
}

export const SHORTCUTS = {
  palette: { key: "K", mod: true },
  send: { key: "Enter", mod: true },
  save: { key: "S", mod: true },
  newTab: { key: "T", alt: true },
  closeTab: { key: "W", alt: true },
  undo: { key: "Z", mod: true },
} satisfies Record<string, Shortcut>;

/**
 * The jump keys (BB2): G, then a letter, goes to a place. `command` is the palette command's id, so the palette, Settings
 * and the keys read one list; the palette row shows the keys, and the command is what runs.
 */
export const JUMPS = [
  { command: "go-collections", label: "Go to the collections", key: "C" },
  { command: "open-history", label: "Go to History", key: "H" },
  { command: "environments", label: "Go to Environments", key: "E" },
  { command: "open-settings", label: "Open Settings", key: "S" },
  { command: "go-response", label: "Go to the response", key: "R" },
  { command: "focus-address-bar", label: "Go to the address", key: "A" },
  { command: "go-variables", label: "Go to the request's variables", key: "V" },
  { command: "go-route-strip", label: "Go to the route strip", key: "P" },
] as const satisfies readonly { command: string; label: string; key: string }[];

/** The keys of a palette command that has a jump, or none. */
export function jumpOf(command: string): Shortcut | undefined {
  const jump = JUMPS.find((entry) => entry.command === command);
  return jump && { key: jump.key, after: "G" };
}

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "⌘↵" on a Mac, "Ctrl+Enter" elsewhere; a key alone is its name. */
export function keysOf(shortcut: Shortcut, mac = MAC): string {
  const { key, mod, alt, shift, after } = shortcut;
  if (after) return `${after} then ${key}`;
  if (mac) return `${mod ? "⌘" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${(mod || alt) && key === "Enter" ? "↵" : key}`;
  return [mod && "Ctrl", alt && "Alt", shift && "Shift", key].filter(Boolean).join("+");
}

/** The keys of the collections panel and the dialogs, which Settings lists with the rest (they act where focus is). */
export function panelKeys(mac = MAC): { keys: string; description: string }[] {
  return [
    { keys: "C", description: "New collection, with the collections panel focused" },
    { keys: "N", description: "New request in the selected collection or folder" },
    { keys: "Delete", description: "Delete the item selected in the collections panel" },
    { keys: "F2", description: "Rename the item selected in the collections panel, or the focused tab" },
    {
      keys: `${keysOf({ key: "↑", alt: true }, mac)} ${keysOf({ key: "↓", alt: true }, mac)}`,
      description: "Move the selected item up or down among its siblings",
    },
    {
      keys: keysOf({ key: "F10", shift: true }, mac),
      description: "Open the menu of the selected item or the focused tab",
    },
    { keys: "Escape", description: "Close the open dialog, drawer or palette" },
  ];
}

/** The value of `aria-keyshortcuts`. */
export function ariaKeysOf(shortcut: Shortcut, mac = MAC): string {
  const { key, mod, alt, after } = shortcut;
  // aria-keyshortcuts has no sequence: a jump says its keys in its row's text.
  if (after) return "";
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
