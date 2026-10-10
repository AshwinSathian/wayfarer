import { describe, expect, it } from "vitest";
import type { AuthConfig } from "../model/request";
import { buildAuthHeaders, buildAuthQueryParam, credentialsOf, resolveAuth } from "./request-auth";

describe("buildAuthHeaders", () => {
  it("encodes Basic credentials as UTF-8 (RFC 7617), so non-Latin-1 text does not throw", () => {
    const { Authorization } = buildAuthHeaders({ type: "basic", username: "jos\u00e9", password: "p\u00e4ss\u20ac" });

    const bytes = Uint8Array.from(atob(Authorization.slice("Basic ".length)), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("jos\u00e9:p\u00e4ss\u20ac");
  });

  it("keeps ASCII credentials byte-for-byte", () => {
    expect(buildAuthHeaders({ type: "basic", username: "user", password: "pass" })).toEqual({
      Authorization: `Basic ${btoa("user:pass")}`,
    });
  });
});

describe("what each auth type puts on a request", () => {
  const bearer: AuthConfig = { type: "bearer", token: "{{t}}" };
  const basic: AuthConfig = { type: "basic", username: "{{u}}", password: "{{p}}" };
  const header: AuthConfig = { type: "apikey", key: "{{k}}", value: "{{v}}", in: "header" };
  const query: AuthConfig = { type: "apikey", key: "api_key", value: "v-1", in: "query" };
  const upper = (text: string) => text.toUpperCase();

  it("bearer and an API key in a header are headers; an API key in the query is a parameter; none and inherit are nothing", () => {
    expect(buildAuthHeaders({ type: "bearer", token: "abc" })).toEqual({ Authorization: "Bearer abc" });
    expect(buildAuthHeaders({ type: "apikey", key: "X-Key", value: "v-1", in: "header" })).toEqual({ "X-Key": "v-1" });
    expect(buildAuthHeaders(query)).toEqual({});
    expect(buildAuthQueryParam(query)).toEqual({ key: "api_key", value: "v-1" });
    expect(buildAuthQueryParam(header)).toBeNull();
    for (const auth of [{ type: "none" }, { type: "inherit" }] as const) {
      expect(buildAuthHeaders(auth)).toEqual({});
      expect(buildAuthQueryParam(auth)).toBeNull();
    }
  });

  it("a field left empty adds nothing, and a header name such as __proto__ is a header", () => {
    expect(buildAuthHeaders({ type: "bearer", token: "" })).toEqual({});
    expect(buildAuthHeaders({ type: "basic", username: "", password: "p" })).toEqual({});
    expect(buildAuthQueryParam({ type: "apikey", key: "", value: "v", in: "query" })).toBeNull();
    expect(Object.entries(buildAuthHeaders({ type: "apikey", key: "__proto__", value: "v", in: "header" }))).toEqual([["__proto__", "v"]]);
  });

  it("resolveAuth replaces variables in every field that is sent (F07), and leaves none and inherit as they are", () => {
    expect(resolveAuth(bearer, upper)).toEqual({ type: "bearer", token: "{{T}}" });
    expect(resolveAuth(basic, upper)).toEqual({ type: "basic", username: "{{U}}", password: "{{P}}" });
    expect(resolveAuth(header, upper)).toEqual({ type: "apikey", key: "{{K}}", value: "{{V}}", in: "header" });
    expect(resolveAuth({ type: "none" }, upper)).toEqual({ type: "none" });
    expect(resolveAuth({ type: "inherit" }, upper)).toEqual({ type: "inherit" });
  });

  it("credentialsOf names what a redactor must look for: the token, the password, the key's value", () => {
    expect([bearer, basic, header, { type: "none" }, { type: "inherit" }].map((auth) => credentialsOf(auth as AuthConfig))).toEqual([["{{t}}"], ["{{p}}"], ["{{v}}"], [], []]);
  });
});
