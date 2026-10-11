import { parse } from "yaml";
import { ImportError } from "./import-error";

/** A YAML file that uses an alias this many times is refused. A file built to grow without end as it is read (a "billion laughs") uses far more. */
export const MAX_YAML_ALIASES = 100;

/**
 * The largest text read as YAML. The reader keeps every token of the file
 * as an object: a megabyte written to be dense (`[[[[…`, `""""…`) took a
 * gigabyte and a second and a half when measured, and ten megabytes ended
 * the process. JSON has the 10 MB limit of every import.
 * ponytail: one limit for every YAML file, though a megabyte of an honest
 * file takes 150 MB. A count of tokens would let a larger honest file in.
 */
export const MAX_YAML_CHARS = 1024 * 1024;

export const YAML_ALIASES = `The YAML file repeats parts of itself through aliases ${MAX_YAML_ALIASES} times or more and is refused: a file written that way grows without end as it is read.`;
export const YAML_TOO_LARGE = "The file is not JSON, and at more than 1 MB it is too large to be read as YAML: a YAML file takes far more memory to read than a JSON file of its size. If it is YAML, convert it to JSON and import that.";
export const NOT_READABLE = "The file is neither JSON nor YAML that can be read, so it is not a file Wayfarer can import.";

/**
 * A YAML file's text as the value it holds. YAML 1.2's core schema: a tag
 * makes no object of the page and `<<` merges nothing. A key that is there
 * twice keeps its last value, as in JSON: the reader's own check compares
 * every key of a map with every other. Its errors are not given the lines
 * around them, which it would cut from the text once per error. Throws
 * `ImportError`.
 */
export function parseYaml(text: string): unknown {
  if (text.length > MAX_YAML_CHARS) throw new ImportError(YAML_TOO_LARGE);
  try {
    return parse(text, { maxAliasCount: MAX_YAML_ALIASES, schema: "core", logLevel: "error", uniqueKeys: false, prettyErrors: false });
  } catch (error) {
    // The parser has no error type for this one: it is a ReferenceError that says "alias".
    throw new ImportError(error instanceof Error && /alias count/i.test(error.message) ? YAML_ALIASES : NOT_READABLE);
  }
}
