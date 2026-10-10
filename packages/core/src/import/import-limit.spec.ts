import { describe, expect, it } from "vitest";
import { IMPORT_TOO_LARGE, MAX_IMPORT_BYTES, readImportText } from "../safe-json";
import { validateCollection } from "./wayfarer-collection";
import { validateEnvironmentExport } from "./wayfarer-environments";

describe("import size limit", () => {
  it("reads at most one byte past the import limit, and both importers reject such a file by size", async () => {
    const huge = new Blob(["[", "x".repeat(MAX_IMPORT_BYTES + 5000)]);

    const text = await readImportText(huge);

    expect(text.length).toBe(MAX_IMPORT_BYTES + 1);
    expect(validateCollection(text).errors).toEqual([{ path: "root", message: IMPORT_TOO_LARGE }]);
    expect(validateEnvironmentExport(text).errors).toEqual([IMPORT_TOO_LARGE]);
  });
});
