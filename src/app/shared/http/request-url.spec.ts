import { describe, expect, it } from "vitest";
import { buildUrlFromParams, parseParamsFromUrl } from "./request-url";

const row = (key: string, value: string, enabled = true) => ({ key, value, enabled });

describe("Params tab <-> URL field", () => {
  it("reads the query of any endpoint text, parseable as a URL or not", () => {
    expect(parseParamsFromUrl("https://api.test/x?a=1&b=two%20words#frag")).toEqual([
      row("a", "1"),
      row("b", "two words"),
    ]);
    expect(parseParamsFromUrl("httpbin.org/get?a=1")).toEqual([row("a", "1")]);
    expect(parseParamsFromUrl("{{baseUrl}}/users?token={{token}}")).toEqual([row("token", "{{token}}")]);
    expect(parseParamsFromUrl("api.test/x")).toEqual([row("", "")]);
    expect(parseParamsFromUrl("")).toEqual([row("", "")]);
  });

  // U-139: a switched-off row is not in the address, so reading the address again kept none of them.
  it("keeps the switched-off rows it was given, where they stood among the address's", () => {
    const before = [row("a", "1"), row("off", "x", false), row("b", "2"), row("last", "y", false)];
    expect(parseParamsFromUrl("https://api.test/x?a=1&b=2", before)).toEqual(before);
    // The address changed: its rows are read again, the switched-off ones stay in their places.
    expect(parseParamsFromUrl("https://api.test/x?a=9&b=2&c=3", before)).toEqual([
      row("a", "9"),
      row("off", "x", false),
      row("b", "2"),
      row("last", "y", false),
      row("c", "3"),
    ]);
    // An address with no query keeps them too, and no blank row is added beside them.
    expect(parseParamsFromUrl("https://api.test/x", before)).toEqual([row("off", "x", false), row("last", "y", false)]);
  });

  it("rewrites only the query, from the enabled, keyed rows", () => {
    const rows = [row("a", "1"), row("off", "x", false), row("", "ignored"), row("q", "two words&more")];

    expect(buildUrlFromParams("https://api.test/x?old=1#frag", rows)).toBe(
      "https://api.test/x?a=1&q=two%20words%26more#frag",
    );
    expect(buildUrlFromParams("api.test", [row("a", "1")])).toBe("api.test?a=1");
    expect(buildUrlFromParams("https://api.test/x?old=1", [])).toBe("https://api.test/x");
    expect(buildUrlFromParams("", rows)).toBeNull();
  });

  it("keeps {{variables}} as typed, in the host and in a param", () => {
    expect(buildUrlFromParams("{{baseUrl}}/users", [row("token", "{{token}}"), row("{{k}}", "a b{{v}}")])).toBe(
      "{{baseUrl}}/users?token={{token}}&{{k}}=a%20b{{v}}",
    );
  });
});
