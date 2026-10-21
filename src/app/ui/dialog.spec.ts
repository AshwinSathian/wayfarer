import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { Dialog } from "./dialog";

@Component({
  imports: [Dialog],
  template: `
    <button id="opener" (click)="open.set(true)">Open</button>
    <ui-dialog
      header="Settings"
      [visible]="open()"
      (visibleChange)="changes.push($event); open.set($event)"
      (hide)="hides = hides + 1; onHide()"
      [dismissableMask]="dismissable()"
      width="320px"
    >
      <input id="first" />
      <div uiDialogFooter><button id="save">Save</button></div>
    </ui-dialog>
  `,
})
class TestHost {
  readonly open = signal(false);
  readonly dismissable = signal(false);
  readonly changes: boolean[] = [];
  readonly shown = signal("");
  hides = 0;
  onHide = () => undefined as void;
}

describe("ui-dialog", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const settle = async () => {
      await fixture.whenStable();
      // The browser's close event comes in a task of its own.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await fixture.whenStable();
    };
    const dialog = () => document.querySelector<HTMLDialogElement>("dialog.ui-dialog")!;
    const escape = () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    return { fixture, host: fixture.componentInstance, settle, dialog, escape };
  }

  it("holds nothing while closed, then a modal dialog named by its header, with body and footer", async () => {
    const { fixture, host, settle, dialog } = await setup();
    expect(dialog().open).toBe(false);
    expect(dialog().querySelector("#first")).toBeNull();

    host.open.set(true);
    await settle();

    const el = dialog();
    expect(el.matches(":modal")).toBe(true);
    expect(document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent).toBe("Settings");
    expect(el.querySelector(".dialog-content #first")).not.toBeNull();
    expect(el.querySelector(".dialog-footer #save")).not.toBeNull();
    expect(el.style.width).toBe("320px");
    // Its first element is the header's Close, as Material's was.
    expect(document.activeElement).toBe(el.querySelector('button[aria-label="Close"]'));
    fixture.destroy();
  });

  it("asks its owner to close on Escape and on the close button, and reports hide once each time", async () => {
    const { fixture, host, settle, dialog, escape } = await setup();
    host.open.set(true);
    await settle();

    escape();
    await settle();
    expect(host.changes).toEqual([false]);
    expect(dialog().open).toBe(false);
    expect(host.hides).toBe(1);

    host.open.set(true);
    await settle();
    dialog().querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await settle();
    expect(host.changes).toEqual([false, false]);
    expect(host.hides).toBe(2);
    fixture.destroy();
  });

  it("closes in the task of the Escape or the click that asked, so the page takes the next key", async () => {
    const { fixture, host, settle, dialog, escape } = await setup();
    host.open.set(true);
    await settle();
    escape();
    expect(dialog().open).toBe(false);

    host.open.set(true);
    await settle();
    dialog().querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    expect(dialog().open).toBe(false);
    fixture.destroy();
  });

  it("reports hide in the task that closed it, so an owner that reopens it at once keeps it open", async () => {
    const { fixture, host, settle, dialog } = await setup();
    host.open.set(true);
    await settle();
    // What the import does: its hide ends the import shown; a second file opens the dialog again at once.
    host.onHide = () => host.shown.set("");
    host.shown.set("first");
    host.open.set(false);
    await fixture.whenStable();
    host.shown.set("second");
    host.open.set(true);
    await settle();
    expect(dialog().open).toBe(true);
    expect(host.shown()).toBe("second");
    fixture.destroy();
  });

  it("stays in step with an owner that reopens it before the close has been rendered", async () => {
    const { fixture, host, settle, dialog, escape } = await setup();
    host.open.set(true);
    await settle();

    escape();
    host.open.set(true);
    await settle();

    expect(host.open()).toBe(true);
    expect(dialog().open).toBe(true);
    fixture.destroy();
  });

  it("closes on a backdrop click only when dismissableMask is set", async () => {
    const { fixture, host, settle, dialog } = await setup();
    host.open.set(true);
    await settle();
    const backdrop = (type: string) =>
      dialog().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 2, clientY: 2 }));

    backdrop("pointerdown");
    backdrop("click");
    await settle();
    expect(dialog().open).toBe(true);

    host.dismissable.set(true);
    await settle();
    backdrop("pointerdown");
    backdrop("click");
    await settle();
    expect(dialog().open).toBe(false);
    expect(host.changes).toEqual([false]);
    fixture.destroy();
  });
});
