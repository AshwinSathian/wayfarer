import { describe, expect, it } from "vitest";
import { BinaryBody, decodeEnvelope } from "../http/response-body";
import { cookiesFor, parseSetCookie, storeCookie, type Cookie } from "../cookies/jar";
import { BRIDGE_MISMATCH, BridgeTransport, bridgeHealthProblem } from "./bridge";
import { fakeFetch, never } from "./fake-fetch";
import { TransportError } from "./transport";

const BRIDGE = { url: "http://127.0.0.1:7717", token: "test-token" };
const open = () => ({ signal: new AbortController().signal, timeoutMs: 0 });
const relay = (envelope: unknown, init: ResponseInit = { status: 200 }) =>
  fakeFetch(() => new Response(JSON.stringify(envelope), init));
const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
/** A target's response as the bridge answers it. */
const answer = (status: number, headers: [string, string][] = [], body: string | Uint8Array = "", statusText = "") => {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return { status, statusText, headers, bodyB64: base64(bytes), encodedSize: bytes.length, decodedSize: bytes.length };
};
/** What the page asked the bridge to send. */
interface Relayed {
  method: string;
  url: string;
  headers: [string, string][];
  bodyB64?: string;
  timeoutMs?: number;
}
const relayed = (init: RequestInit): Relayed => JSON.parse(init.body as string) as Relayed;

