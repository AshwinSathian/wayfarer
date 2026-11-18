// What changed in a folder since the app last wrote or took it (T2.4): the files that differ, and for each the
// lines that went and the lines that came, so a person sees a change before it is taken.
import { isFolderPath } from "./folder";

export interface LineChange {
  kind: "same" | "removed" | "added";
  text: string;
}

export interface FileChange {
  path: string;
  status: "added" | "removed" | "changed";
  lines: LineChange[];
}

/** The lines of `before` and `after` as one list, by the longest run they share (a file is at most a few thousand lines). */
export function diffLines(before: string, after: string): LineChange[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const common = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
  const out: LineChange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (common[i + 1][j] >= common[i][j + 1]) out.push({ kind: "removed", text: a[i++] });
    else out.push({ kind: "added", text: b[j++] });
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++] });
  while (j < b.length) out.push({ kind: "added", text: b[j++] });
  return out;
}

/** The files of `now` that are not as `base` has them, in path order; a path that is not the format's is not looked at. */
export function changedFiles(base: Record<string, string>, now: Record<string, string>): FileChange[] {
  const paths = [...new Set([...Object.keys(base), ...Object.keys(now)])].filter(isFolderPath).sort();
  const changes: FileChange[] = [];
  for (const path of paths) {
    const before = Object.hasOwn(base, path) ? base[path] : undefined;
    const after = Object.hasOwn(now, path) ? now[path] : undefined;
    if (before === after) continue;
    changes.push({
      path,
      status: before === undefined ? "added" : after === undefined ? "removed" : "changed",
      lines: diffLines(before ?? "", after ?? ""),
    });
  }
  return changes;
}
