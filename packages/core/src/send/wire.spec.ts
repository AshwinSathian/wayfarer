import { describe, expect, it } from "vitest";
import { appendQueryParam } from "./build";
import { containsSecretPlaceholder } from "./wire";

const basic = (pair: string): [string, string] => ["Authorization", `Basic ${btoa(pair)}`];

describe("containsSecretPlaceholder", () => {
  it("finds a reference that a query parameter form-encoded, spaces as +", () => {
    const url = appendQueryParam("https://h/p", "api_key", "{{ $secret.abc }}");
    expect(containsSecretPlaceholder({ url, headers: [] })).toBe(true);
  });

  it("finds a form-encoded reference in Basic credentials", () => {
    const pair = `client:${new URLSearchParams({ k: "{{ $secret.abc }}" }).toString().slice(2)}`;
    expect(containsSecretPlaceholder({ url: "https://h/", headers: [basic(pair)] })).toBe(true);
  });

  it("finds an encoded reference beside a malformed escape", () => {
    for (const path of ["https://h/%zz/{{$secret.abc}}", "https://h/100%/{{$secret.abc}}"]) {
      const url = appendQueryParam(path, "api_key", "k");
      expect(containsSecretPlaceholder({ url, headers: [] })).toBe(true);
    }
    expect(containsSecretPlaceholder({ url: "", headers: [], body: "a=%zz&b=%7B%7B%24secret.x%7D%7D" })).toBe(true);
  });

  it("finds a reference with an encoded non-ASCII space, also beside a byte that is not UTF-8", () => {
    for (const url of ["https://h/?k=%7B%7B%C2%A0%24secret.x%7D%7D", "https://h/?k=%FF%7B%7B%C2%A0%24secret.x%7D%7D"]) {
      expect(containsSecretPlaceholder({ url, headers: [] })).toBe(true);
    }
  });

  it("passes a request with no reference", () => {
    expect(containsSecretPlaceholder({ url: "https://h/%zz?a=1+2", headers: [basic("u:p")], body: "a=%7B" })).toBe(
      false,
    );
  });
});
