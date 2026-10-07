import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { SplitterComponent } from "./splitter.component";

const KEY = "test:split";

@Component({
  imports: [SplitterComponent],
  template: `
    <ui-splitter style="width: 1008px; height: 100px" storageKey="${KEY}" [sizes]="[55, 45]" [minSizes]="[28, 22]" ariaLabel="Resize panes">
      <div uiSplitterStart id="start">start</div>
      <div uiSplitterEnd id="end">end</div>
    </ui-splitter>
  `,
})
class HostComponent {}

describe("ui-splitter", () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const gutter = root.querySelector<HTMLElement>('[role="separator"]')!;
    const width = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!.parentElement!.getBoundingClientRect().width;
    const press = async (key: string) => {
      gutter.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };
    // A scripted pointer has no id the browser knows, so it cannot be captured.
    gutter.setPointerCapture = () => undefined;
    gutter.releasePointerCapture = () => undefined;
    const pointer = (type: string, clientX: number) => gutter.dispatchEvent(new PointerEvent(type, { clientX, pointerId: 1, button: 0, bubbles: true, cancelable: true }));
    return { fixture, root, gutter, width, press, pointer };
  }

  afterEach(() => localStorage.removeItem(KEY));

  it("lays out both panes from the given sizes and describes the gutter as a focusable separator", async () => {
    const { fixture, gutter, width } = await setup();

    // 55% and 45% of 1008, less the 8 px gutter shared equally.
    expect(width("start")).toBeCloseTo(550.4, 0);
    expect(width("end")).toBeCloseTo(449.6, 0);
    expect(gutter.getBoundingClientRect().width).toBe(8);
    expect(gutter.tabIndex).toBe(0);
    expect(gutter.getAttribute("aria-orientation")).toBe("vertical");
    expect(gutter.getAttribute("aria-label")).toBe("Resize panes");
    expect(gutter.getAttribute("aria-valuenow")).toBe("55");
    expect(gutter.getAttribute("aria-valuemin")).toBe("28");
    expect(gutter.getAttribute("aria-valuemax")).toBe("78");
    fixture.destroy();
  });

  it("reads sizes stored by the PrimeNG splitter unchanged", async () => {
    localStorage.setItem(KEY, "[67.5365344467641,31.628392484342378]");
    const { fixture, width } = await setup();

    // PrimeNG stored each pane's width over the total width: 1008 × 67.54% and 1008 × 31.63%.
    expect(width("start")).toBeCloseTo(680.8, 0);
    expect(width("end")).toBeCloseTo(318.8, 0);
    fixture.destroy();
  });

  it.each(["not json", '"55"', "[55]", "[55,null]", "[-5,105]", "[80,80]", "[0,100]"])("ignores a stored value it cannot use: %s", async (value) => {
    localStorage.setItem(KEY, value);
    const { fixture, gutter } = await setup();

    expect(gutter.getAttribute("aria-valuenow")).toBe("55");
    fixture.destroy();
  });

  it("arrow keys move the gutter and store the result; Home and End stop at the minimum sizes", async () => {
    const { fixture, gutter, width, press } = await setup();

    const before = width("start");
    await press("ArrowRight");
    expect(width("start")).toBeCloseTo(before + 1008 * 0.02, 0);
    expect(JSON.parse(localStorage.getItem(KEY)!)[0]).toBeCloseTo(57, 0);
    await press("ArrowLeft");
    expect(width("start")).toBeCloseTo(before, 0);

    await press("Home");
    expect(width("start")).toBeCloseTo(1008 * 0.28, 0);
    expect(gutter.getAttribute("aria-valuenow")).toBe("28");
    await press("ArrowLeft");
    expect(width("start")).toBeCloseTo(1008 * 0.28, 0);

    await press("End");
    expect(width("end")).toBeCloseTo(1008 * 0.22, 0);
    const stored = JSON.parse(localStorage.getItem(KEY)!) as number[];
    expect(stored[1]).toBeCloseTo(22, 5);
    fixture.destroy();
  });

  it("dragging follows the pointer, stays inside the minimum sizes, and stores on release", async () => {
    const { fixture, root, gutter, width, pointer } = await setup();
    const left = root.querySelector("ui-splitter")!.getBoundingClientRect().left;
    const at = gutter.getBoundingClientRect().left;

    pointer("pointerdown", at + 4);
    pointer("pointermove", at + 104);
    await fixture.whenStable();
    expect(gutter.getBoundingClientRect().left).toBeCloseTo(at + 100, 0);
    expect(localStorage.getItem(KEY)).toBeNull();

    pointer("pointermove", left - 500);
    await fixture.whenStable();
    expect(width("start")).toBeCloseTo(1008 * 0.28, 0);

    pointer("pointerup", left - 500);
    expect(JSON.parse(localStorage.getItem(KEY)!)[0]).toBeCloseTo(28, 5);

    // Released: the pointer no longer moves the gutter.
    pointer("pointermove", at + 300);
    await fixture.whenStable();
    expect(width("start")).toBeCloseTo(1008 * 0.28, 0);
    fixture.destroy();
  });
});
