import { Component, signal, viewChild } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UiModal, keepFocusInDialogs } from "./modal";

@Component({
  imports: [UiModal],
  template: `
    <button id="opener" type="button">Open</button>
    <dialog uiModal #modal="uiModal" id="modal" [open]="open()" [dismissable]="dismissable()" (closeRequest)="requests = requests + 1; open.set(false)">
      <span tabindex="-1">Not in the tab order</span>
      <button id="first" type="button">First</button>
      <input id="field" />
      @if (withAutofocus()) {
        <button id="marked" type="button" cdkFocusInitial>Marked</button>
      }
      <button id="last" type="button">Last</button>
    </dialog>
  `,
})
class TestHost {
  readonly open = signal(false);
  readonly dismissable = signal(false);
  readonly withAutofocus = signal(false);
  readonly modal = viewChild.required<UiModal>("modal");
  requests = 0;
}

describe("UiModal", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const el = (id: string) => document.getElementById(id) as HTMLElement;
    const dialog = el("modal") as HTMLDialogElement;
    const key = (target: Element, key: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    };
    const mouse = (type: string, x: number, y: number, target: Element = dialog) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    const open = async () => {
      el("opener").focus();
      host.open.set(true);
      await fixture.whenStable();
    };
    return { fixture, host, el, dialog, key, mouse, open };
  }

  it("opens as the browser's modal dialog, with focus on the first element Tab reaches, and gives focus back on close", async () => {
    const { fixture, host, el, dialog, open } = await setup();
    await open();
    expect(dialog.matches(":modal")).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(el("first"));

    host.open.set(false);
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(el("opener"));
    fixture.destroy();
  });

  it("starts on the element marked cdkFocusInitial", async () => {
    const { fixture, host, el, open } = await setup();
    host.withAutofocus.set(true);
    await open();
    expect(document.activeElement).toBe(el("marked"));
    fixture.destroy();
  });

  it("wraps Tab from the last element to the first, and Shift+Tab from the first to the last; leaves other Tabs to the browser", async () => {
    const { fixture, el, key, open } = await setup();
    await open();

    el("last").focus();
    expect(key(el("last"), "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el("first"));

    expect(key(el("first"), "Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el("last"));
    // Safari's Alt+Tab, which reaches every button.
    expect(key(el("last"), "Tab", { altKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el("first"));

    el("field").focus();
    expect(key(el("field"), "Tab").defaultPrevented).toBe(false);
    expect(key(el("field"), "Tab", { shiftKey: true }).defaultPrevented).toBe(false);
    fixture.destroy();
  });

  it("asks to close on Escape and stops the browser's own close; not for an Escape a popup inside took", async () => {
    const { fixture, host, el, dialog, key, open } = await setup();
    await open();

    // A select's list or a menu inside: it handles Escape and prevents it.
    const taken = (event: Event) => event.preventDefault();
    el("field").addEventListener("keydown", taken);
    key(el("field"), "Escape");
    expect(host.requests).toBe(0);
    el("field").removeEventListener("keydown", taken);

    // The browser's close request after an Escape: cancelled, the owner decides.
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);

    // A Material tooltip over a button takes Escape on the page's body and stops it there:
    // the dialog has heard it first.
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.body.addEventListener("keydown", swallow);
    expect(key(el("first"), "Escape").defaultPrevented).toBe(true);
    document.body.removeEventListener("keydown", swallow);
    expect(host.requests).toBe(1);
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
    fixture.destroy();
  });

  it("asks to close on Escape with focus on the body, the topmost dialog only", async () => {
    const { fixture, host, el, key, open } = await setup();
    await open();
    el("first").blur();
    expect(document.activeElement).toBe(document.body);
    key(document.body, "Escape");
    expect(host.requests).toBe(1);
    fixture.destroy();
  });

  it("asks to close on a click on the backdrop only when dismissable, and only when the press began there", async () => {
    const { fixture, host, dialog, el, mouse, open } = await setup();
    await open();
    const box = dialog.getBoundingClientRect();
    const outside = [box.left - 5, box.top - 5] as const;

    mouse("pointerdown", ...outside);
    mouse("click", ...outside);
    expect(host.requests).toBe(0);

    host.dismissable.set(true);
    await fixture.whenStable();
    // A drag out of a field: the press was inside.
    mouse("pointerdown", box.left + 5, box.top + 5, el("field"));
    mouse("click", ...outside);
    // A click inside the dialog's own box, between its children.
    mouse("pointerdown", box.left + 1, box.top + 1);
    mouse("click", box.left + 1, box.top + 1);
    expect(host.requests).toBe(0);

    mouse("pointerdown", ...outside);
    mouse("click", ...outside);
    expect(host.requests).toBe(1);
    fixture.destroy();
  });

  it("acts at once on show() and close(), and the binding finds it as it is", async () => {
    const { fixture, host, el, dialog } = await setup();
    const modal = host.modal();
    el("opener").focus();
    modal.show();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(el("first"));
    host.open.set(true);
    await fixture.whenStable();
    expect(dialog.open).toBe(true);

    modal.close();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(el("opener"));
    host.open.set(false);
    await fixture.whenStable();
    // Opened and closed before a render: the binding saw no change, and the dialog is as left.
    modal.show();
    modal.close();
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
    fixture.destroy();
  });

  it("closes when its owner is destroyed while it is open", async () => {
    const { fixture, dialog, open } = await setup();
    await open();
    fixture.destroy();
    expect(dialog.open).toBe(false);
  });
});

describe("keepFocusInDialogs", () => {
  @Component({
    imports: [UiModal],
    template: `
      <dialog uiModal #under="uiModal" (closeRequest)="asked.push('under')"><button type="button">Under</button></dialog>
      <dialog uiModal #over="uiModal" (closeRequest)="asked.push('over')"><button id="over-button" type="button">Over</button></dialog>
    `,
  })
  class Stack {
    readonly under = viewChild.required<UiModal>("under");
    readonly over = viewChild.required<UiModal>("over");
    readonly asked: string[] = [];
  }

  it("gives focus that fell to the page to the dialog still open under the one that closed, and leaves focus that is somewhere alone; Escape on the body is the topmost's", async () => {
    const fixture = TestBed.createComponent(Stack);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const { under, over } = fixture.componentInstance;
    under().show();
    // Opened from an element that is gone by the time it closes.
    const opener = Object.assign(document.createElement("button"), { textContent: "Gone" });
    under().element.append(opener);
    opener.focus();
    over().show();
    opener.remove();

    // Escape with focus on the body is the topmost dialog's.
    (document.activeElement as HTMLElement).blur();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.asked).toEqual(["over"]);

    over().close();
    expect(document.activeElement).toBe(under().element);

    const field = document.createElement("input");
    under().element.append(field);
    field.focus();
    keepFocusInDialogs();
    expect(document.activeElement).toBe(field);
    fixture.destroy();
  });
});
