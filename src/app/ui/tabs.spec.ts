import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Tab, TabContent, TabPanel, Tabs } from "@angular/aria/tabs";
import { describe, expect, it } from "vitest";
import { UiTabList } from "./tabs";

type Value = "a" | "b" | "c";

@Component({
  imports: [Tab, TabContent, TabPanel, Tabs, UiTabList],
  template: `
    <div ngTabs>
      <div
        uiTabList
        aria-label="Parts"
        [selectedTab]="tab()"
        (selectedTabChange)="chosen.push($event); tab.set($event)"
      >
        <button ngTab value="a">A</button>
        @if (showB()) {
          <button ngTab value="b">B</button>
        }
        <button ngTab value="c">C</button>
      </div>
      <div ngTabPanel value="a" class="tab-pane" [preserveContent]="true"
        ><ng-template ngTabContent><input aria-label="In A" /></ng-template
      ></div>
      @if (showB()) {
        <div ngTabPanel value="b" class="tab-pane" [preserveContent]="true"
          ><ng-template ngTabContent>Pane B</ng-template></div
        >
      }
      <div ngTabPanel value="c" class="tab-pane" [preserveContent]="true"
        ><ng-template ngTabContent>Pane C</ng-template></div
      >
    </div>
  `,
})
class TestHost {
  readonly tab = signal<Value>("a");
  readonly showB = signal(true);
  readonly chosen: Value[] = [];
}

describe("uiTabList", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    const root: HTMLElement = fixture.nativeElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await fixture.whenStable();
    };
    await settle();
    const tab = (name: string) =>
      Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]')).find((t) => t.textContent?.trim() === name);
    const stop = () =>
      Array.from(root.querySelectorAll<HTMLElement>('[role="tab"][tabindex="0"]')).map((t) => t.textContent?.trim());
    const shown = () =>
      Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]:not([inert])')).map(
        (p) => p.textContent?.trim() || p.querySelector("input")?.getAttribute("aria-label"),
      );
    const press = async (key: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      await settle();
    };
    return { fixture, host: fixture.componentInstance, root, tab, stop, shown, press, settle };
  }

  it("chooses a tab on a click and on an arrow key, and shows its pane only", async () => {
    const { host, tab, shown, press, settle } = await setup();
    expect(shown()).toEqual(["In A"]);
    tab("C")!.click();
    await settle();
    expect(host.tab()).toBe("c");
    expect(shown()).toEqual(["Pane C"]);
    tab("C")!.focus();
    await press("ArrowRight");
    expect(document.activeElement).toBe(tab("A"));
    expect(host.tab()).toBe("a");
    expect(tab("A")!.getAttribute("aria-selected")).toBe("true");
  });

  it("draws a choice at once, before the next key", async () => {
    const { root, tab, settle } = await setup();
    tab("C")!.click();
    // No wait: Chromium takes a Tab before the next render.
    expect(root.querySelector('[ngTabPanel][value="a"]')!.hasAttribute("inert")).toBe(true);
    expect(tab("C")!.getAttribute("tabindex")).toBe("0");
    await settle();
    tab("C")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    expect(tab("B")!.getAttribute("tabindex")).toBe("0");
    expect(root.querySelector('[ngTabPanel][value="c"]')!.hasAttribute("inert")).toBe(true);
  });

  it("leaves the default of a key it does not take: Escape and Tab go on", async () => {
    const { tab } = await setup();
    for (const key of ["Escape", "Tab"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      tab("A")!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("keeps a pane's content when another is chosen", async () => {
    const { host, root, settle } = await setup();
    const input = root.querySelector<HTMLInputElement>('input[aria-label="In A"]')!;
    input.value = "typed";
    host.tab.set("c");
    await settle();
    host.tab.set("a");
    await settle();
    expect(root.querySelector('input[aria-label="In A"]')).toBe(input);
    expect(input.value).toBe("typed");
  });

  it("moves the tab stop, and the keys, to a tab chosen by code", async () => {
    const { host, tab, stop, press, settle } = await setup();
    // Interacted with first: Aria stops following the choice once a tab had focus.
    tab("A")!.focus();
    await settle();
    host.tab.set("c");
    await settle();
    expect(stop()).toEqual(["C"]);
    tab("C")!.focus();
    await press("ArrowLeft");
    expect(document.activeElement).toBe(tab("B"));
    expect(host.tab()).toBe("b");
  });

  it("chooses a tab focused by code, and moves the keys from it", async () => {
    const { host, tab, press, settle } = await setup();
    tab("A")!.focus();
    await press("ArrowRight");
    expect(document.activeElement).toBe(tab("B"));
    tab("A")!.focus();
    await settle();
    expect(host.tab()).toBe("a");
    await press("ArrowRight");
    expect(document.activeElement).toBe(tab("B"));
    tab("C")!.focus();
    await settle();
    expect(host.tab()).toBe("c");
  });

  it("chooses a tab again when it comes back, and does not pass on Aria's undefined", async () => {
    const { host, tab, shown, settle } = await setup();
    host.tab.set("b");
    await settle();
    host.showB.set(false);
    await settle();
    expect(host.tab()).toBe("b");
    host.showB.set(true);
    await settle();
    expect(tab("B")!.getAttribute("aria-selected")).toBe("true");
    expect(shown()).toEqual(["Pane B"]);
    expect(host.chosen).toEqual([]);
  });

  it("brings the chosen tab into a bar too narrow for all of them", async () => {
    const { host, root, tab, settle } = await setup();
    const bar = root.querySelector<HTMLElement>('[role="tablist"]')!;
    bar.style.width = "60px";
    host.tab.set("c");
    await settle();
    const room = bar.getBoundingClientRect();
    const open = tab("C")!.getBoundingClientRect();
    expect(bar.scrollLeft).toBeGreaterThan(0);
    expect(open.right).toBeLessThanOrEqual(room.right + 0.5);
  });
});
