import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { describe, expect, it } from "vitest";
import { UiInput } from "./input";

@Component({
  imports: [FormsModule, UiInput],
  template: `
    <input id="field" uiInput class="font-mono w-full" [disabled]="off()" [(ngModel)]="value" />
    <textarea id="lines" uiInput class="font-mono" rows="3"></textarea>
    <input id="plain" />
  `,
})
class TestHost {
  readonly off = signal(false);
  value = "first";
}

describe("UiInput", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
    return { fixture, el };
  }

  it("names the field in a class, on an input and a text area, and keeps the element's own classes", async () => {
    const { fixture, el } = await setup();
    expect([...el("field").classList].sort()).toEqual([
      "font-mono",
      "ng-pristine",
      "ng-untouched",
      "ng-valid",
      "ui-input",
      "w-full",
    ]);
    expect(el("lines").classList.contains("ui-input")).toBe(true);
    expect(el("plain").classList.contains("ui-input")).toBe(false);
    fixture.destroy();
  });

  it("is the element's own field: no id, aria-invalid or aria-required of its own (Material wrote all three)", async () => {
    const { fixture, el } = await setup();
    for (const id of ["field", "lines"]) {
      expect(el(id).getAttribute("id")).toBe(id);
      expect(el(id).hasAttribute("aria-invalid")).toBe(false);
      expect(el(id).hasAttribute("aria-required")).toBe(false);
      expect(el(id).hasAttribute("role")).toBe(false);
    }
    fixture.destroy();
  });

  it("holds the model's value both ways, and is disabled by the element's own property", async () => {
    const { fixture, el } = await setup();
    const field = el("field");
    await fixture.whenStable();
    expect(field.value).toBe("first");
    field.value = "second";
    field.dispatchEvent(new Event("input"));
    expect(fixture.componentInstance.value).toBe("second");
    fixture.componentInstance.off.set(true);
    await fixture.whenStable();
    expect(field.disabled).toBe(true);
    fixture.destroy();
  });
});
