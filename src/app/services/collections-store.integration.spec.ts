import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Idb } from "../data/idb";
import { CollectionsStore } from "./collections-store";

// CollectionsStore over the real IndexedDB stores: what the sidebar shows
// (the `tree` signal) must match what was written, after every operation.
describe("CollectionsStore with real storage", () => {
  let service: CollectionsStore;
  let idb: Idb;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CollectionsStore);
    idb = TestBed.inject(Idb);
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  const names = () => service.tree().map((t) => t.collection.name);
  const tree = (id: string) => service.getCollectionTree(id)!;

  it("keeps the tree in step with collection, folder and request changes", async () => {
    await service.ensureLoaded();
    expect(service.tree()).toEqual([]);
    expect(service.loading()).toBe(false);

    const billing = await service.createCollection({ name: "Billing" });
    const users = await service.createCollection({ name: "Users" });
    expect(names()).toEqual(["Billing", "Users"]);
    expect(service.getCollection(billing.meta.id)?.name).toBe("Billing");
    expect(service.getCollection("missing")).toBeUndefined();

    await service.renameCollection(billing.meta.id, { name: "Payments" });
    await service.reorderCollections([
      { id: users.meta.id, order: 0 },
      { id: billing.meta.id, order: 1 },
    ]);
    expect(names()).toEqual(["Users", "Payments"]);

    const auth = await service.createFolder({ collectionId: billing.meta.id, name: "Auth" });
    const misc = await service.createFolder({ collectionId: billing.meta.id, name: "Misc" });
    const login = await service.createRequest({
      collectionId: billing.meta.id,
      folderId: auth.meta.id,
      name: "Login",
      method: "POST",
      url: "https://api.test/login",
    });
    const ping = await service.createRequest({ collectionId: billing.meta.id, name: "Ping", method: "GET", url: "https://api.test/ping" });

    await service.reorderFolders([
      { id: misc.meta.id, order: 0 },
      { id: auth.meta.id, order: 1 },
    ]);
    await service.reorderRequests([
      { id: ping.meta.id, order: 0 },
      { id: login.meta.id, order: 1 },
    ]);
    expect(tree(billing.meta.id).folders.map((f) => f.name)).toEqual(["Misc", "Auth"]);
    expect(tree(billing.meta.id).requests.map((r) => r.name)).toEqual(["Ping", "Login"]);
    // Changes inside one collection leave the other collection's entry alone.
    expect(tree(users.meta.id).requests).toEqual([]);

    const authCopy = await service.duplicateFolder(auth.meta.id);
    const loginCopy = await service.duplicateRequest(login.meta.id);
    expect(tree(billing.meta.id).folders.map((f) => f.name)).toContain("Auth copy");
    // Ping, Login, the Login inside "Auth copy", and the duplicated request.
    expect(tree(billing.meta.id).requests).toHaveLength(4);
    expect(tree(billing.meta.id).requests.filter((r) => r.folderId === authCopy!.meta.id)).toHaveLength(1);
    expect(tree(billing.meta.id).requests.map((r) => r.meta.id)).toContain(loginCopy!.meta.id);
    expect(await service.duplicateFolder("missing")).toBeNull();
    expect(await service.duplicateRequest("missing")).toBeNull();

    await service.deleteRequest(loginCopy!.meta.id);
    await service.deleteFolder(authCopy!.meta.id);
    expect(tree(billing.meta.id).folders.map((f) => f.name)).toEqual(["Misc", "Auth"]);
    expect(tree(billing.meta.id).requests.map((r) => r.name)).toEqual(["Ping", "Login"]);

    const copy = await service.duplicateCollection(billing.meta.id);
    expect(tree(copy!.meta.id).requests.map((r) => r.name)).toEqual(["Ping", "Login"]);

    await service.deleteCollection(copy!.meta.id);
    expect(names()).toEqual(["Users", "Payments"]);
  });

  it("exports a collection and imports the file back, as the original or as a copy", async () => {
    const billing = await service.createCollection({ name: "Billing" });
    await service.createRequest({ collectionId: billing.meta.id, name: "Ping", method: "GET", url: "https://api.test/ping" });

    const json = await service.exportCollectionJson(billing.meta.id);
    expect(JSON.parse(json!).collection.name).toBe("Billing");
    expect(await service.exportCollectionJson("missing")).toBeNull();

    await service.deleteCollection(billing.meta.id);
    expect(service.tree()).toEqual([]);

    const restored = await service.importCollection(JSON.parse(json!));
    expect(restored?.meta.id).toBe(billing.meta.id);
    expect(tree(billing.meta.id).requests.map((r) => r.name)).toEqual(["Ping"]);
    // Re-exporting what was imported gives the same file.
    expect(await service.exportCollectionJson(billing.meta.id)).toBe(json);
  });

  it("@claim:C-014 an exported collection has its credentials masked unless that export asks for them; a variable reference stays", async () => {
    const collection = await service.createCollection({ name: "Billing" });
    await service.changeCollectionVariables(collection.meta.id, [
      { key: "api_key", value: "typed-collection-key" },
      { key: "base", value: "https://api.test" },
    ]);
    await service.createRequest({
      collectionId: collection.meta.id,
      name: "Typed",
      method: "GET",
      url: "https://api.test/a",
      headers: [{ key: "X-Api-Key", value: "typed-header-key", enabled: true }, { key: "Accept", value: "*/*", enabled: true }],
      auth: { type: "bearer", token: "typed-bearer-token" },
    });
    await service.createRequest({
      collectionId: collection.meta.id,
      name: "Referenced",
      method: "GET",
      url: "https://api.test/b",
      auth: { type: "basic", username: "alice", password: "{{password}}" },
    });

    // What the collection and a folder hold for their requests (P4.9).
    await service.saveInherited({ collectionId: collection.meta.id }, { auth: { type: "apikey", key: "X-Shop", value: "typed-collection-auth", in: "header" }, scripts: { pre: "", post: "" } }, true);
    const folder = await service.createFolder({ collectionId: collection.meta.id, name: "Admin" });
    await service.saveInherited({ collectionId: collection.meta.id, folderId: folder.meta.id }, { auth: { type: "basic", username: "admin", password: "typed-folder-password" }, scripts: { pre: "", post: "" } }, true);
    await service.changeFolderVariables(folder.meta.id, [{ key: "admin_token", value: "typed-folder-variable" }, { key: "region", value: "eu" }]);

    const masked = (await service.exportCollectionJson(collection.meta.id))!;
    expect(masked).not.toMatch(/typed-collection-key|typed-header-key|typed-bearer-token|typed-collection-auth|typed-folder-password|typed-folder-variable/);
    expect(masked).toContain('"username": "admin"');
    expect(masked).toContain('"value": "eu"');
    expect(masked).toContain('"token": "***"');
    expect(masked).toContain('"password": "{{password}}"');
    expect(masked).toContain('"value": "https://api.test"');
    expect(masked).toContain('"value": "*/*"');

    const whole = (await service.exportCollectionJson(collection.meta.id, { credentials: true }))!;
    for (const credential of ["typed-collection-key", "typed-header-key", "typed-bearer-token", "typed-collection-auth", "typed-folder-password", "typed-folder-variable"]) {
      expect(whole).toContain(credential);
    }
    // What is stored is not changed by an export.
    expect(tree(collection.meta.id).requests.find((request) => request.name === "Typed")?.auth).toEqual({ type: "bearer", token: "typed-bearer-token" });
  });
});
