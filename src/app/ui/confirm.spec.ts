import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { Confirm } from "./confirm";

describe("Confirm", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
  const alert = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
  const button = (name: string) => Array.from(alert()!.querySelectorAll("button")).find((b) => b.textContent?.trim() === name)!;

  afterEach(() => {
    document.querySelectorAll(".cdk-overlay-container").forEach((el) => el.remove());
  });

  it("shows an alert dialog named by its title and described by its message, with focus on the button that backs out", async () => {
    const service = TestBed.inject(Confirm);
    const answer = service.confirm({ title: "Delete item?", message: "This action cannot be undone. Continue?", acceptLabel: "Delete" });
    await settle();

    const el = alert()!;
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent).toBe("Delete item?");
    expect(document.getElementById(el.getAttribute("aria-describedby")!)?.textContent).toBe("This action cannot be undone. Continue?");
    expect(document.activeElement).toBe(button("Cancel"));

    button("Delete").click();
    expect(await answer).toBe(true);
    await settle();
    expect(alert()).toBeNull();
  });

  it("resolves false on the other button, on Escape and on a click outside; labels default to Proceed and Cancel", async () => {
    const service = TestBed.inject(Confirm);

    let answer = service.confirm({ title: "Are you sure?", message: "Your entire history will be cleared" });
    await settle();
    expect(button("Proceed")).toBeDefined();
    button("Cancel").click();
    expect(await answer).toBe(false);

    answer = service.confirm({ title: "Are you sure?", message: "m" });
    await settle();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    expect(await answer).toBe(false);

    answer = service.confirm({ title: "Are you sure?", message: "m" });
    await settle();
    document.querySelector<HTMLElement>(".cdk-overlay-backdrop")!.click();
    expect(await answer).toBe(false);
  });

  it("with an anchor, shows a small popup named by its message", async () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const service = TestBed.inject(Confirm);

    const answer = service.confirm({ message: "Remove this request from history?", acceptLabel: "Delete", anchor });
    await settle();

    const el = alert()!;
    expect(document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent).toBe("Remove this request from history?");
    expect(el.hasAttribute("aria-describedby")).toBe(false);
    expect(el.closest(".ui-confirm-popup")).not.toBeNull();
    button("Delete").click();
    expect(await answer).toBe(true);
    anchor.remove();
  });
});
