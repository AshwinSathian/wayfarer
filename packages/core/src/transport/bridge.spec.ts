import { describe, expect, it } from "vitest";
import { BinaryBody, decodeEnvelope } from "../http/response-body";
import { BridgeTransport } from "./bridge";
import { fakeFetch, never } from "./fake-fetch";
import { TransportError } from "./transport";

const BRIDGE = { url: "http://127.0.0.1:7717", token: "test-token" };
const open = () => ({ signal: new AbortController().signal, timeoutMs: 0 });
const relay = (envelope: unknown, init: ResponseInit = { status: 200 }) =>
  fakeFetch(() => new Response(JSON.stringify(envelope), init));

// Ported from http-transport.spec.ts ("when the Local Bridge is enabled").
describe("BridgeTransport", () => {
  it("relays the request to the bridge with the token header and unwraps a successful target response", async () => {
    const { fetch, calls } = relay({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
      bodyEncoding: "utf8",
    });

    const response = await new BridgeTransport(BRIDGE, fetch).send(
      { method: "GET", url: "https://internal.example.com/data", headers: [["Accept", "application/json"]] },
      open()
    );

    expect(response.status).toBe(200);
    expect(decodeEnvelope(response)).toEqual({ ok: true });
    expect(response.route).toBe("bridge");
    expect(calls[0].url).toBe("http://127.0.0.1:7717/relay");
    expect(calls[0].init.method).toBe("POST");
    expect(new Headers(calls[0].init.headers).get("X-Wayfarer-Bridge-Token")).toBe("test-token");
    const payload = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
    expect(payload["method"]).toBe("GET");
    expect(payload["url"]).toBe("https://internal.example.com/data");
    expect(payload["headers"]).toEqual({ Accept: "application/json" });
  });

  it("surfaces a non-2xx target status (relayed successfully by the bridge) as an error", async () => {
    const { fetch } = relay({
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "not found" }),
      bodyEncoding: "utf8",
    });

    const response = await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://internal.example.com/missing", headers: [] }, open());

    expect(response.status).toBe(404);
    expect(decodeEnvelope(response)).toEqual({ message: "not found" });
  });

  it("keeps a bridge utf8 body intact when the target declares another charset (P0.4)", async () => {
    // The bridge has already decoded this body to a string.
    const { fetch } = relay({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/plain; charset=iso-8859-1" },
      body: "café",
      bodyEncoding: "utf8",
    });

    const response = await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://internal.example.com/latin1", headers: [] }, open());

    expect(decodeEnvelope(response)).toBe("café");
    // The headers shown are the target's own.
    expect(response.headers).toEqual([["content-type", "text/plain; charset=iso-8859-1"]]);
  });

  it("returns a base64 binary target body as BinaryBody, not a binary string (P0.4, #62)", async () => {
    const { fetch } = relay({
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "image/png" },
      body: btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47)),
      bodyEncoding: "base64",
    });

    const body = decodeEnvelope(await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://internal.example.com/i.png", headers: [] }, open()));

    expect(body).toBeInstanceOf(BinaryBody);
    expect(Array.from(new Uint8Array((body as BinaryBody).bytes as ArrayBuffer))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("surfaces a bridge-level failure (e.g. an unreachable target) with a readable message", async () => {
    const { fetch } = relay(
      { error: { message: "connect ECONNREFUSED", code: "ECONNREFUSED" } },
      { status: 502, statusText: "Bad Gateway" }
    );

    const error = (await new BridgeTransport(BRIDGE, fetch)
      .send({ method: "GET", url: "https://intranet.example.com/data", headers: [] }, open())
      .catch((e: unknown) => e)) as TransportError;

    expect(error.status).toBe(502);
    expect(error.message).toBe("connect ECONNREFUSED");
    expect(error.kind).toBe("bridge");
  });

  it("surfaces an invalid bridge token as a readable error", async () => {
    const { fetch } = relay({ error: "invalid or missing bridge token" }, { status: 401, statusText: "Unauthorized" });

    const error = (await new BridgeTransport(BRIDGE, fetch)
      .send({ method: "GET", url: "https://intranet.example.com/data", headers: [] }, open())
      .catch((e: unknown) => e)) as TransportError;

    expect(error.status).toBe(401);
    expect(error.message).toBe("invalid or missing bridge token");
  });

  it("shows what the bridge sent as text when a base64 body is not base64, and names its own status when it sends no JSON", async () => {
    const { fetch } = relay({ status: 200, statusText: "OK", headers: {}, body: "not base64!", bodyEncoding: "base64" });
    expect(decodeEnvelope(await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://x.test/", headers: [] }, open()))).toBe("not base64!");

    const down = fakeFetch(() => new Response("<html>", { status: 503 }));
    expect(
      await new BridgeTransport(BRIDGE, down.fetch).send({ method: "GET", url: "https://x.test/", headers: [] }, open()).catch((e: unknown) => e)
    ).toMatchObject({ kind: "bridge", status: 503, message: "The bridge answered 503." });
  });

  it("refuses a body that is not text, and makes no call: protocol 1 would relay it as {}", async () => {
    for (const body of [new Blob(["x"]), new FormData(), new ArrayBuffer(1)]) {
      const { fetch, calls } = relay({});
      const sent = new BridgeTransport(BRIDGE, fetch).send({ method: "POST", url: "https://a.test", headers: [], body }, open());

      await expect(sent).rejects.toThrow(TransportError);
      await expect(sent).rejects.toThrow("cannot relay a file or multipart body");
      expect(calls).toHaveLength(0);
    }
  });

  it("passes the body on, trims the bridge URL, and times out and cancels like the direct route", async () => {
    const { fetch, calls } = relay({ status: 200, statusText: "OK", headers: {}, body: "", bodyEncoding: "utf8" });
    await new BridgeTransport({ ...BRIDGE, url: "http://127.0.0.1:7717//" }, fetch).send(
      { method: "POST", url: "https://x.test/", headers: [], body: '{"a":1}' },
      open()
    );
    expect(calls[0].url).toBe("http://127.0.0.1:7717/relay");
    expect((JSON.parse(calls[0].init.body as string) as Record<string, unknown>)["body"]).toBe('{"a":1}');

    const hang = new BridgeTransport(BRIDGE, fakeFetch(never).fetch);
    expect(
      await hang.send({ method: "GET", url: "https://x.test/", headers: [] }, { signal: new AbortController().signal, timeoutMs: 20 }).catch((e: unknown) => e)
    ).toMatchObject({ kind: "timeout", message: "Timed out after 20 ms" });
    expect(
      await hang.send({ method: "GET", url: "https://x.test/", headers: [] }, { signal: AbortSignal.abort(), timeoutMs: 0 }).catch((e: unknown) => e)
    ).toMatchObject({ kind: "aborted" });
  });
});
