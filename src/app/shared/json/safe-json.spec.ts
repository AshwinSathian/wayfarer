import { describe, expect, it } from "vitest";
import { validateCollection } from "../collections/collection-io";
import { validateEnvironmentExport } from "../environments/environment-io";
import { IMPORT_TOO_LARGE, MAX_IMPORT_BYTES, parseJson, readImportText, stringifyJson } from "./safe-json";

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

  it("reads at most one byte past the import limit, and both importers reject such a file by size", async () => {
    const huge = new Blob(["[", "x".repeat(MAX_IMPORT_BYTES + 5000)]);

    const text = await readImportText(huge);

    expect(text.length).toBe(MAX_IMPORT_BYTES + 1);
    expect(validateCollection(text).errors).toEqual([{ path: "root", message: IMPORT_TOO_LARGE }]);
    expect(validateEnvironmentExport(text).errors).toEqual([IMPORT_TOO_LARGE]);
  });
});
