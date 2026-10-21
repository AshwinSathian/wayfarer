import { describe, expect, it } from "vitest";
import { cookieHeader, cookiesFor, parseSetCookie, storeCookie, withJarCookies, type Cookie } from "./jar";

const NOW = Date.UTC(2026, 9, 13);
const parse = (header: string, url = "https://api.test/v1/login") => parseSetCookie(header, url, NOW);
const jarOf = (...headers: [string, string?][]) =>
  headers.reduce<Cookie[]>((jar, [header, url]) => {
    const cookie = parse(header, url);
    return cookie ? storeCookie(jar, cookie, NOW) : jar;
  }, []);
const sent = (jar: Cookie[], url: string, now = NOW) => cookieHeader(cookiesFor(jar, url, now));

describe("parseSetCookie", () => {
  it("reads a name and a value, and gives a cookie without attributes the request's host and default path", () => {
    expect(parse("sid=abc123")).toEqual({
      name: "sid",
      value: "abc123",
      domain: "api.test",
      hostOnly: true,
      path: "/v1",
      secure: false,
      httpOnly: false,
      created: NOW,
    });
  });

  it("reads the attributes, in any case and order", () => {
    expect(parse("sid=a=b; SECURE; httponly; Path=/app; Domain=.API.test; SameSite=Lax; Max-Age=60")).toEqual({
      name: "sid",
      value: "a=b",
      domain: "api.test",
      hostOnly: false,
      path: "/app",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      expires: NOW + 60_000,
      created: NOW,
    });
  });

  it("takes Max-Age over Expires, and reads Expires as a date with its comma", () => {
    expect(parse("a=1; Expires=Wed, 14 Oct 2026 00:00:00 GMT")?.expires).toBe(Date.UTC(2026, 9, 14));
    expect(parse("a=1; Expires=Wed, 14 Oct 2026 00:00:00 GMT; Max-Age=10")?.expires).toBe(NOW + 10_000);
    expect(parse("a=1; Max-Age=0")?.expires).toBe(0);
    expect(parse("a=1; Max-Age=-5")?.expires).toBe(0);
    expect(parse("a=1; Expires=never; Max-Age=soon")?.expires).toBeUndefined();
  });

  it("a path that does not start with a slash is the default path, and the default of a top-level address is /", () => {
    expect(parse("a=1; Path=app")?.path).toBe("/v1");
    expect(parse("a=1", "https://api.test/login")?.path).toBe("/");
    expect(parse("a=1", "https://api.test")?.path).toBe("/");
    expect(parse("a=1", "https://api.test/a/b/c?x=/y/z")?.path).toBe("/a/b");
  });

  it("refuses what is no cookie: no =, no name, a control character, more than 4096 bytes", () => {
    expect(parse("justtext")).toBeUndefined();
    expect(parse("=value")).toBeUndefined();
    expect(parse("a=b\u0000c")).toBeUndefined();
    expect(parse(`a=${"x".repeat(4096)}`)).toBeUndefined();
    expect(parse("a=1", "not a url")).toBeUndefined();
  });

  it("refuses a Domain the request's host does not belong to, and one that is a bare suffix", () => {
    expect(parse("a=1; Domain=other.test")).toBeUndefined();
    expect(parse("a=1; Domain=pi.test")).toBeUndefined();
    expect(parse("a=1; Domain=test")).toBeUndefined();
    expect(parse("a=1; Domain=test", "https://sub.api.test/")).toBeUndefined();
    expect(parse("a=1; Domain=api.test", "https://sub.api.test/")?.domain).toBe("api.test");
    // A host with no dot may name itself: the cookie is then that host's alone.
    expect(parse("a=1; Domain=localhost", "http://localhost:3000/")).toMatchObject({
      domain: "localhost",
      hostOnly: true,
    });
    // An IP address is never a suffix of anything.
    expect(parse("a=1; Domain=0.0.1", "http://127.0.0.1/")).toBeUndefined();
    expect(parse("a=1; Domain=127.0.0.1", "http://127.0.0.1/")).toMatchObject({ domain: "127.0.0.1", hostOnly: true });
  });

  it("refuses a Secure cookie set without TLS, and holds the __Secure- and __Host- prefixes to their rules", () => {
    expect(parse("a=1; Secure", "http://api.test/")).toBeUndefined();
    expect(parse("__Secure-a=1")).toBeUndefined();
    expect(parse("__Secure-a=1; Secure")).toBeDefined();
    expect(parse("__Host-a=1; Secure; Path=/")).toBeDefined();
    expect(parse("__Host-a=1; Secure; Path=/v1")).toBeUndefined();
    expect(parse("__Host-a=1; Secure; Path=/; Domain=api.test")).toBeUndefined();
    expect(parse("__Host-a=1; Path=/")).toBeUndefined();
  });
});

