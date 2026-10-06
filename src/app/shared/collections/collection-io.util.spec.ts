import { CollectionTree } from "../../services/collections.service";
import { importCollection, serializeDeterministic, validateCollection } from "./collection-io.util";
import { describe, it, expect } from "vitest";

describe("collection-io.util", () => {
  it("@claim:C-026 produces byte-identical output after import/export round-trip", () => {
    const tree: CollectionTree = {
      collection: {
        id: "c2",
        meta: { id: "c2", createdAt: 1, updatedAt: 2, version: 1 },
        name: "Sample",
        description: "Desc",
        order: 2,
      },
      folders: [
        {
          id: "f2",
          meta: { id: "f2", createdAt: 1, updatedAt: 2, version: 1 },
          collectionId: "c2",
          name: "Folder B",
          order: 2,
        },
        {
          id: "f1",
          meta: { id: "f1", createdAt: 1, updatedAt: 2, version: 1 },
          collectionId: "c2",
          name: "Folder A",
          order: 1,
        },
      ],
      requests: [
        {
          id: "r2",
          meta: { id: "r2", createdAt: 1, updatedAt: 2, version: 1 },
          collectionId: "c2",
          name: "Request B",
          order: 2,
          method: "GET",
          url: "https://example-b.com",
          headers: {},
        },
        {
          id: "r1",
          meta: { id: "r1", createdAt: 1, updatedAt: 2, version: 1 },
          collectionId: "c2",
          name: "Request A",
          order: 1,
          method: "GET",
          url: "https://example-a.com",
          headers: {},
        },
      ],
    };

    const firstExport = serializeDeterministic(tree);
    const importResult = importCollection(firstExport);
    expect(importResult.payload).toBeTruthy();
    const secondExport = serializeDeterministic(importResult.payload!);
    expect(secondExport).toBe(firstExport);
  });

  it("rejects invalid payloads with helpful errors", () => {
    const invalid = validateCollection("null");
    expect(invalid.ok).toBe(false);
    expect(invalid.errors?.[0].path).toBe("root");

    const valid = validateCollection({
      meta: { id: "export-1", createdAt: 1, updatedAt: 1, version: 1 },
      collection: {
        id: "col-1",
        meta: { id: "col-1", createdAt: 1, updatedAt: 1, version: 1 },
        name: "Valid",
        order: 1,
      },
      folders: [],
      requests: [],
    });
    expect(valid.ok).toBe(true);
  });

  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 as const });
  const validExport = () => ({
    meta: meta("export-1"),
    collection: { id: "col-1", meta: meta("col-1"), name: "Billing", order: 1 },
    folders: [
      { id: "f-parent", meta: meta("f-parent"), collectionId: "col-1", name: "Parent", order: 1 },
      { id: "f-child", meta: meta("f-child"), collectionId: "col-1", parentFolderId: "f-parent", name: "Child", order: 2 },
    ],
    requests: [
      { id: "r-1", meta: meta("r-1"), collectionId: "col-1", folderId: "f-child", name: "Login", method: "POST", url: "https://api.test/login", headers: {}, order: 1 },
      { id: "r-2", meta: meta("r-2"), collectionId: "col-1", name: "Ping", method: "GET", url: "https://api.test/ping", headers: {}, order: 2 },
    ],
  });

  it("names every problem in a malformed file by its path", () => {
    const broken = {
      meta: { id: "export-1", createdAt: "yesterday", updatedAt: 1, version: 2 },
      collection: { meta: meta(""), name: "", order: "first" },
      folders: [{ id: "f-1", meta: "nope", name: "Folder", order: 1 }],
      requests: [{ id: "r-1", meta: meta("r-1"), collectionId: "col-1", name: "R", method: "", url: "", headers: null, order: 1 }],
    };

    const result = validateCollection(broken);

    expect(result.ok).toBe(false);
    const paths = result.errors!.map((e) => e.path);
    for (const path of [
      "meta.createdAt",
      "meta.version",
      "collection.id",
      "collection.name",
      "collection.order",
      "folders[0].meta",
      "folders[0].collectionId",
      "requests[0].method",
      "requests[0].url",
      "requests[0].headers",
    ]) {
      expect(paths, `missing error for ${path}`).toContain(path);
    }
  });

  it("rejects a file whose blocks are missing or of the wrong shape", () => {
    expect(validateCollection("{not json").ok).toBe(false);
    expect(validateCollection("42").ok).toBe(false);

    const paths = validateCollection({ folders: "none", requests: {} }).errors!.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["collection", "folders", "requests", "meta"]));

    expect(importCollection({ folders: [], requests: [] }).errors?.length).toBeGreaterThan(0);
    expect(importCollection({ folders: [], requests: [] }).payload).toBeUndefined();
  });

  it("plans an overwrite that keeps every id when importing over the original", () => {
    const result = importCollection(JSON.stringify(validExport()));

    expect(result.errors).toBeUndefined();
    expect(result.idRemap).toBeUndefined();
    expect(result.summary).toEqual({ folders: 2, requests: 2 });
    expect(result.plan).toEqual([
      { type: "collection", name: "Billing", id: "col-1", action: "overwrite" },
      { type: "folder", name: "Parent", id: "f-parent", action: "overwrite" },
      { type: "folder", name: "Child", id: "f-child", action: "overwrite" },
      { type: "request", name: "Login", id: "r-1", action: "overwrite" },
      { type: "request", name: "Ping", id: "r-2", action: "overwrite" },
    ]);
  });

  it("gives everything a new id when importing as a copy, and keeps the tree connected", () => {
    const source = validExport();
    const result = importCollection(source, { duplicateAsNew: true });
    const payload = result.payload!;
    const remap = result.idRemap!;

    expect(Object.keys(remap).sort()).toEqual(["col-1", "f-child", "f-parent", "r-1", "r-2"]);
    expect(new Set(Object.values(remap)).size).toBe(5);
    for (const [oldId, newId] of Object.entries(remap)) expect(newId).not.toBe(oldId);

    expect(payload.collection.id).toBe(remap["col-1"]);
    expect(payload.collection.meta.id).toBe(remap["col-1"]);
    expect(payload.folders.every((f) => f.collectionId === remap["col-1"])).toBe(true);
    expect(payload.requests.every((r) => r.collectionId === remap["col-1"])).toBe(true);
    // Parent/child and request/folder links follow the new ids.
    expect(payload.folders.find((f) => f.name === "Child")?.parentFolderId).toBe(remap["f-parent"]);
    expect(payload.requests.find((r) => r.name === "Login")?.folderId).toBe(remap["f-child"]);
    expect(payload.requests.find((r) => r.name === "Ping")?.folderId).toBeUndefined();
    expect(result.plan!.every((entry) => entry.action === "create")).toBe(true);

    // The caller's object is not modified.
    expect(source.collection.id).toBe("col-1");
    expect(source.folders[1].parentFolderId).toBe("f-parent");
  });
});
