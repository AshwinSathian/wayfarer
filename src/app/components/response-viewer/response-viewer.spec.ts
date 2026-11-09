import { BinaryBody, parseJson, type ExchangeRecord } from "@wayfarer/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { ResponseViewer, type ResponseExportContext } from "./response-viewer";
import { ResponseInspection } from "../../shared/inspect/response-inspector";
import { JsonWorkerClient } from "../../shared/json-worker/json-worker-client";
import { describe, it, beforeEach, expect, vi } from "vitest";

class JsonWorkerServiceStub {
  parsePretty = vi.fn().mockImplementation(async (input: string, indent = 4) => {
    const parsed = parseJson(input);
    return parsed.ok ? JSON.stringify(parsed.value, null, indent) : input;
  });
  minify = vi.fn().mockImplementation(async (input: string) => input);
  search = vi.fn().mockImplementation(async (_input: string, _query: string) => ({
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

  it("a response got with the certificate not verified says so in a red pill; any other has none (P6.1)", () => {
    fixture.componentRef.setInput("responseStatusCode", 200);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".tls-off-pill")).toBeNull();
    fixture.componentRef.setInput("tlsInsecure", true);
    fixture.detectChanges();
    expect(element.querySelector(".tls-off-pill")?.textContent?.trim()).toBe("Certificate not checked");
  });

  // D5-e (V1): while a request is out the last response stays. For its first second nothing changes (D3.7); then the
  // status line says it is sending, with a spinner and the time so far, and the old response under it is dimmed.
  describe("while a request is on its way", () => {
    const element = () => fixture.nativeElement as HTMLElement;
    const sending = (since: number) => {
      fixture.componentRef.setInput("loading", true);
      fixture.componentRef.setInput("sendingSince", since);
      fixture.detectChanges();
    };

    beforeEach(() => {
      fixture.componentRef.setInput("responseStatusCode", 200);
      fixture.componentRef.setInput("responseStatusText", "OK");
      fixture.componentRef.setInput("responseData", "the last body");
      fixture.detectChanges();
    });

    it("keeps the last response as it was for the first second", () => {
      sending(Date.now());
      expect(element().querySelector(".status-badge")?.textContent?.trim()).toBe("200");
      expect(element().querySelector(".response-stale")).toBeNull();
      expect(element().querySelector("ui-spinner")).toBeNull();
      expect(element().querySelector(".response-tabs")).not.toBeNull();
    });

    it("then says Sending and the time so far in the status line, with a spinner, over the last response dimmed", () => {
      sending(Date.now() - 1500);
      const line = element().querySelector(".response-sending");
      expect(line?.textContent?.trim()).toMatch(/^Sending… 1\.\d s$/);
      expect(line?.querySelector("ui-spinner")).not.toBeNull();
      expect(element().querySelector(".status-badge")).toBeNull();
      // The last response is still there, dimmed: its line is the one replaced, not its body.
      expect(element().querySelector(".response-main.response-stale .response-tabs")).not.toBeNull();
      expect(line?.closest(".response-stale")).toBe(element().querySelector(".response-main"));
    });

    it("with no response before it, draws only that line", () => {
      fixture.componentRef.setInput("responseStatusCode", undefined);
      fixture.componentRef.setInput("responseData", "");
      sending(Date.now() - 1500);
      expect(element().querySelector(".response-sending")?.textContent?.trim()).toMatch(/^Sending… 1\.\d s$/);
      expect(element().querySelector(".response-tabs")).toBeNull();
    });
  });

  // D5-e (V21): on a phone the status, its reason, the time and the size are one line; where the request went and
  // Export are the next, at its end. The route and the facts wrapped as one group, and Export took a third line.
  it("on a phone, keeps the status and the facts on one line, and the route and Export on the next, at its end", () => {
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = "block";
    host.style.width = "360px";
    const inspection = signal({ duration: 12 } as ResponseInspection);
    fixture.componentRef.setInput("responseStatusCode", 200);
    fixture.componentRef.setInput("responseStatusText", "OK");
    fixture.componentRef.setInput("responseContentLength", 60);
    fixture.componentRef.setInput("inspection", inspection);
    fixture.componentRef.setInput("exportContext", {} as ResponseExportContext);
    fixture.componentRef.setInput("record", {
      durationMs: 12,
      route: "direct",
      host: "api.example.com:4300",
      secrets: [],
      masked: { headers: [], responseHeaders: [] },
      kept: { response: true, body: true },
    } as ExchangeRecord);
    fixture.detectChanges();
    const middle = (selector: string) => {
      const box = host.querySelector(selector)!.getBoundingClientRect();
      return box.top + box.height / 2;
    };
    const facts = [...host.querySelectorAll(".response-status .response-fact")];
    expect(facts.map((fact) => fact.textContent?.trim())).toEqual(["12 ms", "60 B"]);
    for (const fact of facts) {
      const box = fact.getBoundingClientRect();
      expect(Math.abs(box.top + box.height / 2 - middle(".status-code"))).toBeLessThan(4);
    }
    expect(middle(".record-toggle")).toBeGreaterThan(middle(".status-code") + 8);
    expect(Math.abs(middle(".record-toggle") - middle('[aria-label="Export response"]'))).toBeLessThan(4);
    const line = host.querySelector(".response-status")!.getBoundingClientRect();
    const exportBox = host.querySelector('[aria-label="Export response"]')!.getBoundingClientRect();
    expect(line.right - exportBox.right).toBeLessThanOrEqual(17);
  });

  it("says where a response came from: the page, or the Local Bridge (P6.4)", () => {
    fixture.componentRef.setInput("responseStatusCode", 200);
    fixture.componentRef.setInput("route", "direct");
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".route-badge")?.textContent?.trim()).toBe("Direct");
    fixture.componentRef.setInput("route", "bridge");
    fixture.detectChanges();
    expect(element.querySelector(".route-badge")?.textContent?.trim()).toBe("Local Bridge");
  });

  describe("the exchange record (D4.12)", () => {
    const record: ExchangeRecord = {
      durationMs: 3,
      route: "direct",
      host: "api.example.com",
      secrets: [{ name: "token", scope: "environment", holder: 'environment "Local"' }],
      masked: { headers: ["Authorization"], responseHeaders: [] },
      kept: { response: false, body: false },
      failure: { kind: "network", reported: "Failed to fetch", summary: "The request got no response." },
    };

    it("ends the status line with where the request went, as a button that opens and closes the record", () => {
      fixture.componentRef.setInput("isError", true);
      fixture.componentRef.setInput("record", record);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const toggle = element.querySelector<HTMLButtonElement>(".record-toggle");
      expect(toggle?.textContent?.trim()).toBe("Direct to api.example.com");
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");
      expect(element.querySelector("#exchange-record")).toBeNull();
      const asked: boolean[] = [];
      component.recordOpenChange.subscribe((open) => asked.push(open));
      toggle?.click();
      expect(asked).toEqual([true]);
    });

    it("open, says each field in a sentence, the wire's values in monospace, and offers the Local Bridge once", () => {
      fixture.componentRef.setInput("isError", true);
      fixture.componentRef.setInput("record", record);
      fixture.componentRef.setInput("recordOpen", true);
      fixture.detectChanges();
      const region = (fixture.nativeElement as HTMLElement).querySelector("#exchange-record");
      expect(region?.getAttribute("aria-label")).toBe("Exchange record");
      const lines = [...(region?.querySelectorAll("li") ?? [])].map((line) => line.textContent);
      // What was reported leads (U-175).
      expect(lines).toEqual([
        "What was reported: Failed to fetch",
        "Sent from this page to api.example.com.",
        'Filled from the vault: token, from environment "Local". Each is *** in what is kept.',
        "Masked with *** in what is kept: Authorization.",
        "History kept the request. No response came.",
      ]);
      expect([...(region?.querySelectorAll(".font-mono") ?? [])].map((part) => part.textContent)).toEqual([
        "Failed to fetch",
        "api.example.com",
        "token",
        "Authorization",
      ]);
      // The action is under what was reported, before what the send did.
      const action = region?.querySelector("button");
      expect(action?.previousElementSibling?.querySelector(".record-failure")).not.toBeNull();
      const sent = vi.fn();
      component.sendThroughBridge.subscribe(sent);
      const buttons = region?.querySelectorAll("button") ?? [];
      expect(buttons).toHaveLength(1);
      buttons[0].click();
      expect(sent).toHaveBeenCalledOnce();
    });

    it("offers nothing when the request went through the bridge, or got a response", () => {
      fixture.componentRef.setInput("recordOpen", true);
      fixture.componentRef.setInput("record", { ...record, route: "bridge" });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector("#exchange-record button")).toBeNull();
      fixture.componentRef.setInput("record", { ...record, failure: undefined, status: { code: 200, text: "OK" } });
      fixture.detectChanges();
      expect(element.querySelector("#exchange-record button")).toBeNull();
    });
  });

  describe("redirects (P5.4)", () => {
    const shown = (redirects: unknown) => {
      fixture.componentRef.setInput("responseStatusCode", 302);
      fixture.componentRef.setInput("redirects", redirects);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, " ").trim();
      return {
        hops: [...element.querySelectorAll(".redirect-hop")].map(text),
        note: text(element.querySelector(".redirect-stopped")),
        section: element.querySelector(".redirect-chain"),
      };
    };
    const hop = (n: number) => ({ status: 302, url: `https://a.test/${n}`, location: `/${n + 1}` });

    it("lists each hop that was followed: status, address, Location as the server wrote it", () => {
      const { hops, note } = shown({
        chain: [hop(1), { status: 307, url: "https://a.test/2", location: "https://a.test/{{token}}" }],
      });
      expect(hops).toEqual(["302 https://a.test/1 to /2", "307 https://a.test/2 to https://a.test/{{token}}"]);
      expect(note).toBeUndefined();
    });

    it("says why a redirect was not followed", () => {
      expect(shown({ chain: [hop(1)], stopped: "other-host" }).note).toContain(
        "leaves the host, and the request holds a vault secret",
      );
      expect(shown({ chain: [], stopped: "location" }).note).toContain("not an http or https address");
      expect(shown({ chain: [], stopped: "off" }).note).toContain("Follow redirects is off");
      expect(shown({ chain: Array.from({ length: 20 }, (_, n) => hop(n)), stopped: "limit" }).note).toContain(
        "20 redirects are followed at most",
      );
    });

    it("shows nothing for a response without a redirect, by either route", () => {
      expect(shown(undefined).section).toBeNull();
      expect(shown({ chain: [] }).section).toBeNull();
    });
  });

  it("returns empty timing bars when inspection is missing", () => {
    fixture.componentRef.setInput("inspection", signal<ResponseInspection | null>(null));

    expect(component.timingBars()).toEqual([]);
    expect(component.fallbackBars()).toEqual([]);
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

    fixture.componentRef.setInput("inspection", signal(inspection));

    const bars = component.timingBars();
    expect(bars.length).toBe(3);
    expect(bars[0].label).toBe("DNS");
    expect(bars[1].label).toBe("TCP");
    expect(component.timingBars().length).toBeGreaterThan(0);
  });

  describe("views (P2.13)", () => {
    const set = (inputs: Record<string, unknown>) => {
      for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
      fixture.detectChanges();
    };
    const element = () => fixture.nativeElement as HTMLElement;

    // U-175: a send that got no response says why once, and draws no tab of a response that never came.
    it("with no response, says why once and draws no Body, Headers or Timings; Tests only when a test ran", () => {
      const why = "The request got no response. Send it through the Local Bridge to see which.";
      set({ isError: true, responseError: why });
      const tabs = () => [...element().querySelectorAll("[ngTab]")].map((tab) => tab.textContent?.trim());
      expect(element().querySelectorAll(".response-failure").length).toBe(1);
      expect(element().querySelector(".response-failure")?.textContent).toBe(why);
      expect(element().querySelector(".response-tabs")).toBeNull();
      set({ testResults: [{ label: "status is 200", passed: false, source: "assertion" }] });
      expect(tabs()).toEqual(["Tests 1"]);
      expect(element().querySelector(".test-result-fail")?.textContent).toContain("status is 200");
      expect(element().textContent?.match(/Send it through the Local Bridge/g)).toHaveLength(1);
    });

    it("draws a test that ran twice under one name as two rows, each its own (NG0955)", () => {
      const warn = vi.spyOn(console, "warn");
      set({
        isError: true,
        responseError: "The request got no response.",
        testResults: [
          { label: "has id", passed: true, source: "script" },
          { label: "has id", passed: false, source: "script" },
        ],
      });
      // Angular checks the keys when it draws a list again: the next send's results.
      set({
        testResults: [
          { label: "has id", passed: false, source: "script" },
          { label: "has id", passed: true, source: "script" },
        ],
      });
      expect(element().querySelectorAll(".test-result").length).toBe(2);
      expect(warn.mock.calls.flat().join(" ")).not.toContain("NG0955");
      warn.mockRestore();
    });

    it("lists a header sent twice as two rows", () => {
      set({
        responseStatusCode: 200,
        activeTab: "headers",
        responseHeaders: [
          { name: "set-cookie", value: "a=1" },
          { name: "set-cookie", value: "b=2" },
        ],
      });
      expect([...element().querySelectorAll("table.ds-table td")].map((cell) => cell.textContent)).toEqual([
        "a=1",
        "b=2",
      ]);
    });

    it("says that the browser withheld headers only when it did", () => {
      set({
        responseStatusCode: 200,
        activeTab: "headers",
        responseHeaders: [{ name: "content-type", value: "text/plain" }],
      });
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
      set({
        responseStatusCode: 404,
        isError: true,
        responseError: "<h1>Not found</h1>",
        responseContentType: "text/html",
      });
      expect(component.view()).toBe("html");
      expect(element().querySelector("iframe.html-preview")?.getAttribute("sandbox")).toBe("");
    });

    // L-14 (D5-e): one field above the body, not a row for the search and another for the path.
    it("has one field that searches, or filters by a path when the text is one", async () => {
      set({
        responseStatusCode: 200,
        responseBodyIsJson: true,
        responseData: '{"items":[{"id":1},{"id":2}]}',
        responseContentType: "application/json",
      });
      const tools = () => element().querySelector(".response-tools") as HTMLElement;
      const type = async (text: string) => {
        await component.onSearchQueryChange(text);
        fixture.detectChanges();
      };
      const search = TestBed.inject(JsonWorkerClient).search as ReturnType<typeof vi.fn>;
      expect(tools().querySelectorAll("input").length).toBe(1);
      expect(tools().querySelector("input")?.getAttribute("aria-label")).toBe(
        "Search the response, or filter it by path",
      );
      // The count and the arrows are there only while there is something to count.
      expect(tools().querySelector("[aria-label='Next search match']")).toBeNull();

      await type("items[*].id");
      expect(JSON.parse(component.filteredJson() ?? "")).toEqual([1, 2]);
      expect(tools().textContent).toContain("Filtering by path");
      expect(tools().querySelector("[aria-label='Next search match']")).toBeNull();
      await type("$.items[0].id");
      expect(component.filteredJson()).toBe("1");
      await type(".items.constructor");
      expect(component.filteredJson()).toBe("");
      expect(search).not.toHaveBeenCalled();

      await type("items");
      expect(component.filteredJson()).toBeNull();
      expect(tools().textContent).not.toContain("Filtering by path");
      expect(search).toHaveBeenCalledWith(expect.any(String), "items");
      expect(tools().querySelector("[aria-label='Next search match']")).not.toBeNull();
    });

    it("parses the body once for a path, not again at each key typed", async () => {
      const body = '{"a":{"b":[1,2]}}';
      set({
        responseStatusCode: 200,
        responseBodyIsJson: true,
        responseData: body,
        responseContentType: "application/json",
      });
      const parse = vi.spyOn(JSON, "parse");
      for (const text of ["$.a", "$.a.", "$.a.b"]) {
        await component.onSearchQueryChange(text);
        component.filteredJson();
      }
      expect(component.filteredJson()).toBe(JSON.stringify([1, 2], null, 4));
      expect(parse.mock.calls.filter(([text]) => text === body)).toHaveLength(1);
      parse.mockRestore();
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
      set({
        responseStatusCode: 200,
        responseBinary: new BinaryBody(new Uint8Array([60, 104, 49, 62]).buffer, "text/html"),
      });
      expect(component.views()).toEqual(["hex"]);
      expect(component.imageUrl()).toBeNull();
    });
  });
});
