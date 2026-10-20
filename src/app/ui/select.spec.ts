import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UiSelect, type UiSelectOption } from "./select";

type Route = "auto" | "direct" | "bridge";

/** The route's select as the composer has it: an optional choice whose null shows its own label. */
@Component({
  imports: [UiSelect],
  template: `
    <span id="route-label">Route</span>
    <ui-select aria-labelledby="route-label" [options]="routes" [value]="route()" (valueChange)="choose($event)" />
    <ui-select class="env" aria-label="Environment" placeholder="No environment" [options]="environments" [value]="environment()" (valueChange)="environment.set($event)" />
    <button type="button" class="after">After</button>
  `,
  styles: ":host { display: block; padding-top: 8px; }",
})
class TestHost {
  readonly routes: UiSelectOption<Route | null>[] = [
    { value: null, label: "Inherit: Auto" },
    { value: "auto", label: "Auto" },
    { value: "direct", label: "Direct" },
    { value: "bridge", label: "Local Bridge" },
  ];
  readonly route = signal<Route | null>(null);
  readonly chosen: (Route | null)[] = [];
  readonly environments: UiSelectOption<string | null>[] = Array.from({ length: 12 }, (_, i) => ({ value: `e${i}`, label: `Environment ${i}` }));
  readonly environment = signal<string | null>(null);

  choose(route: Route | null): void {
    this.chosen.push(route);
    this.route.set(route);
  }
}

