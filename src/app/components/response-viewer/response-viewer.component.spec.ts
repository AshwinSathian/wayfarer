import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { ResponseViewerComponent } from "./response-viewer.component";
import { ResponseInspection } from "../../shared/inspect/response-inspector.service";
import { JsonWorkerService } from "../../shared/json-worker/json-worker.service";

class JsonWorkerServiceStub {
  parsePretty = jasmine
    .createSpy("parsePretty")
    .and.callFake(async (input: string, indent = 4) => {
      try {
        return JSON.stringify(JSON.parse(input), null, indent);
      } catch {
        return input;
      }
    });
  minify = jasmine
    .createSpy("minify")
    .and.callFake(async (input: string) => input);
  search = jasmine
    .createSpy("search")
    .and.callFake(async (_input: string, _query: string) => ({
      count: 0,
      excerpts: [],
    }));
}

describe("ResponseViewerComponent", () => {
  let component: ResponseViewerComponent;
  let fixture: ComponentFixture<ResponseViewerComponent>;

  beforeEach(async () => {
    const jsonWorkerStub = new JsonWorkerServiceStub();

    await TestBed.configureTestingModule({
      imports: [ResponseViewerComponent],
      providers: [{ provide: JsonWorkerService, useValue: jsonWorkerStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(ResponseViewerComponent);
    component = fixture.componentInstance;
  });

  it("updates the active tab model signal", () => {
    component.onTabChange("headers");

    expect(component.activeTab()).toBe("headers");
  });

  it("returns empty timing bars when inspection is missing", () => {
    fixture.componentRef.setInput('inspection', signal<ResponseInspection | null>(null));

    expect(component.hasGranularTimings()).toBeFalse();
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
    expect(component.hasGranularTimings()).toBeTrue();
  });
});
