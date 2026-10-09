import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdbCore } from "./idb-core";
import { DB_NAME, DB_VERSION } from "./idb-schema";
import { Idb } from "./idb";

/** Opens the database with the raw API, at a version of the caller's choosing. The connection ignores `versionchange`. */
function openRaw(version: number, build: (db: IDBDatabase) => void = () => undefined): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => build(request.result);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

const STORES = ["collections", "environments", "files", "folders", "history", "meta", "requests", "secrets"];

/** A v4 database with a document in every store, and the store v1 left behind. */
function buildV4(db: IDBDatabase): void {
  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });
  db.createObjectStore("pastRequests", { keyPath: "id", autoIncrement: true }).add({ url: "https://api.test/v1" });
  db.createObjectStore("history", { keyPath: "id", autoIncrement: true }).add({
    method: "GET",
    url: "https://api.test/kept",
    headers: { Authorization: "Bearer old" },
    createdAt: 5,
  });
  db.createObjectStore("collections", { keyPath: "meta.id" }).add({ id: "c-1", meta: meta("c-1"), name: "Old", order: 1 });
  db.createObjectStore("folders", { keyPath: "meta.id" }).add({ id: "f-1", meta: meta("f-1"), collectionId: "c-1", name: "Folder", order: 1 });
  db.createObjectStore("requests", { keyPath: "meta.id" }).add({
    id: "r-1",
    meta: meta("r-1"),
    collectionId: "c-1",
    name: "Request",
    method: "POST",
    url: "https://api.test/r",
    headers: { A: "1" },
    body: { n: 1 },
    vars: { a: "1" },
    order: 1,
  });
  db.createObjectStore("environments", { keyPath: "meta.id" }).add({ id: "e-1", meta: meta("e-1"), name: "Dev", vars: { a: "{{$secret.s-1}}" }, order: 1 });
  db.createObjectStore("secrets", { keyPath: "meta.id" }).add({ id: "s-1", meta: meta("s-1"), name: "token" });
  db.createObjectStore("meta", { keyPath: "key" }).add({ key: "state", schemaVersion: 1, activeEnvironmentId: "e-1" });
}

// v5 does not read the shapes before it (maintainer, 2026-10-09: no stored data exists to keep).
describe("opening a database left by another release", () => {
  let idb: Idb;
  let core: IdbCore;

  beforeEach(async () => {
    await deleteDatabase();
    TestBed.configureTestingModule({});
    idb = TestBed.inject(Idb);
    core = TestBed.inject(IdbCore);
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  it("empties a v4 database, recreates the v5 stores and says the old data was removed", async () => {
    (await openRaw(4, buildV4)).close();

    await idb.init();

    const db = (await core.getDatabase())!;
    expect(db.version).toBe(DB_VERSION);
    expect(DB_VERSION).toBe(7);
    expect([...db.objectStoreNames].sort()).toEqual(STORES);
    expect(await idb.listCollections()).toEqual([]);
    expect(await idb.listFolders("c-1")).toEqual([]);
    expect(await idb.listRequests("c-1")).toEqual([]);
    expect(await idb.listEnvironments()).toEqual([]);
    expect(await idb.listSecrets()).toEqual([]);
    expect(await idb.getLatest()).toEqual([]);
    expect(await idb.getActiveEnvironmentId()).toBeNull();
    expect(core.clearedOldData()).toBe(true);

    // The recreated stores take new writes through their indexes.
    const collection = await idb.createCollection({ name: "New" });
    expect((await idb.listCollections()).map((c) => c.name)).toEqual(["New"]);
    expect(collection.order).toBe(1);
  });

  it("keeps what version 5 stored, adds the files store (version 6) and gives a collection its variables (version 7)", async () => {
    const v5 = await openRaw(5, (db) => {
      db.createObjectStore("history", { keyPath: "id", autoIncrement: true }).createIndex("by-createdAt", "createdAt");
      const collections = db.createObjectStore("collections", { keyPath: "meta.id" });
      collections.createIndex("by-order", "order");
      collections.add({ id: "c-5", meta: { id: "c-5", createdAt: 1, updatedAt: 1, version: 1 }, name: "Kept", order: 1, scriptTrust: { trusted: true } });
      for (const name of ["folders", "requests", "environments", "secrets"]) db.createObjectStore(name, { keyPath: "meta.id" });
      db.createObjectStore("meta", { keyPath: "key" });
    });
    v5.close();

    await idb.init();

    const db = (await core.getDatabase())!;
    expect(db.version).toBe(7);
    expect([...db.objectStoreNames]).toContain("files");
    expect((await idb.listCollections()).map((c) => [c.name, c.variables, c.scriptTrust])).toEqual([["Kept", [], { trusted: true }]]);
    expect(core.clearedOldData()).toBe(false);
  });

  it("does not report removed data on a first run", async () => {
    await idb.init();

    expect((await core.getDatabase())!.version).toBe(DB_VERSION);
    expect(core.clearedOldData()).toBe(false);
  });

  it("waits, and says so, while a tab that will not close holds the old database; finishes when it closes", async () => {
    // A tab running a build from before v5 does not close on versionchange.
    const oldTab = await openRaw(4, buildV4);

    const opening = idb.init();
    await vi.waitFor(() => expect(core.upgradeBlocked()).toBe(true));
    oldTab.close();
    await opening;

    expect(core.upgradeBlocked()).toBe(false);
    expect(core.memoryOnly()).toBe(false);
    expect((await core.getDatabase())!.version).toBe(DB_VERSION);
  });

  it("closes its connection and asks for a reload when a newer release upgrades the database", async () => {
    await idb.init();

    const newer = await openRaw(DB_VERSION + 1);
    try {
      expect(core.updatedElsewhere()).toBe(true);
      // An upgrade is not a reset: the two banners say different things.
      expect(core.closedByOtherTab()).toBe(false);
      await expect(core.getDatabase()).rejects.toThrow(/updated in another tab/);
    } finally {
      newer.close();
    }
  });

  it("says this tab runs an older Wayfarer when the database is from a newer release", async () => {
    (await openRaw(DB_VERSION + 1)).close();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await idb.init();

    expect(core.olderThanData()).toBe(true);
    expect(core.memoryOnly()).toBe(true);
    // The newer database is left as it was.
    const untouched = await openRaw(DB_VERSION + 1);
    expect(untouched.version).toBe(DB_VERSION + 1);
    untouched.close();
    errors.mockRestore();
  });
});
