import { IDBPTransaction } from "idb";
import { fileIdsOf } from "@wayfarer/core";
import { Collection, Folder, RequestDoc } from "../models/collections";
import { StoredFile, StoreCollection, WayfarerDB } from "./idb-schema";

/**
 * What a delete in the tree took out of the stores, as it was stored (U-080): the collection, the folders, the
 * requests and the files of their bodies. Kept in memory for the few seconds the Undo is offered, and put back by
 * `putBack` exactly as it was, ids, order and the collection's script approvals included: Undo returns what this
 * browser held a moment ago, it approves nothing new.
 */
export interface Removed {
  collections: Collection[];
  folders: Folder[];
  requests: RequestDoc[];
  files: [string, StoredFile][];
}

type Tx = IDBPTransaction<WayfarerDB, StoreCollection, "readwrite">;

/** The files the requests' bodies name, read inside the delete's transaction before `sweepFiles` takes them. */
export async function filesOf(tx: Tx, requests: RequestDoc[]): Promise<[string, StoredFile][]> {
  const files = tx.objectStore("files");
  const found: [string, StoredFile][] = [];
  for (const id of new Set(requests.flatMap((request) => fileIdsOf(request.body)))) {
    const file = await files.get(id);
    if (file) found.push([id, file]);
  }
  return found;
}

/** Puts back what a delete removed, in one transaction. A folder or a request whose collection is gone stays gone. */
export async function putBack(tx: Tx, removed: Removed): Promise<void> {
  const collections = tx.objectStore("collections");
  for (const collection of removed.collections) await collections.put(collection);
  const exists = async (id: string) => (await collections.getKey(id)) !== undefined;
  for (const folder of removed.folders)
    if (await exists(folder.collectionId)) await tx.objectStore("folders").put(folder);
  const requests = [];
  for (const request of removed.requests)
    if (await exists(request.collectionId)) requests.push(await tx.objectStore("requests").put(request));
  if (requests.length) for (const [id, file] of removed.files) await tx.objectStore("files").put(file, id);
}
