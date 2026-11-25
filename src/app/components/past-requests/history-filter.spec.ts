import { describe, expect, it } from "vitest";
import { historyEntry } from "../../../testing/request-fixtures";
import { addressParts, matches, parseFilter } from "./history-filter";

const entries = [
  {
    id: 1,
    ...historyEntry({ method: "GET", url: "https://api.test/users", status: 200, createdAt: 1 }),
    durationMs: 40,
  },
  {
    id: 2,
    ...historyEntry({ method: "POST", url: "https://api.test/orders", status: 503, createdAt: 2 }),
    durationMs: 900,
    route: "bridge" as const,
  },
  { id: 3, ...historyEntry({ method: "GET", url: "https://other.test/x", createdAt: 3 }), response: undefined },
];
const ids = (query: string) => entries.filter((entry) => matches(entry, query)).map((entry) => entry.id);

describe("history filter tokens", () => {
  it("reads a token by its name and any other word as a word, a URL's scheme among them", () => {
    expect(parseFilter("status:5xx https://api foo").words).toEqual(["https://api", "foo"]);
    expect(parseFilter("slower-than:2s").slowerThanMs).toBe(2000);
    expect(parseFilter("slower-than:500ms").slowerThanMs).toBe(500);
    expect(parseFilter("status:99 route:moon slower-than:x method: host:").invalid).toEqual([
      "status:99",
      "route:moon",
      "slower-than:x",
      "method:",
      "host:",
    ]);
  });

  it("filters by status class, exact status and no response", () => {
    expect(ids("status:5xx")).toEqual([2]);
    expect(ids("status:200")).toEqual([1]);
    expect(ids("status:error")).toEqual([3]);
    expect(ids("status:2xx")).toEqual([1]);
  });

  it("filters by method, host, route and time, and combines tokens with words", () => {
    expect(ids("method:post")).toEqual([2]);
    expect(ids("host:other.test")).toEqual([3]);
    expect(ids("route:bridge")).toEqual([2]);
    expect(ids("route:page")).toEqual([1, 3]);
    expect(ids("slower-than:500ms")).toEqual([2]);
    expect(ids("slower-than:1s")).toEqual([]);
    expect(ids("status:5xx orders")).toEqual([2]);
    expect(ids("status:5xx users")).toEqual([]);
  });

  it("matches nothing while a token has a value it does not take", () => {
    expect(ids("status:abc")).toEqual([]);
  });
});

describe("addressParts", () => {
  it("leads with the host and keeps the end of the path", () => {
    expect(addressParts("https://api.test/v1/pets/42?x=1")).toEqual({ host: "api.test", tail: "…/pets/42?x=1" });
    expect(addressParts("https://api.test/pets")).toEqual({ host: "api.test", tail: "/pets" });
    expect(addressParts("https://api.test/")).toEqual({ host: "api.test", tail: "" });
    expect(addressParts("{{base}}/pets")).toEqual({ host: "", tail: "{{base}}/pets" });
  });
});
