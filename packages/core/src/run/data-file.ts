import type { Row } from "../model/request";
import { parseJson, stringifyJson } from "../safe-json";

/** A data file that is not one. Its message is written for the user. */
export class DataFileError extends Error {
  override readonly name = "DataFileError";
}

/**
 * The records of a CSV text (RFC 4180): fields parted by commas, records by
 * CRLF or LF; a field in double quotes may hold a comma, a line break and,
 * doubled, a quote. Nothing is trimmed. A byte order mark and one line break
 * at the end are not data.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let at = text.startsWith("﻿") ? 1 : 0;
  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = "";
  };
  for (; at < text.length; at++) {
    const char = text[at];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[at + 1] === '"') {
        field += '"';
        at++;
      } else quoted = false;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || (char === "\r" && text[at + 1] === "\n")) {
      if (char === "\r") at++;
      endRecord();
    } else field += char;
  }
  if (quoted) throw new DataFileError("The CSV file ends inside a quoted field.");
  // What follows the last line break is a record only when something is there.
  if (field !== "" || record.length) endRecord();
  return records;
}

/**
 * The rows of a run's data file (P5.2), one per iteration, each as
 * variables. A `.json` file is a list of objects, and a value that is not
 * text is kept as its JSON (`json: true`, as a value a script sets is). Any
 * other file is CSV with its names in the first record; its values are text.
 */
export function parseDataFile(text: string, fileName: string): Row[][] {
  if (/\.json$/i.test(fileName)) {
    const parsed = parseJson(text);
    const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
    if (!parsed.ok || !Array.isArray(parsed.value) || !parsed.value.every(isObject)) throw new DataFileError("A JSON data file is a list of objects, one for each iteration.");
    return parsed.value.map((entry) =>
      Object.entries(entry).map(([key, value]): Row => (typeof value === "string" ? { key, value, enabled: true } : { key, value: stringifyJson(value) ?? "null", enabled: true, json: true }))
    );
  }
  const [names, ...records] = parseCsv(text);
  if (!names?.some((name) => name)) throw new DataFileError("A CSV data file has the names of its values in its first line.");
  // A record of one empty field is an empty line.
  return records.filter((record) => record.length > 1 || record[0] !== "").map((record) => names.flatMap((key, index): Row[] => (key ? [{ key, value: record[index] ?? "", enabled: true }] : [])));
}
