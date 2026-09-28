import { describe, it, expect } from "vitest";
import { BinaryBody, decodeResponseBody } from "./response-body.util";

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe("decodeResponseBody (P0.4, F04/F05)", () => {
  it("returns null for an empty or missing body", () => {
    expect(decodeResponseBody(null, "application/json")).toBeNull();
    expect(decodeResponseBody(new ArrayBuffer(0), "text/plain")).toBeNull();
  });

  it("parses JSON when the content-type says JSON, including +json", () => {
    expect(decodeResponseBody(bytes('{"a":1}'), "application/json; charset=utf-8")).toEqual({ a: 1 });
    expect(decodeResponseBody(bytes('[1,2]'), "application/problem+json")).toEqual([1, 2]);
  });

  it("keeps a JSON null literal as the text \"null\", not an empty body", () => {
    expect(decodeResponseBody(bytes("null"), "application/json")).toBe("null");
  });

  it("keeps an invalid JSON body as text instead of a parse-error wrapper", () => {
    expect(decodeResponseBody(bytes("{nope"), "application/json")).toBe("{nope");
  });

  it("returns html, xml and plain text as text", () => {
    expect(decodeResponseBody(bytes("<h1>hi</h1>"), "text/html; charset=utf-8")).toBe("<h1>hi</h1>");
    expect(decodeResponseBody(bytes("<a/>"), "application/xml")).toBe("<a/>");
    expect(decodeResponseBody(bytes("User-agent: *"), "text/plain")).toBe("User-agent: *");
  });

  it("parses a JSON object or array served with a non-JSON text type, but leaves scalars as text", () => {
    expect(decodeResponseBody(bytes('{"a":1}'), "text/plain")).toEqual({ a: 1 });
    expect(decodeResponseBody(bytes("123"), "text/plain")).toBe("123");
    expect(decodeResponseBody(bytes("null"), "text/plain")).toBe("null");
  });

  it("decodes with the charset from the content-type", () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer; // "café" in ISO-8859-1
    expect(decodeResponseBody(latin1, "text/plain; charset=iso-8859-1")).toBe("café");
  });

  it("falls back to UTF-8 for an unknown charset label", () => {
    expect(decodeResponseBody(bytes("ok"), "text/plain; charset=not-a-charset")).toBe("ok");
  });

  it("returns binary content types as BinaryBody, never as text", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    const body = decodeResponseBody(png, "image/png");
    expect(body).toBeInstanceOf(BinaryBody);
    expect((body as BinaryBody).byteLength).toBe(8);
    expect((body as BinaryBody).contentType).toBe("image/png");
    expect(decodeResponseBody(bytes("%PDF-1.7"), "application/pdf")).toBeInstanceOf(BinaryBody);
    expect(decodeResponseBody(bytes("x"), "application/octet-stream")).toBeInstanceOf(BinaryBody);
  });

  it("sniffs a body with no content-type: valid UTF-8 is text, anything else is binary", () => {
    expect(decodeResponseBody(bytes("plain"), null)).toBe("plain");
    expect(decodeResponseBody(new Uint8Array([0xff, 0xfe, 0x00, 0x81]).buffer, null)).toBeInstanceOf(BinaryBody);
  });
});
