import { describe, expect, it } from "vitest";
import { parseJson, stringifyJson } from "./safe-json.util";

describe("safe-json", () => {
  it("parseJson returns the value or the SyntaxError", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    const bad = parseJson("{nope");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toBeInstanceOf(SyntaxError);
  });

  it("stringifyJson returns undefined for cycles and BigInt, and pretty-prints", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(stringifyJson(cyclic)).toBeUndefined();
    expect(stringifyJson(1n)).toBeUndefined();
    expect(stringifyJson({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
  });
});
