import { describe, expect, it } from "vitest";
import { rowsOf } from "../../../testing/request-fixtures";
import { EnvironmentDoc } from "../../models/environments";
import { serializeEnvironmentExport, validateEnvironmentExport } from "./environment-io";

const env = (id: string, name: string, order: number, vars: Record<string, string> = {}): EnvironmentDoc => ({
  id,
  meta: { id, createdAt: 1, updatedAt: 1, version: 1 },
  name,
  order,
  vars: rowsOf(vars),
});

describe("environment-io", () => {
  const fileOf = (environments: unknown) => ({ $id: "wayfarer/environments/2", environments });

  it("exports environments in order, with sorted keys, and reads its own export back unchanged", () => {
    const text = serializeEnvironmentExport([env("b", "Prod", 2, { zeta: "1", alpha: "2" }), env("a", "Dev", 1)]);
    const file = JSON.parse(text) as { $id: string; environments: EnvironmentDoc[] };

    expect(file.$id).toBe("wayfarer/environments/2");
    expect(file.environments.map((e) => e.name)).toEqual(["Dev", "Prod"]);
    // Keys are sorted; variables keep the order they were written in.
    expect(text.indexOf('"meta"')).toBeLessThan(text.indexOf('"name"'));
    expect(file.environments[1].vars.map((row) => row.key)).toEqual(["zeta", "alpha"]);

    const reread = validateEnvironmentExport(text);
    expect(reread.ok).toBe(true);
    expect(serializeEnvironmentExport(reread.payload!)).toBe(text);
  });

  it("fills a missing id from meta, and refuses a file that is not format 2", () => {
    const withoutId = { ...env("x", "Dev", 1), id: undefined };

    expect(validateEnvironmentExport(fileOf([withoutId])).payload?.[0].id).toBe("x");
    // Format 1: a bare array, or a wrapper with no $id.
    const notFormatTwo = { ok: false, errors: ['Not a Wayfarer environments file: "$id" must be "wayfarer/environments/2".'] };
    expect(validateEnvironmentExport([withoutId])).toEqual(notFormatTwo);
    expect(validateEnvironmentExport({ environments: [withoutId] })).toEqual(notFormatTwo);
  });

  it("rejects text that is not JSON and JSON that is not a list of environments", () => {
    expect(validateEnvironmentExport("{nope")).toEqual({ ok: false, errors: ["File does not contain a valid JSON payload."] });
    expect(validateEnvironmentExport(fileOf("none"))).toEqual({ ok: false, errors: ["Expected an array of environments."] });
  });

  it("rejects a variable whose value is not a string", () => {
    const result = validateEnvironmentExport(
      fileOf([
        {
          id: "e",
          meta: { id: "e", createdAt: 1, updatedAt: 1, version: 1 },
          name: "E",
          order: 1,
          vars: [
            { key: "a", value: "ok", enabled: true },
            { key: "b", value: { nested: true }, enabled: true },
          ],
        },
      ])
    );

    expect(result.errors).toEqual(["environments[0].vars[1].value: Value must be a string."]);
  });

  it("names each invalid field by its position", () => {
    const result = validateEnvironmentExport(fileOf([null, { name: " ", order: "1", vars: {} }, env("ok", "Fine", 3)]));

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "environments[0] must be an object.",
      "environments[1].meta is missing.",
      "environments[1].name is required.",
      "environments[1].order must be a number.",
      "environments[1].vars: Value must be an array.",
    ]);
  });
});
