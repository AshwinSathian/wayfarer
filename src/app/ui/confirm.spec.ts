import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { Confirm } from "./confirm";

describe("Confirm", () => {
  const alert = () => document.querySelector<HTMLDialogElement>('dialog[role="alertdialog"]');
  const button = (name: string) =>
    Array.from(alert()!.querySelectorAll("button")).find((b) => b.textContent?.trim() === name)!;
  const outside = (type: string) =>
    alert()!.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 1, clientY: 1 }));

  it("shows a modal alert dialog named by its title and described by its message, with focus on the button that backs out, and gives focus back", async () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.focus();
    const answer = TestBed.inject(Confirm).confirm({
      title: "Delete item?",
      message: "This action cannot be undone. Continue?",
      acceptLabel: "Delete",
    });

    const el = alert()!;
    expect(el.matches(":modal")).toBe(true);
    expect(document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent).toBe("Delete item?");
    expect(document.getElementById(el.getAttribute("aria-describedby")!)?.textContent).toBe(
      "This action cannot be undone. Continue?",
    );
    expect(document.activeElement).toBe(button("Cancel"));

    button("Delete").click();
    expect(await answer).toBe(true);
    expect(alert()).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("resolves false on the other button, on Escape and on a click outside; labels default to Proceed and Cancel", async () => {
    const service = TestBed.inject(Confirm);

    let answer = service.confirm({ title: "Are you sure?", message: "Your entire history will be cleared" });
    expect(button("Proceed")).toBeDefined();
    button("Cancel").click();
    expect(await answer).toBe(false);

    answer = service.confirm({ title: "Are you sure?", message: "m" });
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(await answer).toBe(false);

    answer = service.confirm({ title: "Are you sure?", message: "m" });
    outside("pointerdown");
    outside("click");
    expect(await answer).toBe(false);
    expect(alert()).toBeNull();
  });

  it("with an anchor, shows a small popup named by its message under the button, or above it with no room below", async () => {
    const anchor = document.createElement("button");
    anchor.style.cssText = "position: fixed; left: 200px; top: 100px; width: 40px; height: 20px";
    document.body.append(anchor);
    const service = TestBed.inject(Confirm);

    let answer = service.confirm({ message: "Remove this request from history?", acceptLabel: "Delete", anchor });
    const el = alert()!;
    expect(el.classList).toContain("ui-confirm-popup");
    expect(document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent).toBe(
      "Remove this request from history?",
    );
    expect(el.hasAttribute("aria-describedby")).toBe(false);
    // Where it is laid out: it is still growing into place.
    expect(el.offsetTop).toBe(130);
    // offsetLeft is whole pixels: half the width may not be.
    expect(Math.abs(el.offsetLeft + el.offsetWidth / 2 - 220)).toBeLessThanOrEqual(1);
    button("Delete").click();
    expect(await answer).toBe(true);

    anchor.style.top = `${innerHeight - 30}px`;
    answer = service.confirm({ message: "m", anchor });
    expect(alert()!.offsetTop + alert()!.offsetHeight).toBe(innerHeight - 40);
    button("Cancel").click();
    expect(await answer).toBe(false);
    anchor.remove();
  });
});
