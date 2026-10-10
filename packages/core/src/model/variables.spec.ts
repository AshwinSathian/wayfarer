import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Row } from "./request";
import { applyVariableChanges, variableChanges } from "./variables";

const row = (key: string, value: string, enabled = true): Row => ({ key, value, enabled });
const names = (rows: Row[]) => Object.fromEntries(rows.filter((r) => r.enabled).map((r) => [r.key, r.value]));

describe("variable changes", () => {
  it("sets a value where the name stood, adds a new name at the end, and removes every row of a name", () => {
    const rows = [row("a", "1"), row("off", "x", false), row("a", "old"), row("b", "2")];

    expect(applyVariableChanges(rows, [{ key: "a", value: "new" }])).toEqual([row("a", "new"), row("off", "x", false), row("b", "2")]);
    expect(applyVariableChanges(rows, [{ key: "c", value: "3" }])).toEqual([...rows, row("c", "3")]);
    expect(applyVariableChanges(rows, [{ key: "a", value: null }])).toEqual([row("off", "x", false), row("b", "2")]);
    // Setting a row that was switched off switches it on: the caller set it to be used.
    expect(applyVariableChanges(rows, [{ key: "off", value: "y" }])[1]).toEqual(row("off", "y"));
    expect(applyVariableChanges(rows, [])).toBe(rows);
    expect(applyVariableChanges(rows, [{ key: "__proto__", value: "p" }]).at(-1)).toEqual(row("__proto__", "p"));
  });

  it("finds what an editor did: values set or changed, names removed, and nothing for rows it left alone", () => {
    const before = [row("keep", "1"), row("change", "old"), row("gone", "x"), row("off", "z", false)];
    const after = [row("keep", "1"), row("change", "new"), row("added", "+")];

    expect(variableChanges(before, after)).toEqual([
      { key: "change", value: "new" },
      { key: "added", value: "+" },
      { key: "gone", value: null },
    ]);
    expect(variableChanges(before, before)).toEqual([]);
  });

  // The two-tab case: each tab edited the rows it loaded; the second save lands on what the first one stored.
  it("two editors that changed different names both keep their change, whichever saves first (200 generated)", () => {
    const rows = fc.uniqueArray(fc.record({ key: fc.string({ minLength: 1, maxLength: 3 }), value: fc.string(), enabled: fc.constant(true) }), {
      selector: (r) => r.key,
      maxLength: 5,
    });
    fc.assert(
      fc.property(rows, fc.string(), fc.string(), (loaded, valueA, valueB) => {
        const editA = [...loaded, row("only-in-a", valueA)];
        const editB = [...loaded.slice(1), row("only-in-b", valueB)];
        const changesA = variableChanges(loaded, editA);
        const changesB = variableChanges(loaded, editB);

        const aThenB = applyVariableChanges(applyVariableChanges(loaded, changesA), changesB);
        const bThenA = applyVariableChanges(applyVariableChanges(loaded, changesB), changesA);

        const expected = { ...names(loaded.slice(1)), "only-in-a": valueA, "only-in-b": valueB };
        expect(names(aThenB)).toEqual(expected);
        expect(names(bThenA)).toEqual(expected);
      }),
      { numRuns: 200, seed: 20261009 }
    );
  });

  it("a script's set never replaces a protected variable's reference; anyone else's does, and a removal does", () => {
    const reference = "{{$secret.0b1c2d3e-0000-4000-8000-000000000001}}";
    const rows = [row("token", reference), row("mixed", `Bearer ${reference}`), row("plain", "1")];
    const fromScript = (key: string, value: string | null) => ({ key, value, keepSecret: true as const });
    expect(applyVariableChanges(rows, [fromScript("token", "leaked"), fromScript("mixed", "m"), fromScript("plain", "2")])).toEqual([row("token", reference), row("mixed", "m"), row("plain", "2")]);
    expect(applyVariableChanges([row("token", ` {{ $secret.ab-1 }} `, false)], [fromScript("token", "leaked")])).toEqual([row("token", ` {{ $secret.ab-1 }} `, false)]);
    // The editor unprotects a variable by saving its text; a script may remove one.
    expect(applyVariableChanges(rows, [{ key: "token", value: "typed" }])[0]).toEqual(row("token", "typed"));
    expect(applyVariableChanges(rows, [fromScript("token", null)]).map((r) => r.key)).toEqual(["mixed", "plain"]);
  });
});
