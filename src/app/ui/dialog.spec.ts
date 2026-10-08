import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, Drawer } from "./dialog";

@Component({
  imports: [Dialog, Drawer],
  template: `
    <button id="opener" (click)="open.set(true)">Open</button>
    <ui-dialog header="Settings" [visible]="open()" (visibleChange)="changes.push($event); open.set($event)" (hide)="hides = hides + 1" [dismissableMask]="dismissable()" width="320px">
      <input id="first" />
      <div uiDialogFooter><button id="save">Save</button></div>
    </ui-dialog>
    <ui-drawer side="right" ariaLabel="Request history" [visible]="drawer()" (visibleChange)="drawer.set($event)" (hide)="drawerHides = drawerHides + 1" width="200px">
      <button id="in-drawer">Close history</button>
    </ui-drawer>
  `,
})
class TestHost {
  readonly open = signal(false);
  readonly dismissable = signal(false);
  readonly drawer = signal(false);
  readonly changes: boolean[] = [];
  hides = 0;
  drawerHides = 0;
}

describe("ui-dialog and ui-drawer", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await fixture.whenStable();
    };
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
    const backdrop = () => document.querySelector<HTMLElement>(".cdk-overlay-backdrop");
    const escape = () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return { fixture, host: fixture.componentInstance, settle, dialog, backdrop, escape };
  }

  afterEach(() => {
    document.querySelectorAll(".cdk-overlay-container").forEach((el) => el.remove());
  });

  it("renders nothing while closed, then a modal dialog named by its header, with body and footer", async () => {
    const { fixture, host, settle, dialog } = await setup();
    expect(dialog()).toBeNull();

    host.open.set(true);
    await settle();

    const el = dialog()!;
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent).toBe("Settings");
    expect(el.querySelector("#first")).not.toBeNull();
    expect(el.querySelector(".ui-dialog-footer #save")).not.toBeNull();
    expect(el.querySelector('button[aria-label="Close"]')).not.toBeNull();
    fixture.destroy();
  });

  it("moves focus inside on open and gives it back to the opener on close", async () => {
    const { fixture, host, settle, dialog } = await setup();
    const opener = fixture.nativeElement.querySelector("#opener") as HTMLButtonElement;
    opener.focus();
    opener.click();
    await settle();

    expect(dialog()!.contains(document.activeElement)).toBe(true);

    host.open.set(false);
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(host.hides).toBe(1);
    fixture.destroy();
  });

  it("asks its owner to close on Escape and on the close button, and reports hide once each time", async () => {
    const { fixture, host, settle, dialog, escape } = await setup();
    host.open.set(true);
    await settle();

    escape();
    await settle();
    expect(host.changes).toEqual([false]);
    expect(dialog()).toBeNull();
    expect(host.hides).toBe(1);

    host.open.set(true);
    await settle();
    dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await settle();
    expect(host.changes).toEqual([false, false]);
    expect(host.hides).toBe(2);
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
    expect(dialog()).not.toBeNull();
    fixture.destroy();
  });

  it("closes on a backdrop click only when dismissableMask is set", async () => {
    const { fixture, host, settle, dialog, backdrop } = await setup();
    host.open.set(true);
    await settle();

    backdrop()!.click();
    await settle();
    expect(dialog()).not.toBeNull();

    host.dismissable.set(true);
    await settle();
    backdrop()!.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(host.changes).toEqual([false]);
    fixture.destroy();
  });

  it("is removed with its owner", async () => {
    const { fixture, host, settle, dialog } = await setup();
    host.open.set(true);
    await settle();

    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(dialog()).toBeNull();
  });

  it("drawer: a labelled modal panel on its side that closes on Escape and on the backdrop", async () => {
    const { fixture, host, settle, dialog, backdrop, escape } = await setup();
    host.drawer.set(true);
    await settle();

    const el = dialog()!;
    expect(el.getAttribute("aria-label")).toBe("Request history");
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(el.closest(".ui-drawer-panel--right")).not.toBeNull();
    expect(el.contains(document.activeElement)).toBe(true);

    escape();
    await settle();
    expect(host.drawer()).toBe(false);
    expect(dialog()).toBeNull();
    expect(host.drawerHides).toBe(1);

    host.drawer.set(true);
    await settle();
    backdrop()!.click();
    await settle();
    expect(host.drawer()).toBe(false);
    expect(host.drawerHides).toBe(2);
    fixture.destroy();
  });
});
