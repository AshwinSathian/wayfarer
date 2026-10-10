import { describe, expect, it } from "vitest";
import { emptyRequest, type RequestContent } from "../model/request";
import { scriptRequestOf, sentScriptRequest, withScriptRequest } from "./request-view";

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

  it("a post-response script sees the request as it was sent: its address, its headers and its body as they went out", () => {
    const composed = content({ method: "POST", url: "https://{{host}}/items", headers: [{ key: "X-A", value: "{{a}}", enabled: true }], body: { mode: "raw", raw: { language: "json", text: '{"a":"{{a}}"}' } } });
    const sent = { method: "POST", url: "https://api.test/items", headers: [["X-A", "1"], ["Authorization", "Bearer t"], ["Content-Type", "application/json"]] as [string, string][], body: '{"a":"1"}' };
    expect(sentScriptRequest(composed, sent)).toEqual({ method: "POST", url: "https://api.test/items", headers: sent.headers, body: { mode: "raw", raw: '{"a":"1"}' } });
    // Form fields are read back from the text that was sent.
    expect(sentScriptRequest(content({ body: { mode: "urlencoded" } }), { ...sent, body: "grant+type=a%26b&__proto__=x" }).body).toEqual({ mode: "urlencoded", urlencoded: [["grant type", "a&b"], ["__proto__", "x"]] });
    // A request sent without a body (GET) has none, whatever the composer holds; of a form or a file there is the mode, as before.
    expect(sentScriptRequest(composed, { method: "GET", url: "u", headers: [] }).body).toEqual({ mode: "none" });
    expect(sentScriptRequest(content({ body: { mode: "multipart" } }), { method: "POST", url: "u", headers: [] }).body).toEqual({ mode: "multipart" });
    expect(sentScriptRequest(content({ body: { mode: "binary", binary: { fileId: "id", fileName: "key.pem" } } }), { method: "POST", url: "u", headers: [] }).body).toEqual({ mode: "binary" });
  });
});
