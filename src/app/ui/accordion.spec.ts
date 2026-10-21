import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AccordionContent, AccordionPanel, AccordionTrigger } from "@angular/aria/accordion";
import { describe, expect, it } from "vitest";
import { UiAccordion, UiAccordionPanel } from "./accordion";

type Part = "params" | "headers" | "auth";

/** As the composer holds it on a phone: one open, Headers when nothing else is. */
@Component({
  imports: [AccordionContent, AccordionPanel, AccordionTrigger, UiAccordion, UiAccordionPanel],
  template: `
    <div uiAccordion>
      @for (part of parts; track part) {
        <div class="sections-item">
          <button
            ngAccordionTrigger
            #trigger="ngAccordionTrigger"
            class="section-header"
            [panel]="panel"
            [expanded]="open() === part"
            (expandedChange)="$event ? open.set(part) : closed(part, trigger)"
          >
            {{ part }}
          </button>
          <div
            ngAccordionPanel
            uiAccordionPanel
            #panel="ngAccordionPanel"
            class="section-body"
            [preserveContent]="true"
          >
            <ng-template ngAccordionContent>
              <input [attr.aria-label]="'In ' + part" />
              <button type="button" (click)="pressed.push(part)">Press {{ part }}</button>
            </ng-template>
          </div>
        </div>
      }
    </div>
  `,
})
class TestHost {
  readonly parts: Part[] = ["params", "headers", "auth"];
  readonly open = signal<Part>("headers");
  readonly pressed: Part[] = [];

  closed(part: Part, trigger: { expand(): void }): void {
    if (this.open() !== part) return;
    this.open.set("headers");
    if (part === "headers") trigger.expand();
  }
}

describe("uiAccordion", () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestHost);
    document.body.append(fixture.nativeElement);
    const root: HTMLElement = fixture.nativeElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await fixture.whenStable();
    };
    await settle();
    const header = (part: string) =>
      Array.from(root.querySelectorAll<HTMLButtonElement>(".section-header")).find(
        (h) => h.textContent?.trim() === part,
      )!;
    const field = (part: string) => root.querySelector<HTMLInputElement>(`input[aria-label="In ${part}"]`);
    const open = () =>
      Array.from(root.querySelectorAll(".section-header[aria-expanded='true']")).map((h) => h.textContent?.trim());
    const key = async (target: HTMLElement, key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      await settle();
      return event;
    };
    return { fixture, host: fixture.componentInstance, root, header, field, open, key, settle };
  }

  it("names each panel by its header, and hides a closed one from the page and the keyboard", async () => {
    const { header, root } = await setup();
    const panel = root.querySelector(`#${header("auth").getAttribute("aria-controls")}`)!;
    expect(panel.getAttribute("role")).toBe("region");
    expect(panel.getAttribute("aria-labelledby")).toBe(header("auth").id);
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(getComputedStyle(panel).display).toBe("none");
  });

  it("opens one section at a time: a click and Enter open another, closing the open one falls back to Headers", async () => {
    const { header, open, key, settle } = await setup();
    expect(open()).toEqual(["headers"]);
    header("auth").click();
    await settle();
    expect(open()).toEqual(["auth"]);
    header("params").focus();
    await key(header("params"), "Enter");
    expect(open()).toEqual(["params"]);
    header("params").click();
    await settle();
    expect(open()).toEqual(["headers"]);
    // Headers itself stays open: there is nothing to fall back to.
    header("headers").click();
    await settle();
    expect(open()).toEqual(["headers"]);
  });

  it("moves between the headers with the arrows, Home and End, without wrapping", async () => {
    const { header, key } = await setup();
    header("params").focus();
    await key(header("params"), "ArrowDown");
    expect(document.activeElement).toBe(header("headers"));
    await key(header("headers"), "End");
    expect(document.activeElement).toBe(header("auth"));
    await key(header("auth"), "ArrowDown");
    expect(document.activeElement).toBe(header("auth"));
    await key(header("auth"), "Home");
    expect(document.activeElement).toBe(header("params"));
  });

  it("leaves Space, Enter and the arrows typed inside a panel to what has focus there", async () => {
    const { root, field, open, key } = await setup();
    const input = field("headers")!;
    input.focus();
    for (const name of [" ", "Enter", "ArrowUp", "ArrowDown", "Home", "End"]) {
      expect((await key(input, name)).defaultPrevented, name).toBe(false);
      expect(open()).toEqual(["headers"]);
    }
    expect(document.activeElement).toBe(input);
    // A button in a panel is pressed by Enter: its click is not taken from it.
    const press = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === "Press headers",
    )!;
    expect((await key(press, "Enter")).defaultPrevented).toBe(false);
  });

  it("lets a shortcut with a modifier go on from inside a panel", async () => {
    const { field } = await setup();
    let heard = false;
    const listen = () => (heard = true);
    window.addEventListener("keydown", listen);
    field("headers")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    window.removeEventListener("keydown", listen);
    expect(heard).toBe(true);
  });

  it("makes a panel when it first opens and keeps what was typed in it", async () => {
    const { host, field, settle } = await setup();
    expect(field("auth")).toBeNull();
    const headers = field("headers")!;
    headers.value = "typed";
    host.open.set("auth");
    await settle();
    expect(field("auth")).not.toBeNull();
    host.open.set("headers");
    await settle();
    expect(field("headers")).toBe(headers);
    expect(headers.value).toBe("typed");
  });
});