// Ported from http-transport.spec.ts ("when the Local Bridge is enabled").
describe("BridgeTransport", () => {
  it("relays the request to the bridge with the token header and unwraps a successful target response", async () => {
    const { fetch, calls } = relay(answer(200, [["Content-Type", "application/json"]], JSON.stringify({ ok: true }), "OK"));

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
    // Exactly the fields the bridge reads: it refuses one it does not know. No body, so no `bodyB64`; no timeout, so none.
    expect(relayed(calls[0].init)).toEqual({ method: "GET", url: "https://internal.example.com/data", headers: [["Accept", "application/json"]] });
    // The names in lower case, as a direct response has them.
    expect(response.headers).toEqual([["content-type", "application/json"]]);
    expect(response.sizes).toEqual({ encoded: 11, decoded: 11 });
  });

  it("surfaces a non-2xx target status (relayed successfully by the bridge) as an error", async () => {
    const { fetch } = relay(answer(404, [["content-type", "application/json"]], JSON.stringify({ message: "not found" }), "Not Found"));

    const response = await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://internal.example.com/missing", headers: [] }, open());

    expect(response.status).toBe(404);
    expect(decodeEnvelope(response)).toEqual({ message: "not found" });
  });

  it("a body in another charset is the target's bytes, read by the charset its type names (P0.4; F23)", async () => {
    // "café" in ISO 8859-1: the é is one byte, which is not UTF-8.
    const { fetch } = relay(answer(200, [["content-type", "text/plain; charset=iso-8859-1"]], Uint8Array.of(0x63, 0x61, 0x66, 0xe9)));

    const response = await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://internal.example.com/latin1", headers: [] }, open());

    expect(decodeEnvelope(response)).toBe("café");
    // The headers shown are the target's own.
    expect(response.headers).toEqual([["content-type", "text/plain; charset=iso-8859-1"]]);
    expect(Array.from(new Uint8Array(response.body as ArrayBuffer))).toEqual([0x63, 0x61, 0x66, 0xe9]);
  });

  it("returns a binary target body as BinaryBody, not a binary string (P0.4, #62)", async () => {
    const { fetch } = relay(answer(200, [["Content-Type", "image/png"]], Uint8Array.of(0x89, 0x50, 0x4e, 0x47)));

    const body = decodeEnvelope(await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://internal.example.com/i.png", headers: [] }, open()));

    expect(body).toBeInstanceOf(BinaryBody);
    expect(Array.from(new Uint8Array((body as BinaryBody).bytes as ArrayBuffer))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("a decoded body comes with both sizes: what came over the wire, and what it is", async () => {
    const { fetch } = relay({ ...answer(200, [["Content-Encoding", "gzip"]], "x".repeat(1000)), encodedSize: 29 });

    const response = await new BridgeTransport(BRIDGE, fetch).send({ method: "GET", url: "https://x.test/", headers: [] }, open());

    expect(response.sizes).toEqual({ encoded: 29, decoded: 1000 });
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

  it("an answer of another shape is an error, never a response made of it; and the bridge's own status is named when it sends no JSON", async () => {
    const send = (envelope: unknown) => new BridgeTransport(BRIDGE, relay(envelope).fetch).send({ method: "GET", url: "https://x.test/", headers: [] }, open()).catch((e: unknown) => e);
    for (const wrong of [
      // As Local Bridge 1 answered.
      { status: 200, statusText: "OK", headers: { "content-type": "text/plain" }, body: "hello", bodyEncoding: "utf8" },
      { ...answer(200), bodyB64: "not base64!" },
      { ...answer(200), bodyB64: undefined },
      { ...answer(200), headers: [["a"]] },
      { ...answer(200), status: "200" },
      { ...answer(200), decodedSize: 5 },
      [answer(200)],
      null,
    ]) {
      expect(await send(wrong)).toMatchObject({ kind: "bridge", message: BRIDGE_MISMATCH });
    }

    const down = fakeFetch(() => new Response("<html>", { status: 503 }));
    expect(
      await new BridgeTransport(BRIDGE, down.fetch).send({ method: "GET", url: "https://x.test/", headers: [] }, open()).catch((e: unknown) => e)
    ).toMatchObject({ kind: "bridge", status: 503, message: "The bridge answered 503." });
    const garbled = fakeFetch(() => new Response("<html>", { status: 200 }));
    expect(await new BridgeTransport(BRIDGE, garbled.fetch).send({ method: "GET", url: "https://x.test/", headers: [] }, open()).catch((e: unknown) => e)).toMatchObject({ kind: "bridge", message: BRIDGE_MISMATCH });
  });

  it("a bridge that does not know the path is of another version, and the message says to update it (P6.3)", async () => {
    // What Local Bridge 1.1.0 answers to a path it does not have.
    const { fetch, calls } = relay({ error: "not found" }, { status: 404 });

    const error = await new BridgeTransport(BRIDGE, fetch).send({ method: "POST", url: "https://x.test/", headers: [["A", "1"]], body: "secret" }, open()).catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: "bridge", status: 404, message: BRIDGE_MISMATCH });
    expect(BRIDGE_MISMATCH).toContain("Update the Local Bridge");
    expect(calls).toHaveLength(1);
  });

  it("relays a body that is not text as its bytes: a file, bytes, and a form with the boundary fetch would write", async () => {
    const bytes = Uint8Array.of(0x00, 0xff, 0xfe, 0x80);
    for (const body of [new Blob([bytes]), bytes.buffer]) {
      const { fetch, calls } = relay(answer(200));
      await new BridgeTransport(BRIDGE, fetch).send({ method: "POST", url: "https://a.test", headers: [["Content-Type", "application/octet-stream"]], body }, open());

      expect(Array.from(fromBase64(relayed(calls[0].init).bodyB64 ?? ""))).toEqual([0x00, 0xff, 0xfe, 0x80]);
      expect(relayed(calls[0].init).headers).toEqual([["Content-Type", "application/octet-stream"]]);
    }

    const form = new FormData();
    form.set("name", "Ann");
    form.set("file", new Blob([bytes], { type: "application/octet-stream" }), "four.bin");
    const { fetch, calls } = relay(answer(200));
    await new BridgeTransport(BRIDGE, fetch).send({ method: "POST", url: "https://a.test", headers: [["X-Probe", "1"]], body: form }, open());

    const sent = relayed(calls[0].init);
    const type = sent.headers.find(([name]) => name === "Content-Type")?.[1] ?? "";
    expect(type).toMatch(/^multipart\/form-data; boundary=/);
    expect(sent.headers[0]).toEqual(["X-Probe", "1"]);
    // The body is what a server reads as that form: parsed again, it is the form.
    const parsed = await new Response(fromBase64(sent.bodyB64 ?? ""), { headers: { "Content-Type": type } }).formData();
    expect(parsed.get("name")).toBe("Ann");
    expect(Array.from(new Uint8Array(await (parsed.get("file") as File).arrayBuffer()))).toEqual([0x00, 0xff, 0xfe, 0x80]);
    expect((parsed.get("file") as File).name).toBe("four.bin");
  });

  it("a form's Content-Type is the one with the boundary, also when the request names one of its own", async () => {
    const form = new FormData();
    form.set("a", "1");
    const { fetch, calls } = relay(answer(200));
    await new BridgeTransport(BRIDGE, fetch).send({ method: "POST", url: "https://a.test", headers: [["content-type", "multipart/form-data"]], body: form }, open());

    const types = relayed(calls[0].init).headers.filter(([name]) => name.toLowerCase() === "content-type");
    expect(types).toHaveLength(1);
    expect(types[0][1]).toMatch(/boundary=/);
  });

  it("passes the body on as UTF-8, the timeout with it, trims the bridge URL, and times out and cancels like the direct route", async () => {
    const { fetch, calls } = relay(answer(200));
    await new BridgeTransport({ ...BRIDGE, url: "http://127.0.0.1:7717//" }, fetch).send(
      { method: "POST", url: "https://x.test/", headers: [], body: '{"a":"é☃"}' },
      { signal: new AbortController().signal, timeoutMs: 5000 }
    );
    expect(calls[0].url).toBe("http://127.0.0.1:7717/relay");
    expect(new TextDecoder().decode(fromBase64(relayed(calls[0].init).bodyB64 ?? ""))).toBe('{"a":"é☃"}');
    // The bridge's deadline is the request's: without it the bridge would wait its own 30 s.
    expect(relayed(calls[0].init).timeoutMs).toBe(5000);

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
      const hopsRelayed: Relayed[] = [];
      const { fetch } = fakeFetch(({ init }) => {
        const payload = relayed(init);
        hopsRelayed.push(payload);
        const path = new URL(payload.url).pathname;
        const n = Number(/^\/hop\/(\d+)$/.exec(path)?.[1]);
        const reply = (status: number, headers: [string, string][] = []) => new Response(JSON.stringify(answer(status, headers, path)));
        if (n > 0) return reply(302, [["Location", `/hop/${n - 1}`]]);
        if (path === "/away") return reply(307, [["location", "https://other.test/landing"]]);
        if (path === "/loop") return reply(302, [["location", "/loop"]]);
        return reply(200);
      });
      return { transport: new BridgeTransport(BRIDGE, fetch), relayed: hopsRelayed };
    };

    it("follows nothing, and says nothing of redirects, when the caller says nothing of them", async () => {
      const { transport, relayed } = hops();
      const response = await transport.send(request, open());
      expect(response.status).toBe(302);
      expect(response.redirects).toBeUndefined();
      expect(response.redirected).toBe(false);
      expect(relayed).toHaveLength(1);
      // The bridge is asked to follow nothing: it relays a hop, and the page decides the next.
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
      expect(relayed[3].headers).toEqual([["X-Probe", "kept"]]);
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
        return payload.url.endsWith("/hop/1") ? never() : new Response(JSON.stringify(answer(302, [["location", "/hop/1"]])));
      });
      const sent = new BridgeTransport(BRIDGE, fetch).send(request, { signal: new AbortController().signal, timeoutMs: 20, redirects: { follow: true, stayOnHost: false } });
      await expect(sent).rejects.toMatchObject({ kind: "timeout" });
    });
  });
  describe("cookies (P5.3)", () => {
    const NOW = Date.UTC(2026, 9, 13);
    /** A jar as the app holds one, and a bridge in front of a target that signs in with a redirect: `/login` sets `sid` and sends on to `/home`. */
    const signIn = () => {
      let jar: Cookie[] = [];
      const hopsRelayed: Relayed[] = [];
      const { fetch } = fakeFetch(({ init }) => {
        const payload = relayed(init);
        hopsRelayed.push(payload);
        const path = new URL(payload.url).pathname;
        const reply = (status: number, list: [string, string][]) => new Response(JSON.stringify(answer(status, list, path)));
        if (path === "/login") return reply(302, [["Location", "/home"], ["Set-Cookie", "sid=abc; Path=/; Expires=Wed, 14 Oct 2026 00:00:00 GMT"], ["Set-Cookie", "theme=dark; Path=/"]]);
        return reply(200, [["Content-Type", "text/plain"]]);
      });
      const cookies = {
        for: (url: string) => cookiesFor(jar, url, NOW),
        store: (url: string, headers: string[]) => {
          for (const header of headers) {
            const cookie = parseSetCookie(header, url, NOW);
            if (cookie) jar = storeCookie(jar, cookie, NOW);
          }
        },
      };
      return { transport: new BridgeTransport(BRIDGE, fetch), relayed: hopsRelayed, cookies, jar: () => jar };
    };
    const request = { method: "POST", url: "https://api.test/login", headers: [] as [string, string][], body: "user=a" };
    const cookie = (hop: Relayed) => hop.headers.find(([name]) => name === "Cookie")?.[1];

    it("gives the response's headers one by one, as the bridge lists them", async () => {
      const { transport } = signIn();
      const response = await transport.send(request, open());
      // Names in lower case, as a direct response has them.
      expect(response.headers).toEqual([["location", "/home"], ["set-cookie", "sid=abc; Path=/; Expires=Wed, 14 Oct 2026 00:00:00 GMT"], ["set-cookie", "theme=dark; Path=/"]]);
    });

    it("a cookie that one hop sets goes out with the next, and both are in the jar afterwards", async () => {
      const { transport, relayed, cookies, jar } = signIn();
      const response = await transport.send(request, { ...open(), redirects: { follow: true, stayOnHost: false }, cookies });
      expect(response.status).toBe(200);
      expect(relayed.map((hop) => [hop.url, cookie(hop)])).toEqual([["https://api.test/login", undefined], ["https://api.test/home", "sid=abc; theme=dark"]]);
      expect(jar().map((cookie) => cookie.name)).toEqual(["sid", "theme"]);

      // And with the request after that.
      await transport.send({ method: "GET", url: "https://api.test/me", headers: [["Cookie", "mine=1"]] }, { ...open(), cookies });
      expect(relayed[2].headers).toEqual([["Cookie", "mine=1; sid=abc; theme=dark"]]);
    });

    it("without a jar nothing is added and nothing is kept", async () => {
      const { transport, relayed, jar } = signIn();
      await transport.send(request, { ...open(), redirects: { follow: true, stayOnHost: false } });
      expect(cookie(relayed[1])).toBeUndefined();
      expect(jar()).toEqual([]);
    });

    it("an answer from before the list, with Set-Cookie joined into one line, is an answer of another shape: nothing of it is kept", async () => {
      let jar: string[] = [];
      const cookies = { for: () => [], store: (_url: string, headers: string[]) => void (jar = [...jar, ...headers]) };
      const { fetch } = relay({ status: 200, statusText: "", headers: { "set-cookie": "sid=abc; Expires=Wed, 14 Oct 2026 00:00:00 GMT, theme=dark" }, body: "", bodyEncoding: "utf8" });

      await expect(new BridgeTransport(BRIDGE, fetch).send(request, { ...open(), cookies })).rejects.toMatchObject({ message: BRIDGE_MISMATCH });
      expect(jar).toEqual([]);
    });
  });
});

describe("what a request asks of the bridge beyond its method, address, headers and body (P6.1)", () => {
  const GET = { method: "GET", url: "https://internal.example.com/x", headers: [] as [string, string][] };

  it("a request is one relay, with no field it does not need", async () => {
    const { fetch, calls } = relay(answer(200, [], "ok"));
    const response = await new BridgeTransport(BRIDGE, fetch).send(GET, open());
    expect(calls.map((call) => call.url)).toEqual(["http://127.0.0.1:7717/relay"]);
    expect(relayed(calls[0].init)).toEqual({ method: "GET", url: GET.url, headers: [] });
    expect(response.tlsInsecure).toBeUndefined();
  });

  it("TLS verification off: the request says tls.insecure, and the response says it was sent so", async () => {
    const { fetch, calls } = relay(answer(200, [], "ok"));
    const response = await new BridgeTransport(BRIDGE, fetch).send(GET, { ...open(), tlsInsecure: true });
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([["POST", "http://127.0.0.1:7717/relay"]]);
    expect(relayed(calls[0].init)).toEqual({ method: "GET", url: GET.url, headers: [], tls: { insecure: true } });
    expect(response.tlsInsecure).toBe(true);
  });

  it("a Host header goes in the header list as written", async () => {
    const { fetch, calls } = relay(answer(200, [], "ok"));
    await new BridgeTransport(BRIDGE, fetch).send({ ...GET, headers: [["Host", "api.internal"]] }, open());
    expect(relayed(calls[0].init)).toEqual({ method: "GET", url: GET.url, headers: [["Host", "api.internal"]] });
  });

  it("timings are the bridge's when each is a number of 0 or more; an answer without them, or with one that is not, has none of that phase", async () => {
    const timed = async (timings: unknown) => (await new BridgeTransport(BRIDGE, relay({ ...answer(200), timings }).fetch).send(GET, open())).timings;
    expect(await timed({ dns: 1.5, tcp: 2, tls: 30, ttfb: 40, content: 0 })).toEqual({ dns: 1.5, tcp: 2, tls: 30, ttfb: 40, content: 0 });
    expect(await timed({ tcp: 2, ttfb: 40, content: 3 })).toEqual({ tcp: 2, ttfb: 40, content: 3 });
    expect(await timed({ tcp: -1, ttfb: "40", content: Number.NaN, tls: null, other: 5, dns: 7 })).toEqual({ dns: 7 });
    expect(await timed(undefined)).toBeUndefined();
    expect(await timed("fast")).toBeUndefined();
    expect(await timed([1, 2])).toBeUndefined();
    expect(await timed({})).toBeUndefined();
  });

  it("every hop of a chain of redirects is sent with verification off", async () => {
    const { fetch, calls } = fakeFetch((call) => {
      const url = relayed(call.init).url;
      return new Response(JSON.stringify(url.endsWith("/a") ? answer(302, [["Location", "/b"]]) : answer(200, [], "end")));
    });
    const response = await new BridgeTransport(BRIDGE, fetch).send({ ...GET, url: "https://internal.example.com/a" }, { ...open(), tlsInsecure: true, redirects: { follow: true, stayOnHost: false } });
    expect(calls.map((call) => call.url.replace("http://127.0.0.1:7717", ""))).toEqual(["/relay", "/relay"]);
    expect(calls.map((call) => (relayed(call.init) as Relayed & { tls?: unknown }).tls)).toEqual([{ insecure: true }, { insecure: true }]);
    expect(response.tlsInsecure).toBe(true);
    expect(response.redirects?.chain).toHaveLength(1);
  });
});

describe("bridgeHealthProblem: what /health says of a bridge (P6.3)", () => {
  it("an answer that says ok is a bridge", () => {
    expect(bridgeHealthProblem({ ok: true, name: "wayfarer-bridge", version: "2.3.0" })).toBeUndefined();
  });

  it("what is no health answer is said to be none", () => {
    for (const wrong of [null, [], "ok", 7, {}, { ok: false, version: "2.0.0" }, { ok: "true" }]) expect(bridgeHealthProblem(wrong)).toBe("What answered at this address is not a Local Bridge.");
  });
});
