import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { browserLimits, type BrowserLimits } from "@wayfarer/core";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../../state/workspace-store";
import { RequestWarnings } from "./request-warnings";

// What will go wrong with the request, said above it, for the cases no e2e
// page can be in, since the e2e origin is http://.
describe("RequestWarnings (P2.14)", () => {
  const limits = signal<BrowserLimits>(
    browserLimits({ method: "GET", url: "", headers: [] }, { origin: "https://app.example", route: "direct" }),
  );
  const settings = signal<{ tlsInsecure?: boolean }>({});
  const show = (
    request: { method?: string; url: string; headers?: [string, string][] },
    route: "direct" | "bridge" = "direct",
  ) => {
    limits.set(browserLimits({ method: "GET", headers: [], ...request }, { origin: "https://app.example", route }));
    const fixture = TestBed.createComponent(RequestWarnings);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const text = (element: HTMLElement, selector: string) =>
    element.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

  beforeEach(() => {
    settings.set({});
    TestBed.configureTestingModule({
      imports: [RequestWarnings],
      providers: [
        { provide: WorkspaceStore, useValue: { browserLimits: limits, draft: () => ({ settings: settings() }) } },
      ],
    });
  });

  it("shows nothing for a request the browser sends as written", () => {
    expect(show({ url: "https://api.example/" }).textContent?.trim()).toBe("");
  });

  it("shows a red pill while the request's certificate check is off (P6.1)", () => {
    expect(show({ url: "https://api.example/" }).querySelector(".tls-off-pill")).toBeNull();
    settings.set({ tlsInsecure: true });
    expect(text(show({ url: "https://api.example/" }, "bridge"), ".tls-off-pill")).toBe("TLS verification off");
  });

  it("says before the send that an http:// address will be blocked from an HTTPS page", () => {
    const element = show({ url: "http://example.invalid/x" });
    expect(text(element, ".browser-note-mixed")).toContain("The browser will block this request");
    expect(element.querySelector(".browser-note-mixed")?.getAttribute("role")).toBe("status");
  });

  it("names each dropped header", () => {
    expect(
      text(
        show({
          url: "https://api.example/",
          headers: [
            ["Cookie", "a"],
            ["Host", "b"],
          ],
        }),
        ".browser-note-dropped",
      ),
    ).toContain("The browser will not send Cookie, Host: a page is not allowed to set these headers.");
  });

  it("names the headers the Local Bridge sets itself", () => {
    const element = show(
      {
        url: "https://api.example/",
        headers: [
          ["Cookie", "a"],
          ["Host", "b"],
          ["Connection", "close"],
        ],
      },
      "bridge",
    );
    // A Host of the user's is sent since Local Bridge 2.1.0; a header of the bridge's own connection is not.
    expect(text(element, ".browser-note-dropped")).toContain(
      "The Local Bridge will not send Connection: the Local Bridge sets this header itself",
    );
    expect(text(element, ".browser-note-dropped")).not.toContain("Host");
  });
});
