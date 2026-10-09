import { TestBed } from "@angular/core/testing";
import { requestContent } from "../../testing/request-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionImport } from "./collection-import";
import { CollectionsStore } from "./collections-store";

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });
const file = JSON.stringify({
  $id: "wayfarer/collection/2",
  meta: meta("export-1"),
  collection: { id: "col-1", meta: meta("col-1"), name: "Billing", order: 1 },
  folders: [{ id: "f-1", meta: meta("f-1"), collectionId: "col-1", name: "Auth", order: 1 }],
  requests: [{ id: "r-1", meta: meta("r-1"), collectionId: "col-1", folderId: "f-1", name: "Login", order: 1, ...requestContent({ method: "POST", url: "https://api.test/login" }) }],
});

describe("CollectionImport", () => {
  let service: CollectionImport;
  const collections = { importCollection: vi.fn() };

  beforeEach(() => {
    collections.importCollection.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: CollectionsStore, useValue: collections }] });
    service = TestBed.inject(CollectionImport);
  });

  it("stages a valid file with an overwrite preview", () => {
    service.stageFile("billing.json", file);

    expect(service.dialogVisible()).toBe(true);
    expect(service.fileName()).toBe("billing.json");
    expect(service.errors()).toEqual([]);
    expect(service.analysis()?.summary).toEqual({ folders: 1, requests: 1 });
    expect(service.analysis()?.plan?.every((entry) => entry.action === "overwrite")).toBe(true);
  });

  it("switching to 'import as a copy' re-plans with new ids, and confirm passes that choice on", async () => {
    service.stageFile("billing.json", file);
    service.toggleDuplicateAsNew(true);

    const analysis = service.analysis()!;
    expect(analysis.plan?.every((entry) => entry.action === "create")).toBe(true);
    expect(analysis.payload?.collection.id).not.toBe("col-1");

    await service.confirm();

    expect(collections.importCollection).toHaveBeenCalledExactlyOnceWith(analysis.payload, { duplicateAsNew: true });
    expect(service.dialogVisible()).toBe(false);
    expect(service.analysis()).toBeNull();
    expect(service.sourcePayload()).toBeNull();
    expect(service.duplicateAsNew()).toBe(false);
    expect(service.fileName()).toBe("");
  });

  it("shows the errors of an invalid file, has no preview, and imports nothing on confirm", async () => {
    service.stageFile("bad.json", '{"collection":{}}');

    expect(service.dialogVisible()).toBe(true);
    expect(service.errors().length).toBeGreaterThan(0);
    expect(service.analysis()).toBeNull();
    service.toggleDuplicateAsNew(true);
    expect(service.analysis()).toBeNull();

    await service.confirm();

    expect(collections.importCollection).not.toHaveBeenCalled();
    expect(service.dialogVisible()).toBe(false);
  });
});
