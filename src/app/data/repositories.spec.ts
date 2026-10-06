import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectionRequestsRepository } from "./collection-requests.repository";
import { CollectionsRepository } from "./collections.repository";
import { EnvironmentsRepository } from "./environments.repository";
import { FoldersRepository } from "./folders.repository";
import { IdbCoreService } from "./idb-core.service";

// These run against the real IndexedDB of the test browser: the stores,
// indexes and transactions are the ones users' data lives in.
describe("collection repositories (real IndexedDB)", () => {
  let core: IdbCoreService;
  let collections: CollectionsRepository;
  let folders: FoldersRepository;
  let requests: CollectionRequestsRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    core = TestBed.inject(IdbCoreService);
    collections = TestBed.inject(CollectionsRepository);
    folders = TestBed.inject(FoldersRepository);
    requests = TestBed.inject(CollectionRequestsRepository);
  });

  afterEach(async () => {
    await core.resetDatabase();
  });

  async function seed() {
    const collection = await collections.createCollection({ name: "  Billing  ", description: " invoices " });
    const folder = await folders.createFolder({ collectionId: collection.meta.id, name: " Auth " });
    const inFolder = await requests.createRequest({
      collectionId: collection.meta.id,
      folderId: folder.meta.id,
      name: " Login ",
      method: "POST",
      url: "https://api.test/login",
      headers: { "X-Trace": "1" },
      body: { user: "a" },
    });
    const atRoot = await requests.createRequest({
      collectionId: collection.meta.id,
      name: "Ping",
      method: "GET",
      url: "https://api.test/ping",
    });
    return { collection, folder, inFolder, atRoot };
  }

  it("creates collections, folders and requests with trimmed names and increasing order", async () => {
    const { collection, folder, inFolder, atRoot } = await seed();
    const second = await collections.createCollection({ name: "Second", description: "   " });

    expect(collection.name).toBe("Billing");
    expect(collection.description).toBe("invoices");
    expect(second.description).toBeUndefined();
    expect(second.order).toBeGreaterThan(collection.order);
    expect(folder.name).toBe("Auth");
    expect(inFolder.name).toBe("Login");
    expect(atRoot.headers).toEqual({});
    expect(atRoot.order).toBeGreaterThan(inFolder.order);

    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Billing", "Second"]);
    expect((await folders.listFolders(collection.meta.id)).map((f) => f.name)).toEqual(["Auth"]);
    expect((await requests.listRequests(collection.meta.id)).map((r) => r.name)).toEqual(["Login", "Ping"]);
    expect(await requests.listRequests(second.meta.id)).toEqual([]);
  });

  it("renames and updates in place, and reports a missing id as null", async () => {
    const { collection, folder, inFolder } = await seed();

    const renamed = await collections.renameCollection(collection.meta.id, { name: " Payments ", description: "" });
    expect(renamed?.name).toBe("Payments");
    expect(renamed?.description).toBeUndefined();
    expect(renamed?.meta.updatedAt).toBeGreaterThanOrEqual(collection.meta.updatedAt);
    expect(renamed?.meta.createdAt).toBe(collection.meta.createdAt);

    expect((await folders.renameFolder(folder.meta.id, " Sessions "))?.name).toBe("Sessions");
    expect((await requests.renameRequest(inFolder.meta.id, " Sign in "))?.name).toBe("Sign in");

    const updated = await requests.updateRequest(inFolder.meta.id, {
      method: "PUT",
      url: "https://api.test/session",
      headers: { Accept: "application/json" },
      body: [1, 2],
    });
    expect(updated).toMatchObject({ method: "PUT", url: "https://api.test/session", body: [1, 2] });
    const stored = (await requests.listRequests(collection.meta.id)).find((r) => r.meta.id === inFolder.meta.id);
    expect(stored?.headers).toEqual({ Accept: "application/json" });
    expect(stored?.name).toBe("Sign in");

    expect(await collections.renameCollection("missing", { name: "x" })).toBeNull();
    expect(await folders.renameFolder("missing", "x")).toBeNull();
    expect(await requests.renameRequest("missing", "x")).toBeNull();
    expect(await requests.updateRequest("missing", { url: "x" })).toBeNull();
  });

  it("duplicates a request, a folder with its requests, and a whole collection, each under new ids", async () => {
    const { collection, folder, inFolder } = await seed();

    const requestCopy = await requests.duplicateRequest(inFolder.meta.id);
    expect(requestCopy?.meta.id).not.toBe(inFolder.meta.id);
    expect(requestCopy).toMatchObject({ url: inFolder.url, method: "POST", folderId: folder.meta.id });

    const folderCopy = await folders.duplicateFolder(folder.meta.id);
    expect(folderCopy?.name).toBe("Auth copy");
    const afterFolderCopy = await requests.listRequests(collection.meta.id);
    expect(afterFolderCopy.filter((r) => r.folderId === folderCopy?.meta.id)).toHaveLength(2);

    const collectionCopy = await collections.duplicateCollection(collection.meta.id);
    expect(collectionCopy?.meta.id).not.toBe(collection.meta.id);
    const copiedFolders = await folders.listFolders(collectionCopy!.meta.id);
    const copiedRequests = await requests.listRequests(collectionCopy!.meta.id);
    expect(copiedFolders).toHaveLength(2);
    expect(copiedRequests).toHaveLength(afterFolderCopy.length);
    // Requests in the copy point at the copy's folders, never at the original's.
    const copiedFolderIds = new Set(copiedFolders.map((f) => f.meta.id));
    for (const request of copiedRequests.filter((r) => r.folderId)) {
      expect(copiedFolderIds.has(request.folderId!)).toBe(true);
    }
    // The original is untouched.
    expect(await requests.listRequests(collection.meta.id)).toHaveLength(afterFolderCopy.length);

    expect(await requests.duplicateRequest("missing")).toBeNull();
    expect(await folders.duplicateFolder("missing")).toBeNull();
    expect(await collections.duplicateCollection("missing")).toBeNull();
  });

  it("reorders by the given order values and ignores unknown ids", async () => {
    const { collection, folder, inFolder, atRoot } = await seed();
    const second = await collections.createCollection({ name: "Second" });
    const otherFolder = await folders.createFolder({ collectionId: collection.meta.id, name: "Zed" });

    await collections.reorderCollections([
      { id: second.meta.id, order: 0 },
      { id: collection.meta.id, order: 1 },
      { id: "missing", order: 2 },
    ]);
    await folders.reorderFolders([
      { id: otherFolder.meta.id, order: 0 },
      { id: folder.meta.id, order: 1 },
      { id: "missing", order: 2 },
    ]);
    await requests.reorderRequests([
      { id: atRoot.meta.id, order: 0 },
      { id: inFolder.meta.id, order: 1 },
      { id: "missing", order: 2 },
    ]);

    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Second", "Billing"]);
    expect((await folders.listFolders(collection.meta.id)).map((f) => f.name)).toEqual(["Zed", "Auth"]);
    expect((await requests.listRequests(collection.meta.id)).map((r) => r.name)).toEqual(["Ping", "Login"]);
  });

  it("deleting a folder removes its requests; deleting a collection removes everything under it", async () => {
    const { collection, folder, atRoot } = await seed();
    const other = await collections.createCollection({ name: "Other" });
    const kept = await requests.createRequest({ collectionId: other.meta.id, name: "Kept", method: "GET", url: "/k" });

    await folders.deleteFolder(folder.meta.id);
    expect(await folders.listFolders(collection.meta.id)).toEqual([]);
    expect((await requests.listRequests(collection.meta.id)).map((r) => r.meta.id)).toEqual([atRoot.meta.id]);

    await requests.deleteRequest(atRoot.meta.id);
    expect(await requests.listRequests(collection.meta.id)).toEqual([]);

    await folders.createFolder({ collectionId: collection.meta.id, name: "Again" });
    await requests.createRequest({ collectionId: collection.meta.id, name: "Again", method: "GET", url: "/a" });
    await collections.deleteCollection(collection.meta.id);

    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Other"]);
    expect(await folders.listFolders(collection.meta.id)).toEqual([]);
    expect(await requests.listRequests(collection.meta.id)).toEqual([]);
    expect((await requests.listRequests(other.meta.id)).map((r) => r.meta.id)).toEqual([kept.meta.id]);
  });

  it("exports a collection with its folders and requests, and imports it back over the existing one", async () => {
    const { collection, folder, inFolder, atRoot } = await seed();

    const exported = await collections.getCollectionExport(collection.meta.id);
    expect(exported?.collection.name).toBe("Billing");
    expect(exported?.folders.map((f) => f.meta.id)).toEqual([folder.meta.id]);
    expect(exported?.requests.map((r) => r.meta.id).sort()).toEqual([inFolder.meta.id, atRoot.meta.id].sort());
    expect(await collections.getCollectionExport("missing")).toBeNull();

    // Local changes made after the export are replaced by the import.
    await requests.createRequest({ collectionId: collection.meta.id, name: "Local only", method: "GET", url: "/l" });
    const payload = structuredClone(exported!);
    payload.collection.name = "Billing (imported)";
    // A request that points at a folder the file does not contain lands at the root.
    payload.requests[0].folderId = "folder-that-is-not-in-the-file";

    const imported = await collections.importCollectionExport(payload);

    expect(imported?.name).toBe("Billing (imported)");
    const after = await requests.listRequests(collection.meta.id);
    expect(after.map((r) => r.name).sort()).toEqual(["Login", "Ping"]);
    expect(after.find((r) => r.meta.id === payload.requests[0].meta.id)?.folderId).toBeUndefined();
    expect(await collections.listCollections()).toHaveLength(1);
  });

  it("refuses an import whose collection has no identifier, and writes nothing", async () => {
    const { collection } = await seed();
    const payload = structuredClone((await collections.getCollectionExport(collection.meta.id))!);
    const broken = { ...payload, collection: { ...payload.collection, id: "", meta: { ...payload.collection.meta, id: "" } } };

    await expect(collections.importCollectionExport(broken)).rejects.toThrow();
    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Billing"]);
  });
});

