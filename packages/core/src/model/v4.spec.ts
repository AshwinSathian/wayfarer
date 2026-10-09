import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { V4_METHODS, authFromV4, draftFromV4, type V4Auth } from "./from-v4";
import type { AssertionOperator, AssertionTarget, TestAssertion } from "./request";
import { authToV4, bodyToV4, draftToV4, headersToV4, type V4Content } from "./to-v4";

const TARGETS: AssertionTarget[] = ["status", "body", "header", "duration"];
const OPERATORS: AssertionOperator[] = [
  "equals",
  "not-equals",
  "contains",
  "not-contains",
  "exists",
  "not-exists",
  "is-array",
  "is-object",
  "less-than",
  "greater-than",
];

const auth: fc.Arbitrary<V4Auth> = fc.oneof(
  fc.constant<V4Auth>({ type: "none" }),
  fc.record({ type: fc.constant("bearer" as const), bearer: fc.record({ token: fc.string() }) }),
  fc.record({
    type: fc.constant("basic" as const),
    basic: fc.record({ username: fc.string(), password: fc.string() }),
  }),
  fc.record({
    type: fc.constant("api-key" as const),
    apiKey: fc.record({
      key: fc.string(),
      value: fc.string(),
      addTo: fc.constantFrom("header" as const, "query" as const),
    }),
  })
);

const assertion: fc.Arbitrary<TestAssertion> = fc.record(
  {
    id: fc.uuid(),
    target: fc.constantFrom(...TARGETS),
    operator: fc.constantFrom(...OPERATORS),
    key: fc.string(),
    expected: fc.string(),
  },
  { requiredKeys: ["id", "target", "operator"] }
);

/** A request as the v4 composer writes it: header names are trimmed and not empty, the body is a JSON value or absent. */
const v4Content: fc.Arbitrary<V4Content> = fc.record({
  method: fc.constantFrom(...V4_METHODS),
  url: fc.string(),
  headers: fc.dictionary(
    fc.string({ minLength: 1 }).filter((name) => name === name.trim()),
    fc.string()
  ),
  // Through JSON text, as the composer's JSON editor produced it: -0 is written as 0.
  body: fc.option(
    fc.jsonValue().map((value): unknown => JSON.parse(JSON.stringify(value))),
    { nil: undefined }
  ),
  auth,
  preRequestScript: fc.string(),
  postRequestScript: fc.string(),
  tests: fc.array(assertion, { maxLength: 4 }),
});

describe("v4 converters", () => {
  it("from-v4 followed by to-v4 is the identity on 200 generated requests", () => {
    fc.assert(
      fc.property(v4Content, (request) => {
        expect(draftToV4(draftFromV4(request))).toEqual(request);
      }),
      // A fixed seed: a failure in CI is the same failure here.
      { numRuns: 200, seed: 20261009 }
    );
  });

  it("builds a draft from a history entry, which has no auth, scripts or tests", () => {
    expect(draftFromV4({ method: "POST", url: "{{base}}/x?a=1", headers: { A: "1" }, body: { n: 1 } })).toEqual({
      method: "POST",
      url: "{{base}}/x?a=1",
      params: [],
      headers: [{ key: "A", value: "1", enabled: true }],
      body: { mode: "raw", raw: { language: "json", text: '{\n  "n": 1\n}' } },
      auth: { type: "none" },
      scripts: { pre: "", post: "" },
      tests: [],
      settings: {},
    });
    expect(draftFromV4({ method: "GET", url: "" }).headers).toEqual([]);
    expect(draftFromV4({ method: "GET", url: "" }).body).toEqual({ mode: "none" });
  });

  it("fills the fields of an auth type that v4 stored without them", () => {
    expect(authFromV4(undefined)).toEqual({ type: "none" });
    expect(authFromV4({ type: "bearer" })).toEqual({ type: "bearer", token: "" });
    expect(authFromV4({ type: "basic" })).toEqual({ type: "basic", username: "", password: "" });
    expect(authFromV4({ type: "api-key" })).toEqual({ type: "apikey", key: "", value: "", in: "header" });
    // v4 could keep the fields of a type no longer chosen; only the chosen type's are carried.
    expect(authToV4(authFromV4({ type: "none", bearer: { token: "stale" } }))).toEqual({ type: "none" });
  });

  it("keeps a header named __proto__ as data and drops rows that are disabled or unnamed", () => {
    const headers = headersToV4([
      { key: "__proto__", value: "x", enabled: true },
      { key: " Accept ", value: "*/*", enabled: true },
      { key: "", value: "ignored", enabled: true },
      { key: "Off", value: "1", enabled: false },
    ]);
    expect(Object.keys(headers)).toEqual(["__proto__", "Accept"]);
    expect(Object.getPrototypeOf(headers)).toBe(Object.prototype);
  });

  it("keeps body text that is not JSON as a string, and stores any other method as GET", () => {
    expect(bodyToV4({ mode: "raw", raw: { language: "json", text: "{nope" } })).toBe("{nope");
    expect(bodyToV4({ mode: "raw", raw: { language: "text", text: "1" } })).toBe("1");
    expect(draftToV4({ ...draftFromV4({ method: "GET", url: "" }), method: "PURGE" }).method).toBe("GET");
  });
});