describe("ui-select", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    const root: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    const select = root.querySelector<HTMLElement>("ui-select")!;
    const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    const labels = () => options().map((option) => option.textContent?.trim());
    const active = () => options().find((option) => option.getAttribute("data-active") === "true")?.textContent?.trim();
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await fixture.whenStable();
    };
    /** A key now, with no render before the next: as fast as a test or a macro sends them. */
    const send = (key: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      (document.activeElement as HTMLElement).dispatchEvent(event);
      return event;
    };
    const press = async (key: string, init: KeyboardEventInit = {}) => {
      const event = send(key, init);
      await settle();
      return event;
    };
    return { fixture, host: fixture.componentInstance, root, select, options, labels, active, settle, send, press };
  }

  it("is a combobox named by its label, showing the chosen option's label, with a listbox of options", async () => {
    const { fixture, select, labels, press } = await setup();
    expect(select.getAttribute("role")).toBe("combobox");
    expect(select.getAttribute("aria-labelledby")).toBe("route-label");
    expect(select.getAttribute("aria-haspopup")).toBe("listbox");
    expect(select.getAttribute("aria-expanded")).toBe("false");
    expect(select.getAttribute("tabindex")).toBe("0");
    expect(select.textContent?.trim()).toBe("Inherit: Auto");

    select.focus();
    await press("Enter");
    expect(select.getAttribute("aria-expanded")).toBe("true");
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(select.getAttribute("aria-controls")).toBe(listbox.id);
    expect(listbox.getAttribute("aria-labelledby")).toBe("route-label");
    expect(labels()).toEqual(["Inherit: Auto", "Auto", "Direct", "Local Bridge"]);
    // The null choice is the chosen one, and the list opens on it.
    expect(document.querySelector('[aria-selected="true"]')?.textContent?.trim()).toBe("Inherit: Auto");
    expect(select.getAttribute("aria-activedescendant")).toBe(document.querySelector('[data-active="true"]')?.id);
    expect(document.activeElement).toBe(select);
    fixture.destroy();
  });

  it("is destroyed before its first render without an error", () => {
    // Aria's popup reads its required input when destroyed.
    expect(() => TestBed.createComponent(TestHost).destroy()).not.toThrow();
  });

  it("shows its placeholder for a value no option has", async () => {
    const { fixture, root } = await setup();
    expect(root.querySelector(".env")?.textContent?.trim()).toBe("No environment");
    fixture.destroy();
  });

  it("closed, the arrows, Home, End and a letter choose without opening the list; Alt+ArrowDown opens it", async () => {
    const { fixture, host, select, options, press } = await setup();
    select.focus();
    await press("ArrowDown");
    expect(options()).toEqual([]);
    expect(select.textContent?.trim()).toBe("Auto");
    await press("ArrowRight");
    await press("ArrowUp");
    await press("End");
    expect(select.textContent?.trim()).toBe("Local Bridge");
    // No wrap at the end.
    await press("ArrowDown");
    await press("Home");
    await press("d");
    expect(host.chosen).toEqual(["auto", "direct", "auto", "bridge", null, "direct"]);
    expect(options()).toEqual([]);

    await press("ArrowDown", { altKey: true });
    expect(options()).toHaveLength(4);
    expect(document.activeElement).toBe(select);
    fixture.destroy();
  });

  it("a letter typed again goes on to the next option that starts with it; letters typed together find a word", async () => {
    const { fixture, root, settle, send, press } = await setup();
    const env = root.querySelector<HTMLElement>(".env")!;
    env.focus();
    await press("e");
    expect(env.textContent?.trim()).toBe("Environment 0");
    await press("e");
    expect(env.textContent?.trim()).toBe("Environment 1");
    // A new word: its first letter goes on to the next option, and the letters after it keep it there.
    await new Promise((resolve) => setTimeout(resolve, 600));
    send("e");
    send("n");
    send("v");
    await settle();
    expect(env.textContent?.trim()).toBe("Environment 2");
    fixture.destroy();
  });

  it("Enter and Space open it; Enter chooses the option the keys are on and closes it, with focus on the select", async () => {
    const { fixture, host, select, options, active, press } = await setup();
    select.focus();
    await press(" ");
    expect(options()).toHaveLength(4);
    await press("ArrowDown");
    await press("ArrowDown");
    expect(active()).toBe("Direct");
    await press("Enter");
    expect(options()).toEqual([]);
    expect(host.chosen).toEqual(["direct"]);
    expect(select.textContent?.trim()).toBe("Direct");
    expect(document.activeElement).toBe(select);
    fixture.destroy();
  });

  it("Enter on the option already chosen closes the list and changes nothing", async () => {
    const { fixture, host, select, options, press } = await setup();
    select.focus();
    await press("Enter");
    await press("Enter");
    expect(options()).toEqual([]);
    expect(host.chosen).toEqual([]);
    expect(host.route()).toBeNull();
    fixture.destroy();
  });

  it("keys sent at once after the one that opened it are not lost", async () => {
    const { fixture, host, select, settle, send } = await setup();
    select.focus();
    send("Enter");
    send("End");
    send("Enter");
    await settle();
    expect(host.chosen).toEqual(["bridge"]);
    send("Enter");
    send("Home");
    send("Enter");
    await settle();
    expect(host.chosen).toEqual(["bridge", null]);
    fixture.destroy();
  });

  it("Escape closes the list and changes nothing; Tab chooses the option the keys are on", async () => {
    const { fixture, host, select, options, press } = await setup();
    select.focus();
    await press("Enter");
    await press("ArrowDown");
    const escape = await press("Escape");
    expect(options()).toEqual([]);
    expect(host.chosen).toEqual([]);
    expect(document.activeElement).toBe(select);
    // Stopped: a dialog around it stays open.
    expect(escape.defaultPrevented).toBe(true);

    await press("Enter");
    await press("ArrowDown");
    const tab = await press("Tab");
    expect(options()).toEqual([]);
    expect(host.chosen).toEqual(["auto"]);
    expect(tab.defaultPrevented).toBe(false);
    fixture.destroy();
  });

  it("a click opens it, and a click on an option chooses it; a press in the list does not take focus from the select", async () => {
    const { fixture, host, select, options, settle } = await setup();
    select.focus();
    select.click();
    await settle();
    expect(options()).toHaveLength(4);
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    options()[3].dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    options()[3].click();
    await settle();
    expect(options()).toEqual([]);
    expect(host.chosen).toEqual(["bridge"]);

    select.click();
    await settle();
    select.click();
    await settle();
    expect(options()).toEqual([]);
    fixture.destroy();
  });

  it("a click outside closes it", async () => {
    const { fixture, host, root, select, options, settle } = await setup();
    select.focus();
    select.click();
    await settle();
    const after = root.querySelector<HTMLElement>(".after")!;
    after.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    after.click();
    await settle();
    expect(options()).toEqual([]);
    expect(host.chosen).toEqual([]);
    fixture.destroy();
  });

  it("a list that does not fit below the select opens above it", async () => {
    const { fixture, root, select, settle } = await setup();
    root.style.paddingTop = `${window.innerHeight - 60}px`;
    select.focus();
    select.click();
    await settle();
    const panel = document.querySelector<HTMLElement>(".ui-select-panel")!;
    await Promise.all(panel.getAnimations().map((animation) => animation.finished));
    expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(select.getBoundingClientRect().top);
    fixture.destroy();
  });

  it("the option the keys are on is scrolled into a list too short for it", async () => {
    const { fixture, root, press } = await setup();
    const env = root.querySelector<HTMLElement>(".env")!;
    env.focus();
    await press("Enter");
    await press("End");
    const panel = document.querySelector<HTMLElement>(".ui-select-panel")!;
    const last = [...panel.querySelectorAll<HTMLElement>('[role="option"]')].at(-1)!;
    expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
    expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom + 1);
    fixture.destroy();
  });
});
