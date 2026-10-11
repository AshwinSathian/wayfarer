import type { Row } from "./request";

/** One change to a set of variables: a value to set, or `null` to remove the name. */
export interface VariableChange {
  key: string;
  value: string | null;
  /** The value is the JSON of something that is not text (`Row.json`): a script set a number, a boolean, null, an object or a list. */
  json?: true;
  /**
   * A script's change. It never replaces a protected variable's reference
   * with text: the app puts such a value into the vault instead, and this
   * holds also when the app's own copy of the rows was a moment old.
   */
  keepSecret?: true;
}

/** A protected variable's value: one reference to a vault secret and nothing else. */
export const SECRET_REFERENCE = /^\s*\{\{\s*\$secret\.[a-z0-9-]+\s*\}\}\s*$/i;

/**
 * The rows with the changes applied. A set replaces every row of that name
 * with one enabled row, where the first of them stood, or adds a row at the
 * end; a removal takes every row of that name. Rows the changes do not name
 * are left exactly as they are. A set marked `keepSecret` is left out when a
 * row of that name holds a vault secret's reference.
 *
 * This is the one way variables are changed from a value that may be stale:
 * the environments editor saves the difference it made, and a script's
 * `pm.environment.set` (Phase 3) is the same call. Run inside one
 * `readwrite` transaction on the stored rows, two tabs cannot lose each
 * other's change (D22).
 */
export function applyVariableChanges(rows: Row[], changes: VariableChange[]): Row[] {
  let next = rows;
  for (const { key, value, keepSecret, json } of changes) {
    const made = (): Row => ({ key, value: value ?? "", enabled: true, ...(json && { json }) });
    const first = next.findIndex((row) => row.key === key);
    if (value !== null && keepSecret && next.some((row) => row.key === key && SECRET_REFERENCE.test(row.value))) continue;
    if (value === null) {
      next = next.filter((row) => row.key !== key);
    } else if (first === -1) {
      next = [...next, made()];
    } else {
      next = next.flatMap((row, index) => (row.key !== key ? [row] : index === first ? [made()] : []));
    }
  }
  return next;
}

/** The enabled variables by name. A later row wins over an earlier one of the same name. */
export function variablesByName(rows: Row[]): Map<string, string> {
  return new Map(rows.filter((row) => row.enabled && row.key).map((row) => [row.key, row.value]));
}

/** A variable as a script is given it: its name, its value, and whether the value is JSON (`Row.json`). */
export type ScriptVariable = [name: string, value: string, json?: true];

/** The enabled variables as a script is given them. A later row wins over an earlier one of the same name. */
export function scriptVariables(rows: Row[]): ScriptVariable[] {
  const byName = new Map<string, ScriptVariable>();
  for (const row of rows) if (row.enabled && row.key) byName.set(row.key, row.json ? [row.key, row.value, true] : [row.key, row.value]);
  return [...byName.values()];
}

/** The changes that turn the variables of `before` into those of `after`: what an editor did to the rows it was given. */
export function variableChanges(before: Row[], after: Row[]): VariableChange[] {
  const was = variablesByName(before);
  const is = variablesByName(after);
  return [
    ...[...is].filter(([key, value]) => was.get(key) !== value).map(([key, value]) => ({ key, value })),
    ...[...was.keys()].filter((key) => !is.has(key)).map((key) => ({ key, value: null })),
  ];
}
