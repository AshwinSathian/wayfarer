import { describe, expect, it } from "vitest";
import { browserLimits, type LimitsRequest } from "./browser-limits";

const PAGE = "https://wayfarer.example";
const limits = (request: Partial<LimitsRequest>, origin = PAGE, route: "direct" | "bridge" = "direct") =>
  browserLimits({ method: "GET", url: "https://api.example/items", headers: [], ...request }, { origin, route });
const preflight = (request: Partial<LimitsRequest>) => limits(request).preflight;

describe("browserLimits: does the browser ask the server first? (Fetch, CORS-preflight; P2.14)", () => {
  // The ten cases of the AC, each a rule of the Fetch standard's "CORS-safelisted" definitions.
  it("1. GET with no headers of the user's is sent at once", () => {
    expect(preflight({})).toEqual([]);
  });

  it("2. HEAD and POST are sent at once too", () => {
    expect(preflight({ method: "HEAD" })).toEqual([]);
    expect(preflight({ method: "POST" })).toEqual([]);
  });

  it("3. any other method is asked for first", () => {
    expect(preflight({ method: "PUT" })).toEqual(["the method PUT"]);
    expect(preflight({ method: "DELETE" })).toEqual(["the method DELETE"]);
    expect(preflight({ method: "PATCH" })).toEqual(["the method PATCH"]);
  });

  it("4. the three form content types need no question, with or without parameters", () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded; charset=UTF-8", "multipart/form-data; boundary=x", "TEXT/PLAIN"]) {
      expect(preflight({ method: "POST", headers: [["Content-Type", type]] })).toEqual([]);
    }
  });

  it("5. any other content type does: a JSON body is asked for first", () => {
    expect(preflight({ method: "POST", headers: [["Content-Type", "application/json"]] })).toEqual(["Content-Type: application/json"]);
    expect(preflight({ method: "POST", headers: [["content-type", "text/xml"]] })).toEqual(["Content-Type: text/xml"]);
  });

  it("6. a header outside the safelist is asked for first", () => {
    expect(preflight({ headers: [["Authorization", "Bearer t"]] })).toEqual(["the header Authorization"]);
    expect(preflight({ headers: [["X-Api-Key", "k"], ["x-trace", "1"]] })).toEqual(["the header X-Api-Key", "the header x-trace"]);
  });

  it("7. Accept, Accept-Language and Content-Language are safelisted while their value is plain", () => {
    expect(preflight({ headers: [["Accept", "application/json"], ["Accept-Language", "en-US,en;q=0.9"], ["Content-Language", "de"]] })).toEqual([]);
    expect(preflight({ headers: [["Accept", "text/html, (x)"]] })).toEqual(["the value of Accept"]);
    expect(preflight({ headers: [["Accept-Language", "en@US"]] })).toEqual(["the value of Accept-Language"]);
  });

  it("8. Range is safelisted for one simple byte range only", () => {
    expect(preflight({ headers: [["Range", "bytes=0-99"]] })).toEqual([]);
    expect(preflight({ headers: [["Range", "bytes=100-"]] })).toEqual([]);
    expect(preflight({ headers: [["Range", "bytes=0-99,200-299"]] })).toEqual(["the value of Range"]);
    expect(preflight({ headers: [["Range", "bytes=-500"]] })).toEqual(["the value of Range"]);
  });

  it("9. a safelisted value over 128 bytes, or safelisted values over 1024 bytes together, are asked for first", () => {
    expect(preflight({ headers: [["Accept", "a".repeat(128)]] })).toEqual([]);
    expect(preflight({ headers: [["Accept", "a".repeat(129)]] })).toEqual(["the value of Accept"]);
    // Bytes, not characters.
    expect(preflight({ headers: [["Accept", "é".repeat(65)]] })).toEqual(["the value of Accept"]);
    const many: [string, string][] = Array.from({ length: 9 }, () => ["Accept", "a".repeat(120)]);
    expect(preflight({ headers: many })).toEqual(["safelisted headers over 1024 bytes together"]);
  });

  it("10. a request to the page's own origin is never asked for first", () => {
    const own = limits({ method: "PUT", url: `${PAGE}/api`, headers: [["Authorization", "x"], ["Content-Type", "application/json"]] });
    expect(own.crossOrigin).toBe(false);
    expect(own.preflight).toEqual([]);
  });

  it("gives every reason, in the order method, headers", () => {
    expect(preflight({ method: "PUT", headers: [["Content-Type", "application/json"], ["Authorization", "x"]] })).toEqual([
      "the method PUT",
      "Content-Type: application/json",
      "the header Authorization",
    ]);
  });
});

