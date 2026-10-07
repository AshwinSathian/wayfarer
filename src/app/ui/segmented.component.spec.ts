import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { SegmentedComponent } from "./segmented.component";

@Component({
  imports: [SegmentedComponent],
  template: `<ui-segmented [options]="options" [value]="mode()" (valueChange)="changes.push($event); mode.set($event)" aria-label="Editor mode" />`,
})
class HostComponent {
  readonly options = [
    { label: "Basic", value: "basic" },
    { label: "JSON", value: "json" },
  ] as const;
  readonly mode = signal<"basic" | "json">("basic");
  readonly changes: string[] = [];
}

describe("ui-segmented", () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const group: HTMLElement = fixture.nativeElement.querySelector('[role="radiogroup"]');
    const radios = () => Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
    return { fixture, group, radios };
  }

  it("is a labelled radio group with exactly one option checked and in the tab order", async () => {
    const { fixture, group, radios } = await setup();

    expect(group.getAttribute("aria-label")).toBe("Editor mode");
    expect(radios().map((r) => [r.textContent?.trim(), r.getAttribute("aria-checked"), r.getAttribute("tabindex")])).toEqual([
      ["Basic", "true", "0"],
      ["JSON", "false", "-1"],
    ]);
    fixture.destroy();
  });

  it("selects on click, and clicking the checked option changes nothing", async () => {
    const { fixture, radios } = await setup();

    radios()[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.changes).toEqual(["json"]);
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);

    radios()[1].click();
    expect(fixture.componentInstance.changes).toEqual(["json"]);
    fixture.destroy();
  });

  it("moves and selects with the arrow keys, wrapping at the ends", async () => {
    const { fixture, radios } = await setup();
    const press = async (key: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };
    radios()[0].focus();

    await press("ArrowRight");
    expect(fixture.componentInstance.mode()).toBe("json");
    expect(document.activeElement).toBe(radios()[1]);

    await press("ArrowDown");
    expect(fixture.componentInstance.mode()).toBe("basic");
    await press("ArrowLeft");
    expect(fixture.componentInstance.mode()).toBe("json");
    await press("ArrowUp");
    expect(fixture.componentInstance.mode()).toBe("basic");

    await press("Enter");
    expect(fixture.componentInstance.changes).toEqual(["json", "basic", "json", "basic"]);
    fixture.destroy();
  });
});
