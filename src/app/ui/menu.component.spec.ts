import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { MenuComponent, UiMenuItem } from "./menu.component";

@Component({
  imports: [MenuComponent],
  template: `
    <button id="trigger" (click)="menu.toggle($event)">Export</button>
    <div id="area" (contextmenu)="menu.show($event)">right-click me</div>
    <button id="elsewhere">Elsewhere</button>
    <ui-menu #menu [items]="items" />
  `,
})
class HostComponent {
  readonly ran: string[] = [];
  readonly items: UiMenuItem[] = [
    { label: "Copy as cURL", icon: "terminal", command: () => this.ran.push("curl") },
    { separator: true },
    { label: "Copy as HAR", command: () => this.ran.push("har") },
  ];
}

describe("ui-menu", () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const trigger = root.querySelector<HTMLButtonElement>("#trigger")!;
    const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
    const items = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    };
    return { fixture, root, trigger, menu, items, settle };
  }

  afterEach(() => {
    document.querySelectorAll(".cdk-overlay-container").forEach((el) => el.remove());
  });

  it("renders nothing until opened, then a menu with its items and a separator, focus on the first item", async () => {
    const { fixture, trigger, menu, items, settle } = await setup();
    expect(menu()).toBeNull();

    trigger.focus();
    trigger.click();
    await settle();

    expect(items().map((i) => i.textContent?.trim())).toEqual(["Copy as cURL", "Copy as HAR"]);
    expect(menu()?.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(document.activeElement).toBe(items()[0]);
    fixture.destroy();
  });

  it("runs the chosen item, closes, and gives focus back to the trigger", async () => {
    const { fixture, trigger, menu, items, settle } = await setup();
    trigger.focus();
    trigger.click();
    await settle();

    items()[1].click();
    await settle();

    expect(fixture.componentInstance.ran).toEqual(["har"]);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fixture.destroy();
  });

  it("closes on Escape without running anything, keeps the key from an enclosing dialog, and toggles shut on a second click", async () => {
    const { fixture, trigger, menu, settle } = await setup();
    let reachedDocument = 0;
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") reachedDocument++; };
    document.addEventListener("keydown", listener);
    trigger.focus();
    trigger.click();
    await settle();

    menu()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    expect(menu()).toBeNull();
    expect(reachedDocument).toBe(0);
    expect(document.activeElement).toBe(trigger);
    expect(fixture.componentInstance.ran).toEqual([]);

    trigger.click();
    await settle();
    expect(menu()).not.toBeNull();
    // A real second click: the press must not close it for the click to reopen it.
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.click();
    await settle();
    expect(menu()).toBeNull();
    document.removeEventListener("keydown", listener);
    fixture.destroy();
  });

  it("closes on a press outside, but not on the release of the click that opened it", async () => {
    const { fixture, root, trigger, menu, settle } = await setup();
    trigger.click();
    await settle();

    // The rest of the opening gesture.
    trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("auxclick", { bubbles: true }));
    expect(menu()).not.toBeNull();

    menu()!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(menu()).not.toBeNull();

    root.querySelector("#elsewhere")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await settle();
    expect(menu()).toBeNull();
    fixture.destroy();
  });

  it("opens at the pointer as a context menu and suppresses the browser's own", async () => {
    const { fixture, root, menu, settle } = await setup();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 });

    root.querySelector("#area")!.dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(menu()).not.toBeNull();
    expect(document.querySelector(".ui-menu-panel--context")).not.toBeNull();
    fixture.destroy();
    expect(menu()).toBeNull();
  });
});
