import { IDBPTransaction } from "idb";
import { fileIdsOf } from "@wayfarer/core";
import { ApiSandboxDB, StoreCollection } from "./idb-schema";

/** A file a request body may hold. Larger ones are refused when picked. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Deletes every stored file that no saved request refers to. Called inside
 * the transaction that removed or rewrote requests, so a file goes with the
 * last request that used it and a copy of a request can share its files.
 *
 * ponytail: reads every request on each call. Keep a reference count on the
 * file if collections grow to where that shows.
 */
export async function sweepFiles(tx: IDBPTransaction<ApiSandboxDB, StoreCollection, "readwrite">): Promise<void> {
  const used = new Set((await tx.objectStore("requests").getAll()).flatMap((request) => fileIdsOf(request.body)));
  const files = tx.objectStore("files");
  for (const id of await files.getAllKeys()) {
    if (!used.has(id)) {
      await files.delete(id);
    }
  }
}
