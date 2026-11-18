import { IDBPDatabase } from "idb";
import { WayfarerDB } from "./idb-schema";

/**
 * The `openDB(...).upgrade` handler: it runs on a browser that has no database of this number yet, and makes the
 * stores that database lacks (`oldVersion` 0: all of them; 2: the three T2.0 added). It moves no data.
 */
export function createStores(db: IDBPDatabase<WayfarerDB>, oldVersion = 0): void {
  if (oldVersion < 2) createVersion2Stores(db);
  if (oldVersion < 3) createVersion3Stores(db);
}

function createVersion3Stores(db: IDBPDatabase<WayfarerDB>): void {
  db.createObjectStore("shares", { keyPath: "collectionId" });
  db.createObjectStore("bases", { keyPath: "collectionId" });
  db.createObjectStore("changes", { keyPath: "id" }).createIndex("by-collection", "collectionId");
}

function createVersion2Stores(db: IDBPDatabase<WayfarerDB>): void {
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
