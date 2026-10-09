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
    const { fetch, calls } = fakeFetch(() => new Response('{"ok":true}', { status: 200, statusText: "OK", headers: json }));

    const response = await new FetchTransport(fetch).send(
      { method: "GET", url: "https://example.com/data", headers: [["Accept", "application/json"]] },
      open()
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
    const headers: [string, string][] = [["X-B", "1"], ["X-A", "2"], ["X-B", "3"]];

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
      const { fetch } = fakeFetch(() => new Response(text, { status: 200, statusText: "OK", headers: { "Content-Type": contentType } }));
      const response = await new FetchTransport(fetch).send({ method: "GET", url: "https://example.com/t", headers: [] }, open());
      expect(decodeEnvelope(response)).toBe(text);
    });
  }

  // P0.4 (F05, #62)
  it("returns an image body as BinaryBody with its exact bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    const { fetch } = fakeFetch(() => new Response(png, { status: 200, statusText: "OK", headers: { "Content-Type": "image/png" } }));

    const body = decodeEnvelope(await new FetchTransport(fetch).send({ method: "GET", url: "https://example.com/i.png", headers: [] }, open()));

    expect(body).toBeInstanceOf(BinaryBody);
    expect(new Uint8Array((body as BinaryBody).bytes as ArrayBuffer)).toEqual(new Uint8Array(png));
  });

  it("decodes an HTTP error body instead of exposing the raw ArrayBuffer", async () => {
    const { fetch } = fakeFetch(() => new Response("<p>Not here</p>", { status: 404, statusText: "Not Found", headers: { "Content-Type": "text/html" } }));

    const response = await new FetchTransport(fetch).send({ method: "GET", url: "https://example.com/missing", headers: [] }, open());

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
      open()
    );

    expect(response.status).toBe(204);
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ displayName: "Jane" });
    expect(new Headers(calls[0].init.headers).get("Content-Type")).toBe("application/json");
  });

  it("should surface errors for DELETE requests", async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{"message":"missing"}', { status: 404, statusText: "Not Found", headers: json }));

    const response = await new FetchTransport(fetch).send(
      { method: "DELETE", url: "https://example.com/resource/1", headers: [["Authorization", "Bearer token"]] },
      open()
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

    const response = await new FetchTransport(fetch).send({ method: "GET", url: "https://example.com/start", headers: [] }, open());

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
    const { fetch } = fakeFetch(() => new Response(stream, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }));

    const response = await new FetchTransport(fetch, 2048).send({ method: "GET", url: "https://example.com/big", headers: [] }, open());

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

    const timedOut = await hang.send(request, { signal: new AbortController().signal, timeoutMs: 20 }).catch((e: unknown) => e);
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
  });
});
