import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UI_TABS } from "./tabs.component";

@Component({
  imports: [UI_TABS],
  template: `
    <ui-tabs [value]="tab()" (valueChange)="changes.push($event); tab.set($event)">
      <ui-tablist>
        <ui-tab value="a">A</ui-tab>
        @if (showB()) {<ui-tab value="b">B</ui-tab>}
        <ui-tab value="c">C</ui-tab>
      </ui-tablist>
      <ui-tabpanels>
        <ui-tabpanel value="a"><input id="in-a" /></ui-tabpanel>
        <ui-tabpanel value="b">panel b</ui-tabpanel>
        <ui-tabpanel value="c">panel c</ui-tabpanel>
      </ui-tabpanels>
    </ui-tabs>
  `,
})
class HostComponent {
  readonly tab = signal<string | number>("a");
  readonly showB = signal(true);
  readonly changes: (string | number)[] = [];
}

describe("ui-tabs", () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const tabs = () => Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
    const panels = () => Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    const key = async (key: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };
    return { fixture, root, tabs, panels, key };
  }

  it("wires roles, selection and the tab-to-panel links", async () => {
    const { fixture, root, tabs, panels } = await setup();

    expect(root.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs().map((t) => [t.textContent, t.getAttribute("aria-selected"), t.getAttribute("tabindex")])).toEqual([
      ["A", "true", "0"],
      ["B", "false", "-1"],
      ["C", "false", "-1"],
    ]);
    expect(panels().map((p) => p.hidden)).toEqual([false, true, true]);
    for (const [i, tab] of tabs().entries()) {
      expect(tab.getAttribute("aria-controls")).toBe(panels()[i].id);
      expect(panels()[i].getAttribute("aria-labelledby")).toBe(tab.id);
    }
    fixture.destroy();
  });

  it("selects on click and keeps hidden panels mounted", async () => {
    const { fixture, root, tabs, panels } = await setup();
    const input = root.querySelector<HTMLInputElement>("#in-a")!;
    input.value = "typed";

    tabs()[2].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.changes).toEqual(["c"]);
    expect(panels().map((p) => p.hidden)).toEqual([true, true, false]);
    expect(root.querySelector<HTMLInputElement>("#in-a")).toBe(input);
    expect(input.value).toBe("typed");

    // Clicking the selected tab again reports nothing.
    tabs()[2].click();
    expect(fixture.componentInstance.changes).toEqual(["c"]);
    fixture.destroy();
  });

  it("moves and selects with the arrow keys, wrapping, and with Home and End", async () => {
    const { fixture, tabs, key } = await setup();
    tabs()[0].focus();

    await key("ArrowRight");
    expect(document.activeElement).toBe(tabs()[1]);
    expect(fixture.componentInstance.tab()).toBe("b");

    await key("End");
    expect(fixture.componentInstance.tab()).toBe("c");
    await key("ArrowRight");
    expect(fixture.componentInstance.tab()).toBe("a");
    await key("ArrowLeft");
    expect(fixture.componentInstance.tab()).toBe("c");
    await key("Home");
    expect(fixture.componentInstance.tab()).toBe("a");
    expect(document.activeElement).toBe(tabs()[0]);

    // Other keys are left alone.
    await key("x");
    expect(fixture.componentInstance.tab()).toBe("a");
    fixture.destroy();
  });

  it("skips a tab that is not rendered", async () => {
    const { fixture, tabs, key } = await setup();
    fixture.componentInstance.showB.set(false);
    await fixture.whenStable();
    tabs()[0].focus();

    await key("ArrowRight");

    expect(fixture.componentInstance.tab()).toBe("c");
    fixture.destroy();
  });
});
