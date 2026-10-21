import { describe, expect, it } from "vitest";
import { DataFileError, parseCsv, parseDataFile } from "./data-file";

describe("parseCsv (RFC 4180)", () => {
  it("reads records ended by CRLF or LF, the last with or without one", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("")).toEqual([]);
  });

  it("a quoted field holds a comma, a line break and a doubled quote", () => {
    expect(parseCsv('n,"a ""b"", c","two\r\nlines"\n')).toEqual([["n", 'a "b", c', "two\r\nlines"]]);
  });

  it("keeps empty fields, spaces and a lone carriage return, and drops a byte order mark", () => {
    expect(parseCsv("﻿a,,c\n , x \r,\n,\n")).toEqual([
      ["a", "", "c"],
      [" ", " x \r", ""],
      ["", ""],
    ]);
  });

  it("a quote inside an unquoted field is that character", () => {
    expect(parseCsv('5" pipe,x')).toEqual([['5" pipe', "x"]]);
  });

  it("refuses a file that ends inside a quoted field", () => {
    expect(() => parseCsv('a\n"open')).toThrow(DataFileError);
  });
});

describe("parseDataFile", () => {
  it("a CSV file's first record names the values; a short record's missing values are empty, an empty line is no row", () => {
    expect(parseDataFile("user,role\nann,admin\n\nbob\n", "rows.csv")).toEqual([
      [
        { key: "user", value: "ann", enabled: true },
        { key: "role", value: "admin", enabled: true },
      ],
      [
        { key: "user", value: "bob", enabled: true },
        { key: "role", value: "", enabled: true },
      ],
    ]);
  });

  it("a column without a name is left out, and a value past the last name too", () => {
    expect(parseDataFile("a,,c\n1,2,3,4\n", "rows.txt")).toEqual([
      [
        { key: "a", value: "1", enabled: true },
        { key: "c", value: "3", enabled: true },
      ],
    ]);
  });

  it("a name such as __proto__ is a name", () => {
    expect(parseDataFile("__proto__,constructor\n1,2\n", "rows.csv")[0].map((row) => row.key)).toEqual([
      "__proto__",
      "constructor",
    ]);
    expect(parseDataFile('[{"__proto__":"x"}]', "rows.json")).toEqual([
      [{ key: "__proto__", value: "x", enabled: true }],
    ]);
  });

  it("a JSON file is a list of objects; what is not text keeps its type as JSON", () => {
    expect(parseDataFile('[{"user":"ann","n":1,"deep":{"a":[true,null]}},{}]', "Rows.JSON")).toEqual([
      [
        { key: "user", value: "ann", enabled: true },
        { key: "n", value: "1", enabled: true, json: true },
        { key: "deep", value: '{"a":[true,null]}', enabled: true, json: true },
      ],
      [],
    ]);
  });

  it("refuses a JSON file that is not a list of objects, and a CSV file without names", () => {
    for (const text of ["{", '{"a":1}', "[1]", "[[]]", "[null]"])
      expect(() => parseDataFile(text, "rows.json")).toThrow("A JSON data file is a list of objects");
    for (const text of ["", "\n", ",,\n1,2,3\n"])
      expect(() => parseDataFile(text, "rows.csv")).toThrow(
        "A CSV data file has the names of its values in its first line.",
      );
  });
});