describe("storeCookie", () => {
  it("replaces the cookie of the same name, domain and path, and keeps when it was first set", () => {
    const first = parse("sid=1")!;
    const second = { ...parse("sid=2")!, created: NOW + 5 };
    expect(storeCookie([first], second, NOW)).toEqual([{ ...second, created: NOW }]);
    expect(storeCookie([first], parse("sid=3; Path=/other")!, NOW)).toHaveLength(2);
  });

  it("a cookie that has expired removes the one it names, and is not kept itself", () => {
    const jar = jarOf(["sid=1"], ["other=1"]);
    expect(storeCookie(jar, parse("sid=gone; Max-Age=0")!, NOW).map((cookie) => cookie.name)).toEqual(["other"]);
  });

  it("holds no more than 1000 cookies: the oldest go first", () => {
    let jar: Cookie[] = [];
    for (let n = 0; n < 1005; n++) jar = storeCookie(jar, { ...parse(`c${n}=1`)!, created: NOW + n }, NOW);
    expect(jar).toHaveLength(1000);
    expect(jar[0].name).toBe("c5");
  });
});

describe("cookiesFor", () => {
  it("sends a host-only cookie to its host alone, and a Domain cookie to the domain and what is under it", () => {
    const jar = jarOf(["host=1; Path=/"], ["wide=1; Path=/; Domain=api.test"]);
    expect(sent(jar, "https://api.test/x")).toBe("host=1; wide=1");
    expect(sent(jar, "https://sub.api.test/x")).toBe("wide=1");
    expect(sent(jar, "https://notapi.test/x")).toBe("");
    expect(sent(jar, "https://api.test.evil.example/x")).toBe("");
  });

  it("sends a cookie to its path and below, on a whole segment", () => {
    const jar = jarOf(["a=1; Path=/app"]);
    expect(sent(jar, "https://api.test/app")).toBe("a=1");
    expect(sent(jar, "https://api.test/app/x?y=1")).toBe("a=1");
    expect(sent(jar, "https://api.test/application")).toBe("");
    expect(sent(jar, "https://api.test/")).toBe("");
    expect(sent(jarOf(["b=1; Path=/app/"]), "https://api.test/app/x")).toBe("b=1");
  });

  it("sends a Secure cookie over TLS only, and whatever the port", () => {
    const jar = jarOf(["s=1; Secure; Path=/"], ["p=1; Path=/"]);
    expect(sent(jar, "https://api.test:8443/")).toBe("s=1; p=1");
    expect(sent(jar, "http://api.test/")).toBe("p=1");
  });

  it("sends no cookie that has expired, and a session cookie for as long as it is in the jar", () => {
    const jar = jarOf(["short=1; Max-Age=10; Path=/"], ["session=1; Path=/"]);
    expect(sent(jar, "https://api.test/", NOW + 9_999)).toBe("short=1; session=1");
    expect(sent(jar, "https://api.test/", NOW + 10_000)).toBe("session=1");
  });

  it("puts the longer path first, then the cookie set earlier", () => {
    const jar = [
      { ...parse("late=1; Path=/")!, created: NOW + 2 },
      { ...parse("early=1; Path=/")!, created: NOW + 1 },
      { ...parse("deep=1; Path=/v1/login")!, created: NOW + 3 },
    ];
    expect(sent(jar, "https://api.test/v1/login")).toBe("deep=1; early=1; late=1");
  });

  it("gives nothing for an address that is no http or https URL", () => {
    expect(cookiesFor(jarOf(["a=1; Path=/"]), "ws://api.test/", NOW)).toEqual([]);
    expect(cookiesFor(jarOf(["a=1; Path=/"]), "{{base}}/x", NOW)).toEqual([]);
  });
});

describe("withJarCookies", () => {
  const jar = jarOf(["sid=1; Path=/"], ["theme=dark; Path=/"]);
  const cookies = cookiesFor(jar, "https://api.test/", NOW);

  it("adds a Cookie header when the request has none, and none when the jar has nothing for it", () => {
    expect(withJarCookies([["Accept", "*/*"]], cookies)).toEqual([
      ["Accept", "*/*"],
      ["Cookie", "sid=1; theme=dark"],
    ]);
    expect(withJarCookies([["Accept", "*/*"]], [])).toEqual([["Accept", "*/*"]]);
  });

  it("adds to the request's own Cookie header, whose names win over the jar's", () => {
    expect(withJarCookies([["cookie", "theme=light; mine=1"]], cookies)).toEqual([
      ["cookie", "theme=light; mine=1; sid=1"],
    ]);
    expect(withJarCookies([["Cookie", "sid=x; theme=y"]], cookies)).toEqual([["Cookie", "sid=x; theme=y"]]);
  });
});
