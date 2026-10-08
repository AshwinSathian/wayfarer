/**
 * JSON helpers for places where invalid input is an expected outcome, not an
 * error: the failure is returned as a value for the caller to handle.
 */
export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: SyntaxError };

export function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    // JSON.parse only throws SyntaxError for a string argument.
    return { ok: false, error: error as SyntaxError };
  }
}

/** JSON.stringify, or undefined when the value can't be serialized (a cycle, a BigInt). */
export function stringifyJson(value: unknown, space?: number): string | undefined {
  try {
    return JSON.stringify(value, undefined, space);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

/** Largest collection or environment file the app imports. Its own exports are a few hundred kB. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const IMPORT_TOO_LARGE = "The file is larger than 10 MB.";

/**
 * The text of a picked file, reading no more than one byte past the limit so
 * a huge file cannot exhaust memory. `isOversizedImport` then rejects it.
 */
export function readImportText(file: Blob): Promise<string> {
  return file.slice(0, MAX_IMPORT_BYTES + 1).text();
}

// ponytail: counts UTF-16 units, not bytes. A file over the limit that is
// mostly multi-byte text is cut short instead, and fails as invalid JSON.
export function isOversizedImport(input: unknown): boolean {
  return typeof input === "string" && input.length > MAX_IMPORT_BYTES;
}
