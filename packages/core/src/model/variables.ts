import type { Row } from "./request";

/** One change to a set of variables: a value to set, or `null` to remove the name. */
export interface VariableChange {
  key: string;
  value: string | null;
}

/**
 * The rows with the changes applied. A set replaces every row of that name
 * with one enabled row, where the first of them stood, or adds a row at the
 * end; a removal takes every row of that name. Rows the changes do not name
 * are left exactly as they are.
 *
 * This is the one way variables are changed from a value that may be stale:
 * the environments editor saves the difference it made, and a script's
 * `pm.environment.set` (Phase 3) is the same call. Run inside one
 * `readwrite` transaction on the stored rows, two tabs cannot lose each
 * other's change (D22).
 */
export function applyVariableChanges(rows: Row[], changes: VariableChange[]): Row[] {
  let next = rows;
  for (const { key, value } of changes) {
    const first = next.findIndex((row) => row.key === key);
    if (value === null) {
      next = next.filter((row) => row.key !== key);
    } else if (first === -1) {
      next = [...next, { key, value, enabled: true }];
    } else {
      next = next.flatMap((row, index) => (row.key !== key ? [row] : index === first ? [{ key, value, enabled: true }] : []));
    }
  }
  return next;
}

/** The enabled variables by name. A later row wins over an earlier one of the same name. */
export function variablesByName(rows: Row[]): Map<string, string> {
  return new Map(rows.filter((row) => row.enabled && row.key).map((row) => [row.key, row.value]));
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
