import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Idb } from "../data/idb";
import { RequestFiles } from "./request-files";

describe("RequestFiles", () => {
  let files: RequestFiles;
  const idb = { memoryOnly: vi.fn(() => false), readFile: vi.fn() };

  beforeEach(() => {
    idb.readFile.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: Idb, useValue: idb }] });
    files = TestBed.inject(RequestFiles);
  });

  it("holds a picked file in memory under a new id, and lists it as unsaved for a body that names it", async () => {
    const ref = files.pick(new File(["abc"], "a.txt"));
    if (typeof ref === "string") throw new Error(ref);

    expect(ref.fileName).toBe("a.txt");
    expect(await (await files.read(ref.fileId))?.text()).toBe("abc");
    expect(idb.readFile).not.toHaveBeenCalled();
    expect([...files.unsaved({ mode: "binary", binary: ref }).keys()]).toEqual([ref.fileId]);
    expect(files.unsaved({ mode: "binary", binary: { fileId: "stored-earlier", fileName: "b" } }).size).toBe(0);
  });

  it("reads a file it did not pick from the store, and has none when storage is unavailable", async () => {
    idb.readFile.mockResolvedValue(new Blob(["stored"]));
    expect(await (await files.read("f-1"))?.text()).toBe("stored");

    idb.memoryOnly.mockReturnValueOnce(true);
    expect(await files.read("f-2")).toBeUndefined();
  });

  it("refuses a file over 50 MB, naming it and its size, and accepts one of exactly 50 MB", () => {
    const sized = (bytes: number) => Object.defineProperty(new File([], "big.iso"), "size", { value: bytes });

    expect(files.pick(sized(50 * 1024 * 1024 + 1))).toBe('"big.iso" is 50.0 MB. A file in a request body can be 50 MB at most.');
    expect(files.pick(sized(64 * 1024 * 1024))).toContain("64.0 MB");
    expect(typeof files.pick(sized(50 * 1024 * 1024))).toBe("object");
  });
});
