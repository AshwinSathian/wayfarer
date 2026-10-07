import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { afterEach, describe, expect, it } from "vitest";
import { SelectComponent } from "./select.component";

@Component({
  imports: [SelectComponent, FormsModule],
  template: `
    <label for="fruit">Fruit</label>
    <ui-select inputId="fruit" [options]="fruits" [ngModel]="fruit()" (ngModelChange)="changes.push($event); fruit.set($event)" placeholder="Pick one" [showClear]="clearable()" [disabled]="disabled()" />
    <ui-select id="methods" [options]="methods" [(ngModel)]="method" ariaLabel="HTTP method" />
    <ui-select id="keyed" [options]="people" optionLabel="name" optionValue="id" [(ngModel)]="person" ariaLabel="Person" />
  `,
})
class HostComponent {
  readonly fruits = ["Apple", "Banana", "Blueberry", "Cherry"];
  readonly fruit = signal<string | null>(null);
  readonly clearable = signal(false);
  readonly disabled = signal(false);
  readonly changes: unknown[] = [];
  readonly methods = [
    { label: "GET", value: "get" },
    { label: "POST", value: "post" },
  ];
  method = "post";
  readonly people = [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ];
  person = 2;
}

describe("ui-select", () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const combo = (id = "fruit") => (id === "fruit" ? root.querySelector<HTMLButtonElement>("#fruit")! : root.querySelector<HTMLButtonElement>(`#${id} [role="combobox"]`)!);
    const options = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    const key = async (target: HTMLElement, key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      await fixture.whenStable();
      return event;
    };
    const active = () => document.getElementById(combo().getAttribute("aria-activedescendant") ?? "")?.textContent?.trim();
    return { fixture, root, combo, options, key, active };
  }

  afterEach(() => {
    document.querySelectorAll(".cdk-overlay-container").forEach((el) => el.remove());
  });

  it("is a combobox named by its label, showing the placeholder until something is chosen", async () => {
    const { fixture, root, combo, options } = await setup();

    expect(combo().getAttribute("role")).toBe("combobox");
    expect(combo().getAttribute("aria-haspopup")).toBe("listbox");
    expect(combo().getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector<HTMLLabelElement>('label[for="fruit"]')?.control).toBe(combo());
    expect(combo().textContent?.trim()).toBe("Pick one");
    expect(options()).toHaveLength(0);
    fixture.destroy();
  });

  it("opens on click, lists the options, and reports the one clicked", async () => {
    const { fixture, combo, options } = await setup();

    combo().click();
    await fixture.whenStable();

    expect(combo().getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(combo().getAttribute("aria-controls")!)?.getAttribute("role")).toBe("listbox");
    expect(options().map((o) => o.textContent?.trim())).toEqual(["Apple", "Banana", "Blueberry", "Cherry"]);

    options()[1].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.changes).toEqual(["Banana"]);
    expect(combo().textContent?.trim()).toBe("Banana");
    expect(combo().getAttribute("aria-expanded")).toBe("false");
    expect(options()).toHaveLength(0);

    // Reopened, the chosen option is marked selected and is the active one.
    combo().click();
    await fixture.whenStable();
    expect(options().map((o) => o.getAttribute("aria-selected"))).toEqual(["false", "true", "false", "false"]);
    expect(combo().getAttribute("aria-activedescendant")).toBe(options()[1].id);
    fixture.destroy();
  });

  it("is driven by the keyboard: arrows, Home, End, Enter, and Space", async () => {
    const { fixture, combo, key, active } = await setup();
    combo().focus();

    await key(combo(), "ArrowDown");
    expect(combo().getAttribute("aria-expanded")).toBe("true");
    expect(active()).toBe("Apple");

    await key(combo(), "ArrowDown");
    await key(combo(), "ArrowDown");
    expect(active()).toBe("Blueberry");
    await key(combo(), "End");
    expect(active()).toBe("Cherry");
    await key(combo(), "ArrowDown");
    expect(active()).toBe("Cherry");
    await key(combo(), "Home");
    await key(combo(), "ArrowUp");
    expect(active()).toBe("Apple");
    await key(combo(), "ArrowDown");

    await key(combo(), "Enter");
    expect(fixture.componentInstance.fruit()).toBe("Banana");
    expect(combo().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(combo());

    await key(combo(), " ");
    await key(combo(), "ArrowDown");
    await key(combo(), " ");
    expect(fixture.componentInstance.fruit()).toBe("Blueberry");
    fixture.destroy();
  });

  it("jumps to the option that starts with what is typed", async () => {
    const { fixture, combo, key, active } = await setup();
    combo().focus();

    await key(combo(), "b");
    expect(combo().getAttribute("aria-expanded")).toBe("true");
    expect(active()).toBe("Banana");
    await key(combo(), "l");
    expect(active()).toBe("Blueberry");
    await key(combo(), "z");
    expect(active()).toBe("Blueberry");
    fixture.destroy();
  });

  it("closes on Escape without letting the key reach a dialog around it, and on blur, changing nothing", async () => {
    const { fixture, combo, key, options } = await setup();
    let reachedDocument = 0;
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") reachedDocument++; };
    document.addEventListener("keydown", listener);
    combo().focus();

    await key(combo(), "ArrowDown");
    await key(combo(), "ArrowDown");
    await key(combo(), "Escape");
    expect(options()).toHaveLength(0);
    expect(reachedDocument).toBe(0);
    expect(fixture.componentInstance.changes).toEqual([]);

    // Closed, Escape is not the select's business any more.
    await key(combo(), "Escape");
    expect(reachedDocument).toBe(1);

    await key(combo(), "ArrowDown");
    combo().blur();
    await fixture.whenStable();
    expect(options()).toHaveLength(0);
    document.removeEventListener("keydown", listener);
    fixture.destroy();
  });

  it("reads objects through label and value by default, or through the named fields", async () => {
    const { fixture, combo, options } = await setup();

    expect(combo("methods").textContent?.trim()).toBe("POST");
    expect(combo("keyed").textContent?.trim()).toBe("Grace");
    // Named by ariaLabel together with the value.
    const names = combo("methods").getAttribute("aria-labelledby")!.split(" ").map((id) => document.getElementById(id)?.textContent?.trim());
    expect(names).toEqual(["HTTP method", "POST"]);

    combo("keyed").click();
    await fixture.whenStable();
    options()[0].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.person).toBe(1);

    combo("methods").click();
    await fixture.whenStable();
    options()[0].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.method).toBe("get");
    fixture.destroy();
  });

  it("offers a clear button only when asked and something is selected", async () => {
    const { fixture, root, combo } = await setup();
    const clear = () => root.querySelector<HTMLButtonElement>('ui-select button[aria-label="Clear selection"]');
    fixture.componentInstance.fruit.set("Cherry");
    await fixture.whenStable();
    expect(clear()).toBeNull();

    fixture.componentInstance.clearable.set(true);
    await fixture.whenStable();
    clear()!.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.changes).toEqual([null]);
    expect(combo().textContent?.trim()).toBe("Pick one");
    expect(clear()).toBeNull();
    fixture.destroy();
  });

  it("does not open while disabled", async () => {
    const { fixture, combo, options, key } = await setup();
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();

    expect(combo().disabled).toBe(true);
    combo().click();
    await key(combo(), "ArrowDown");
    expect(options()).toHaveLength(0);
    fixture.destroy();
  });
});
