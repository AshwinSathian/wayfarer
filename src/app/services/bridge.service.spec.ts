import { TestBed } from "@angular/core/testing";
import { BridgeService } from "./bridge.service";

describe("BridgeService", () => {
  let service: BridgeService;

  beforeEach(() => {
    localStorage.removeItem("wayfarer:bridge");
    TestBed.configureTestingModule({});
    service = TestBed.inject(BridgeService);
  });

  afterEach(() => {
    localStorage.removeItem("wayfarer:bridge");
  });

  it("defaults to disabled with a localhost URL and no token", () => {
    const config = service.config();
    expect(config.enabled).toBeFalse();
    expect(config.url).toBe("http://127.0.0.1:7717");
    expect(config.token).toBe("");
  });

  it("persists updates to localStorage and reflects them in the signal", () => {
    service.update({ enabled: true, url: "http://localhost:9999", token: "abc123" });

    expect(service.config()).toEqual({ enabled: true, url: "http://localhost:9999", token: "abc123" });

    const stored = JSON.parse(localStorage.getItem("wayfarer:bridge") ?? "{}");
    expect(stored).toEqual({ enabled: true, url: "http://localhost:9999", token: "abc123" });
  });

  it("loads a previously persisted config on construction", () => {
    localStorage.setItem(
      "wayfarer:bridge",
      JSON.stringify({ enabled: true, url: "http://localhost:1234", token: "xyz" })
    );

    // A fresh instance re-reads localStorage in its constructor.
    const fresh = TestBed.runInInjectionContext(() => new BridgeService());

    expect(fresh.config()).toEqual({ enabled: true, url: "http://localhost:1234", token: "xyz" });
  });

  it("falls back to defaults when localStorage holds malformed JSON", () => {
    localStorage.setItem("wayfarer:bridge", "{not json");

    const fresh = TestBed.runInInjectionContext(() => new BridgeService());

    expect(fresh.config().enabled).toBeFalse();
    expect(fresh.config().url).toBe("http://127.0.0.1:7717");
  });

  it("strips a trailing slash from the configured URL via baseUrl", () => {
    service.update({ url: "http://localhost:7717/" });
    expect(service.baseUrl).toBe("http://localhost:7717");
  });

  it("checkHealth returns true when the bridge responds ok", async () => {
    service.update({ url: "http://localhost:7717" });
    spyOn(window, "fetch").and.resolveTo(new Response(null, { status: 200 }));

    await expectAsync(service.checkHealth()).toBeResolvedTo(true);
  });

  it("checkHealth returns false when the bridge is unreachable", async () => {
    service.update({ url: "http://localhost:7717" });
    spyOn(window, "fetch").and.rejectWith(new Error("network error"));

    await expectAsync(service.checkHealth()).toBeResolvedTo(false);
  });

  it("checkHealth returns false when there is no configured URL", async () => {
    service.update({ url: "" });
    await expectAsync(service.checkHealth()).toBeResolvedTo(false);
  });
});