describe("browserLimits: headers the browser does not let a page set", () => {
  it("lists a forbidden header the user set, as written, and does not count it for the preflight", () => {
    const result = limits({ headers: [["Cookie", "a=1"], ["host", "x"], ["Accept", "*/*"], ["Sec-Fetch-Site", "none"], ["Proxy-Authorization", "x"]] });
    expect(result.dropped).toEqual(["Cookie", "host", "Sec-Fetch-Site", "Proxy-Authorization"]);
    expect(result.preflight).toEqual([]);
  });

  it("knows the whole list of the Fetch standard", () => {
    const names = ["Accept-Charset", "Accept-Encoding", "Access-Control-Request-Headers", "Access-Control-Request-Method", "Connection", "Content-Length", "Cookie", "Cookie2", "Date", "DNT", "Expect", "Host", "Keep-Alive", "Origin", "Referer", "Set-Cookie", "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Via"];
    expect(limits({ headers: names.map((name) => [name, "x"]) }).dropped).toEqual(names);
  });

  it("does not list a header a page may set", () => {
    expect(limits({ headers: [["User-Agent", "x"], ["Authorization", "x"], ["X-Sec-Thing", "x"], ["Security", "x"]] }).dropped).toEqual([]);
  });

  it("lists a method override that names a method browsers refuse", () => {
    expect(limits({ headers: [["X-HTTP-Method-Override", "TRACE"]] }).dropped).toEqual(["X-HTTP-Method-Override"]);
    expect(limits({ headers: [["X-HTTP-Method-Override", "PATCH"]] }).dropped).toEqual([]);
  });
});

describe("browserLimits: mixed content", () => {
  it("@claim:C-049 an http:// target from an HTTPS page will be blocked", () => {
    expect(limits({ url: "http://example.invalid/x" }).mixedContent).toBe("blocked");
  });

  it("this machine is the exception, in some browsers", () => {
    for (const url of ["http://localhost:3000/", "http://127.0.0.1/", "http://127.8.9.10:8080/", "http://[::1]:8080/", "http://api.localhost/"]) {
      expect(limits({ url }).mixedContent).toBe("loopback");
    }
    expect(limits({ url: "http://127.example.com/" }).mixedContent).toBe("blocked");
    expect(limits({ url: "http://localhost.example.com/" }).mixedContent).toBe("blocked");
  });

  it("is not a matter for an https:// target, or for a page that is itself http://", () => {
    expect(limits({ url: "https://example.invalid/x" }).mixedContent).toBeNull();
    expect(limits({ url: "http://example.invalid/x" }, "http://localhost:4200").mixedContent).toBeNull();
  });
});

describe("browserLimits: what is added and what is left out", () => {
  it("Origin goes with a request to another origin, and with any request that is not GET or HEAD", () => {
    expect(limits({}).adds).toContain("Origin");
    expect(limits({ url: `${PAGE}/x` }).adds).not.toContain("Origin");
    expect(limits({ url: `${PAGE}/x`, method: "POST" }).adds).toContain("Origin");
  });

  it("the Sec-Fetch headers always go, and the defaults only where the user set none", () => {
    expect(limits({}).adds).toEqual(["Origin", "Sec-Fetch-Dest", "Sec-Fetch-Mode", "Sec-Fetch-Site", "Accept", "Accept-Encoding", "Accept-Language", "User-Agent"]);
    expect(limits({ headers: [["accept", "text/plain"], ["User-Agent", "mine"], ["Accept-Language", "de"]] }).adds).toEqual([
      "Origin",
      "Sec-Fetch-Dest",
      "Sec-Fetch-Mode",
      "Sec-Fetch-Site",
      "Accept-Encoding",
    ]);
  });

  it("Wayfarer sends no Referer and no cookies (D23)", () => {
    expect(limits({}).suppresses).toEqual(["Referer", "Cookie"]);
  });
});

describe("browserLimits: the edges", () => {
  it("says nothing about origins for a URL it cannot read, such as one with a variable left in it", () => {
    const result = limits({ url: "{{base}}/items", method: "PUT", headers: [["Cookie", "a"]] });
    expect(result).toMatchObject({ crossOrigin: false, preflight: [], mixedContent: null, dropped: ["Cookie"] });
  });

  it("through the Local Bridge none of it applies: Node sends the request, and only the headers of its own connection are left out", () => {
    const headers: [string, string][] = [["Cookie", "a"], ["Host", "b"], ["Content-Length", "3"], ["Origin", "https://x.example"], ["Connection", "close"]];
    expect(limits({ method: "PUT", url: "http://example.invalid/", headers }, PAGE, "bridge")).toEqual({
      route: "bridge",
      dropped: ["Host", "Content-Length", "Connection"],
      crossOrigin: false,
      preflight: [],
      mixedContent: null,
      adds: [],
      suppresses: [],
    });
  });
});
