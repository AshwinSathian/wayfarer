import { CollectionTree } from "../../services/collections.service";
import { importCollection, serializeDeterministic, validateCollection } from "./collection-io.util";
import { describe, it, expect } from "vitest";

describe("collection-io.util", () => {
  it("produces byte-identical output after import/export round-trip", () => {
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
});
