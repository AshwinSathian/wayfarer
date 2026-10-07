import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { UI_ACCORDION } from "./accordion.component";

@Component({
  imports: [UI_ACCORDION],
  template: `
    <ui-accordion id="controlled" [value]="open()" (valueChange)="changes.push($event); open.set($event ?? 'a')">
      <ui-accordion-panel value="a"><ui-accordion-header>A</ui-accordion-header><ui-accordion-content><button>in a</button></ui-accordion-content></ui-accordion-panel>
      <ui-accordion-panel value="b"><ui-accordion-header>B</ui-accordion-header><ui-accordion-content>in b</ui-accordion-content></ui-accordion-panel>
    </ui-accordion>
    <ui-accordion id="free">
      <ui-accordion-panel [value]="1"><ui-accordion-header>One</ui-accordion-header><ui-accordion-content>in one</ui-accordion-content></ui-accordion-panel>
    </ui-accordion>
  `,
})
class HostComponent {
  readonly open = signal<string | number>("a");
  readonly changes: (string | number | null)[] = [];
}

describe("ui-accordion", () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const headers = (id: string) => Array.from(root.querySelectorAll<HTMLButtonElement>(`#${id} button.ui-accordion-header`));
    const regions = (id: string) => Array.from(root.querySelectorAll<HTMLElement>(`#${id} [role="region"]`));
    return { fixture, headers, regions };
  }

  it("opens one panel at a time and links each header to its region", async () => {
    const { fixture, headers, regions } = await setup();

    expect(headers("controlled").map((h) => h.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    expect(regions("controlled").map((r) => r.hasAttribute("inert"))).toEqual([false, true]);
    for (const [i, header] of headers("controlled").entries()) {
      expect(header.getAttribute("aria-controls")).toBe(regions("controlled")[i].id);
      expect(regions("controlled")[i].getAttribute("aria-labelledby")).toBe(header.id);
    }

    headers("controlled")[1].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.changes).toEqual(["b"]);
    expect(headers("controlled").map((h) => h.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
    expect(regions("controlled").map((r) => r.hasAttribute("inert"))).toEqual([true, false]);
    fixture.destroy();
  });

  it("reports null when the open panel is closed, and follows the value its owner sets in reply", async () => {
    const { fixture, headers } = await setup();

    headers("controlled")[1].click();
    await fixture.whenStable();
    headers("controlled")[1].click();
    await fixture.whenStable();

    // The host answers null with "a", as the composer answers with "headers".
    expect(fixture.componentInstance.changes).toEqual(["b", null]);
    expect(headers("controlled").map((h) => h.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    fixture.destroy();
  });

  it("starts closed and keeps its own state when no value is bound", async () => {
    const { fixture, headers, regions } = await setup();

    expect(headers("free")[0].getAttribute("aria-expanded")).toBe("false");
    expect(regions("free")[0].hasAttribute("inert")).toBe(true);

    headers("free")[0].click();
    await fixture.whenStable();
    expect(headers("free")[0].getAttribute("aria-expanded")).toBe("true");

    headers("free")[0].click();
    await fixture.whenStable();
    expect(headers("free")[0].getAttribute("aria-expanded")).toBe("false");
    fixture.destroy();
  });
});
