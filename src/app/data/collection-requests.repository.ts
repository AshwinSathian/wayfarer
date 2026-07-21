import { Injectable, inject } from "@angular/core";
import { CollectionId, FolderId, RequestDoc, RequestDocId } from "../models/collections.models";
import { PastRequest } from "../models/history.models";
import { IdbCoreService } from "./idb-core.service";

/**
 * CRUD for requests saved inside a collection/folder (`RequestDoc`) — not
 * to be confused with `HistoryRepository`, which owns the separate
 * "sent request log" (`PastRequest`) store. Split out of
 * `CollectionsRepository` (which used to also own this) once that file
 * crossed ~540 lines; recombined behind `IdbService`'s facade alongside
 * `CollectionsRepository`/`FoldersRepository`.
 */
@Injectable({ providedIn: "root" })
export class CollectionRequestsRepository {
  private readonly core = inject(IdbCoreService);

  async listRequests(collectionId: CollectionId): Promise<RequestDoc[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["requests"]);
    const index = tx.objectStore("requests").index("by-collectionId");
    const items = await index.getAll(collectionId);
    await tx.done;
    const sorted = items.sort((a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id));
    return this.core.ensureIds(sorted);
  }

  async createRequest(payload: {
    collectionId: CollectionId;
    folderId?: FolderId;
    name: string;
    method: PastRequest["method"];
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    order?: number;
  }): Promise<RequestDoc> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    return this.core.commitOrRollback(tx, async () => {
      const meta = this.core.createMeta();
      const doc: RequestDoc = {
        id: meta.id,
        meta,
        collectionId: payload.collectionId,
        folderId: payload.folderId,
        name: payload.name.trim(),
        order: payload.order ?? (await this.core.nextOrder(store.index("by-order"))),
        method: payload.method,
        url: payload.url,
        headers: payload.headers ?? {},
        body: payload.body,
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
   * Persists the composer's full working state (method/url/params/headers/
   * body/auth/scripts/tests) back onto an existing collection request —
   * the "Save" half of Save/Save As. `folderId` is included so a request
   * can be re-filed into a different folder in the same call; `undefined`
   * values are left untouched rather than clearing the field, since callers
   * only pass the subset of fields the composer actually knows about.
   */
  async updateRequest(
    id: RequestDocId,
    patch: Partial<
      Pick<
        RequestDoc,
        | "name"
        | "folderId"
        | "method"
        | "url"
        | "params"
        | "headers"
        | "body"
        | "vars"
        | "auth"
        | "preRequestScript"
        | "postRequestScript"
        | "tests"
      >
    >
  ): Promise<RequestDoc | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["requests"]);
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
      await store.put(doc);
      return doc;
    });
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
        ...this.core.clone(doc),
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
    const tx = await this.core.txReadWrite(["requests"]);
    await this.core.commitOrRollback(tx, async () => {
      await tx.objectStore("requests").delete(id);
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