describe("EnvironmentsRepository (real IndexedDB)", () => {
  let core: IdbCoreService;
  let environments: EnvironmentsRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    core = TestBed.inject(IdbCoreService);
    environments = TestBed.inject(EnvironmentsRepository);
  });

  afterEach(async () => {
    await core.resetDatabase();
  });

  it("creates, updates, duplicates and reorders environments", async () => {
    const dev = await environments.createEnvironment({ name: " Dev ", description: " local ", vars: { host: "localhost" } });
    const prod = await environments.createEnvironment({ name: "Prod" });
    expect(dev).toMatchObject({ name: "Dev", description: "local", vars: { host: "localhost" } });
    expect(prod.vars).toEqual({});

    const updated = await environments.updateEnvironment(dev.meta.id, {
      name: " Development ",
      description: "  ",
      vars: { host: "127.0.0.1", port: "8080" },
    });
    expect(updated).toMatchObject({ name: "Development", vars: { host: "127.0.0.1", port: "8080" } });
    expect(updated?.description).toBeUndefined();
    expect(await environments.updateEnvironment("missing", { name: "x" })).toBeNull();

    const copy = await environments.duplicateEnvironment(dev.meta.id);
    expect(copy?.meta.id).not.toBe(dev.meta.id);
    expect(copy?.vars).toEqual({ host: "127.0.0.1", port: "8080" });
    expect(await environments.duplicateEnvironment("missing")).toBeNull();

    await environments.reorderEnvironments([
      { id: prod.meta.id, order: 0 },
      { id: dev.meta.id, order: 1 },
      { id: copy!.meta.id, order: 2 },
      { id: "missing", order: 3 },
    ]);
    const listed = await environments.listEnvironments();
    expect(listed.map((e) => e.meta.id)).toEqual([prod.meta.id, dev.meta.id, copy!.meta.id]);
  });

  it("remembers the active environment and clears it when that environment is deleted", async () => {
    const dev = await environments.createEnvironment({ name: "Dev" });
    const prod = await environments.createEnvironment({ name: "Prod" });
    expect(await environments.getActiveEnvironmentId()).toBeNull();

    await environments.setActiveEnvironment(dev.meta.id);
    expect(await environments.getActiveEnvironmentId()).toBe(dev.meta.id);

    // Deleting another environment leaves the active one alone.
    await environments.deleteEnvironment(prod.meta.id);
    expect(await environments.getActiveEnvironmentId()).toBe(dev.meta.id);

    await environments.deleteEnvironment(dev.meta.id);
    expect(await environments.getActiveEnvironmentId()).toBeNull();
    expect(await environments.listEnvironments()).toEqual([]);
  });
});
