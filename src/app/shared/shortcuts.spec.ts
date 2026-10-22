import { describe, expect, it } from "vitest";
import { SHORTCUTS, ariaKeysOf, keysOf, matches } from "./shortcuts";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("shortcuts", () => {
  it("are written in the keys of one system only (docs/design/voice.md)", () => {
    expect(keysOf(SHORTCUTS.send, true)).toBe("⌘↵");
    expect(keysOf(SHORTCUTS.send, false)).toBe("Ctrl+Enter");
    expect(keysOf(SHORTCUTS.newTab, true)).toBe("⌥T");
    expect(keysOf(SHORTCUTS.newTab, false)).toBe("Alt+T");
    expect(keysOf({ key: "Enter" }, true)).toBe("Enter");
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
  });
});
