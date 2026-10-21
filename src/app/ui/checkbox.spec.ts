import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { describe, expect, it } from "vitest";
import { UiCheckbox } from "./checkbox";

@Component({
  imports: [FormsModule, UiCheckbox],
  template: `
    <label class="ui-checkbox-label"
      ><input
        id="labelled"
        type="checkbox"
        uiCheckbox
        class="mt-1"
        [checked]="on()"
        [disabled]="off()"
        (change)="on.set($any($event.target).checked)"
      />Follow redirects</label
    >
    <label for="pointed">Hold back a request</label>
    <input id="pointed" type="checkbox" uiCheckbox />
    <input id="named" type="checkbox" uiCheckbox aria-label="Send header 1" [(ngModel)]="enabled" />
    <input id="plain" type="checkbox" />
    <input id="text" uiCheckbox />
  `,
})
class TestHost {
  readonly on = signal(false);
  readonly off = signal(false);
  enabled = true;
}

describe("UiCheckbox", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
    return { fixture, el };
  }

  it("names the checkbox in a class, only on a checkbox, and keeps the element's own classes", async () => {
    const { fixture, el } = await setup();
    expect([...el("labelled").classList].sort()).toEqual(["mt-1", "ui-checkbox"]);
    expect(el("pointed").classList.contains("ui-checkbox")).toBe(true);
    expect(el("plain").classList.contains("ui-checkbox")).toBe(false);
    expect(el("text").classList.contains("ui-checkbox")).toBe(false);
    fixture.destroy();
  });

  it("is a tab stop of its own, as Material's was: WebKit's Tab passes over a checkbox without one", async () => {
    const { fixture, el } = await setup();
    for (const id of ["labelled", "pointed", "named"]) expect(el(id).getAttribute("tabindex"), id).toBe("0");
    expect(el("plain").hasAttribute("tabindex")).toBe(false);
    fixture.destroy();
  });

  it("is the element's own checkbox: its label and its name reach it, with no role or id of its own", async () => {
    const { fixture, el } = await setup();
    expect(el("labelled").labels?.[0]?.textContent?.trim()).toBe("Follow redirects");
    expect(el("pointed").labels?.[0]?.textContent?.trim()).toBe("Hold back a request");
    expect(el("named").getAttribute("aria-label")).toBe("Send header 1");
    for (const id of ["labelled", "pointed", "named"]) {
      expect(el(id).getAttribute("id")).toBe(id);
      expect(el(id).hasAttribute("role")).toBe(false);
    }
    fixture.destroy();
  });

  it("is checked by a click on its text, holds the model both ways, and is disabled by the element's own property", async () => {
    const { fixture, el } = await setup();
    const host = fixture.componentInstance;
    el("labelled").closest("label")?.click();
    expect(host.on()).toBe(true);
    expect(el("labelled").checked).toBe(true);

    await fixture.whenStable();
    expect(el("named").checked).toBe(true);
    el("named").click();
    expect(host.enabled).toBe(false);

    host.off.set(true);
    await fixture.whenStable();
    expect(el("labelled").disabled).toBe(true);
    fixture.destroy();
  });
});
