/**
 * Pure conversions between the composer's key/value row editors
 * (Headers/Body/Params tabs, each backed by a `{ key, value }[]` signal)
 * and the plain objects the rest of the app (HttpClient calls, the JSON
 * editor, `RequestDoc` persistence) actually deals in.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Row list -> plain object, dropping blank-key rows and stringifying values (used for headers, which are always string-valued on the wire). */
export function stringRecordFromRows(rows: { key: string; value: unknown }[]): Record<string, string> {
  return rows.reduce((acc, item) => {
    const key = (item?.key ?? "").trim();
    if (!key) {
      return acc;
    }
    acc[key] = String(item.value ?? "");
    return acc;
  }, {} as Record<string, string>);
}

/** Row list -> plain object (or undefined if empty), preserving raw value types — used for the request body. */
export function bodyObjectFromRows(
  rows: { key: string; value: unknown }[]
): Record<string, unknown> | undefined {
  const body = rows.reduce((acc, item) => {
    const key = (item?.key ?? "").trim();
    if (!key) {
      return acc;
    }
    acc[key] = item.value;
    return acc;
  }, {} as Record<string, unknown>);
  return Object.keys(body).length ? body : undefined;
}

/** Plain object -> row list (the inverse of the two functions above), used when loading a saved/history request into the editors. Values are always stringified — this feeds the Body/Headers key/value editors, which are text inputs. */
export function rowsFromObject(object: Record<string, unknown>): { key: string; value: string }[] {
  return Object.entries(object).map(([key, value]) => ({
    key,
    value: String(value ?? ""),
  }));
}

/**
 * Merges a parsed JSON headers object (from the JSON-mode editor) back into
 * ordered row form, keeping the Content-Type row first and falling back to
 * whatever Content-Type was already set (or the given default) if the
 * parsed object didn't specify one.
 */
export function mergeHeaderRowsFromParsed(
  parsed: Record<string, unknown>,
  currentRows: { key: string; value: string }[],
  defaultHeaderKey: string,
  defaultHeaderValue: string
): { key: string; value: string }[] {
  const headersMap = new Map<string, string>();
  for (const [key, rawValue] of Object.entries(parsed)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      continue;
    }
    headersMap.set(trimmedKey, String(rawValue ?? ""));
  }

  const existingContentType =
    currentRows.find((header) => header.key === defaultHeaderKey)?.value ?? defaultHeaderValue;

  if (!headersMap.size || !headersMap.has(defaultHeaderKey)) {
    headersMap.set(defaultHeaderKey, existingContentType);
  }

  const orderedEntries: { key: string; value: string }[] = [];
  if (headersMap.has(defaultHeaderKey)) {
    const value = headersMap.get(defaultHeaderKey) ?? existingContentType;
    orderedEntries.push({ key: defaultHeaderKey, value });
    headersMap.delete(defaultHeaderKey);
  }
  headersMap.forEach((value, key) => {
    orderedEntries.push({ key, value });
  });

  return orderedEntries.length
    ? orderedEntries
    : [{ key: defaultHeaderKey, value: existingContentType }];
}
