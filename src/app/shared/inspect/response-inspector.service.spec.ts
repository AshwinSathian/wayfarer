import { TestBed } from "@angular/core/testing";
import {
  ResponseInspectorService,
  ResponseInspection,
} from "./response-inspector.service";

interface MutablePerformance {
  now: () => number;
  timeOrigin: number;
  getEntriesByName: (name: string) => PerformanceResourceTiming[];
  getEntriesByType: (type: string) => PerformanceResourceTiming[];
}

describe("ResponseInspectorService", () => {
  let service: ResponseInspectorService;
  let originalPerformance: Performance;
  let stubPerformance: MutablePerformance;
  let nowValue: number;
  let entries: PerformanceResourceTiming[];

  beforeEach(() => {
    originalPerformance = globalThis.performance;
    nowValue = 0;
    entries = [];

    stubPerformance = {
      now: () => nowValue,
      timeOrigin: 1000,
      getEntriesByName: (name: string) =>
        entries.filter((entry) => entry.name === name),
      getEntriesByType: (type: string) =>
        type === "resource" ? entries : ([] as PerformanceResourceTiming[]),
    };

    (globalThis as typeof globalThis & { performance: Performance }).performance =
      stubPerformance as unknown as Performance;

    TestBed.configureTestingModule({
      providers: [ResponseInspectorService],
    });

    service = TestBed.inject(ResponseInspectorService);
  });

  afterEach(() => {
    (globalThis as typeof globalThis & { performance: Performance }).performance =
      originalPerformance;
  });

  function readInspection(): ResponseInspection | null {
    return service.latest();
  }

  it("records duration when resource timing entries are unavailable", () => {
    const url = "https://example.com/api";

    nowValue = 100;
    service.markRequest("req-1", url);

    nowValue = 160;
    service.markResponse("req-1", url);

    const inspection = readInspection();
    expect(inspection).toBeTruthy();
    expect(inspection?.url).toBe(url);
    expect(inspection?.duration).toBeCloseTo(60, 5);
    expect(inspection?.phases).toBeUndefined();
    expect(inspection?.limitedByCors).toBeTrue();
  });

  it("normalizes phases and sizes from matching resource timing entry", () => {
    const url = "https://example.com/data";
    const resourceTiming = {
      name: url,
      entryType: "resource",
      startTime: 10,
      redirectStart: 10,
      redirectEnd: 14,
      domainLookupStart: 14,
      domainLookupEnd: 20,
      connectStart: 20,
      secureConnectionStart: 22,
      connectEnd: 28,
      requestStart: 30,
      responseStart: 46,
      responseEnd: 70,
      duration: 60,
      initiatorType: "xmlhttprequest",
      transferSize: 4096,
      encodedBodySize: 3072,
      decodedBodySize: 8192,
      toJSON: () => ({}),
    } as PerformanceResourceTiming;

    entries.push(resourceTiming);

    nowValue = 5;
    service.markRequest("req-2", url);

    nowValue = 80;
    service.markResponse("req-2", url);

    const inspection = readInspection();
    expect(inspection).toBeTruthy();
    expect(inspection?.duration).toBeCloseTo(
      resourceTiming.responseEnd - resourceTiming.startTime,
      5
    );
    expect(inspection?.phases).toEqual(
      jasmine.objectContaining({
        redirect: 4,
        dns: 6,
        tcp: 8,
        tls: 6,
        request: 2,
        ttfb: 16,
        content: 24,
      })
    );
    expect(inspection?.sizes).toEqual({
      transferSize: 4096,
      encodedBodySize: 3072,
      decodedBodySize: 8192,
    });
    expect(inspection?.limitedByCors).toBeFalse();
  });

  it("falls back gracefully when markResponse is invoked before markRequest", () => {
    const url = "https://example.com/late";
    nowValue = 200;

    service.markResponse("missing", url);

    const inspection = readInspection();
    expect(inspection).toBeTruthy();
    expect(inspection?.id).toBe("missing");
    expect(inspection?.duration).toBe(0);
  });
});

