import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UiSpinner } from "./spinner";

@Component({
  imports: [UiSpinner],
  template: `
    <button id="save" type="button"><ui-spinner id="in-button" /> Save</button>
    <ui-spinner id="alone" [diameter]="28" label="Loading secrets" />
  `,
})
class TestHost {}

describe("UiSpinner", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
    return { fixture, el };
  }

  it("says nothing in a button, and is a named progressbar on its own", async () => {
    const { fixture, el } = await setup();
    const inButton = el("in-button");
    expect(inButton.getAttribute("aria-hidden")).toBe("true");
    expect(inButton.hasAttribute("role")).toBe(false);
    const alone = el("alone");
    expect(alone.getAttribute("role")).toBe("progressbar");
    expect(alone.getAttribute("aria-label")).toBe("Loading secrets");
    expect(alone.hasAttribute("aria-hidden")).toBe(false);
    fixture.destroy();
  });

  it("is as wide and tall as its diameter, 18 px unless told", async () => {
    const { fixture, el } = await setup();
    expect(el("in-button").getBoundingClientRect().width).toBe(18);
    expect(el("alone").getBoundingClientRect().height).toBe(28);
    fixture.destroy();
  });

  it("takes no focus: not even by a click, as Material's tabindex=-1 could", async () => {
    const { fixture, el } = await setup();
    const spinner = el("in-button");
    expect(spinner.tabIndex).toBe(-1);
    expect(spinner.hasAttribute("tabindex")).toBe(false);
    spinner.focus();
    expect(document.activeElement).not.toBe(spinner);
    fixture.destroy();
  });

  it("draws three quarters of a ring in the text's colour, turning", async () => {
    const { fixture, el } = await setup();
    const spinner = el("in-button");
    spinner.style.color = "rgb(1, 2, 3)";
    const circle = getComputedStyle(spinner.querySelector("circle")!);
    expect(circle.stroke).toBe("rgb(1, 2, 3)");
    expect(circle.strokeDasharray).not.toBe("none");
    expect(getComputedStyle(spinner.querySelector("svg")!).animationIterationCount).toBe("infinite");
    fixture.destroy();
  });
});
