import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Theme } from "./theme";

describe("Theme", () => {
  let systemDark: boolean;
  let onSystemChange: ((event: { matches: boolean }) => void) | undefined;

  beforeEach(() => {
    localStorage.removeItem("wayfarer:theme");
    systemDark = true;
    onSystemChange = undefined;
    vi.spyOn(window, "matchMedia").mockImplementation(
      () =>
        ({
          get matches() {
            return systemDark;
          },
          addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
            (onSystemChange = listener),
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.mocked(window.matchMedia).mockRestore();
    localStorage.removeItem("wayfarer:theme");
  });

  const drawn = () => document.documentElement.getAttribute("data-theme");

  it("a browser with no choice follows the system, and keeps following it when the system changes", () => {
    const theme = TestBed.inject(Theme);
    expect([theme.choice(), theme.theme(), drawn()]).toEqual(["system", "dark", "dark"]);
    systemDark = false;
    onSystemChange?.({ matches: false });
    expect([theme.choice(), theme.theme(), drawn()]).toEqual(["system", "light", "light"]);
    expect(localStorage.getItem("wayfarer:theme")).toBeNull();
  });

  it("a choice is drawn, kept, and no longer moved by the system", () => {
    const theme = TestBed.inject(Theme);
    theme.choose("light");
    expect([theme.theme(), drawn(), localStorage.getItem("wayfarer:theme")]).toEqual(["light", "light", "light"]);
    onSystemChange?.({ matches: true });
    expect([theme.theme(), drawn()]).toEqual(["light", "light"]);
    theme.choose("system");
    expect([theme.theme(), localStorage.getItem("wayfarer:theme")]).toEqual(["dark", "system"]);
  });

  it("toggle picks the other theme from the one drawn, which is a choice of its own", () => {
    const theme = TestBed.inject(Theme);
    theme.toggle();
    expect([theme.choice(), drawn()]).toEqual(["light", "light"]);
    theme.toggle();
    expect([theme.choice(), drawn()]).toEqual(["dark", "dark"]);
  });

  it("reads the stored choice, and takes nothing else for one", () => {
    localStorage.setItem("wayfarer:theme", "light");
    expect(TestBed.inject(Theme).choice()).toBe("light");
    TestBed.resetTestingModule();
    localStorage.setItem("wayfarer:theme", "sepia");
    expect(TestBed.inject(Theme).choice()).toBe("system");
  });
});
