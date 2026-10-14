import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { browserLimits, type BrowserLimits } from "@wayfarer/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  const settings = signal<{ followRedirects?: boolean; tlsInsecure?: boolean; route?: "auto" | "direct" | "bridge" }>({});
  const setFollowRedirects = vi.fn();
  const setTlsInsecure = vi.fn();

  beforeEach(() => {
    settings.set({});
    setFollowRedirects.mockClear();
    TestBed.configureTestingModule({
      imports: [BrowserNotes],
      providers: [{ provide: WorkspaceStore, useValue: { browserLimits: limits, draft: () => ({ settings: settings() }), inheritedRoute: () => "auto", setFollowRedirects, setTlsInsecure, setRoute: vi.fn() } }],
    });
  });

  it("shows the request's route: the one it inherits, and what it is now, until it names its own (P6.4)", async () => {
    const fixture = TestBed.createComponent(BrowserNotes);
    const shown = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return text(fixture.nativeElement as HTMLElement, ".request-route .mat-mdc-select-value");
    };
    expect(await shown()).toBe("Inherit: Auto");

    settings.set({ route: "direct" });
    expect(await shown()).toBe("Direct");
  });

  it("offers Follow redirects, on unless the request says no, and says what each route does with it (P5.4)", () => {
    const direct = show({ url: "https://api.example/" });
    const box = direct.querySelector<HTMLInputElement>(".follow-redirects input[type=checkbox]");
    expect(box?.checked).toBe(true);
    expect(text(direct, ".follow-redirects")).toContain("Sent directly, a request is always followed");
    box?.click();
    expect(setFollowRedirects).toHaveBeenCalledWith(false);

    settings.set({ followRedirects: false });
    const bridge = show({ url: "https://api.example/" }, "bridge");
    expect(bridge.querySelector<HTMLInputElement>(".follow-redirects input[type=checkbox]")?.checked).toBe(false);
    expect(text(bridge, ".follow-redirects")).toContain("Through the Local Bridge each one is listed");
  });

  it("offers not to verify the certificate, off unless the request says so, with a red pill when on, and says that only the bridge can (P6.1)", () => {
    const direct = show({ url: "https://api.example/" });
    const box = direct.querySelector<HTMLInputElement>(".tls-insecure input[type=checkbox]");
    expect(box?.checked).toBe(false);
    expect(direct.querySelector(".tls-insecure .tls-off-pill")).toBeNull();
    expect(text(direct, ".tls-insecure")).toContain("Only the Local Bridge can");
    box?.click();
    expect(setTlsInsecure).toHaveBeenCalledWith(true);

    settings.set({ tlsInsecure: true });
    const bridge = show({ url: "https://api.example/" }, "bridge");
    expect(bridge.querySelector<HTMLInputElement>(".tls-insecure input[type=checkbox]")?.checked).toBe(true);
    expect(text(bridge, ".tls-insecure .tls-off-pill")).toBe("TLS verification off");
    expect(text(bridge, ".tls-insecure")).toContain("the Local Bridge accepts any certificate");
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
    const element = show({ url: "https://api.example/", headers: [["Cookie", "a"], ["Host", "b"], ["Connection", "close"]] }, "bridge");
    // A Host of the user's is sent since Local Bridge 2.1.0; a header of the bridge's own connection is not.
    expect(text(element, ".browser-note-dropped")).toContain("The Local Bridge will not send Connection: the Local Bridge sets this header itself");
    expect(text(element, ".browser-note-dropped")).not.toContain("Host");
  });
});
