import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UiFile } from "./file";

@Component({
  imports: [UiFile],
  template: `
    <ui-file
      label="File to send as the body"
      accept="application/json"
      [fileName]="name()"
      [disabled]="off()"
      (picked)="picked.push($event); name.set($event.name)"
      (cleared)="name.set('')"
    />
  `,
})
class TestHost {
  readonly name = signal("");
  readonly off = signal(false);
  readonly picked: File[] = [];
}

// D3.5, U-059: what the field does that the browser's input does not.
describe("UiFile", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const field = host.querySelector("ui-file") as HTMLElement;
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const buttons = () =>
      [...field.querySelectorAll("button")].map(
        (button) => button.textContent?.trim() || button.getAttribute("aria-label"),
      );
    return { fixture, field, input, buttons, host: fixture.componentInstance };
  }
  const file = (name: string) => new File(["{}"], name, { type: "application/json" });
  const choose = (input: HTMLInputElement, chosen: File) => {
    const files = new DataTransfer();
    files.items.add(chosen);
    input.files = files.files;
    input.dispatchEvent(new Event("change"));
  };
  const drag = (field: HTMLElement, type: "dragover" | "drop", chosen?: File) => {
    const data = new DataTransfer();
    if (chosen) data.items.add(chosen);
    const event = new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true });
    field.dispatchEvent(event);
    return event;
  };

  it("is the platform's input, hidden and named, with none of the browser's words", async () => {
    const { field, input, buttons } = await setup();
    expect(getComputedStyle(input).display).toBe("none");
    expect(input.getAttribute("aria-label")).toBe("File to send as the body");
    expect(input.accept).toBe("application/json");
    expect(field.textContent).not.toContain("No file chosen");
    expect(buttons()).toEqual(["Choose a file…"]);
  });

  it("names the file chosen, and the same file chosen again is a change", async () => {
    const { fixture, field, input, buttons, host } = await setup();
    choose(input, file("pets.json"));
    await fixture.whenStable();
    expect(field.querySelector(".ui-file-name")?.textContent).toBe("pets.json");
    expect(buttons()).toEqual(["Choose another…", "Remove pets.json"]);
    expect(input.value).toBe("");
    choose(input, file("pets.json"));
    expect(host.picked.map((picked) => picked.name)).toEqual(["pets.json", "pets.json"]);
  });

  it("takes a dropped file, and is marked while one is dragged over it", async () => {
    const { fixture, field, host } = await setup();
    const over = drag(field, "dragover", file("dropped.json"));
    await fixture.whenStable();
    // Prevented, or the browser would open the file in the tab.
    expect(over.defaultPrevented).toBe(true);
    expect(field.classList).toContain("ui-file-over");
    const drop = drag(field, "drop", file("dropped.json"));
    await fixture.whenStable();
    expect(drop.defaultPrevented).toBe(true);
    expect(field.classList).not.toContain("ui-file-over");
    expect(host.picked.map((picked) => picked.name)).toEqual(["dropped.json"]);
  });

  it("is emptied by its remove button", async () => {
    const { fixture, field, input, buttons } = await setup();
    choose(input, file("pets.json"));
    await fixture.whenStable();
    (field.querySelector('button[aria-label="Remove pets.json"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(buttons()).toEqual(["Choose a file…"]);
    // The remove button went: focus is on the button that chooses one.
    expect(document.activeElement?.textContent?.trim()).toBe("Choose a file…");
  });

  it("disabled, takes no drop and its buttons are disabled", async () => {
    const { fixture, field, host } = await setup();
    host.off.set(true);
    await fixture.whenStable();
    expect(drag(field, "dragover", file("x.json")).defaultPrevented).toBe(false);
    drag(field, "drop", file("x.json"));
    expect(host.picked).toEqual([]);
    expect([...field.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
  });
});
