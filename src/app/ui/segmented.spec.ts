import { Component, computed, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UiSegmented, type UiSegment } from "./segmented";

type Format = "wayfarer" | "postman";
type Mode = "strip" | "references" | "plain";

/** As the environments' export dialog holds them: two groups, and the second's options depend on the first. */
@Component({
  imports: [UiSegmented],
  template: `
    <ui-segmented aria-label="File for" [options]="formats" [value]="format()" (valueChange)="setFormat($event)" />
    <ui-segmented
      aria-label="Protected variables"
      [options]="modes()"
      [value]="mode()"
      (valueChange)="mode.set($event)"
    />
  `,
})
class TestHost {
  readonly formats: UiSegment<Format>[] = [
    { value: "wayfarer", label: "Wayfarer" },
    { value: "postman", label: "Postman", icon: "download" },
  ];
  readonly format = signal<Format>("wayfarer");
  readonly mode = signal<Mode>("references");
  readonly modes = computed<UiSegment<Mode>[]>(() => [
    { value: "strip", label: "Leave out" },
    ...(this.format() === "wayfarer" ? [{ value: "references" as const, label: "With the vault" }] : []),
    { value: "plain", label: "Plain text" },
  ]);

  setFormat(format: Format): void {
    this.format.set(format);
    if (format === "postman" && this.mode() === "references") this.mode.set("strip");
  }
}

describe("ui-segmented", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    const root: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    const group = (name: string) => root.querySelector(`[aria-label="${name}"]`) as HTMLElement;
    const radio = (group: HTMLElement, label: string) =>
      [...group.querySelectorAll("label")]
        .find((option) => option.textContent?.trim() === label)
        ?.querySelector("input") as HTMLInputElement;
    const checked = (group: HTMLElement) =>
      [...group.querySelectorAll("label")]
        .filter((option) => option.querySelector("input")?.checked)
        .map((option) => option.textContent?.trim());
    return { fixture, host: fixture.componentInstance, group, radio, checked };
  }

  it("is a radio group of radio buttons named by their text, the value's checked", async () => {
    const { group, radio, checked } = await setup();
    const formats = group("File for");
    expect(formats.getAttribute("role")).toBe("radiogroup");
    expect([...formats.querySelectorAll("input")].map((input) => input.type)).toEqual(["radio", "radio"]);
    expect(radio(formats, "Postman").labels?.[0]?.textContent?.trim()).toBe("Postman");
    expect(formats.querySelector("app-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(checked(formats)).toEqual(["Wayfarer"]);
    expect(checked(group("Protected variables"))).toEqual(["With the vault"]);
  });

  it("tells its user of a choice, and follows a value set by code", async () => {
    const { fixture, host, group, radio, checked } = await setup();
    const modes = group("Protected variables");
    radio(modes, "Plain text").click();
    await fixture.whenStable();
    expect(host.mode()).toBe("plain");
    expect(checked(modes)).toEqual(["Plain text"]);
    host.mode.set("strip");
    await fixture.whenStable();
    expect(checked(modes)).toEqual(["Leave out"]);
  });

  // Each group has a name of its own: with one name for both, the browser
  // took them as one group, and choosing a format unchecked the mode.
  it("keeps two groups apart", async () => {
    const { fixture, group, radio, checked } = await setup();
    const [formats, modes] = [group("File for"), group("Protected variables")];
    expect(radio(formats, "Wayfarer").name).not.toBe(radio(modes, "Leave out").name);
    radio(modes, "Plain text").click();
    await fixture.whenStable();
    expect([checked(formats), checked(modes)]).toEqual([["Wayfarer"], ["Plain text"]]);
  });

  // The browser's arrows: in WebKit they stopped at the ends, where WAI-ARIA's wrap.
  it("moves and chooses with the arrows, wrapping at both ends", async () => {
    const { fixture, host, group, radio, checked } = await setup();
    const modes = group("Protected variables");
    const press = (from: HTMLInputElement, key: string, shiftKey = false) => {
      from.focus();
      const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
      from.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press(radio(modes, "Plain text"), "ArrowRight")).toBe(true);
    await fixture.whenStable();
    expect([host.mode(), checked(modes), document.activeElement]).toEqual([
      "strip",
      ["Leave out"],
      radio(modes, "Leave out"),
    ]);
    expect(press(radio(modes, "Leave out"), "ArrowUp")).toBe(true);
    await fixture.whenStable();
    expect([host.mode(), checked(modes)]).toEqual(["plain", ["Plain text"]]);
    expect(press(radio(modes, "Plain text"), "ArrowLeft")).toBe(true);
    await fixture.whenStable();
    expect([host.mode(), checked(modes), document.activeElement]).toEqual([
      "references",
      ["With the vault"],
      radio(modes, "With the vault"),
    ]);
    // A modified key is not the group's.
    expect(press(radio(modes, "With the vault"), "ArrowRight", true)).toBe(false);
    await fixture.whenStable();
    expect(host.mode()).toBe("references");
  });

  it("checks the value among options that changed", async () => {
    const { fixture, host, group, radio, checked } = await setup();
    radio(group("File for"), "Postman").click();
    await fixture.whenStable();
    expect(host.mode()).toBe("strip");
    expect(checked(group("Protected variables"))).toEqual(["Leave out"]);
    expect(radio(group("Protected variables"), "With the vault")).toBeUndefined();
  });
});
