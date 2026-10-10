import { describe, expect, it } from "vitest";
import { emptyRequest, type RequestContent } from "../model/request";
import { scriptRequestOf, withScriptRequest } from "./request-view";

const content = (changes: Partial<RequestContent>): RequestContent => ({ ...emptyRequest(), ...changes });

describe("the request a script sees", () => {
  it("is the rows that are switched on, as written", () => {
    const request = content({
      method: "POST",
      url: "https://{{host}}/items",
      headers: [
        { key: "X-A", value: "{{a}}", enabled: true },
        { key: "X-Off", value: "1", enabled: false },
        { key: "", value: "no name", enabled: true },
      ],
      body: { mode: "raw", raw: { language: "json", text: '{"a":1}' } },
    });
    expect(scriptRequestOf(request)).toEqual({ method: "POST", url: "https://{{host}}/items", headers: [["X-A", "{{a}}"]], body: { mode: "raw", raw: '{"a":1}' } });
  });

  it("shows form fields, and of a multipart form or a file only the mode", () => {
    const fields = [
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: false },
    ];
    expect(scriptRequestOf(content({ body: { mode: "urlencoded", urlencoded: fields } })).body).toEqual({ mode: "urlencoded", urlencoded: [["a", "1"]] });
    expect(scriptRequestOf(content({ body: { mode: "multipart", multipart: [{ key: "f", enabled: true, kind: "file", fileId: "id", fileName: "key.pem" }] } })).body).toEqual({ mode: "multipart" });
    expect(scriptRequestOf(content({ body: { mode: "binary", binary: { fileId: "id", fileName: "key.pem" } } })).body).toEqual({ mode: "binary" });
    expect(scriptRequestOf(content({ body: { mode: "raw" } })).body).toEqual({ mode: "raw", raw: "" });
  });

  it("a script's changes go into what is sent; a body a script cannot set stays the user's", () => {
    const composed = content({ method: "GET", url: "https://a.test", params: [{ key: "p", value: "1", enabled: true }], body: { mode: "raw", raw: { language: "json", text: "{}" } } });
    const changed = withScriptRequest(composed, { method: "PUT", url: "https://b.test", headers: [["X-Signed", "s"]], body: { mode: "raw", raw: "signed" } });
    expect(changed).toEqual({ ...composed, method: "PUT", url: "https://b.test", headers: [{ key: "X-Signed", value: "s", enabled: true }], body: { mode: "raw", raw: { language: "json", text: "signed" } } });
    expect(withScriptRequest(content({}), { method: "POST", url: "u", headers: [], body: { mode: "raw", raw: "t" } }).body).toEqual({ mode: "raw", raw: { language: "text", text: "t" } });
    expect(withScriptRequest(composed, { method: "POST", url: "u", headers: [], body: { mode: "urlencoded", urlencoded: [["a", "1"]] } }).body).toMatchObject({ mode: "urlencoded", urlencoded: [{ key: "a", value: "1", enabled: true }] });
    const file = content({ body: { mode: "binary", binary: { fileId: "id", fileName: "key.pem" } } });
    expect(withScriptRequest(file, { method: "POST", url: "u", headers: [], body: { mode: "binary" } }).body).toEqual(file.body);
    // The composed request is not touched.
    expect(composed.url).toBe("https://a.test");
  });
});
