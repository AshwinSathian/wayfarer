import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UiButton } from "./button";

@Component({
  imports: [UiButton],
  template: `
    <button
      id="filled"
      uiButton="filled"
      class="btn-sm"
      type="button"
      [disabled]="off()"
      (click)="pressed.set(pressed() + 1)"
      >Save</button
    >
    <button id="outlined" uiButton="outlined" type="button">Cancel</button>
    <button id="text" uiButton type="button">Clear</button>
    <button id="icon" uiButton="icon" type="button" aria-label="Close">x</button>
    <a id="link" uiButton="outlined" href="#here">Open</a>
  `,
})
class TestHost {
  readonly off = signal(false);
  readonly pressed = signal(0);
}

describe("UiButton", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
    return { fixture, el };
  }

  it("names its variant in a class, a text button when it names none, and keeps the element's own classes", async () => {
    const { fixture, el } = await setup();
    const variants = ["filled", "outlined", "text", "icon", "link"].map((id) =>
      [...el(id).classList]
        .filter((name) => name.startsWith("ui-button"))
        .sort()
        .join(" "),
    );
    expect(variants).toEqual([
      "ui-button ui-button-filled",
      "ui-button ui-button-outlined",
      "ui-button ui-button-text",
      "ui-button ui-button-icon",
      "ui-button ui-button-outlined",
    ]);
    expect(el("filled").classList.contains("btn-sm")).toBe(true);
    fixture.destroy();
  });

  it("is the element's own button and link: no role, tabindex or aria-disabled of its own", async () => {
    const { fixture, el } = await setup();
    for (const id of ["filled", "icon", "link"]) {
      expect(el(id).hasAttribute("role")).toBe(false);
      expect(el(id).hasAttribute("tabindex")).toBe(false);
      expect(el(id).hasAttribute("aria-disabled")).toBe(false);
    }
    fixture.destroy();
  });

  it("is disabled by the element's own attribute, and a disabled one is not pressed", async () => {
    const { fixture, el } = await setup();
    const save = el("filled") as HTMLButtonElement;
    save.click();
    expect(fixture.componentInstance.pressed()).toBe(1);
    fixture.componentInstance.off.set(true);
    await fixture.whenStable();
    expect(save.disabled).toBe(true);
    save.click();
    expect(fixture.componentInstance.pressed()).toBe(1);
    fixture.destroy();
  });
});
