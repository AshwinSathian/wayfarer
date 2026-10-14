import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyEntry } from "../../testing/request-fixtures";
import { IdbCore } from "./idb-core";
import { DB_NAME, DB_VERSION } from "./idb-schema";
import { repositories, type Repositories } from "../../testing/repositories";

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

const STORES = ["collections", "cookies", "environments", "files", "folders", "history", "meta", "requests", "secrets", "tabs"];

/** A v4 database with a document in every store, and the store v1 left behind. */
function buildV4(db: IDBDatabase): void {
  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
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

// Nothing an earlier version stored is read (D24; maintainer, 2026-10-14: no backward compatibility).
describe("opening a database left by another release", () => {
  let idb: Repositories;
  let core: IdbCore;

  beforeEach(async () => {
    await deleteDatabase();
    TestBed.configureTestingModule({});
    idb = repositories();
    core = TestBed.inject(IdbCore);
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  it("empties a v4 database, makes this version's stores and says the old data was removed", async () => {
    (await openRaw(4, buildV4)).close();

    await idb.core.init();

    const db = (await core.getDatabase())!;
    expect(db.version).toBe(DB_VERSION);
    expect(DB_VERSION).toBe(13);
    expect([...db.objectStoreNames].sort()).toEqual(STORES);
    expect(await idb.collections.listCollections()).toEqual([]);
    expect(await idb.folders.listFolders("c-1")).toEqual([]);
    expect(await idb.requests.listRequests("c-1")).toEqual([]);
    expect(await idb.environments.listEnvironments()).toEqual([]);
    expect(await idb.secrets.listAll()).toEqual([]);
    expect(await idb.history.getLatest()).toEqual([]);
    expect(await idb.environments.getActiveEnvironmentId()).toBeNull();
    expect(core.clearedOldData()).toBe(true);

    // The recreated stores take new writes through their indexes.
    const collection = await idb.collections.createCollection({ name: "New" });
    expect((await idb.collections.listCollections()).map((c) => c.name)).toEqual(["New"]);
    expect(collection.order).toBe(1);
  });

  it("empties a database of the version before this one too, every store, and says so", async () => {
    const keyPaths: Record<string, string | undefined> = { history: "id", meta: "key", tabs: "id", cookies: "key", files: undefined };
    const build = (db: IDBDatabase) => {
      for (const name of STORES) {
        const keyPath = Object.hasOwn(keyPaths, name) ? keyPaths[name] : "meta.id";
        db.createObjectStore(name, keyPath === undefined ? undefined : { keyPath, autoIncrement: name === "history" });
      }
    };
    (await openRaw(DB_VERSION - 1, build)).close();
    const db0 = await openRaw(DB_VERSION - 1);
    const write = db0.transaction(["collections", "environments", "history", "tabs"], "readwrite");
    write.objectStore("collections").add({ id: "c-1", meta: { id: "c-1", createdAt: 1, updatedAt: 1 }, name: "Kept before", order: 1 });
    write.objectStore("environments").add({ id: "e-1", meta: { id: "e-1", createdAt: 1, updatedAt: 1 }, name: "Dev", vars: [], order: 1 });
    write.objectStore("history").add(historyEntry());
    write.objectStore("tabs").add({ id: "t-1" });
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
    });
    db0.close();

    await idb.core.init();

    const db = (await core.getDatabase())!;
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(STORES);
    for (const name of STORES) expect(await db.count(name as never), name).toBe(0);
    expect(core.clearedOldData()).toBe(true);
  });

  it("says nothing when an earlier database held nothing", async () => {
    (await openRaw(DB_VERSION - 1, (db) => db.createObjectStore("collections", { keyPath: "meta.id" }))).close();

    await idb.core.init();

    expect([...(await core.getDatabase())!.objectStoreNames].sort()).toEqual(STORES);
    expect(core.clearedOldData()).toBe(false);
  });

  it("does not report removed data on a first run", async () => {
    await idb.core.init();

    expect((await core.getDatabase())!.version).toBe(DB_VERSION);
    expect(core.clearedOldData()).toBe(false);
  });

  it("waits, and says so, while a tab that will not close holds the old database; finishes when it closes", async () => {
    // A tab running a build from before v5 does not close on versionchange.
    const oldTab = await openRaw(4, buildV4);

    const opening = idb.core.init();
    await vi.waitFor(() => expect(core.upgradeBlocked()).toBe(true));
    oldTab.close();
    await opening;

    expect(core.upgradeBlocked()).toBe(false);
    expect(core.memoryOnly()).toBe(false);
    expect((await core.getDatabase())!.version).toBe(DB_VERSION);
  });

  it("closes its connection and asks for a reload when a newer release upgrades the database", async () => {
    await idb.core.init();

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

    await idb.core.init();

    expect(core.olderThanData()).toBe(true);
    expect(core.memoryOnly()).toBe(true);
    // The newer database is left as it was.
    const untouched = await openRaw(DB_VERSION + 1);
    expect(untouched.version).toBe(DB_VERSION + 1);
    untouched.close();
    errors.mockRestore();
  });
});
