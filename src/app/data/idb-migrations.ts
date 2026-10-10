import { IDBPDatabase, IDBPTransaction } from "idb";
import { ApiSandboxDB, RemovedData, StoreName } from "./idb-schema";

/**
 * The `openDB(...).upgrade` handler. v5 does not read the shapes of v1 to v4,
 * so whatever an older release left is removed and the v5 stores are created
 * empty (maintainer, 2026-10-09: no stored data exists to keep). It throws
 * nothing it catches: an error aborts the upgrade and the database keeps its
 * old version.
 *
 * Resolves, once the upgrade's writes are queued, to what it removed.
 */
export function runUpgrade(
  db: IDBPDatabase<ApiSandboxDB>,
  oldVersion: number,
  tx: IDBPTransaction<ApiSandboxDB, StoreName[], "versionchange">
): Promise<RemovedData> {
  if (oldVersion < 5) {
    createV5Stores(db);
  }
  // 6 (P2.12): the files of multipart and binary bodies. Nothing stored changes shape.
  if (oldVersion < 6) {
    db.createObjectStore("files");
  }
  // 7 (P2.4) gave a stored collection its variables. Version 10 empties the collections, so that step is gone.
  if (oldVersion < 5) {
    return Promise.resolve(oldVersion > 0 ? "all" : []);
  }
  return removeWhatChangedShape(db, oldVersion, tx);
}

/**
 * Stores whose records an older version wrote in a shape this one does not
 * read (maintainer, 2026-10-09: no stored data exists to keep). Resolves to
 * the ones that held anything.
 */
async function removeWhatChangedShape(
  db: IDBPDatabase<ApiSandboxDB>,
  oldVersion: number,
  tx: IDBPTransaction<ApiSandboxDB, StoreName[], "versionchange">
): Promise<RemovedData> {
  const removed: Exclude<RemovedData, "all"> = [];
  // 9 (P2.5): history v2. An entry of before holds what was sent as it was sent, credentials included.
  // The store is made again: it is searched in memory and keeps one index.
  if (oldVersion < 9) {
    if ((await tx.objectStore("history").count()) > 0) removed.push("history");
    db.deleteObjectStore("history");
    createHistoryStore(db);
  }
  // 8 (P2.6): the vault has one data key, wrapped by the passphrase. A
  // secret encrypted under a key of its own cannot be read with it.
  if (oldVersion < 8) {
    const store = tx.objectStore("secrets");
    if ((await store.count()) > 0) removed.unshift("secrets");
    await store.clear();
  }
  // 10 (P4.9): a collection and a folder hold auth and scripts, a folder variables, and a request's auth may be
  // "inherit". The three stores are emptied, and with them the files only their requests named.
  if (oldVersion < 10) {
    const held = await Promise.all((["collections", "folders", "requests"] as const).map((name) => tx.objectStore(name).count()));
    if (held.some((count) => count > 0)) removed.push("collections");
    for (const name of ["collections", "folders", "requests", "files"] as const) await tx.objectStore(name).clear();
  }
  return removed;
}

function createHistoryStore(db: IDBPDatabase<ApiSandboxDB>): void {
  db.createObjectStore("history", { keyPath: "id", autoIncrement: true }).createIndex("by-createdAt", "createdAt");
}

function createV5Stores(db: IDBPDatabase<ApiSandboxDB>): void {
  for (const name of Array.from(db.objectStoreNames as DOMStringList)) {
    (db as unknown as IDBPDatabase).deleteObjectStore(name);
  }

  createHistoryStore(db);

  const collections = db.createObjectStore("collections", { keyPath: "meta.id" });
  collections.createIndex("by-order", "order");
  collections.createIndex("by-name", "name");

  const folders = db.createObjectStore("folders", { keyPath: "meta.id" });
  folders.createIndex("by-collectionId", "collectionId");
  folders.createIndex("by-parentFolderId", "parentFolderId");
  folders.createIndex("by-order", "order");

  const requests = db.createObjectStore("requests", { keyPath: "meta.id" });
  requests.createIndex("by-collectionId", "collectionId");
  requests.createIndex("by-folderId", "folderId");
  requests.createIndex("by-order", "order");

  const environments = db.createObjectStore("environments", { keyPath: "meta.id" });
  environments.createIndex("by-name", "name");
  environments.createIndex("by-order", "order");

  const secrets = db.createObjectStore("secrets", { keyPath: "meta.id" });
  secrets.createIndex("by-environmentId", "environmentId");
  secrets.createIndex("by-name", "name");

  db.createObjectStore("meta", { keyPath: "key" });
}
