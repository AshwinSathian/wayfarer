import { describe, expect, it } from "vitest";
import { afterDirectSend, routeOf } from "./route";

const page = "https://app.test";
// A JSON body makes the browser ask the server first (a preflight); a form body does not.
const json = (method: string) => ({ method, url: "https://api.test/items", headers: [["Content-Type", "application/json"]] as [string, string][] });
const plain = (method: string) => ({
  method,
  url: "https://api.test/items",
  headers: [["Content-Type", "application/x-www-form-urlencoded"]] as [string, string][],
});

describe("routeOf (P6.4)", () => {
  it("is the request's own route, else its collection's, else the device's", () => {
    expect(routeOf("direct", "bridge", "auto")).toBe("direct");
    expect(routeOf(undefined, "bridge", "auto")).toBe("bridge");
    expect(routeOf(undefined, undefined, "auto")).toBe("auto");
  });
});

// D7: auto-routing never sends a request twice that the server may have received once.
const D7 = [
  // A response came: it is the answer, whatever the request.
  ["a preflight, a safe method, a response", json("GET"), false, "keep"],
  ["a preflight, another method, a response", json("POST"), false, "keep"],
  ["no preflight, a safe method, a response", plain("GET"), false, "keep"],
  ["no preflight, another method, a response", plain("POST"), false, "keep"],
  // A network failure after a preflight: the request itself was never sent.
  ["a preflight, a safe method, a network failure", json("GET"), true, "retry"],
  ["a preflight, another method, a network failure", json("POST"), true, "retry"],
  // A safe method may be sent twice.
  ["no preflight, a safe method, a network failure", plain("HEAD"), true, "retry"],
  // The browser may have sent it: the user is asked.
  ["no preflight, another method, a network failure", plain("POST"), true, "ask"],
] as const;

describe("afterDirectSend, D7's eight cases", () => {
  it.each(D7)("@claim:C-064 %s", (_case, request, failed, expected) => {
    expect(afterDirectSend(request, page, failed)).toBe(expected);
  });

  it("reads OPTIONS as safe, and a method in any case", () => {
    expect(afterDirectSend({ ...plain("OPTIONS"), headers: [] }, page, true)).toBe("retry");
    expect(afterDirectSend(plain("get"), page, true)).toBe("retry");
  });

  it("asks for a request to the page's own origin, which never needs a preflight", () => {
    expect(afterDirectSend({ ...json("POST"), url: `${page}/items` }, page, true)).toBe("ask");
  });
});
