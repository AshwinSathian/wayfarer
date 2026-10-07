import { describe, expect, it } from "vitest";
import {
  bodyObjectFromRows,
  bodyRowsFromObject,
  isPlainObject,
  mergeHeaderRowsFromParsed,
  rowsFromObject,
  stringRecordFromRows,
} from "./key-value.util";

describe("key-value.util", () => {
  it("tells plain objects from arrays, null and primitives", () => {
    expect(isPlainObject({})).toBe(true);
    expect([[], null, "x", 1, undefined].map(isPlainObject)).toEqual([false, false, false, false, false]);
  });

  it("turns header rows into a string record, trimming keys and dropping blank ones", () => {
    expect(
      stringRecordFromRows([
        { key: " Accept ", value: "*/*" },
        { key: "  ", value: "dropped" },
        { key: "X-Count", value: 3 },
        { key: "X-Empty", value: null },
      ])
    ).toEqual({ Accept: "*/*", "X-Count": "3", "X-Empty": "" });
  });

  it("turns body rows into an object that keeps value types, or undefined when empty", () => {
    expect(bodyObjectFromRows([{ key: "n", value: 1 }, { key: " list ", value: [1, 2] }, { key: "", value: "x" }])).toEqual({ n: 1, list: [1, 2] });
    expect(bodyObjectFromRows([{ key: " ", value: 1 }])).toBeUndefined();
  });

  it("turns objects into rows: text rows stringify, body rows keep nested values", () => {
    expect(rowsFromObject({ a: 1, b: null, c: true })).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "" },
      { key: "c", value: "true" },
    ]);
    expect(bodyRowsFromObject({ a: { b: [1] }, c: undefined })).toEqual([
      { key: "a", value: { b: [1] } },
      { key: "c", value: null },
    ]);
  });

  it("merges edited JSON headers into rows with Content-Type first", () => {
    const current = [{ key: "Content-Type", value: "text/plain" }];

    // The JSON omits Content-Type: the current one is kept, and placed first.
    expect(mergeHeaderRowsFromParsed({ " Accept ": "*/*", "": "dropped", "X-N": 2 }, current, "Content-Type", "application/json")).toEqual([
      { key: "Content-Type", value: "text/plain" },
      { key: "Accept", value: "*/*" },
      { key: "X-N", value: "2" },
    ]);
    // The JSON sets it: that value wins, still first.
    expect(mergeHeaderRowsFromParsed({ Accept: "*/*", "Content-Type": "application/xml" }, current, "Content-Type", "application/json")).toEqual([
      { key: "Content-Type", value: "application/xml" },
      { key: "Accept", value: "*/*" },
    ]);
    // Nothing anywhere: the default.
    expect(mergeHeaderRowsFromParsed({}, [], "Content-Type", "application/json")).toEqual([{ key: "Content-Type", value: "application/json" }]);
  });
});
