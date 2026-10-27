import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FetchMock, type MockRequest } from "../../testing/fetch-mock";
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

  it("sends straight from the page, and adds no header of its own: the composer names the body's type", async () => {
    const pending = router.send(
      { method: "POST", url: "https://example.com/a", headers: [["X-A", "1"]], body: '{"a":1}' },
      open(),
    );

    const req = fetchMock.expectOne("https://example.com/a");
    expect(req.request.init.headers).toEqual([["X-A", "1"]]);
    req.flush("{}", { status: 200 });
    expect((await pending).route).toBe("direct");
  });

  it("leaves the user's own Content-Type alone, and adds none to a request without a body", async () => {
    const withType = router.send(
      { method: "POST", url: "https://example.com/b", headers: [["content-type", "text/plain"]], body: '"x"' },
      open(),
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
    TestBed.inject(BridgeSettings).update({ route: "bridge", url: "http://127.0.0.1:7717", token: "test-token" });

    const pending = router.send({ method: "GET", url: "https://internal.example.com/data", headers: [] }, open());

    // The body is made into bytes first: the call follows a moment later.
    const req = await vi.waitFor(() => fetchMock.expectOne("http://127.0.0.1:7717/relay"));
    expect(req.request.headers.get("X-Wayfarer-Bridge-Token")).toBe("test-token");
    expect(req.request.body).toEqual({ method: "GET", url: "https://internal.example.com/data", headers: [] });
    req.flush(
      JSON.stringify({ status: 200, statusText: "OK", headers: [], bodyB64: "", encodedSize: 0, decodedSize: 0 }),
      { status: 200 },
    );
    expect((await pending).route).toBe("bridge");
  });

  it("with the bridge on and no token in the tab or the vault, nothing is sent and the error says where the token is kept (F83)", async () => {
    TestBed.inject(BridgeSettings).update({ route: "bridge", url: "http://127.0.0.1:7717", token: "" });

    await expect(
      router.send({ method: "GET", url: "https://internal.example.com/data", headers: [] }, open()),
    ).rejects.toThrow("The Local Bridge is on, and its token is not in this tab.");
    fetchMock.verify();
  });

  describe("auto (P6.4, D7)", () => {
    const relay = "http://127.0.0.1:7717/relay";
    const answer = (req: MockRequest) =>
      req.flush(
        JSON.stringify({
          status: 201,
          statusText: "Created",
          headers: [],
          bodyB64: "",
          encodedSize: 0,
          decodedSize: 0,
        }),
        { status: 200 },
      );
    const json = {
      method: "POST",
      url: "https://api.example.com/items",
      headers: [["Content-Type", "application/json"]] as [string, string][],
      body: "{}",
    };
    const form = {
      method: "POST",
      url: "https://api.example.com/items",
      headers: [["Content-Type", "application/x-www-form-urlencoded"]] as [string, string][],
      body: "a=1",
    };

    beforeEach(() =>
      TestBed.inject(BridgeSettings).update({ route: "auto", url: "http://127.0.0.1:7717", token: "test-token" }),
    );

    it("is the device's route when nothing else is set, with no bridge configured too", () => {
      localStorage.removeItem("wayfarer:bridge");
      expect(TestBed.inject(BridgeSettings).config().route).toBe("auto");
    });

    it("@claim:C-064 sends a request that needed a preflight through the bridge when the page's send failed, and asks nothing", async () => {
      const ask = vi.fn(() => Promise.resolve(true));
      const pending = router.send(json, open(), { route: "auto", ask });

      fetchMock.expectOne("https://api.example.com/items").fail();
      answer(await vi.waitFor(() => fetchMock.expectOne(relay)));

      const envelope = await pending;
      expect(envelope.route).toBe("bridge");
      expect(envelope.status).toBe(201);
      expect(ask).not.toHaveBeenCalled();
    });

    it("@claim:C-064 asks before it sends a simple POST again, and sends nothing more on a no", async () => {
      const ask = vi.fn(() => Promise.resolve(false));
      const pending = router.send(form, open(), { route: "auto", ask });

      fetchMock.expectOne("https://api.example.com/items").fail();

      await expect(pending).rejects.toMatchObject({ kind: "network" });
      expect(ask).toHaveBeenCalledOnce();
      fetchMock.verify();
    });

    it("sends a simple POST through the bridge on a yes", async () => {
      const pending = router.send(form, open(), { route: "auto", ask: () => Promise.resolve(true) });

      fetchMock.expectOne("https://api.example.com/items").fail();
      answer(await vi.waitFor(() => fetchMock.expectOne(relay)));

      expect((await pending).route).toBe("bridge");
    });

    it("does not ask when there is no one to ask (a script's request): the failure stands", async () => {
      const pending = router.send(form, open(), { route: "auto" });

      fetchMock.expectOne("https://api.example.com/items").fail();

      await expect(pending).rejects.toMatchObject({ kind: "network" });
      fetchMock.verify();
    });

    it("keeps a response, whatever its status: it is never sent twice", async () => {
      const pending = router.send(json, open(), { route: "auto" });

      fetchMock.expectOne("https://api.example.com/items").flush("no", { status: 500 });

      const envelope = await pending;
      expect(envelope.route).toBe("direct");
      expect(envelope.status).toBe(500);
      fetchMock.verify();
    });

    it("with no bridge token anywhere, shows the page's failure, asks nothing, and says no bridge is paired", async () => {
      TestBed.inject(BridgeSettings).update({ token: "" });
      const ask = vi.fn(() => Promise.resolve(true));
      const policy = { route: "auto" as const, ask };
      const pending = router.send(form, open(), policy);

      fetchMock.expectOne("https://api.example.com/items").fail();

      await expect(pending).rejects.toMatchObject({ kind: "network" });
      expect(ask).not.toHaveBeenCalled();
      expect(policy).toMatchObject({ took: "direct", unpaired: true });
      fetchMock.verify();
    });

    it("says no bridge is paired for a request whose own route is direct, and not when one is (U-131)", async () => {
      const paired = { route: "direct" as const };
      const first = router.send(json, open(), paired);
      fetchMock.expectOne("https://api.example.com/items").fail();
      await expect(first).rejects.toMatchObject({ kind: "network" });
      expect(paired).not.toHaveProperty("unpaired");

      TestBed.inject(BridgeSettings).update({ token: "" });
      const unpaired = { route: "direct" as const };
      const second = router.send(json, open(), unpaired);
      fetchMock.expectOne("https://api.example.com/items").fail();
      await expect(second).rejects.toMatchObject({ kind: "network" });
      expect(unpaired).toMatchObject({ unpaired: true });
    });

    it("a request's own route wins over the device's: direct is never retried", async () => {
      const pending = router.send(json, open(), { route: "direct" });

      fetchMock.expectOne("https://api.example.com/items").fail();

      await expect(pending).rejects.toMatchObject({ kind: "network" });
      fetchMock.verify();
    });
  });
});
