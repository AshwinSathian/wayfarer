import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, isOversizedImport, parseJson, readImportText, stringifyJson } from "./safe-json";

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

  it("stringifyJson rethrows what is not a serialization failure", () => {
    const failing = { toJSON: () => { throw new RangeError("no"); } };
    expect(() => stringifyJson(failing)).toThrow(RangeError);
  });

  it("reads at most one byte past the import limit, which counts as oversized", async () => {
    const huge = new Blob(["[", "x".repeat(MAX_IMPORT_BYTES + 5000)]);

    const text = await readImportText(huge);

    expect(text.length).toBe(MAX_IMPORT_BYTES + 1);
    expect(isOversizedImport(text)).toBe(true);
    expect(isOversizedImport(text.slice(1))).toBe(false);
    expect(isOversizedImport({ length: MAX_IMPORT_BYTES + 1 })).toBe(false);
  });
});
