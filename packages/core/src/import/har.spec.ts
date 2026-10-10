import fc from "fast-check";
import { describe, expect, it } from "vitest";
import har from "../../test/fixtures/har/three-entries.har.json";
import { ImportError } from "./import-error";
import { isHar, parseHar } from "./har";

const entry = (request: unknown) => ({ log: { entries: [{ request }] } });

describe("parseHar", () => {
  it("a HAR 1.2 file with three entries is three requests, in the file's order", () => {
    const requests = parseHar(har);

    expect(requests.map((request) => request.name)).toEqual(["GET /users", "POST /users", "POST /login"]);
    expect(requests[0].request).toEqual({
      method: "GET",
      url: "https://api.example.test/users?page=2",
      // HTTP/2's pseudo-headers are not headers to send; the cookie that went out is in its header.
      headers: [["accept", "application/json"], ["cookie", "session=abc123"]],
      body: { mode: "none" },
    });
    expect(requests[1].request.body).toEqual({ mode: "raw", text: '{"name":"Ada"}' });
    expect(requests[1].request.headers).toEqual([["Content-Type", "application/json"], ["Authorization", "Bearer eyJhbGciOi.example.sig"]]);
    // A method is stored in upper case; a form's fields are the file's own list of them.
    expect(requests[2].request).toMatchObject({ method: "POST", body: { mode: "urlencoded", fields: [["user", "ada@example.test"], ["remember", "on"]] } });
    expect(requests.flatMap((request) => request.warnings)).toEqual([]);
  });

  it("a form without its list of fields is read from its text; a multipart form's parts are parts", () => {
    expect(parseHar(entry({ method: "POST", url: "https://a.test/", postData: { mimeType: "application/x-www-form-urlencoded; charset=UTF-8", text: "a=1&b=two+words" } }))[0].request.body).toEqual({
      mode: "urlencoded",
      fields: [["a", "1"], ["b", "two words"]],
    });
    expect(
      parseHar(entry({ method: "POST", url: "https://a.test/", postData: { mimeType: "multipart/form-data; boundary=x", params: [{ name: "note", value: "hi" }, { name: "upload", fileName: "a.bin", contentType: "application/octet-stream" }] } }))[0].request.body
    ).toEqual({ mode: "multipart", parts: [{ name: "note", value: "hi" }, { name: "upload", fileName: "a.bin" }] });
  });

  it("says what it could not keep: a multipart body that is only text, and a binary body", () => {
    const text = parseHar(entry({ method: "POST", url: "https://a.test/", postData: { mimeType: "multipart/form-data; boundary=x", text: "--x\r\n…" } }))[0];
    expect(text.request.body).toEqual({ mode: "raw", text: "--x\r\n…" });
    expect(text.warnings).toEqual(["Its multipart body is in the file as text only, with a boundary of that one send. It is kept as text."]);

    const binary = parseHar(entry({ method: "PUT", url: "https://a.test/", postData: { mimeType: "image/png", text: "iVBORw0KGgo=", encoding: "base64" } }))[0];
    expect(binary.request.body).toEqual({ mode: "none" });
    expect(binary.warnings).toEqual(["Its body is binary (base64 in the file) and was left out."]);
  });

  it("refuses a file that is not a HAR, and an entry without a request, with ImportError", () => {
    expect(isHar({ log: { entries: [] } })).toBe(true);
    for (const value of [null, [], {}, { log: 5 }, { log: {} }, { log: { entries: {} } }]) {
      expect(isHar(value)).toBe(false);
      expect(() => parseHar(value)).toThrow(new ImportError("The file is not a HAR: it has no log.entries."));
    }
    expect(() => parseHar({ log: { entries: [{ request: { method: "GET", url: "https://a.test/" } }, { request: { url: "https://b.test/" } }] } })).toThrow(
      new ImportError("The HAR's entry 2 has no request with a method and a URL.")
    );
    // A key named like something every object has is not read as that thing.
    expect(parseHar({ log: { entries: [{ request: { method: "GET", url: "https://a.test/", headers: [{ name: "constructor", value: "x" }], postData: { constructor: 1 } } }] } })[0].request).toEqual({
      method: "GET",
      url: "https://a.test/",
      headers: [["constructor", "x"]],
      body: { mode: "none" },
    });
  });

  it("throws nothing but ImportError, whatever the entries hold", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (entries) => {
        try {
          parseHar({ log: { entries } });
          parseHar({ log: { entries: [{ request: entries }] } });
        } catch (error) {
          if (!(error instanceof ImportError)) throw error;
        }
      })
    );
  });
});
