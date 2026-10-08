import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { HoverCard } from "./hover-card";

@Component({
  imports: [HoverCard],
  template: `
    <span id="row" tabindex="0" [uiHoverCard]="details">row</span>
    <ng-template #details><p class="detail">Status: 200</p></ng-template>
  `,
})
class TestHost {}

const card = () => document.querySelector<HTMLElement>('[role="tooltip"]');
const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: type !== "mouseenter" && type !== "mouseleave" }));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("HoverCard", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    return { fixture, row: fixture.nativeElement.querySelector("#row") as HTMLElement };
  }

  afterEach(() => {
    document.querySelectorAll(".cdk-overlay-container").forEach((el) => el.remove());
  });

  it("shows the template on hover, describes the host with it, and removes both on leave", async () => {
    const { fixture, row } = await setup();
    expect(card()).toBeNull();
    expect(row.hasAttribute("aria-describedby")).toBe(false);

    fire(row, "mouseenter");
    await fixture.whenStable();

    expect(card()?.querySelector(".detail")?.textContent).toBe("Status: 200");
    expect(card()?.classList.contains("ui-popover")).toBe(true);
    expect(row.getAttribute("aria-describedby")).toBe(card()?.id);

    fire(row, "mouseleave");
    await wait(150);
    await fixture.whenStable();
    expect(card()).toBeNull();
    expect(row.hasAttribute("aria-describedby")).toBe(false);
    fixture.destroy();
  });

  it("stays open while the pointer is over the card itself", async () => {
    const { fixture, row } = await setup();
    fire(row, "mouseenter");
    await fixture.whenStable();

    fire(row, "mouseleave");
    fire(card()!, "mouseenter");
    await wait(150);
    expect(card()).not.toBeNull();

    fire(card()!, "mouseleave");
    await wait(150);
    expect(card()).toBeNull();
    fixture.destroy();
  });

  it("shows on keyboard focus and closes on blur and on Escape", async () => {
    const { fixture, row } = await setup();

    row.focus();
    await fixture.whenStable();
    expect(row.matches(":focus-visible")).toBe(true);
    expect(card()).not.toBeNull();
    row.blur();
    expect(card()).toBeNull();

    row.focus();
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(card()).toBeNull();
    fixture.destroy();
  });

  it("does not open for focus the browser shows no ring for (a click, or focus handed back by a dialog)", async () => {
    const { fixture, row } = await setup();
    // A focusin whose target does not match :focus-visible, as after a mouse click.
    const other = document.createElement("div");
    row.append(other);
    other.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await fixture.whenStable();
    expect(card()).toBeNull();
    fixture.destroy();
  });

  it("opens one card however often it is triggered, and removes it when the host is destroyed", async () => {
    const { fixture, row } = await setup();
    fire(row, "mouseenter");
    row.focus();
    await fixture.whenStable();
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);

    fixture.destroy();
    expect(card()).toBeNull();
  });
});
