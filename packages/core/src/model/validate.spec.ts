import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ASSERTION_OPERATORS,
  ASSERTION_TARGETS,
  BODY_MODES,
  HTTP_METHODS,
  RAW_LANGUAGES,
  emptyRequest,
  type AuthConfig,
  type RequestBody,
  type RequestContent,
} from "./request";
import { validateRequestContent, validateRows } from "./validate";

const full = (): RequestContent => ({
  method: "POST",
  url: "{{base}}/login",
  params: [{ key: "a", value: "1", enabled: true }],
  headers: [
    { key: "Accept", value: "*/*", enabled: true },
    { key: "Accept", value: "text/plain", enabled: false },
  ],
  body: { mode: "raw", raw: { language: "json", text: '{"n": {{count}}}' } },
  auth: { type: "apikey", key: "X-Key", value: "{{key}}", in: "query" },
  scripts: { pre: "", post: "pm.test('ok', () => {})" },
  tests: [{ id: "t-1", target: "status", operator: "equals", expected: "200" }],
  settings: { timeoutMs: 0, followRedirects: false, route: "bridge" },
});

const row = fc.record({ key: fc.string(), value: fc.string(), enabled: fc.boolean() });

/** Every request the model allows. */
const anyRequest: fc.Arbitrary<RequestContent> = fc.record({
  method: fc.constantFrom(...HTTP_METHODS),
  url: fc.string({ minLength: 1 }).filter((url) => url.trim() !== ""),
  params: fc.array(row, { maxLength: 3 }),
  headers: fc.array(row, { maxLength: 3 }),
  body: fc
    .record(
      {
        raw: fc.record({ language: fc.constantFrom(...RAW_LANGUAGES), text: fc.string() }),
        urlencoded: fc.array(row, { maxLength: 3 }),
        multipart: fc.array(
          fc.oneof(
            fc.record({ kind: fc.constant("text" as const), key: fc.string(), value: fc.string(), enabled: fc.boolean() }),
            fc.record({ kind: fc.constant("file" as const), key: fc.string(), fileId: fc.uuid(), fileName: fc.string(), enabled: fc.boolean() })
          ),
          { maxLength: 3 }
        ),
        binary: fc.record({ fileId: fc.uuid(), fileName: fc.string(), contentType: fc.string() }, { requiredKeys: ["fileId", "fileName"] }),
      },
      { requiredKeys: [] }
    )
    // The part the mode names is always there, except a binary body with no file chosen.
    .chain((parts) =>
      fc
        .constantFrom(...BODY_MODES)
        .filter((mode) => mode === "none" || mode === "binary" || parts[mode] !== undefined)
        .map((mode): RequestBody => ({ mode, ...parts }))
    ),
  auth: fc.oneof(
    fc.constant<AuthConfig>({ type: "none" }),
    fc.record({ type: fc.constant("bearer" as const), token: fc.string() }),
    fc.record({ type: fc.constant("basic" as const), username: fc.string(), password: fc.string() }),
    fc.record({
      type: fc.constant("apikey" as const),
      key: fc.string(),
      value: fc.string(),
      in: fc.constantFrom("header" as const, "query" as const),
    })
  ),
  scripts: fc.record({ pre: fc.string(), post: fc.string() }),
  tests: fc.array(
    fc.record(
      {
        id: fc.uuid(),
        target: fc.constantFrom(...ASSERTION_TARGETS),
        operator: fc.constantFrom(...ASSERTION_OPERATORS),
        key: fc.string(),
        expected: fc.string(),
      },
      { requiredKeys: ["id", "target", "operator"] }
    ),
    { maxLength: 3 }
  ),
  settings: fc.record(
    {
      timeoutMs: fc.nat(),
      followRedirects: fc.boolean(),
      route: fc.constantFrom("auto" as const, "direct" as const, "bridge" as const),
    },
    { requiredKeys: [] }
  ),
});

const paths = (value: unknown) => validateRequestContent(value, "r").map((issue) => issue.path);

