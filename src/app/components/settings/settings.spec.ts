import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Idb } from "../../data/idb";
import { BridgeSettings } from "../../services/bridge-settings";
import { Theme } from "../../services/theme";
import { Settings } from "./settings";

describe("Settings", () => {
  let fixture: ComponentFixture<Settings>;
  /** The dialog is drawn in an overlay, outside the fixture's element. */
  const dialog = () => document.querySelector<HTMLElement>(".settings") as HTMLElement;
  const item = (name: string) => [...dialog().querySelectorAll<HTMLButtonElement>(".settings-nav-item")].find((button) => button.textContent?.trim() === name) as HTMLButtonElement;
  const heading = () => dialog().querySelector("#settings-pane-title")?.textContent?.trim();
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.removeItem("wayfarer:bridge");
    localStorage.removeItem("wayfarer:theme");
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [{ provide: Idb, useValue: { onChangeElsewhere: vi.fn(), listSecrets: async () => [], memoryOnly: () => false } }],
    }).compileComponents();
    fixture = TestBed.createComponent(Settings);
    fixture.componentRef.setInput("visible", true);
    await settle();
  });

  it("lists ten sections, the danger zone last, and opens at General", () => {
    expect([...dialog().querySelectorAll(".settings-nav-item")].map((button) => button.textContent?.trim())).toEqual(["General", "Requests", "History", "Data and storage", "Vault", "Local Bridge", "Cookies", "Shortcuts", "About", "Danger zone"]);
    expect(heading()).toBe("General");
    expect(item("General").getAttribute("aria-current")).toBe("page");
    expect(item("Requests").getAttribute("aria-current")).toBeNull();
  });

  it("a section's pane replaces the one before it, and only its controls are there", async () => {
    expect(dialog().querySelector("#request-timeout")).toBeNull();
    item("Requests").click();
    await settle();
    expect(heading()).toBe("Requests");
    expect(dialog().querySelector("#request-timeout")).not.toBeNull();
    expect(dialog().classList.contains("settings-pane-open")).toBe(true);
    item("Danger zone").click();
    await settle();
    expect(dialog().querySelector("#request-timeout")).toBeNull();
    expect(dialog().querySelector('[aria-label="Reset all data"]')).not.toBeNull();
  });

  it("opens at the section its caller names: the bridge's button opens the bridge's pane", async () => {
    fixture.componentRef.setInput("visible", false);
    await settle();
    fixture.componentRef.setInput("section", "bridge");
    fixture.componentRef.setInput("visible", true);
    await settle();
    expect(heading()).toBe("Local Bridge");
    expect(dialog().querySelector("#bridge-url-input")).not.toBeNull();
    // A phone shows that pane, not the list.
    expect(dialog().classList.contains("settings-pane-open")).toBe(true);
  });

  it("Up, Down, Home and End walk the list, round its ends", () => {
    const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    item("General").focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(item("Requests"));
    press("ArrowUp");
    press("ArrowUp");
    expect(document.activeElement).toBe(item("Danger zone"));
    press("Home");
    expect(document.activeElement).toBe(item("General"));
    press("End");
    expect(document.activeElement).toBe(item("Danger zone"));
    press("a");
    expect(document.activeElement).toBe(item("Danger zone"));
  });

  it("the theme is one of three choices, and the one chosen is kept", async () => {
    const theme = TestBed.inject(Theme);
    const choice = (name: string) => [...dialog().querySelectorAll<HTMLButtonElement>(".segmented button")].find((button) => button.textContent?.trim() === name) as HTMLButtonElement;
    expect([...dialog().querySelectorAll(".segmented button")].map((button) => button.textContent?.trim())).toEqual(["System", "Light", "Dark"]);
    choice("Dark").click();
    await settle();
    expect([theme.choice(), document.documentElement.getAttribute("data-theme"), localStorage.getItem("wayfarer:theme")]).toEqual(["dark", "dark", "dark"]);
    choice("System").click();
    await settle();
    expect(theme.choice()).toBe("system");
  });

  it("a size is written as a person reads it, and the bar is never empty once something is stored", () => {
    const settings = fixture.componentInstance as unknown as { size: (bytes: number) => string; used: (estimate: { usage: number; quota: number }) => number };
    expect([0, 512, 1536, 3.6 * 1024 ** 2, 10 * 1024 ** 3, 250 * 1024 ** 3].map((bytes) => settings.size(bytes))).toEqual(["0 B", "512 B", "1.5 kB", "3.6 MB", "10 GB", "250 GB"]);
    expect(settings.used({ usage: 0, quota: 100 })).toBe(0);
    expect(settings.used({ usage: 1, quota: 1e9 })).toBe(1);
    expect(settings.used({ usage: 50, quota: 100 })).toBe(50);
    expect(settings.used({ usage: 500, quota: 100 })).toBe(100);
    expect(settings.used({ usage: 5, quota: 0 })).toBe(0);
  });

  describe("the Local Bridge pane", () => {
    const input = (id: string) => dialog().querySelector<HTMLInputElement>(id) as HTMLInputElement;
    const button = (label: string) => dialog().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) as HTMLButtonElement;
    const type = async (id: string, value: string) => {
      input(id).value = value;
      input(id).dispatchEvent(new Event("input"));
      await settle();
    };

    beforeEach(async () => {
      item("Local Bridge").click();
      await settle();
    });

    it("stores nothing until Save, and Save is offered only for a change", async () => {
      const bridge = TestBed.inject(BridgeSettings);
      expect(button("Save").disabled).toBe(true);
      await type("#bridge-token-input", " a-token ");
      expect(button("Save").disabled).toBe(false);
      expect(bridge.config().token).toBe("");
      button("Save").click();
      await settle();
      expect(bridge.config()).toEqual({ enabled: false, url: "http://127.0.0.1:7717", token: "a-token" });
      expect(dialog().querySelector(".bridge-saved")?.textContent).toContain("Saved");
      expect(button("Save").disabled).toBe(true);
    });

    it("Discard puts back what is stored", async () => {
      await type("#bridge-url-input", "http://127.0.0.1:9999");
      const discard = [...dialog().querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Discard") as HTMLButtonElement;
      discard.click();
      await settle();
      expect(input("#bridge-url-input").value).toBe("http://127.0.0.1:7717");
      expect(button("Save").disabled).toBe(true);
    });

    it("switched on with no address is refused, and says why", async () => {
      dialog().querySelector<HTMLInputElement>("#bridge-enabled-checkbox-input")?.click();
      await type("#bridge-url-input", "  ");
      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("Give the bridge's address, or switch the bridge off.");
      expect(button("Save").disabled).toBe(true);
      expect(button("Test connection").disabled).toBe(true);
    });

    it("Test connection asks the address that is typed, not the one stored, and says what came back", async () => {
      const bridge = TestBed.inject(BridgeSettings);
      const health = vi.spyOn(bridge, "checkHealth").mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await type("#bridge-url-input", "http://127.0.0.1:9999 ");
      const verdict = async (text: string) =>
        vi.waitFor(async () => {
          await settle();
          expect(dialog().querySelector(".bridge-test")?.textContent).toContain(text);
        });
      button("Test connection").click();
      await verdict("Reachable");
      expect(health).toHaveBeenCalledWith("http://127.0.0.1:9999");
      button("Test connection").click();
      await verdict("Not reachable");
      // An edit after a test takes the verdict away: it was of another address.
      await type("#bridge-url-input", "http://127.0.0.1:1");
      expect(dialog().querySelector(".bridge-test")?.textContent?.trim()).toBe("");
    });
  });
});
