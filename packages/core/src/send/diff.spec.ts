import { describe, expect, it } from "vitest";
import { MAX_PATH_CHANGES, diffExchanges, type DiffSide } from "./diff";

function side(
  over: Partial<DiffSide> & { body?: string; status?: number; headers?: [string, string][] } = {},
): DiffSide {
  const { body, status = 200, headers = [], ...rest } = over;
  return {
    sent: { method: "GET", url: "https://api.test/pets", headers: [] },
    route: "direct",
    durationMs: 120,
    response: {
      status,
      statusText: status === 200 ? "OK" : "Teapot",
      headers,
      ...(body !== undefined && { body: { text: body, truncated: false } }),
    },
    ...rest,
  };
}

describe("diffExchanges", () => {
  it("finds nothing between an exchange and itself", () => {
    const one = side({ body: '{"a":1}', headers: [["X-A", "1"]] });
    const diff = diffExchanges(one, one);
    expect(diff.differs).toBe(false);
    expect(diff.body).toEqual({ kind: "same" });
    expect(diff.headers).toEqual([]);
  });

  it("@claim:C-119 lists changed paths before removed before added, with a path from the root", () => {
    const diff = diffExchanges(
      side({ body: '{"gone":1,"n":{"id":1},"list":[1,2],"same":true}' }),
      side({ body: '{"new":1,"n":{"id":2},"list":[1],"same":true}' }),
    );
    expect(diff.body.kind).toBe("json");
    if (diff.body.kind !== "json") return;
    expect(diff.body.changes.map((c) => `${c.kind} ${c.path}`)).toEqual([
      "changed $.n.id",
      "removed $.gone",
      "removed $.list[1]",
      "added $.new",
    ]);
    expect(diff.body.changes[0]).toMatchObject({ a: "1", b: "2" });
  });

  it("writes a key that is not a name as an index, and hides no key named like a prototype's", () => {
    const diff = diffExchanges(
      side({ body: '{"a-b":1,"constructor":1}' }),
      side({ body: '{"a-b":2,"constructor":2}' }),
    );
    if (diff.body.kind !== "json") throw new Error("json");
    expect(diff.body.changes.map((c) => c.path)).toEqual(['$["a-b"]', "$.constructor"]);
  });

  it("caps the list and counts the rest, and cuts a long value", () => {
    const many = (v: number) => JSON.stringify(Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`k${i}`, v])));
    const diff = diffExchanges(side({ body: many(1) }), side({ body: many(2) }));
    if (diff.body.kind !== "json") throw new Error("json");
    expect(diff.body.changes).toHaveLength(MAX_PATH_CHANGES);
    expect(diff.body.more).toBe(50);
    const long = diffExchanges(side({ body: JSON.stringify({ s: "x".repeat(500) }) }), side({ body: '{"s":"y"}' }));
    if (long.body.kind !== "json") throw new Error("json");
    expect(long.body.changes[0]?.a?.length).toBeLessThan(250);
  });

  it("says where a text body first differs", () => {
    expect(diffExchanges(side({ body: "a\nb\nc" }), side({ body: "a\nB\nc" })).body).toEqual({ kind: "text", line: 2 });
    expect(diffExchanges(side({ body: "{bad" }), side({ body: "{bad" })).body).toEqual({ kind: "same" });
  });

  it("does not compare a body that was not kept, and says which side", () => {
    expect(diffExchanges(side(), side({ body: "{}" })).body).toEqual({ kind: "not-kept", a: true, b: false });
    expect(diffExchanges(side(), side()).differs).toBe(false);
  });

  it("compares the status, the route, the request and the headers without case, by name", () => {
    const a = side({
      headers: [
        ["Content-Type", "a"],
        ["Set-Cookie", "1"],
        ["Set-Cookie", "2"],
        ["Gone", "x"],
      ],
    });
    const b = side({
      status: 418,
      route: "bridge",
      headers: [
        ["content-type", "b"],
        ["Set-Cookie", "1"],
        ["Set-Cookie", "2"],
        ["New", "y"],
      ],
      sent: { method: "POST", url: "https://api.test/pets", headers: [["X", "***"]] },
    });
    const diff = diffExchanges(a, b);
    expect(diff.status).toEqual({ a: "200 OK", b: "418 Teapot", same: false });
    expect(diff.route.same).toBe(false);
    expect(diff.request.changed).toBe(true);
    expect(diff.requestHeaders).toEqual([{ name: "X", kind: "added", a: [], b: ["***"] }]);
    expect(diff.headers.map((h) => `${h.kind} ${h.name}`)).toEqual([
      "changed Content-Type",
      "removed Gone",
      "added New",
    ]);
    expect(diff.differs).toBe(true);
  });

  it("treats a missing response as a status of its own and keeps durations apart from differences", () => {
    const none: DiffSide = { ...side(), response: undefined, durationMs: undefined, error: "x" };
    const diff = diffExchanges(none, none);
    expect(diff.status.a).toBe("No response");
    expect(diff.body).toEqual({ kind: "same" });
    expect(diff.duration).toEqual({ a: undefined, b: undefined });
    expect(diffExchanges(side({ durationMs: 1 }), side({ durationMs: 900 })).differs).toBe(false);
  });

  it("compares the body that was sent, as kept, and says nothing differs only when it does not", () => {
    const withBody = (bodyPreview?: string) =>
      side({ sent: { method: "POST", url: "https://api.test/pets", headers: [], bodyPreview } });
    expect(diffExchanges(withBody('{"a":1}'), withBody('{"a":1}')).differs).toBe(false);
    const diff = diffExchanges(withBody('{"a":1}'), withBody('{"a":"***"}'));
    expect(diff.requestBody).toEqual({ changed: true, a: '{"a":1}', b: '{"a":"***"}' });
    expect(diff.differs).toBe(true);
    expect(diffExchanges(withBody(), withBody("x")).requestBody).toEqual({ changed: true, b: "x" });
  });
});
