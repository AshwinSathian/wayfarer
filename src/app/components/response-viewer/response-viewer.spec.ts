import { BinaryBody, parseJson } from "@wayfarer/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { ResponseViewer } from "./response-viewer";
import { ResponseInspection } from "../../shared/inspect/response-inspector";
import { JsonWorkerClient } from "../../shared/json-worker/json-worker-client";
import { describe, it, beforeEach, expect, vi } from "vitest";

class JsonWorkerServiceStub {
  parsePretty = vi.fn()
    .mockImplementation(async (input: string, indent = 4) => {
      const parsed = parseJson(input);
      return parsed.ok ? JSON.stringify(parsed.value, null, indent) : input;
    });
  minify = vi.fn()
    .mockImplementation(async (input: string) => input);
  search = vi.fn()
    .mockImplementation(async (_input: string, _query: string) => ({
      count: 0,
      excerpts: [],
    }));
}

describe("ResponseViewer", () => {
  let component: ResponseViewer;
  let fixture: ComponentFixture<ResponseViewer>;

  beforeEach(async () => {
    const jsonWorkerStub = new JsonWorkerServiceStub();

    await TestBed.configureTestingModule({
      imports: [ResponseViewer],
      providers: [{ provide: JsonWorkerClient, useValue: jsonWorkerStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(ResponseViewer);
    component = fixture.componentInstance;
  });

  it("updates the active tab model signal", () => {
    component.onTabChange("headers");

    expect(component.activeTab()).toBe("headers");
  });

  it("returns empty timing bars when inspection is missing", () => {
    fixture.componentRef.setInput('inspection', signal<ResponseInspection | null>(null));

    expect(component.hasGranularTimings()).toBe(false);
    expect(component.getFallbackBars()).toEqual([]);
  });

  it("builds timing bars from inspection phases", () => {
    const inspection: ResponseInspection = {
      id: "req-1",
      url: "https://example.com",
      startTime: 5,
      startEpoch: 5,
      endTime: 65,
      duration: 60,
      phases: {
        dns: 10,
        tcp: 15,
        content: 35,
      },
    };

    fixture.componentRef.setInput('inspection', signal(inspection));

    const bars = component.getTimingBars();
    expect(bars.length).toBe(3);
    expect(bars[0].label).toBe("DNS");
    expect(bars[1].label).toBe("TCP");
    expect(component.hasGranularTimings()).toBe(true);
  });

  describe("views (P2.13)", () => {
    const set = (inputs: Record<string, unknown>) => {
      for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
      fixture.detectChanges();
    };
    const element = () => fixture.nativeElement as HTMLElement;

    it("lists a header sent twice as two rows", () => {
      set({
        responseStatusCode: 200,
        activeTab: "headers",
        responseHeaders: [
          { name: "set-cookie", value: "a=1" },
          { name: "set-cookie", value: "b=2" },
        ],
      });
      expect([...element().querySelectorAll("table.ds-table td")].map((cell) => cell.textContent)).toEqual(["a=1", "b=2"]);
    });

    it("says that the browser withheld headers only when it did", () => {
      set({ responseStatusCode: 200, activeTab: "headers", responseHeaders: [{ name: "content-type", value: "text/plain" }] });
      expect(element().querySelector(".headers-note")).toBeNull();
      set({ headersLimited: true });
      expect(element().querySelectorAll(".headers-note").length).toBe(1);
    });

    it("chooses the view from the content type and goes back to it for the next response", () => {
      set({ responseStatusCode: 200, responseData: "<a><b>1</b></a>", responseContentType: "application/xml" });
      expect(component.view()).toBe("xml");
      expect(component.xmlText()).toBe("<a>\n  <b>1</b>\n</a>");
      component.viewOverride.set("text");
      expect(component.view()).toBe("text");

      set({ responseData: "<c/>" });
      expect(component.view()).toBe("xml");
    });

    it("shows the body of an error status in the view of its type", () => {
      set({ responseStatusCode: 404, isError: true, responseError: "<h1>Not found</h1>", responseContentType: "text/html" });
      expect(component.view()).toBe("html");
      expect(element().querySelector("iframe.html-preview")?.getAttribute("sandbox")).toBe("");
    });

    it("filters a JSON body by path", () => {
      set({ responseStatusCode: 200, responseBodyIsJson: true, responseData: '{"items":[{"id":1},{"id":2}]}', responseContentType: "application/json" });
      expect(component.filteredJson()).toBeNull();
      component.jsonFilter.set("items[*].id");
      expect(JSON.parse(component.filteredJson() ?? "")).toEqual([1, 2]);
      component.jsonFilter.set("items.constructor");
      expect(component.filteredJson()).toBe("");
    });

    it("revokes an image's blob: URL when the response changes and when the viewer goes", () => {
      const revoke = vi.spyOn(URL, "revokeObjectURL");
      const png = (byte: number) => new BinaryBody(new Uint8Array([0x89, 0x50, 0x4e, 0x47, byte]).buffer, "image/png");
      set({ responseStatusCode: 200, responseBinary: png(1) });
      const first = component.imageUrl();
      expect(first).toMatch(/^blob:/);
      expect(element().querySelector("img.response-image")?.getAttribute("src")).toBe(first);

      set({ responseBinary: png(2) });
      const second = component.imageUrl();
      expect(second).not.toBe(first);
      expect(revoke).toHaveBeenCalledWith(first);

      component.viewOverride.set("hex");
      fixture.detectChanges();
      expect(revoke).toHaveBeenCalledWith(second);
      expect(component.imageUrl()).toBeNull();
      expect(element().querySelector("pre.hex-dump")?.textContent).toContain("89 50 4e 47 02");

      component.viewOverride.set("image");
      fixture.detectChanges();
      const third = component.imageUrl();
      fixture.destroy();
      expect(revoke).toHaveBeenCalledWith(third);
      revoke.mockRestore();
    });

    it("never gives a binary body to the page as HTML or SVG", () => {
      set({ responseStatusCode: 200, responseBinary: new BinaryBody(new Uint8Array([60, 104, 49, 62]).buffer, "text/html") });
      expect(component.views()).toEqual(["hex"]);
      expect(component.imageUrl()).toBeNull();
    });
  });
});
