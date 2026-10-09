import type { Row } from "@wayfarer/core";

/**
 * Headers as text, one `Name: value` per line, for pasting a block of them.
 * A line that starts with `#` is a row that is kept but not sent.
 */
export function headerLines(rows: Row[]): string {
  return rows
    .filter((row) => row.key || row.value)
    .map((row) => `${row.enabled ? "" : "# "}${row.key}: ${row.value}`)
    .join("\n");
}

/** The rows of such text, in order, duplicates kept. A line with no colon is a name with no value. */
export function rowsFromHeaderLines(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "#")
    .map((line) => {
      const enabled = !line.startsWith("#");
      const content = enabled ? line : line.slice(1).trim();
      const colon = content.indexOf(":");
      return colon === -1
        ? { key: content, value: "", enabled }
        : { key: content.slice(0, colon).trim(), value: content.slice(colon + 1).trim(), enabled };
    });
}
