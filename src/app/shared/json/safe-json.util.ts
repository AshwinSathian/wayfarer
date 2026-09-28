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
