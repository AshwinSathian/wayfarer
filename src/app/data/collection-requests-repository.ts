import { Injectable, inject } from "@angular/core";
import { emptyRequest } from "@wayfarer/core";
import { CollectionId, NewRequest, RequestDoc, RequestDocId, RequestPatch } from "../models/collections";
import { IDBPTransaction } from "idb";
import { IdbCore } from "./idb-core";
import { ApiSandboxDB, StoreCollection, StoredFile } from "./idb-schema";
import { sweepFiles } from "./request-files";

/**
 * CRUD for requests saved inside a collection/folder (`RequestDoc`) — not
 * to be confused with `HistoryRepository`, which owns the separate
 * "sent request log" (`PastRequest`) store. Split out of
 * `CollectionsRepository` (which used to also own this) once that file
 * crossed ~540 lines; recombined behind `Idb`'s facade alongside
 * `CollectionsRepository`/`FoldersRepository`.
 */
@Injectable({ providedIn: "root" })
export class CollectionRequestsRepository {
  private readonly core = inject(IdbCore);

  async listRequests(collectionId: CollectionId): Promise<RequestDoc[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["requests"]);
    const index = tx.objectStore("requests").index("by-collectionId");
    const items = await index.getAll(collectionId);
    await tx.done;
    const sorted = items.sort((a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id));
    return this.core.ensureIds(sorted);
  }

  /** `files` holds the files the request's body names that are not stored yet. */
  async createRequest(payload: NewRequest, files?: ReadonlyMap<string, Blob>): Promise<RequestDoc> {
    await this.core.ensurePersistentSupport();
    const stored = await readFiles(files);
    const tx = await this.core.txReadWrite(["requests", "files"]);
    const store = tx.objectStore("requests");
    return this.core.commitOrRollback(tx, async () => {
      await this.storeFiles(tx, stored);
      const meta = this.core.createMeta();
      const doc: RequestDoc = {
        ...emptyRequest(),
        ...payload,
        id: meta.id,
        meta,
        name: payload.name.trim(),
        order: payload.order ?? (await this.core.nextOrder(store.index("by-order"))),
      };
      this.core.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async renameRequest(id: RequestDocId, name: string): Promise<RequestDoc | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      doc.name = name.trim();
      doc.meta = this.core.touchMeta(doc.meta);
      this.core.ensureId(doc);
      await store.put(doc);
      return doc;
    });
  }

  /**
   * Writes the composer's request back onto a saved one: the "Save" half of
   * Save and Save As. Fields the patch leaves out are kept.
   */
  async updateRequest(id: RequestDocId, patch: RequestPatch, files?: ReadonlyMap<string, Blob>): Promise<RequestDoc | null> {
    await this.core.ensurePersistentSupport();
    const stored = await readFiles(files);
    const tx = await this.core.txReadWrite(["requests", "files"]);
    const store = tx.objectStore("requests");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      Object.assign(doc, patch);
      if (patch.name !== undefined) {
        doc.name = doc.name.trim();
      }
      doc.meta = this.core.touchMeta(doc.meta);
      this.core.ensureId(doc);
      await this.storeFiles(tx, stored);
      await store.put(doc);
      if (patch.body) {
        // The body may have let go of a file.
        await sweepFiles(tx);
      }
      return doc;
    });
  }

  /** A stored file, or undefined when this browser does not have it (the request came from a file). */
  async readFile(id: string): Promise<Blob | undefined> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["files"]);
    const file = await tx.objectStore("files").get(id);
    await tx.done;
    return file && new Blob([file.bytes], { type: file.type });
  }

  private async storeFiles(
    tx: IDBPTransaction<ApiSandboxDB, StoreCollection, "readwrite">,
    files: [string, StoredFile][]
  ): Promise<void> {
    for (const [id, file] of files) {
      await tx.objectStore("files").put(file, id);
    }
  }

  async duplicateRequest(id: RequestDocId): Promise<RequestDoc | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      const meta = this.core.createMeta();
      const clone: RequestDoc = {
        ...structuredClone(doc),
        id: meta.id,
        meta,
        name: `${doc.name} copy`,
        order: await this.core.nextOrder(store.index("by-order")),
      };
      this.core.ensureId(clone);
      await store.add(clone);
      return clone;
    });
  }

  async deleteRequest(id: RequestDocId): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["requests", "files"]);
    await this.core.commitOrRollback(tx, async () => {
      await tx.objectStore("requests").delete(id);
      await sweepFiles(tx);
    });
  }

  async reorderRequests(order: { id: RequestDocId; order: number }[]): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    await this.core.commitOrRollback(tx, async () => {
      for (const entry of order) {
        const doc = await store.get(entry.id);
        if (!doc) {
          continue;
        }
        doc.order = entry.order;
        doc.meta = this.core.touchMeta(doc.meta);
        await store.put(doc);
      }
    });
  }
}

/**
 * The files as they are stored. Read before the transaction opens: waiting
 * for anything but IndexedDB inside one lets it commit.
 */
function readFiles(files: ReadonlyMap<string, Blob> | undefined): Promise<[string, StoredFile][]> {
  return Promise.all(
    [...(files ?? [])].map(async ([id, blob]): Promise<[string, StoredFile]> => [id, { bytes: await blob.arrayBuffer(), type: blob.type }])
  );
}
