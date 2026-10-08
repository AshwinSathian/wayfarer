import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdbCore } from "./idb-core";
import { DB_NAME, DB_VERSION } from "./idb-schema";
import { Idb } from "./idb";

/** Builds a database the way an older release left it, with the raw API. */
function seedOldDatabase(version: number, build: (db: IDBDatabase) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => build(request.result);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Upgrades run once, on a user's real data, and IndexedDB cannot downgrade.
describe("upgrading a database left by an older release", () => {
  let idb: Idb;

  beforeEach(async () => {
    await deleteDatabase();
    TestBed.configureTestingModule({});
    idb = TestBed.inject(Idb);
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  it("moves v1 history out of the legacy store and fills the fields added later", async () => {
    await seedOldDatabase(1, (db) => {
      const legacy = db.createObjectStore("pastRequests", { keyPath: "id", autoIncrement: true });
      legacy.add({ url: "https://api.test/old-1", headers: { A: "1" }, createdAt: 100 });
      legacy.add({ url: "https://api.test/old-2", headers: {}, createdAt: 200, method: "POST", status: 201 });
    });

    await idb.init();

    const history = await idb.getLatest();
    expect(history.map((h) => [h.url, h.method, h.createdAt])).toEqual([
      ["https://api.test/old-2", "POST", 200],
      ["https://api.test/old-1", "GET", 100],
    ]);
    expect(history[1].headers).toEqual({ A: "1" });
    expect(history[0].status).toBe(201);

    const db = (await TestBed.inject(IdbCore).getDatabase())!;
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(
      ["collections", "environments", "folders", "history", "meta", "requests", "secrets"].sort()
    );
  });

  it("keeps the documents of stores that already exist and adds the indexes they lacked", async () => {
    const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });
    await seedOldDatabase(2, (db) => {
      // Stores as an early release created them: right key paths, no indexes.
      db.createObjectStore("history", { keyPath: "id", autoIncrement: true }).add({
        url: "https://api.test/kept",
        headers: {},
        createdAt: 5,
      });
      db.createObjectStore("collections", { keyPath: "meta.id" }).add({ id: "c-1", meta: meta("c-1"), name: "Kept", order: 1 });
      db.createObjectStore("folders", { keyPath: "meta.id" }).add({ id: "f-1", meta: meta("f-1"), collectionId: "c-1", name: "Folder", order: 1 });
      db.createObjectStore("requests", { keyPath: "meta.id" }).add({
        id: "r-1",
        meta: meta("r-1"),
        collectionId: "c-1",
        folderId: "f-1",
        name: "Request",
        method: "GET",
        url: "https://api.test/r",
        headers: {},
        order: 1,
      });
      db.createObjectStore("environments", { keyPath: "meta.id" }).add({ id: "e-1", meta: meta("e-1"), name: "Dev", vars: { a: "1" }, order: 1 });
      db.createObjectStore("secrets", { keyPath: "meta.id" });
    });

    await idb.init();

    // Every read below goes through an index the old database did not have.
    expect((await idb.listCollections()).map((c) => c.name)).toEqual(["Kept"]);
    expect((await idb.listFolders("c-1")).map((f) => f.name)).toEqual(["Folder"]);
    expect((await idb.listRequests("c-1")).map((r) => r.name)).toEqual(["Request"]);
    expect((await idb.listEnvironments()).map((e) => [e.name, e.vars])).toEqual([["Dev", { a: "1" }]]);
    expect((await idb.getLatest()).map((h) => [h.url, h.method])).toEqual([["https://api.test/kept", "GET"]]);
    expect(await idb.findByUrl("https://api.test/kept")).toHaveLength(1);
    expect(await idb.getActiveEnvironmentId()).toBeNull();

    // New writes work on the upgraded stores.
    const added = await idb.createRequest({ collectionId: "c-1", name: "New", method: "GET", url: "/n" });
    expect(added.order).toBeGreaterThan(1);
  });
});
