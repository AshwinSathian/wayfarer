import { TestBed } from "@angular/core/testing";
import type { VariableChange } from "@wayfarer/core";
import { describe, expect, it } from "vitest";
import { rowsOf } from "../../../testing/request-fixtures";
import { VariablesDialog } from "./variables-dialog";

describe("VariablesDialog", () => {
  async function open(stored: Record<string, string>) {
    const fixture = TestBed.createComponent(VariablesDialog);
    fixture.componentRef.setInput("header", "Global variables");
    fixture.componentRef.setInput("variables", rowsOf(stored));
    fixture.componentRef.setInput("visible", true);
    const saved: VariableChange[][] = [];
    const closed: boolean[] = [];
    fixture.componentInstance.save.subscribe((changes) => saved.push(changes));
    fixture.componentInstance.visibleChange.subscribe((visible) => closed.push(visible));
    await fixture.whenStable();
    const dialog = document.querySelector<HTMLElement>("mat-dialog-container")!;
    const fields = () => [...dialog.querySelectorAll<HTMLInputElement>("input")];
    const type = async (input: HTMLInputElement, text: string) => {
      input.value = text;
      input.dispatchEvent(new Event("input"));
      await fixture.whenStable();
    };
    const press = async (label: string) => {
      [...dialog.querySelectorAll("button")].find((button) => button.textContent?.includes(label) || button.getAttribute("aria-label") === label)!.click();
      await fixture.whenStable();
    };
    return { fixture, dialog, fields, type, press, saved, closed };
  }

  it("shows the stored variables without a send switch, and saves only what was changed", async () => {
    const { dialog, fields, type, press, saved, closed } = await open({ keep: "1", change: "old", gone: "x" });

    expect(fields().map((input) => input.value)).toEqual(["keep", "1", "change", "old", "gone", "x"]);
    expect(dialog.querySelector("mat-checkbox")).toBeNull();

    await type(fields()[3], "new");
    await press("Remove global variables item");
    await press("Add variable");
    await type(fields().at(-2)!, " added ");
    await type(fields().at(-1)!, "+");
    await press("Save variables");

    // "Remove" took the first row.
    expect(saved).toEqual([
      [
        { key: "change", value: "new" },
        { key: "added", value: "+" },
        { key: "keep", value: null },
      ],
    ]);
    expect(closed).toEqual([false]);
  });

  it("starts again from what is stored each time it opens, and Cancel saves nothing", async () => {
    const { fixture, fields, type, press, saved } = await open({ a: "1" });
    await type(fields()[1], "edited");
    await press("Cancel");
    expect(saved).toEqual([]);

    fixture.componentRef.setInput("visible", false);
    await fixture.whenStable();
    fixture.componentRef.setInput("visible", true);
    await fixture.whenStable();
    expect([...document.querySelectorAll<HTMLInputElement>("mat-dialog-container input")].map((input) => input.value)).toEqual(["a", "1"]);
  });
});
