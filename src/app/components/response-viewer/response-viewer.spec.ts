import { parseJson } from "../../shared/json/safe-json";
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
});
