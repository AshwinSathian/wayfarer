import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { inCollection, inFolder, requestContent, rowsOf } from "../../test/request-fixtures";
import type { CollectionExport, Folder, RequestDoc } from "../model/collection";
import { COLLECTION_FORMAT } from "../model/collection";
import { FolderError, isFolderPath, readFolder, writeFolder } from "./folder";

const meta = (id: string) => ({ id, createdAt: 0, updatedAt: 0 });

function sample(): CollectionExport {
  const folder = (id: string, name: string, parent?: string): Folder => ({
    id,
    meta: meta(id),
    collectionId: "c1",
    name,
    order: 1,
    ...inFolder,
    ...(parent ? { parentFolderId: parent } : {}),
  });
  const request = (id: string, name: string, folderId?: string): RequestDoc => ({
    id,
    meta: meta(id),
    collectionId: "c1",
    name,
    order: 2,
    ...(folderId ? { folderId } : {}),
    ...requestContent({
      method: "POST",
      url: "{{base}}/x",
      headers: rowsOf({ "X-Key": "{{$secret.abc}}" }),
      body: { mode: "raw", raw: { language: "json", text: '{\n  "a": 1\n}' } },
      scripts: { pre: "const a = 1;\nconst b = 2;", post: "" },
    }),
  });
  return {
    $id: COLLECTION_FORMAT,
    meta: meta("c1"),
    collection: { id: "c1", meta: meta("c1"), name: "Billing API", order: 1, variables: [], ...inCollection },
    folders: [folder("f1", "Auth / Tokens"), folder("f2", "Inner", "f1")],
    requests: [request("r1", "Ping"), request("r2", "Login", "f1"), request("r3", "Deep one", "f2")],
  };
}

describe("writeFolder and readFolder", () => {
  it("names each file for what it holds, with the folders as folders", () => {
    expect(Object.keys(writeFolder(sample())).sort()).toEqual([
      "auth-tokens.f1/folder.json",
      "auth-tokens.f1/inner.f2/deep-one.r3.request.json",
      "auth-tokens.f1/inner.f2/folder.json",
      "auth-tokens.f1/login.r2.request.json",
      "collection.json",
      "ping.r1.request.json",
    ]);
  });

  it("round-trips: what is read is what was written, with no timestamps in the files", () => {
    const files = writeFolder(sample());
    const back = readFolder(files);
    expect(back.requests.map((r) => r.meta.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(writeFolder(back)).toEqual(files);
    expect(Object.values(files).join("")).not.toMatch(/createdAt|updatedAt/);
    expect(back.requests.find((r) => r.meta.id === "r3")?.folderId).toBe("f2");
    expect(back.folders.find((f) => f.meta.id === "f2")?.parentFolderId).toBe("f1");
  });

  it("writes a text of several lines one line to a line, and a secret as its reference", () => {
    const text = writeFolder(sample())["ping.r1.request.json"];
    expect(text).toContain('"const a = 1;"');
    expect(text).toContain('"const b = 2;"');
    expect(text).toContain("{{$secret.abc}}");
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("is byte-stable: the same collection gives the same files, whatever order it is given in", () => {
    const one = sample();
    const two = sample();
    two.requests.reverse();
    two.folders.reverse();
    expect(writeFolder(two)).toEqual(writeFolder(one));
  });

  it("round-trips any names and texts", () => {
    const text = fc.string({ maxLength: 40 });
    fc.assert(
      fc.property(
        text.filter((n) => n.trim() !== ""),
        text,
        text,
        (name, script, body) => {
          const source = sample();
          source.requests[0].name = name;
          source.requests[0].scripts.pre = script;
          source.requests[0].body = { mode: "raw", raw: { language: "text", text: body } };
          const back = readFolder(writeFolder(source));
          const request = back.requests.find((r) => r.meta.id === "r1");
          expect(request?.name).toBe(name);
          expect(request?.scripts.pre).toBe(script);
          expect(request?.body).toEqual({ mode: "raw", raw: { language: "text", text: body } });
        },
      ),
    );
  });

  it("refuses a file of another shape, a file named wrong, and says which", () => {
    const files = writeFolder(sample());
    for (const bad of [
      "../x.request.json",
      "/etc/passwd",
      "a.request.json",
      "collection.json/x",
      ".git/config",
      "A.b.request.json",
    ]) {
      expect(isFolderPath(bad)).toBe(false);
      expect(() => readFolder({ ...files, [bad]: "{}" })).toThrow(FolderError);
    }
  });

  it("refuses a merge conflict, a changed id, a missing collection file and invalid content, reading none of it", () => {
    const files = writeFolder(sample());
    const conflict = { ...files, "ping.r1.request.json": "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> x\n" };
    expect(() => readFolder(conflict)).toThrow(/ping\.r1\.request\.json: not JSON/);
    const { "collection.json": _gone, ...without } = files;
    expect(() => readFolder(without)).toThrow(/collection\.json: missing/);
    const renamed = { ...files, "ping.r9.request.json": files["ping.r1.request.json"] };
    delete (renamed as Record<string, string>)["ping.r1.request.json"];
    expect(() => readFolder(renamed)).toThrow(/id is not the one in its name/);
    const invalid = { ...files, "ping.r1.request.json": files["ping.r1.request.json"].replace('"POST"', "123") };
    expect(() => readFolder(invalid)).toThrow(FolderError);
  });

  it("refuses a request in a folder that has no folder file, and an id that cannot name a file", () => {
    const files = writeFolder(sample());
    delete (files as Record<string, string>)["auth-tokens.f1/folder.json"];
    expect(() => readFolder(files)).toThrow(/has no folder\.json/);
    const bad = sample();
    bad.requests[0].meta.id = "../etc";
    expect(() => writeFolder(bad)).toThrow(/cannot name a file/);
  });
});