describe("validateRequestContent", () => {
  it("accepts what the app writes, for every auth type", () => {
    expect(validateRequestContent(full(), "r")).toEqual([]);
    expect(validateRequestContent({ ...emptyRequest(), url: "https://a.test" }, "r")).toEqual([]);
    expect(paths({ ...full(), auth: { type: "bearer", token: "" } })).toEqual([]);
    expect(paths({ ...full(), auth: { type: "basic", username: "u", password: "" } })).toEqual([]);
  });

  it("accepts every request the model allows, also after a trip through JSON (200 generated)", () => {
    fc.assert(
      fc.property(anyRequest, (request) => {
        expect(validateRequestContent(request, "r")).toEqual([]);
        expect(validateRequestContent(JSON.parse(JSON.stringify(request)), "r")).toEqual([]);
      }),
      // A fixed seed: a failure in CI is the same failure here.
      { numRuns: 200, seed: 20261009 }
    );
  });

  it("names each field that is missing or of the wrong type", () => {
    expect(paths(null)).toEqual(["r"]);
    expect(paths({})).toEqual(["r.method", "r.url", "r.params", "r.headers", "r.body", "r.auth", "r.scripts", "r.tests", "r.settings"]);
    expect(
      paths({
        ...full(),
        method: "GET; rm -rf ~",
        url: "  ",
        params: [null, { key: 1, value: "v", enabled: "yes" }],
        headers: { Accept: "*/*" },
        body: { mode: "raw", raw: { language: "sql", text: 4 } },
        auth: { type: "apikey", key: "k", value: 1, in: "cookie" },
        scripts: { pre: 1 },
        tests: [{ id: "t", target: "moon", operator: "equals", key: 1 }],
        settings: { timeoutMs: -1, followRedirects: "no", route: "proxy" },
      })
    ).toEqual([
      "r.method",
      "r.url",
      "r.params[0]",
      "r.params[1].key",
      "r.params[1].enabled",
      "r.headers",
      "r.body.raw.language",
      "r.body.raw.text",
      "r.auth.value",
      "r.auth.in",
      "r.scripts.pre",
      "r.scripts.post",
      "r.tests[0].target",
      "r.tests[0].key",
      "r.settings.timeoutMs",
      "r.settings.followRedirects",
      "r.settings.route",
    ]);
    expect(paths({ ...full(), body: { mode: "raw" } })).toEqual(["r.body.raw"]);
    expect(paths({ ...full(), body: { mode: "form" } })).toEqual(["r.body.mode"]);
    expect(paths({ ...full(), body: { mode: "urlencoded" } })).toEqual(["r.body.urlencoded"]);
    expect(paths({ ...full(), body: { mode: "binary" } })).toEqual([]);
    // A part the mode does not name is checked all the same: it is stored, and sent once the mode changes.
    expect(
      paths({
        ...full(),
        body: {
          mode: "none",
          urlencoded: [{ key: "a", value: 1, enabled: true }],
          multipart: [
            { kind: "text", key: "a", enabled: true },
            { kind: "file", key: "f", enabled: true, fileId: 7 },
            { kind: "blob", key: "x", enabled: "yes" },
          ],
          binary: { fileId: "f-1", contentType: 3 },
        },
      })
    ).toEqual([
      "r.body.urlencoded[0].value",
      "r.body.multipart[0].value",
      "r.body.multipart[1].fileId",
      "r.body.multipart[1].fileName",
      "r.body.multipart[2].enabled",
      "r.body.multipart[2].kind",
      "r.body.binary.fileName",
      "r.body.binary.contentType",
    ]);
    expect(paths({ ...full(), auth: { type: "bearer" } })).toEqual(["r.auth.token"]);
    expect(paths({ ...full(), auth: { type: "basic", username: "u" } })).toEqual(["r.auth.password"]);
    expect(paths({ ...full(), auth: { type: "oauth2" } })).toEqual(["r.auth.type"]);
  });

  it("reads own fields only: an inherited name is a missing field", () => {
    // Every object has a `constructor`; none of these has its own.
    expect(paths({ ...full(), scripts: Object.create({ pre: "", post: "" }) as object })).toEqual(["r.scripts.pre", "r.scripts.post"]);
    expect(validateRows([{ key: "__proto__", value: "x", enabled: true }], "vars")).toEqual([]);
    expect(validateRows([Object.create({ key: "k", value: "v", enabled: true })], "vars").map((issue) => issue.path)).toEqual([
      "vars[0].key",
      "vars[0].value",
      "vars[0].enabled",
    ]);
  });
});
