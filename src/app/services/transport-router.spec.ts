import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FetchMock } from "../../testing/fetch-mock";
import { BridgeSettings } from "./bridge-settings";
import { TransportRouter } from "./transport-router";

const open = () => ({ signal: new AbortController().signal, timeoutMs: 0 });

describe("TransportRouter", () => {
  let router: TransportRouter;
  let fetchMock: FetchMock;

  beforeEach(() => {
    localStorage.removeItem("wayfarer:bridge");
    fetchMock = new FetchMock();
    router = TestBed.inject(TransportRouter);
  });

  afterEach(() => {
    fetchMock.verify();
    localStorage.removeItem("wayfarer:bridge");
  });

  it("sends straight from the page, and calls a body with no Content-Type JSON", async () => {
    const pending = router.send({ method: "POST", url: "https://example.com/a", headers: [["X-A", "1"]], body: '{"a":1}' }, open());

    const req = fetchMock.expectOne("https://example.com/a");
    expect(req.request.init.headers).toEqual([["X-A", "1"], ["Content-Type", "application/json"]]);
    req.flush("{}", { status: 200 });
    expect((await pending).route).toBe("direct");
  });

  it("leaves the user's own Content-Type alone, and adds none to a request without a body", async () => {
    const withType = router.send(
      { method: "POST", url: "https://example.com/b", headers: [["content-type", "text/plain"]], body: '"x"' },
      open()
    );
    const first = fetchMock.expectOne("https://example.com/b");
    expect(first.request.init.headers).toEqual([["content-type", "text/plain"]]);
    first.flush(null, { status: 204 });
    await withType;

    const bodyless = router.send({ method: "GET", url: "https://example.com/c", headers: [] }, open());
    const second = fetchMock.expectOne("https://example.com/c");
    expect(second.request.init.headers).toEqual([]);
    second.flush(null, { status: 204 });
    await bodyless;
  });

  it("goes through the Local Bridge when it is switched on", async () => {
    TestBed.inject(BridgeSettings).update({ enabled: true, url: "http://127.0.0.1:7717", token: "test-token" });

    const pending = router.send({ method: "GET", url: "https://internal.example.com/data", headers: [] }, open());

    const req = fetchMock.expectOne("http://127.0.0.1:7717/relay");
    expect(req.request.headers.get("X-Wayfarer-Bridge-Token")).toBe("test-token");
    expect(req.request.body).toEqual({ method: "GET", url: "https://internal.example.com/data", headers: {} });
    req.flush(JSON.stringify({ status: 200, statusText: "OK", headers: {}, body: "", bodyEncoding: "utf8" }), { status: 200 });
    expect((await pending).route).toBe("bridge");
  });
});
