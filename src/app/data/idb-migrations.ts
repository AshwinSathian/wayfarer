import { IDBPDatabase } from "idb";
import { ApiSandboxDB } from "./idb-schema";

/**
 * The `openDB(...).upgrade` handler. v5 does not read the shapes of v1 to v4,
 * so whatever an older release left is removed and the v5 stores are created
 * empty (maintainer, 2026-10-09: no stored data exists to keep). It throws
 * nothing it catches: an error aborts the upgrade and the database keeps its
 * old version.
 */
export function runUpgrade(db: IDBPDatabase<ApiSandboxDB>, oldVersion: number): void {
  if (oldVersion < 5) {
    createV5Stores(db);
  }
  // 6 (P2.12): the files of multipart and binary bodies. Nothing stored changes shape.
  db.createObjectStore("files");
}

function createV5Stores(db: IDBPDatabase<ApiSandboxDB>): void {
  for (const name of Array.from(db.objectStoreNames as DOMStringList)) {
    (db as unknown as IDBPDatabase).deleteObjectStore(name);
  }

  const history = db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
  history.createIndex("by-createdAt", "createdAt");
  history.createIndex("by-url", "url");
  history.createIndex("by-method", "method");

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
