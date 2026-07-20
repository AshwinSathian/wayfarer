import { TestBed } from "@angular/core/testing";
import { CollectionsService } from "./collections.service";
import { IdbService } from "../data/idb.service";
import { Collection, Folder, Meta, RequestDoc } from "../models/collections.models";

function meta(id: string): Meta {
  return { id, createdAt: 1, updatedAt: 1, version: 1 };
}

function makeCollection(id: string, order = 0): Collection {
  return { id, meta: meta(id), name: `Collection ${id}`, order };
}

function makeFolder(id: string, collectionId: string, order = 0): Folder {
  return { id, meta: meta(id), collectionId, name: `Folder ${id}`, order };
}

function makeRequest(id: string, collectionId: string, order = 0): RequestDoc {
  return {
    id,
    meta: meta(id),
    collectionId,
    name: `Request ${id}`,
    order,
    method: "GET",
    url: "https://example.com",
    headers: {},
  };
}

class IdbServiceMock {
  collections: Collection[] = [makeCollection("c1"), makeCollection("c2")];
  folders: Record<string, Folder[]> = { c1: [], c2: [] };
  requests: Record<string, RequestDoc[]> = { c1: [], c2: [] };

  listCollectionsCalls = 0;
  listFoldersCalls: string[] = [];
  listRequestsCalls: string[] = [];

  async listCollections(): Promise<Collection[]> {
    this.listCollectionsCalls++;
    return this.collections;
  }

  async listFolders(collectionId: string): Promise<Folder[]> {
    this.listFoldersCalls.push(collectionId);
    return this.folders[collectionId] ?? [];
  }

  async listRequests(collectionId: string): Promise<RequestDoc[]> {
    this.listRequestsCalls.push(collectionId);
    return this.requests[collectionId] ?? [];
  }

  async createFolder(payload: { collectionId: string; name: string }): Promise<Folder> {
    const folder = makeFolder(`f-${Math.random()}`, payload.collectionId);
    this.folders[payload.collectionId] = [...(this.folders[payload.collectionId] ?? []), folder];
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<Folder | null> {
    for (const collectionId of Object.keys(this.folders)) {
      const folder = this.folders[collectionId].find((f) => f.id === id);
      if (folder) {
        folder.name = name;
        return folder;
      }
    }
    return null;
  }

  async deleteFolder(id: string): Promise<void> {
    for (const collectionId of Object.keys(this.folders)) {
      this.folders[collectionId] = this.folders[collectionId].filter((f) => f.id !== id);
    }
  }

  async createRequest(payload: { collectionId: string; name: string }): Promise<RequestDoc> {
    const doc = makeRequest(`r-${Math.random()}`, payload.collectionId);
    this.requests[payload.collectionId] = [...(this.requests[payload.collectionId] ?? []), doc];
    return doc;
  }

  async renameRequest(id: string, name: string): Promise<RequestDoc | null> {
    for (const collectionId of Object.keys(this.requests)) {
      const doc = this.requests[collectionId].find((r) => r.id === id);
      if (doc) {
        doc.name = name;
        return doc;
      }
    }
    return null;
  }

  async deleteRequest(id: string): Promise<void> {
    for (const collectionId of Object.keys(this.requests)) {
      this.requests[collectionId] = this.requests[collectionId].filter((r) => r.id !== id);
    }
  }
}

describe("CollectionsService", () => {
  let service: CollectionsService;
  let idb: IdbServiceMock;

  beforeEach(() => {
    idb = new IdbServiceMock();
    TestBed.configureTestingModule({
      providers: [CollectionsService, { provide: IdbService, useValue: idb }],
    });
    service = TestBed.inject(CollectionsService);
  });

  it("refresh() loads every collection's folders and requests", async () => {
    await service.refresh();
    expect(idb.listCollectionsCalls).toBe(1);
    expect(idb.listFoldersCalls.sort()).toEqual(["c1", "c2"]);
    expect(idb.listRequestsCalls.sort()).toEqual(["c1", "c2"]);
    expect(service.tree().length).toBe(2);
  });

  it("createRequest only re-fetches the owning collection, not the whole tree", async () => {
    await service.refresh();
    idb.listFoldersCalls = [];
    idb.listRequestsCalls = [];
    idb.listCollectionsCalls = 0;

    await service.createRequest({ collectionId: "c1", name: "New", method: "GET", url: "https://x" });

    expect(idb.listCollectionsCalls).toBe(0);
    expect(idb.listFoldersCalls).toEqual(["c1"]);
    expect(idb.listRequestsCalls).toEqual(["c1"]);
    expect(service.getCollectionTree("c1")?.requests.length).toBe(1);
    expect(service.getCollectionTree("c2")?.requests.length).toBe(0);
  });

  it("renameRequest re-fetches only the request's own collection", async () => {
    await service.refresh();
    const created = await service.createRequest({
      collectionId: "c2",
      name: "First",
      method: "GET",
      url: "https://x",
    });
    idb.listFoldersCalls = [];
    idb.listRequestsCalls = [];

    await service.renameRequest(created.id, "Renamed");

    expect(idb.listFoldersCalls).toEqual(["c2"]);
    expect(idb.listRequestsCalls).toEqual(["c2"]);
    expect(service.getCollectionTree("c2")?.requests[0].name).toBe("Renamed");
  });

  it("deleteRequest resolves the owning collection before deleting, then re-fetches only that collection", async () => {
    await service.refresh();
    const created = await service.createRequest({
      collectionId: "c1",
      name: "ToDelete",
      method: "GET",
      url: "https://x",
    });
    idb.listFoldersCalls = [];
    idb.listRequestsCalls = [];

    await service.deleteRequest(created.id);

    expect(idb.listFoldersCalls).toEqual(["c1"]);
    expect(idb.listRequestsCalls).toEqual(["c1"]);
    expect(service.getCollectionTree("c1")?.requests.length).toBe(0);
  });

  it("createFolder and renameFolder patch only the owning collection", async () => {
    await service.refresh();
    idb.listFoldersCalls = [];
    idb.listRequestsCalls = [];

    const folder = await service.createFolder({ collectionId: "c2", name: "Folder A" });
    expect(idb.listFoldersCalls).toEqual(["c2"]);
    expect(service.getCollectionTree("c2")?.folders.length).toBe(1);

    idb.listFoldersCalls = [];
    idb.listRequestsCalls = [];
    await service.renameFolder(folder.id, "Renamed Folder");
    expect(idb.listFoldersCalls).toEqual(["c2"]);
    expect(service.getCollectionTree("c2")?.folders[0].name).toBe("Renamed Folder");
  });
});
