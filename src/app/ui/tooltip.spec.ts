import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, describe, expect, it } from "vitest";
import { UiTooltip, placeTooltip } from "./tooltip";

@Component({
  imports: [UiTooltip],
  template: `
    <button id="labelled" type="button" aria-label="New tab" [uiTooltip]="text()">+</button>
    <button id="same" type="button" aria-label="Duplicate" uiTooltip="Duplicate">D</button>
    @if (shown()) {
      <button id="in-block" type="button" uiTooltip="In a block">B</button>
    }
    <span id="row" tabindex="0" [uiTooltip]="details">row</span>
    <ng-template #details><p class="detail">Status: 200</p></ng-template>
    <dialog id="dialog">
      @if (shown()) {
        <button id="in-dialog" type="button" uiTooltip="Inside">I</button>
      }
    </dialog>
  `,
})
class TestHost {
  readonly text = signal("New tab (Alt+T)");
  readonly shown = signal(true);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const enter = (el: Element, pointerType = "mouse") => el.dispatchEvent(new PointerEvent("pointerenter", { pointerType }));
const leave = (el: Element) => el.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));

let hosts: (host: HTMLElement) => HTMLElement;
const tipOf = (host: HTMLElement) => hosts(host);
const isOpen = (host: HTMLElement) => tipOf(host).matches(":popover-open");

