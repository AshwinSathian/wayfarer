import { IDBPDatabase } from "idb";
import { WayfarerDB } from "./idb-schema";

/** The `openDB(...).upgrade` handler: it runs once, on a browser that has no database yet, and makes the stores. */
export function createStores(db: IDBPDatabase<WayfarerDB>): void {
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
