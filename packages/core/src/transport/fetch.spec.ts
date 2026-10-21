import { describe, expect, it } from "vitest";
import { BinaryBody, decodeEnvelope } from "../http/response-body";
import { fakeFetch, never } from "./fake-fetch";
import { FetchTransport } from "./fetch";
import { TransportError } from "./transport";

const json = { "Content-Type": "application/json" };
const open = () => ({ signal: new AbortController().signal, timeoutMs: 0 });

// Ported from http-transport.spec.ts (the direct route), assertions unchanged
// except where noted in the PR: an HTTP error status is now a response.
describe("FetchTransport", () => {
  it("should be created", () => {
    expect(new FetchTransport()).toBeTruthy();
  });

  it("should perform GET requests with provided headers", async () => {
    const { fetch, calls } = fakeFetch(
      () => new Response('{"ok":true}', { status: 200, statusText: "OK", headers: json }),
    );

    const response = await new FetchTransport(fetch).send(
      { method: "GET", url: "https://example.com/data", headers: [["Accept", "application/json"]] },
      open(),
    );

    expect(response.status).toBe(200);
    expect(decodeEnvelope(response)).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://example.com/data");
    expect(calls[0].init.method).toBe("GET");
    expect(response.body).toBeInstanceOf(ArrayBuffer);
    expect(new Headers(calls[0].init.headers).get("Accept")).toBe("application/json");
  });

  // D2, D23: nothing of the app's own goes with a user's request.
  it("sends without cache, cookies or a referrer, follows redirects, and keeps header order and duplicates", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const headers: [string, string][] = [
      ["X-B", "1"],
      ["X-A", "2"],
      ["X-B", "3"],
    ];

    await new FetchTransport(fetch).send({ method: "GET", url: "https://example.com/", headers }, open());

    expect(calls[0].init).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "follow",
    });
    expect(calls[0].init.headers).toEqual(headers);
  });

  // P0.4 (F04, #61)
  for (const [contentType, text] of [
    ["text/html; charset=utf-8", "<h1>hi</h1>"],
    ["application/xml", "<a/>"],
    ["text/plain", "User-agent: *"],
  ]) {
    it(`returns a ${contentType} body as text`, async () => {
      const { fetch } = fakeFetch(
        () => new Response(text, { status: 200, statusText: "OK", headers: { "Content-Type": contentType } }),
      );
      const response = await new FetchTransport(fetch).send(
        { method: "GET", url: "https://example.com/t", headers: [] },
        open(),
      );
      expect(decodeEnvelope(response)).toBe(text);
    });
  }

  // P0.4 (F05, #62)
  it("returns an image body as BinaryBody with its exact bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    const { fetch } = fakeFetch(
      () => new Response(png, { status: 200, statusText: "OK", headers: { "Content-Type": "image/png" } }),
    );

    const body = decodeEnvelope(
      await new FetchTransport(fetch).send({ method: "GET", url: "https://example.com/i.png", headers: [] }, open()),
    );

    expect(body).toBeInstanceOf(BinaryBody);
    expect(new Uint8Array((body as BinaryBody).bytes as ArrayBuffer)).toEqual(new Uint8Array(png));
  });

  it("decodes an HTTP error body instead of exposing the raw ArrayBuffer", async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response("<p>Not here</p>", {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "text/html" },
        }),
    );

    const response = await new FetchTransport(fetch).send(
      { method: "GET", url: "https://example.com/missing", headers: [] },
      open(),
    );

    expect(response.status).toBe(404);
    expect(decodeEnvelope(response)).toBe("<p>Not here</p>");
  });

  it("should send body payloads for mutating methods", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204, statusText: "No Content" }));

    const response = await new FetchTransport(fetch).send(
      {
        method: "PATCH",
        url: "https://example.com/profile",
        headers: [["Content-Type", "application/json"]],
        body: JSON.stringify({ displayName: "Jane" }),
      },
      open(),
    );

    expect(response.status).toBe(204);
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ displayName: "Jane" });
    expect(new Headers(calls[0].init.headers).get("Content-Type")).toBe("application/json");
  });

  it("should surface errors for DELETE requests", async () => {
    const { fetch, calls } = fakeFetch(
      () => new Response('{"message":"missing"}', { status: 404, statusText: "Not Found", headers: json }),
    );

    const response = await new FetchTransport(fetch).send(
      { method: "DELETE", url: "https://example.com/resource/1", headers: [["Authorization", "Bearer token"]] },
      open(),
    );

    expect(response.status).toBe(404);
    expect(calls[0].init.method).toBe("DELETE");
    expect(new Headers(calls[0].init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("reports a redirect and the URL the response came from", async () => {
    const final = new Response("ok", { status: 200 });
    Object.defineProperty(final, "redirected", { value: true });
    Object.defineProperty(final, "url", { value: "https://example.com/end" });
    const { fetch } = fakeFetch(() => final);

    const response = await new FetchTransport(fetch).send(
      { method: "GET", url: "https://example.com/start", headers: [] },
      open(),
    );

    expect(response).toMatchObject({ redirected: true, finalUrl: "https://example.com/end", route: "direct" });
    expect(response.sizes.decoded).toBe(2);
  });

  it("keeps a body over the display cap as a Blob, which decodes to a download", async () => {
    const chunk = new Uint8Array(1024).fill(7);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const { fetch } = fakeFetch(
      () => new Response(stream, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
    );

    const response = await new FetchTransport(fetch, 2048).send(
      { method: "GET", url: "https://example.com/big", headers: [] },
      open(),
    );

    expect(response.body).toBeInstanceOf(Blob);
    expect(response.sizes.decoded).toBe(5 * 1024);
    const body = decodeEnvelope(response);
    expect(body).toBeInstanceOf(BinaryBody);
    expect((body as BinaryBody).byteLength).toBe(5 * 1024);
    expect((body as BinaryBody).contentType).toBe("text/plain");
    expect(new Uint8Array(await (response.body as Blob).arrayBuffer()).every((byte) => byte === 7)).toBe(true);
  });

  it("names a timeout, a cancel and a network failure", async () => {
    const hang = new FetchTransport(fakeFetch(never).fetch);
    const request = { method: "GET", url: "https://example.com/slow", headers: [] };

    const timedOut = await hang
      .send(request, { signal: new AbortController().signal, timeoutMs: 20 })
      .catch((e: unknown) => e);
    expect(timedOut).toBeInstanceOf(TransportError);
    expect(timedOut).toMatchObject({ kind: "timeout", message: "Timed out after 20 ms" });

    const controller = new AbortController();
    const pending = hang.send(request, { signal: controller.signal, timeoutMs: 0 }).catch((e: unknown) => e);
    controller.abort();
    expect(await pending).toMatchObject({ kind: "aborted" });

    const offline = new FetchTransport(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await offline.send(request, open()).catch((e: unknown) => e)).toMatchObject({
      kind: "network",
      message: "Failed to fetch",
    });

    // Node's fetch names the reason in its cause's code; the cause's message, which holds the address, is not kept.
    const refused = new FetchTransport(() =>
      Promise.reject(
        new TypeError("fetch failed", {
          cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:9"), { code: "ECONNREFUSED" }),
        }),
      ),
    );
    expect(await refused.send(request, open()).catch((e: unknown) => e)).toMatchObject({
      kind: "network",
      message: "fetch failed (ECONNREFUSED)",
    });
  });

  // P5.6: a response that is an event stream is read as it arrives, when the caller asks for its events.
  describe("an event stream", () => {
    const sse = { "Content-Type": "text/event-stream; charset=utf-8" };
    /** A body the spec writes to, chunk by chunk. */
    function body() {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start: (given) => void (controller = given) });
      return {
        stream,
        write: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
        close: () => controller.close(),
        fail: (error: Error) => controller.error(error),
      };
    }
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("gives each event to the caller as it arrives, and the whole body when the server ends the stream", async () => {
      const source = body();
      const { fetch } = fakeFetch(() => new Response(source.stream, { status: 200, headers: sse }));
      const events: unknown[] = [];
      const sent = new FetchTransport(fetch).send(
        { method: "GET", url: "https://example.com/events", headers: [] },
        { ...open(), onEvent: (event) => events.push(event) },
      );

      source.write("id: 1\nevent: tick\ndata: one\n\n");
      await tick();
      expect(events).toEqual([{ id: "1", event: "tick", data: "one", timeMs: expect.any(Number) }]);
      // A character in two chunks is one character.
      const bytes = new TextEncoder().encode("data: k\u00e4se\n\n");
      source.write(new TextDecoder("latin1").decode(bytes.slice(0, 8)));
      await tick();
      expect(events).toHaveLength(1);
      source.close();

      const response = await sent;
      expect(response.status).toBe(200);
      expect(response.stream).toEqual({ stopped: false });
      expect(new TextDecoder().decode(response.body as ArrayBuffer)).toContain("id: 1\nevent: tick");
    });

    it("the timeout is for the answer's first byte: an open stream is not ended by it", async () => {
      const source = body();
      const { fetch } = fakeFetch(() => new Response(source.stream, { status: 200, headers: sse }));
      const events: string[] = [];
      const sent = new FetchTransport(fetch).send(
        { method: "GET", url: "https://example.com/events", headers: [] },
        { signal: new AbortController().signal, timeoutMs: 20, onEvent: (event) => events.push(event.data) },
      );
      await new Promise((resolve) => setTimeout(resolve, 60));
      source.write("data: late\n\n");
      source.close();
      expect((await sent).stream).toEqual({ stopped: false });
      expect(events).toEqual(["late"]);
    });

    it("a stream that never starts is ended by the timeout, as any request is", async () => {
      const { fetch } = fakeFetch(never);
      await expect(
        new FetchTransport(fetch).send(
          { method: "GET", url: "https://example.com/events", headers: [] },
          { signal: new AbortController().signal, timeoutMs: 20, onEvent: () => undefined },
        ),
      ).rejects.toMatchObject({ kind: "timeout" });
    });

    it("stopped by the caller, it is a response with what had arrived, not a failure", async () => {
      const source = body();
      const controller = new AbortController();
      const { fetch } = fakeFetch(() => new Response(source.stream, { status: 200, statusText: "OK", headers: sse }));
      const events: string[] = [];
      const sent = new FetchTransport(fetch).send(
        { method: "GET", url: "https://example.com/events", headers: [] },
        { signal: controller.signal, timeoutMs: 0, onEvent: (event) => events.push(event.data) },
      );
      source.write("data: one\n\ndata: half");
      await tick();
      controller.abort();
      source.fail(new DOMException("aborted", "AbortError"));

      const response = await sent;
      expect(response.stream).toEqual({ stopped: true });
      expect(events).toEqual(["one"]);
      expect(new TextDecoder().decode(response.body as ArrayBuffer)).toBe("data: one\n\ndata: half");
    });

    it("a stream that breaks is a network failure", async () => {
      const source = body();
      const { fetch } = fakeFetch(() => new Response(source.stream, { status: 200, headers: sse }));
      const sent = new FetchTransport(fetch).send(
        { method: "GET", url: "https://example.com/events", headers: [] },
        { ...open(), onEvent: () => undefined },
      );
      await tick();
      source.fail(new TypeError("network error"));
      await expect(sent).rejects.toMatchObject({ kind: "network" });
    });

    it("keeps the first megabyte of an endless stream as the body, and goes on giving events", async () => {
      const source = body();
      const { fetch } = fakeFetch(() => new Response(source.stream, { status: 200, headers: sse }));
      let events = 0;
      const sent = new FetchTransport(fetch).send(
        { method: "GET", url: "https://example.com/events", headers: [] },
        { ...open(), onEvent: () => events++ },
      );
      const event = `data: ${"x".repeat(1017)}\n\n`;
      for (let written = 0; written < 1100; written++) source.write(event);
      source.close();
      const response = await sent;
      expect(events).toBe(1100);
      expect((response.body as ArrayBuffer).byteLength).toBe(1024 * 1024);
      expect(response.stream).toEqual({ stopped: false, truncated: true });
    });

    it("without a caller for its events, and for any other type, the body is read whole as before", async () => {
      const { fetch } = fakeFetch(() => new Response("data: a\n\n", { status: 200, headers: sse }));
      expect(
        (
          await new FetchTransport(fetch).send(
            { method: "GET", url: "https://example.com/events", headers: [] },
            open(),
          )
        ).stream,
      ).toBeUndefined();
      const other = fakeFetch(() => new Response("data: a\n\n", { status: 200, headers: json }));
      const events: unknown[] = [];
      expect(
        (
          await new FetchTransport(other.fetch).send(
            { method: "GET", url: "https://example.com/x", headers: [] },
            { ...open(), onEvent: (event) => events.push(event) },
          )
        ).stream,
      ).toBeUndefined();
      expect(events).toEqual([]);
    });
  });
});
