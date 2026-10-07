import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipDirective } from "./tooltip.directive";

@Component({
  imports: [TooltipDirective],
  template: `
    <button id="text" [uiTooltip]="text()" [uiTooltipPosition]="position()">Copy</button>
    <span id="card" tabindex="0" [uiTooltip]="details">row</span>
    <ng-template #details><p class="detail">Status: 200</p></ng-template>
  `,
})
class HostComponent {
  readonly text = signal<string | null>("Copy as cURL");
  readonly position = signal<"top" | "bottom">("top");
}

const tooltip = () => document.querySelector<HTMLElement>('[role="tooltip"]');
const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: type !== "mouseenter" && type !== "mouseleave" }));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("TooltipDirective", () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    return { fixture, text: fixture.nativeElement.querySelector("#text") as HTMLElement, card: fixture.nativeElement.querySelector("#card") as HTMLElement };
  }

  afterEach(() => {
    document.querySelectorAll(".cdk-overlay-container").forEach((el) => el.remove());
  });

  it("shows the text on hover, describes the host with it, and removes both on leave", async () => {
    const { fixture, text } = await setup();
    expect(tooltip()).toBeNull();
    expect(text.hasAttribute("aria-describedby")).toBe(false);

    fire(text, "mouseenter");
    await fixture.whenStable();

    expect(tooltip()?.textContent).toBe("Copy as cURL");
    expect(tooltip()?.classList.contains("ui-tooltip")).toBe(true);
    expect(text.getAttribute("aria-describedby")).toBe(tooltip()?.id);

    fire(text, "mouseleave");
    await wait(150);
    await fixture.whenStable();
    expect(tooltip()).toBeNull();
    expect(text.hasAttribute("aria-describedby")).toBe(false);
    fixture.destroy();
  });

  it("stays open while the pointer is over the tooltip itself", async () => {
    const { fixture, text } = await setup();
    fire(text, "mouseenter");
    await fixture.whenStable();

    fire(text, "mouseleave");
    fire(tooltip()!, "mouseenter");
    await wait(150);
    expect(tooltip()).not.toBeNull();

    fire(tooltip()!, "mouseleave");
    await wait(150);
    expect(tooltip()).toBeNull();
    fixture.destroy();
  });

  it("shows on keyboard focus and closes on blur and on Escape", async () => {
    const { fixture, text } = await setup();

    text.focus();
    await fixture.whenStable();
    expect(text.matches(":focus-visible")).toBe(true);
    expect(tooltip()).not.toBeNull();
    text.blur();
    expect(tooltip()).toBeNull();

    text.focus();
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tooltip()).toBeNull();
    fixture.destroy();
  });

  it("does not open for focus the browser shows no ring for (a click, or focus handed back by a dialog)", async () => {
    const { fixture, text } = await setup();
    // A focusin whose target does not match :focus-visible, as after a mouse click.
    const other = document.createElement("div");
    text.append(other);
    other.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await fixture.whenStable();
    expect(tooltip()).toBeNull();
    fixture.destroy();
  });

  it("shows nothing for an empty value, and one tooltip however often it is triggered", async () => {
    const { fixture, text } = await setup();
    fixture.componentInstance.text.set("");
    await fixture.whenStable();
    fire(text, "mouseenter");
    expect(tooltip()).toBeNull();

    fixture.componentInstance.text.set("Now it has text");
    await fixture.whenStable();
    fire(text, "mouseenter");
    text.focus();
    await fixture.whenStable();
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    fixture.destroy();
  });

  it("renders a template as a card and removes it when the host is destroyed", async () => {
    const { fixture, card } = await setup();
    fixture.componentInstance.position.set("bottom");

    card.focus();
    await fixture.whenStable();

    expect(tooltip()?.classList.contains("ui-popover")).toBe(true);
    expect(tooltip()?.querySelector(".detail")?.textContent).toBe("Status: 200");
    expect(card.getAttribute("aria-describedby")).toBe(tooltip()?.id);

    fixture.destroy();
    expect(tooltip()).toBeNull();
  });
});
