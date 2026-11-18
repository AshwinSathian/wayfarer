import { describe, expect, it } from "vitest";
import { changedFiles, diffLines } from "./diff";

describe("diffLines", () => {
  it("lists the lines that stayed, went and came", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });
  it("reads an empty side as one empty line", () => {
    expect(diffLines("", "a").map((l) => l.kind)).toEqual(["removed", "added"]);
  });
});

describe("diffLines, large files", () => {
  it("shows two files too long to compare as all gone and all come, without filling a table", () => {
    const long = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n");
    const out = diffLines(long, `${long}\nx`);
    expect(out.filter((l) => l.kind === "same")).toEqual([]);
    expect(out).toHaveLength(3000 + 3001);
  });
});

describe("changedFiles", () => {
  it("names the added, removed and changed files of the format, in path order, and nothing else", () => {
    const base = { "collection.json": "1", "a.r1.request.json": "x", "b.r2.request.json": "y" };
    const now = { "collection.json": "1", "a.r1.request.json": "x2", "c.r3.request.json": "z", ".git/config": "q" };
    expect(changedFiles(base, now).map((c) => [c.path, c.status])).toEqual([
      ["a.r1.request.json", "changed"],
      ["b.r2.request.json", "removed"],
      ["c.r3.request.json", "added"],
    ]);
  });
  it("finds nothing when nothing differs", () => {
    expect(changedFiles({ "collection.json": "1" }, { "collection.json": "1" })).toEqual([]);
  });
});