describe("UiTooltip", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
    hosts = (host) => fixture.debugElement.query(By.css(`#${host.id}`)).injector.get(UiTooltip).popover;
    return { fixture, el };
  }

  afterEach(() => {
    document.querySelectorAll(".ui-tooltip").forEach((tip) => tip.remove());
  });

  it("is a popover with the tooltip's role, and its text describes the host from the start", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    const tip = tipOf(host);
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.popover).toBe("manual");
    expect(tip.textContent).toBe("New tab (Alt+T)");
    expect(host.getAttribute("aria-describedby")).toBe(tip.id);
    expect(isOpen(host)).toBe(false);

    fixture.componentInstance.text.set("Open a tab");
    await fixture.whenStable();
    expect(tip.textContent).toBe("Open a tab");
    fixture.destroy();
  });

  it("does not describe its host with the words of its name, and empty text is no tooltip", async () => {
    const { fixture, el } = await setup();
    expect(el("same").hasAttribute("aria-describedby")).toBe(false);

    const host = el("labelled");
    enter(host);
    expect(isOpen(host)).toBe(true);
    fixture.componentInstance.text.set("");
    await fixture.whenStable();
    expect(isOpen(host)).toBe(false);
    expect(host.hasAttribute("aria-describedby")).toBe(false);
    enter(host);
    expect(isOpen(host)).toBe(false);
    fixture.destroy();
  });

  it("is the body's, out of its host's row: a rule of siblings there finds nothing new", async () => {
    const { fixture, el } = await setup();
    const tip = tipOf(el("in-block"));
    expect(tip.parentElement).toBe(document.body);
    expect(el("in-block").nextElementSibling).toBe(el("row"));
    fixture.destroy();
  });

  it("shows for a mouse or a pen, not for a touch", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    enter(host, "touch");
    expect(isOpen(host)).toBe(false);
    enter(host, "mouse");
    expect(isOpen(host)).toBe(true);
    fixture.destroy();
  });

  it("shows on focus from the keyboard, not for a click's or code's, and hides on blur", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    host.focus();
    expect(isOpen(host)).toBe(false);
    host.blur();

    // A real press: the CDK takes a mousedown with no button for a screen reader's, that is, the keyboard.
    host.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, buttons: 1, detail: 1 }));
    host.focus();
    expect(isOpen(host)).toBe(false);
    host.blur();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    host.focus();
    expect(isOpen(host)).toBe(true);
    host.blur();
    expect(isOpen(host)).toBe(false);
    fixture.destroy();
  });

  it("stays while the pointer travels onto it, and hides when the pointer leaves both", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    enter(host);
    leave(host);
    enter(tipOf(host));
    await wait(150);
    expect(isOpen(host)).toBe(true);

    leave(tipOf(host));
    await wait(150);
    expect(isOpen(host)).toBe(false);
    fixture.destroy();
  });

  it("hides on Escape heard before the host stops it (a menu trigger), and leaves the key to the page", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    host.focus();
    expect(isOpen(host)).toBe(true);

    const stop = (event: Event) => event.stopPropagation();
    host.addEventListener("keydown", stop);
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    host.removeEventListener("keydown", stop);
    expect(isOpen(host)).toBe(false);

    host.blur();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    host.focus();
    expect(isOpen(host)).toBe(true);
    let heard = false;
    const listen = () => (heard = true);
    window.addEventListener("keydown", listen);
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.removeEventListener("keydown", listen);
    expect(isOpen(host)).toBe(false);
    expect(heard).toBe(true);
    fixture.destroy();
  });

  it("hides on a press on its host", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    enter(host);
    host.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(isOpen(host)).toBe(false);
    fixture.destroy();
  });

  it("follows its host on a scroll: Tab scrolls a host into view after its tooltip shows", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    enter(host);
    host.style.marginTop = "40px";
    document.body.dispatchEvent(new Event("scroll"));
    expect(isOpen(host)).toBe(true);
    expect(tipOf(host).offsetTop).toBe(Math.round(host.getBoundingClientRect().bottom + 8));
    fixture.destroy();
  });

  it("is placed against its host, centred under it", async () => {
    const { fixture, el } = await setup();
    const host = el("labelled");
    host.style.marginLeft = "300px";
    enter(host);
    const tip = tipOf(host);
    const h = host.getBoundingClientRect();
    expect(tip.offsetTop).toBe(Math.round(h.bottom + 8));
    expect(Math.abs(tip.offsetLeft + tip.offsetWidth / 2 - (h.left + h.width / 2))).toBeLessThan(1);
    fixture.destroy();
  });

  it("is drawn inside the dialog its host is in, a block's root too: the page outside a modal dialog is inert", async () => {
    const { fixture, el } = await setup();
    const dialog = el("dialog") as HTMLDialogElement;
    dialog.showModal();
    const host = el("in-dialog");
    enter(host);
    expect(dialog.contains(tipOf(host))).toBe(true);
    expect(isOpen(host)).toBe(true);
    dialog.close();
    fixture.destroy();
  });

  it("moves into the dialog its host was put in after it was made (a dialog's projected content)", async () => {
    const { fixture, el } = await setup();
    const dialog = el("dialog") as HTMLDialogElement;
    const host = el("labelled");
    dialog.append(host);
    dialog.showModal();
    enter(host);
    expect(dialog.contains(tipOf(host))).toBe(true);
    expect(isOpen(host)).toBe(true);
    dialog.close();
    fixture.destroy();
  });

  it("shows a template as a card that describes its host while shown, and makes it anew each time", async () => {
    const { fixture, el } = await setup();
    const row = el("row");
    expect(row.hasAttribute("aria-describedby")).toBe(false);

    enter(row);
    const tip = tipOf(row);
    expect(tip.classList.contains("ui-tooltip-card")).toBe(true);
    expect(tip.querySelector(".detail")?.textContent).toBe("Status: 200");
    expect(row.getAttribute("aria-describedby")).toBe(tip.id);
    // A card starts at its host's start edge.
    expect(tip.offsetLeft).toBe(Math.round(Math.max(8, row.getBoundingClientRect().left)));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    row.focus();
    expect(tip.querySelectorAll(".detail")).toHaveLength(1);
    row.blur();
    expect(isOpen(row)).toBe(false);
    expect(tip.childElementCount).toBe(0);
    expect(row.hasAttribute("aria-describedby")).toBe(false);
    fixture.destroy();
  });

  it("takes its popover with it when the host goes", async () => {
    const { fixture, el } = await setup();
    const host = el("in-block");
    const tip = tipOf(host);
    enter(host);
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    expect(tip.isConnected).toBe(false);
    expect(document.querySelectorAll(".ui-tooltip:popover-open")).toHaveLength(0);
    fixture.destroy();
  });
});

describe("placeTooltip", () => {
  const window = { width: 400, height: 300 };
  const size = { width: 100, height: 30 };
  const rect = (left: number, top: number, width = 40, height = 20) => new DOMRect(left, top, width, height);

  it("goes on its side, centred on the host, 8 px from it", () => {
    expect(placeTooltip(rect(100, 100), size, window, "below", "center")).toEqual({ left: 70, top: 128 });
    expect(placeTooltip(rect(100, 100), size, window, "above", "center")).toEqual({ left: 70, top: 62 });
  });

  it("takes the other side when only that one has room", () => {
    expect(placeTooltip(rect(100, 260), size, window, "below", "center").top).toBe(222);
    expect(placeTooltip(rect(100, 10), size, window, "above", "center").top).toBe(38);
  });

  it("stays inside the window by 8 px", () => {
    expect(placeTooltip(rect(370, 100), size, window, "below", "center").left).toBe(292);
    expect(placeTooltip(rect(0, 100), size, window, "below", "center").left).toBe(8);
    expect(placeTooltip(rect(100, 0, 40, 290), size, window, "below", "center").top).toBe(262);
  });

  it("starts at its host's start edge when asked", () => {
    expect(placeTooltip(rect(100, 100), size, window, "below", "start").left).toBe(100);
  });
});
