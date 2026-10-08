import { describe, expect, it } from "vitest";
import { EnvironmentDoc } from "../../models/environments";
import { serializeEnvironmentExport, validateEnvironmentExport } from "./environment-io";

const env = (id: string, name: string, order: number, vars: Record<string, string> = {}): EnvironmentDoc => ({
  id,
  meta: { id, createdAt: 1, updatedAt: 1, version: 1 },
  name,
  order,
  vars,
});

describe("environment-io", () => {
  it("exports environments in order, with sorted keys, and reads its own export back unchanged", () => {
    const text = serializeEnvironmentExport([env("b", "Prod", 2, { zeta: "1", alpha: "2" }), env("a", "Dev", 1)]);

    expect(JSON.parse(text).map((e: EnvironmentDoc) => e.name)).toEqual(["Dev", "Prod"]);
    expect(text.indexOf('"alpha"')).toBeLessThan(text.indexOf('"zeta"'));

    const reread = validateEnvironmentExport(text);
    expect(reread.ok).toBe(true);
    expect(serializeEnvironmentExport(reread.payload!)).toBe(text);
  });

  it("accepts a bare array or an { environments } wrapper, and fills a missing id from meta", () => {
    const withoutId = { ...env("x", "Dev", 1), id: undefined };

    expect(validateEnvironmentExport([withoutId]).payload?.[0].id).toBe("x");
    expect(validateEnvironmentExport({ environments: [withoutId] }).payload?.[0].id).toBe("x");
  });

  it("rejects text that is not JSON and JSON that is not a list of environments", () => {
    expect(validateEnvironmentExport("{nope")).toEqual({ ok: false, errors: ["File does not contain a valid JSON payload."] });
    expect(validateEnvironmentExport({ environments: "none" })).toEqual({ ok: false, errors: ["Expected an array of environments."] });
  });

  it("rejects a variable whose value is not a string", () => {
    const result = validateEnvironmentExport([
      { id: "e", meta: { id: "e", createdAt: 1, updatedAt: 1, version: 1 }, name: "E", order: 1, vars: { a: "ok", b: { nested: true } } },
    ]);

    expect(result.errors).toEqual(["environments[0].vars values must be strings."]);
  });

  it("names each invalid field by its position", () => {
    const result = validateEnvironmentExport([null, { name: " ", order: "1", vars: [] }, env("ok", "Fine", 3)]);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "environments[0] must be an object.",
      "environments[1].meta is missing.",
      "environments[1].name is required.",
      "environments[1].order must be a number.",
      "environments[1].vars must be an object.",
    ]);
  });
});
