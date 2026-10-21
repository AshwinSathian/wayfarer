import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MenuTrigger } from "@angular/aria/menu";
import { describe, expect, it } from "vitest";
import { UiMenu } from "./menu";
import { UiMenuItem } from "./menu-item";

@Component({
  imports: [MenuTrigger, UiMenu],
  template: `
    <button type="button" class="opener" ngMenuTrigger #trigger="ngMenuTrigger" [menu]="menu.menu()">Export</button>
    <ui-menu #menu [trigger]="trigger" [items]="items" />
    <div class="area" tabindex="0" (contextmenu)="atPointer.openAt($event, restore)">Area</div>
    <ui-menu #atPointer [items]="items" />
    <button type="button" class="after">After</button>
  `,
})
class TestHost {
  readonly ran: string[] = [];
  readonly restored: number[] = [];
  readonly items: UiMenuItem[] = [
    { label: "Copy", command: () => this.ran.push("Copy") },
    { separator: true },
    { label: "Delete", command: () => this.ran.push("Delete") },
  ];
  readonly restore = () => this.restored.push(1);
}

describe("ui-menu", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await fixture.whenStable();
    };
    const items = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const press = async (key: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      await settle();
    };
    const rightClick = async (button = 2) => {
      const area = root.querySelector<HTMLElement>(".area")!;
      area.focus();
      area.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30, button }));
      await settle();
    };
    return { fixture, host: fixture.componentInstance, root, settle, items, press, rightClick };
  }

  it("a button opens it from the keyboard at its first item; Enter runs an item and gives focus back to the button", async () => {
    const { fixture, host, root, items, press } = await setup();
    const opener = root.querySelector<HTMLElement>(".opener")!;
    opener.focus();
    await press("Enter");

    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(items().map((item) => item.textContent?.trim())).toEqual(["Copy", "Delete"]);
    expect(document.activeElement).toBe(items()[0]);
    await press("ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    await press("Enter");

    expect(host.ran).toEqual(["Delete"]);
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(opener);
    fixture.destroy();
  });

  it("Escape closes a button's menu and gives focus back to the button", async () => {
    const { fixture, host, root, items, press } = await setup();
    const opener = root.querySelector<HTMLElement>(".opener")!;
    opener.focus();
    await press("ArrowUp");
    expect(document.activeElement).toBe(items()[1]);
    await press("Escape");

    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(opener);
    expect(host.ran).toEqual([]);
    fixture.destroy();
  });

  it("Tab closes a button's menu from the button, so the key goes on from there; at the pointer, from what it hands focus to", async () => {
    const { fixture, host, root, items, press, rightClick } = await setup();
    const opener = root.querySelector<HTMLElement>(".opener")!;
    opener.focus();
    await press("Enter");
    await press("Tab");
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(opener);

    await rightClick();
    await press("Tab");
    expect(items()).toEqual([]);
    expect(host.restored).toEqual([1]);
    fixture.destroy();
  });

  it("opens at the pointer with focus on its first item; Escape closes it and hands focus back", async () => {
    const { fixture, host, items, press, rightClick } = await setup();
    await rightClick();
    expect(document.activeElement).toBe(items()[0]);
    const panel = document.querySelector<HTMLElement>(".ui-menu")!;
    // It grows into place: measured once it has.
    await Promise.all(panel.getAnimations().map((animation) => animation.finished));
    expect(Math.round(panel.getBoundingClientRect().top)).toBe(30);

    await press("Escape");
    expect(items()).toEqual([]);
    expect(host.restored).toEqual([1]);
    fixture.destroy();
  });

  it("at the pointer, is drawn in its own element, not at the end of the body: in a modal dialog the page outside is inert", async () => {
    const { fixture, items, rightClick } = await setup();
    const root: HTMLElement = fixture.nativeElement;
    await rightClick();
    expect(root.querySelectorAll("ui-menu")[1].contains(items()[0])).toBe(true);
    fixture.destroy();
  });

  it("an item that comes up under a pointer that has not moved does not take focus from the first; a pointer that moves does", async () => {
    const { fixture, items, settle, rightClick } = await setup();
    await rightClick();
    // Drawn under a still pointer, the browser sends mouseover with no move.
    items()[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await settle();
    expect(document.activeElement).toBe(items()[0]);

    items()[1].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    items()[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await settle();
    expect(document.activeElement).toBe(items()[1]);
    fixture.destroy();
  });

  it("a choice at the pointer closes it, hands focus back, then runs the item", async () => {
    const { fixture, host, items, settle, rightClick } = await setup();
    await rightClick();
    items()[1].click();
    await settle();

    expect(host.ran).toEqual(["Delete"]);
    expect(host.restored).toEqual([1]);
    expect(items()).toEqual([]);
    fixture.destroy();
  });

  it("the right button's release after it opens is not a click outside; a later click outside closes it, and Tab too", async () => {
    const { fixture, host, root, items, settle, rightClick } = await setup();
    await rightClick();
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 2 }));
    document.body.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 2 }));
    await settle();
    expect(items()).toHaveLength(2);

    // The CDK takes a click as outside by where its press was.
    const after = root.querySelector<HTMLElement>(".after")!;
    after.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    after.click();
    await settle();
    expect(items()).toEqual([]);
    // Closed by a click elsewhere: focus is where the click put it, not handed back.
    expect(host.restored).toEqual([]);

    await rightClick();
    root.querySelector<HTMLElement>(".after")!.focus();
    await settle();
    expect(items()).toEqual([]);
    expect(host.restored).toEqual([]);
    fixture.destroy();
  });
});
