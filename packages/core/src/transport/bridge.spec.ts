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
  describe("redirects (P5.4)", () => {
    const request = { method: "GET", url: "https://api.test/hop/3", headers: [["X-Probe", "kept"]] as [string, string][] };
    /** A bridge in front of a target that answers `/hop/n` with a 302 to `/hop/n-1`, `/away` with a 307 to another host, and anything else with 200. */
    const hops = () => {
      const relayed: { method: string; url: string; headers: Record<string, string> }[] = [];
      const { fetch } = fakeFetch(({ init }) => {
        const payload = JSON.parse(init.body as string) as { method: string; url: string; headers: Record<string, string> };
        relayed.push(payload);
        const path = new URL(payload.url).pathname;
        const n = Number(/^\/hop\/(\d+)$/.exec(path)?.[1]);
        const answer = (status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify({ status, statusText: "", headers, body: path, bodyEncoding: "utf8" }));
        if (n > 0) return answer(302, { location: `/hop/${n - 1}` });
        if (path === "/away") return answer(307, { location: "https://other.test/landing" });
        if (path === "/loop") return answer(302, { location: "/loop" });
        return answer(200);
      });
      return { transport: new BridgeTransport(BRIDGE, fetch), relayed };
    };

    it("follows nothing, and says nothing of redirects, when the caller says nothing of them", async () => {
      const { transport, relayed } = hops();
      const response = await transport.send(request, open());
      expect(response.status).toBe(302);
      expect(response.redirects).toBeUndefined();
      expect(response.redirected).toBe(false);
      expect(relayed).toHaveLength(1);
      // The bridge is asked for nothing it did not know before: any version of it relays a hop.
      expect(Object.keys(relayed[0]).sort()).toEqual(["headers", "method", "url"]);
    });

    it("makes each hop a relay of its own and lists it: status, the address that answered, Location as received", async () => {
      const { transport, relayed } = hops();
      const response = await transport.send(request, { ...open(), redirects: { follow: true, stayOnHost: false } });
      expect(response.status).toBe(200);
      expect(response.redirects).toEqual({
        chain: [
          { status: 302, url: "https://api.test/hop/3", location: "/hop/2" },
          { status: 302, url: "https://api.test/hop/2", location: "/hop/1" },
          { status: 302, url: "https://api.test/hop/1", location: "/hop/0" },
        ],
      });
      expect(response.redirected).toBe(true);
      expect(response.finalUrl).toBe("https://api.test/hop/0");
      expect(relayed.map((hop) => hop.url)).toEqual(["https://api.test/hop/3", "https://api.test/hop/2", "https://api.test/hop/1", "https://api.test/hop/0"]);
      expect(relayed[3].headers).toEqual({ "X-Probe": "kept" });
    });

    it("with follow off the redirect is the response, and the answer says so", async () => {
      const { transport, relayed } = hops();
      const response = await transport.send(request, { ...open(), redirects: { follow: false, stayOnHost: false } });
      expect(response.status).toBe(302);
      expect(response.redirects).toEqual({ chain: [], stopped: "off" });
      expect(response.finalUrl).toBe("https://api.test/hop/3");
      expect(relayed).toHaveLength(1);
    });

    it("follows 20 redirects and no more", async () => {
      const { transport, relayed } = hops();
      const response = await transport.send({ ...request, url: "https://api.test/loop" }, { ...open(), redirects: { follow: true, stayOnHost: false } });
      expect(response.status).toBe(302);
      expect(response.redirects?.chain).toHaveLength(20);
      expect(response.redirects?.stopped).toBe("limit");
      expect(relayed).toHaveLength(21);
    });

    it("@claim:C-063 a request that is to stay on its host is not relayed to another: the redirect is the response", async () => {
      const { transport, relayed } = hops();
      const secret = { ...request, url: "https://api.test/away", headers: [["X-Api-Key", "s3cret"]] as [string, string][] };
      const response = await transport.send(secret, { ...open(), redirects: { follow: true, stayOnHost: true } });
      expect(response.status).toBe(307);
      expect(response.redirects).toEqual({ chain: [], stopped: "other-host" });
      expect(relayed.map((hop) => hop.url)).toEqual(["https://api.test/away"]);

      // Without the secret it is followed.
      const plain = await transport.send({ ...request, url: "https://api.test/away" }, { ...open(), redirects: { follow: true, stayOnHost: false } });
      expect(plain.finalUrl).toBe("https://other.test/landing");
    });

    it("one timeout holds for the whole chain", async () => {
      const { fetch } = fakeFetch(({ init }) => {
        const payload = JSON.parse(init.body as string) as { url: string };
        return payload.url.endsWith("/hop/1") ? never() : new Response(JSON.stringify({ status: 302, statusText: "", headers: { location: "/hop/1" }, body: "", bodyEncoding: "utf8" }));
      });
      const sent = new BridgeTransport(BRIDGE, fetch).send(request, { signal: new AbortController().signal, timeoutMs: 20, redirects: { follow: true, stayOnHost: false } });
      await expect(sent).rejects.toMatchObject({ kind: "timeout" });
    });
  });
});
