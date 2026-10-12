import { describe, expect, it } from "vitest";
import { exportFixtures } from "../../test/export/fixtures";
import { parseHar } from "../import/har";
import { HAR_MAX_BODY_CHARS, buildHar, type HarExchange } from "./har";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- the file is read as a HAR reader would read it: by its keys.

const CREATOR = { name: "Wayfarer", version: "2.2.0" };
const exchange = (patch: Partial<HarExchange> = {}): HarExchange => ({
  startedAt: "2026-10-11T10:00:00.000Z",
  timeMs: 42,
  request: { method: "POST", url: "https://api.test/pets?kind=dog&kind=cat&q=a%20b", headers: [["Content-Type", "application/json"], ["X-Trace", "t-1"]], body: { mode: "raw", text: '{"name":"Rex"}' } },
  response: { status: 201, statusText: "Created", headers: [["content-type", "application/json; charset=utf-8"], ["location", "/pets/7"]], text: '{"id":7}', size: 8 },
  ...patch,
});
const entries = (exchanges: HarExchange[]): Loose[] => buildHar(exchanges, CREATOR).log["entries"] as Loose[];
const only = (patch: Partial<HarExchange> = {}): Loose => entries([exchange(patch)])[0];

describe("buildHar: a HAR 1.2 log", () => {
  it("@claim:C-035 has every field HAR 1.2 requires, for an exchange with a response and for one without", () => {
    // HAR 1.2, http://www.softwareishard.com/blog/har-12-spec/: the fields that are not marked optional.
    const REQUIRED = {
      log: ["version", "creator", "entries"],
      creator: ["name", "version"],
      entry: ["startedDateTime", "time", "request", "response", "cache", "timings"],
      request: ["method", "url", "httpVersion", "cookies", "headers", "queryString", "headersSize", "bodySize"],
      response: ["status", "statusText", "httpVersion", "cookies", "headers", "content", "redirectURL", "headersSize", "bodySize"],
      content: ["size", "mimeType"],
      postData: ["mimeType"],
      timings: ["send", "wait", "receive"],
    };
    const has = (object: Loose, fields: string[], where: string) => {
      for (const field of fields) expect(Object.hasOwn(object, field), `${where}.${field}`).toBe(true);
    };
    const { log } = buildHar([exchange(), exchange({ response: undefined, comment: "No response: the request timed out." })], CREATOR);
    has(log, REQUIRED.log, "log");
    expect(log["version"]).toBe("1.2");
    has(log["creator"] as Loose, REQUIRED.creator, "creator");
    for (const [index, entry] of (log["entries"] as Loose[]).entries()) {
      has(entry, REQUIRED.entry, `entries[${index}]`);
      has(entry["request"], REQUIRED.request, "request");
      has(entry["request"]["postData"], REQUIRED.postData, "postData");
      has(entry["response"], REQUIRED.response, "response");
      has(entry["response"]["content"], REQUIRED.content, "content");
      has(entry["timings"], REQUIRED.timings, "timings");
      expect(new Date(entry["startedDateTime"]).toISOString()).toBe(entry["startedDateTime"]);
      for (const pair of [...entry["request"]["headers"], ...entry["request"]["queryString"], ...entry["response"]["headers"]]) expect(Object.keys(pair)).toEqual(["name", "value"]);
    }
  });

  it("an exchange: the request as sent, the query listed, the response with its type and where it points, what is not known as -1", () => {
    expect(only({ timings: { wait: 30, receive: 2 } })).toEqual({
      startedDateTime: "2026-10-11T10:00:00.000Z",
      time: 42,
      request: {
        method: "POST",
        url: "https://api.test/pets?kind=dog&kind=cat&q=a%20b",
        httpVersion: "HTTP/1.1",
        cookies: [],
        headers: [{ name: "Content-Type", value: "application/json" }, { name: "X-Trace", value: "t-1" }],
        queryString: [{ name: "kind", value: "dog" }, { name: "kind", value: "cat" }, { name: "q", value: "a b" }],
        postData: { mimeType: "application/json", text: '{"name":"Rex"}' },
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: 201,
        statusText: "Created",
        httpVersion: "HTTP/1.1",
        cookies: [],
        headers: [{ name: "content-type", value: "application/json; charset=utf-8" }, { name: "location", value: "/pets/7" }],
        content: { size: 8, mimeType: "application/json; charset=utf-8", text: '{"id":7}' },
        redirectURL: "/pets/7",
        headersSize: -1,
        bodySize: 8,
      },
      cache: {},
      timings: { blocked: -1, dns: -1, connect: -1, send: -1, wait: 30, receive: 2, ssl: -1 },
    });
  });

  it("@claim:C-035 a body of text is kept whatever its type: XML, HTML, CSV and plain text as well as JSON, as it was received", () => {
    for (const [type, text] of [["application/xml", "<a>1</a>"], ["text/html", "<p>hi</p>"], ["text/csv", "a,b\n1,2"], ["text/plain", "not { json"], ["application/json", '{ "spaced" :1}']] as const) {
      const entry = only({ request: { method: "PUT", url: "https://api.test/", headers: [["content-type", type]], body: { mode: "raw", text } }, response: { status: 200, statusText: "OK", headers: [["Content-Type", type]], text } });
      expect(entry["request"]["postData"], type).toEqual({ mimeType: type, text });
      expect(entry["response"]["content"], type).toEqual({ size: -1, mimeType: type, text });
    }
  });

  it("@claim:C-035 a body that is not text and one longer than 256 KB are left out, and a comment says which", () => {
    const long = "x".repeat(HAR_MAX_BODY_CHARS + 1);
    expect(only({ response: { status: 200, statusText: "OK", headers: [["content-type", "image/png"]] } })["response"]["content"]).toEqual({ size: -1, mimeType: "image/png", comment: "The body is left out: it is not text." });
    expect(only({ response: { status: 200, statusText: "OK", headers: [], text: long } })["response"]["content"]).toEqual({ size: -1, mimeType: "", comment: "The body is left out: it is longer than 256 KB." });
    expect(only({ response: { status: 200, statusText: "OK", headers: [], text: "x".repeat(HAR_MAX_BODY_CHARS) } })["response"]["content"]["text"]).toHaveLength(HAR_MAX_BODY_CHARS);
    expect(only({ request: { method: "POST", url: "https://api.test/", headers: [], body: { mode: "raw", text: long } } })["request"]["postData"]).toEqual({ mimeType: "text/plain", text: "", comment: "The body is left out: it is longer than 256 KB." });
  });

  it("a request body in every mode: a form and a multipart form as params, a file by its name, none as no postData", () => {
    const post = (body: HarExchange["request"]["body"], headers: [string, string][] = []) => only({ request: { method: "POST", url: "https://api.test/", headers, body } })["request"]["postData"];
    expect(post({ mode: "none" })).toBeUndefined();
    expect(post({ mode: "urlencoded", fields: [["q", "a b&c"], ["q", "2"]] })).toEqual({ mimeType: "application/x-www-form-urlencoded", params: [{ name: "q", value: "a b&c" }, { name: "q", value: "2" }], text: "q=a+b%26c&q=2" });
    expect(post({ mode: "multipart", parts: [{ name: "note", value: "hi" }, { name: "upload", fileName: "a.bin" }] })).toEqual({
      mimeType: "multipart/form-data",
      params: [{ name: "note", value: "hi" }, { name: "upload", fileName: "a.bin" }],
      text: "",
      comment: "A file part is named, not included.",
    });
    expect(post({ mode: "binary", fileName: "pixel.png" }, [["Content-Type", "image/png"]])).toEqual({ mimeType: "image/png", text: "", comment: 'The body is the file "pixel.png", which is named, not included.' });
  });

  it("no response: status 0, nothing made up, and the reason as the entry's comment", () => {
    const entry = only({ response: undefined, timeMs: Number.NaN, comment: "No response: the host did not resolve." });
    expect(entry["response"]).toEqual({ status: 0, statusText: "", httpVersion: "HTTP/1.1", cookies: [], headers: [], content: { size: -1, mimeType: "" }, redirectURL: "", headersSize: -1, bodySize: -1 });
    expect(entry["time"]).toBe(-1);
    expect(entry["comment"]).toBe("No response: the host did not resolve.");
  });

  it("an address that is not a URL is written as it is, with no query to list; several exchanges keep their order", () => {
    const [first, second] = entries([exchange({ request: { method: "GET", url: "{{base}}/pets?x=1", headers: [], body: { mode: "none" } } }), exchange()]);
    expect([first["request"]["url"], first["request"]["queryString"]]).toEqual(["{{base}}/pets?x=1", []]);
    expect(second["request"]["method"]).toBe("POST");
    expect(buildHar([], CREATOR)).toEqual({ log: { version: "1.2", creator: CREATOR, entries: [] } });
  });

  it("@claim:C-035 a HAR written here imports again as the same requests: the twelve of every body mode, a file body excepted, which a HAR names in a comment", () => {
    const fixtures = exportFixtures("https://api.test");
    const har = JSON.parse(JSON.stringify(buildHar(fixtures.map(({ request }) => exchange({ request })), CREATOR))) as unknown;
    const back = parseHar(har);
    expect(back).toHaveLength(12);
    for (const [index, { name, request }] of fixtures.entries()) {
      if (request.body.mode === "binary") {
        expect(back[index].request, name).toEqual({ ...request, body: { mode: "none" } });
      } else {
        expect(back[index].request, name).toEqual(request);
      }
      expect(back[index].warnings, name).toEqual([]);
    }
    expect(fixtures.filter(({ request }) => request.body.mode === "binary").map(({ name }) => name)).toEqual(["PUT a file"]);
  });
  it("lists the cookies of the Cookie and Set-Cookie headers, and none of a header that was masked (P5.3)", () => {
    const exchange = (cookie: string, set: string[]): HarExchange => ({
      startedAt: "2026-10-13T00:00:00.000Z",
      timeMs: 1,
      request: { method: "GET", url: "https://api.test/", headers: [["Cookie", cookie]], body: { mode: "none" } },
      response: { status: 200, statusText: "OK", headers: set.map((value): [string, string] => ["set-cookie", value]) },
    });
    const cookiesOf = (cookie: string, set: string[]) => {
      const [entry] = entries([exchange(cookie, set)]);
      return [entry["request"]["cookies"], entry["response"]["cookies"]];
    };

    expect(cookiesOf("sid=abc; theme=a=b", ["sid=new; Path=/app; Domain=api.test; Expires=Wed, 14 Oct 2026 00:00:00 GMT; HttpOnly; Secure", "plain=1"])).toEqual([
      [{ name: "sid", value: "abc" }, { name: "theme", value: "a=b" }],
      [{ name: "sid", value: "new", path: "/app", domain: "api.test", expires: "2026-10-14T00:00:00.000Z", httpOnly: true, secure: true }, { name: "plain", value: "1" }],
    ]);
    // History and an export without credentials hold the mask in place of each header: its cookies are not known.
    expect(cookiesOf("***", ["***"])).toEqual([[], []]);
  });
});
