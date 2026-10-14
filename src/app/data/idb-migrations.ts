import { IDBPDatabase, IDBPTransaction } from "idb";
import { ApiSandboxDB, StoreName } from "./idb-schema";

/**
 * The `openDB(...).upgrade` handler. Nothing an earlier version stored is
 * read (D24, maintainer 2026-10-14: no backward compatibility): every store
 * is removed and this version's are made empty. It throws nothing it
 * catches: an error aborts the upgrade and the database keeps its version.
 *
 * Resolves, once the upgrade's writes are queued, to whether the database
 * held anything, for the notice the shell shows once.
 */
export async function runUpgrade(
  db: IDBPDatabase<ApiSandboxDB>,
  tx: IDBPTransaction<ApiSandboxDB, StoreName[], "versionchange">
): Promise<boolean> {
  // Typed loosely: an earlier version may have left a store this one does not name.
  const names = Array.from(db.objectStoreNames as DOMStringList);
  const loose = tx as unknown as IDBPTransaction<unknown, string[], "versionchange">;
  const held = (await Promise.all(names.map((name) => loose.objectStore(name).count()))).some((count) => count > 0);
  for (const name of names) (db as unknown as IDBPDatabase).deleteObjectStore(name);
  createStores(db);
  return held;
}

function createStores(db: IDBPDatabase<ApiSandboxDB>): void {
  db.createObjectStore("history", { keyPath: "id", autoIncrement: true }).createIndex("by-createdAt", "createdAt");

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
  db.createObjectStore("files");
  db.createObjectStore("tabs", { keyPath: "id" });
  db.createObjectStore("cookies", { keyPath: "key" });
}
