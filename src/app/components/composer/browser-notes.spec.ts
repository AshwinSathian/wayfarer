import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { browserLimits, type BrowserLimits } from "@wayfarer/core";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../../state/workspace-store";
import { BrowserNotes } from "./browser-notes";

// The statements themselves are tested in core (browser-limits.spec.ts) and
// against real browsers in e2e/browser-limits.spec.ts. Here: what the panel
// says for the cases no e2e page can be in, since the e2e origin is http://.
describe("BrowserNotes (P2.14)", () => {
  const limits = signal<BrowserLimits>(browserLimits({ method: "GET", url: "", headers: [] }, { origin: "https://app.example", route: "direct" }));
  const show = (request: { method?: string; url: string; headers?: [string, string][] }, route: "direct" | "bridge" = "direct") => {
    limits.set(browserLimits({ method: "GET", headers: [], ...request }, { origin: "https://app.example", route }));
    const fixture = TestBed.createComponent(BrowserNotes);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const text = (element: HTMLElement, selector: string) => element.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BrowserNotes], providers: [{ provide: WorkspaceStore, useValue: { browserLimits: limits } }] });
  });

  it("says before the send that an http:// address will be blocked from an HTTPS page", () => {
    const element = show({ url: "http://example.invalid/x" });
    expect(text(element, ".browser-note-mixed")).toContain("The browser will block this request");
    expect(element.querySelector(".browser-note-mixed")?.getAttribute("role")).toBe("status");
  });

  it("says that an http:// address on this machine works in some browsers", () => {
    expect(text(show({ url: "http://localhost:3000/" }), ".browser-note-mixed")).toContain("Chrome and Firefox allow that, Safari does not");
  });

  it("names each dropped header", () => {
    expect(text(show({ url: "https://api.example/", headers: [["Cookie", "a"], ["Host", "b"]] }), ".browser-note-dropped")).toContain(
      "The browser will not send Cookie, Host: a page is not allowed to set these headers."
    );
  });

  it("gives every reason for a preflight", () => {
    const element = show({ method: "PUT", url: "https://api.example/", headers: [["Authorization", "x"]] });
    expect(text(element, ".browser-note-preflight")).toContain("because of the method PUT, the header Authorization.");
  });

  it("says nothing of the browser's limits when the Local Bridge sends the request", () => {
    const element = show({ method: "PUT", url: "http://example.invalid/", headers: [["Cookie", "a"]] }, "bridge");
    expect(text(element, ".browser-note-bridge")).toContain("the Local Bridge is on");
    for (const selector of [".browser-note-mixed", ".browser-note-dropped", ".browser-note-preflight", ".browser-note-adds"]) {
      expect(element.querySelector(selector)).toBeNull();
    }
  });

  it("names the headers the Local Bridge sets itself", () => {
    const element = show({ url: "https://api.example/", headers: [["Cookie", "a"], ["Host", "b"]] }, "bridge");
    expect(text(element, ".browser-note-dropped")).toContain("The Local Bridge will not send Host: the Local Bridge sets this header itself");
  });
});
