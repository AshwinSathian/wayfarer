import { describe, expect, it } from "vitest";
import { JUMPS, SHORTCUTS, ariaKeysOf, jumpOf, keysOf, matches } from "./shortcuts";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("shortcuts", () => {
  it("are written in the keys of one system only (docs/design/voice.md)", () => {
    expect(keysOf(SHORTCUTS.send, true)).toBe("⌘↵");
    expect(keysOf(SHORTCUTS.send, false)).toBe("Ctrl+Enter");
    expect(keysOf(SHORTCUTS.newTab, true)).toBe("⌥T");
    expect(keysOf(SHORTCUTS.newTab, false)).toBe("Alt+T");
    expect(keysOf({ key: "Enter" }, true)).toBe("Enter");
    expect(keysOf({ key: "F10", shift: true }, true)).toBe("⇧F10");
    expect(keysOf({ key: "F10", shift: true }, false)).toBe("Shift+F10");
    expect(ariaKeysOf(SHORTCUTS.save, true)).toBe("Meta+S");
    expect(ariaKeysOf(SHORTCUTS.save, false)).toBe("Control+S");
  });

  it("match ⌘ or Ctrl for mod, a letter by its place on the keyboard, and nothing with an extra modifier", () => {
    expect(matches(key({ key: "Enter", metaKey: true }), SHORTCUTS.send)).toBe(true);
    expect(matches(key({ key: "Enter", ctrlKey: true }), SHORTCUTS.send)).toBe(true);
    expect(matches(key({ key: "Enter" }), SHORTCUTS.send)).toBe(false);
    expect(matches(key({ key: "Enter", ctrlKey: true, shiftKey: true }), SHORTCUTS.send)).toBe(false);
    expect(matches(key({ key: "s", code: "KeyS", ctrlKey: true }), SHORTCUTS.save)).toBe(true);
    expect(matches(key({ key: "s", code: "KeyS", ctrlKey: true, altKey: true }), SHORTCUTS.save)).toBe(false);
    expect(matches(key({ key: "†", code: "KeyT", altKey: true }), SHORTCUTS.newTab)).toBe(true);
    // ⌘K follows the layout: on Dvorak the K key sits where QWERTY has V.
    expect(matches(key({ key: "k", code: "KeyV", metaKey: true }), SHORTCUTS.palette)).toBe(true);
    expect(matches(key({ key: "v", code: "KeyK", metaKey: true }), SHORTCUTS.palette)).toBe(false);
  });

  it("write a jump as two keys, with no aria-keyshortcuts, and each jump is one letter that no other takes", () => {
    expect(keysOf({ key: "H", after: "G" }, true)).toBe("G then H");
    expect(keysOf({ key: "H", after: "G" }, false)).toBe("G then H");
    expect(ariaKeysOf({ key: "H", after: "G" })).toBe("");
    expect(jumpOf("open-history")).toEqual({ key: "H", after: "G" });
    expect(jumpOf("nothing")).toBeUndefined();
    expect(new Set(JUMPS.map((jump) => jump.key)).size).toBe(JUMPS.length);
    expect(new Set(JUMPS.map((jump) => jump.command)).size).toBe(JUMPS.length);
  });
});
