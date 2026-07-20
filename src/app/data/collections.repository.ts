import { Injectable, inject } from "@angular/core";
import {
  Collection,
  CollectionExport,
  CollectionId,
  Folder,
  FolderId,
  RequestDoc,
  RequestDocId,
} from "../models/collections.models";
import { PastRequest } from "../models/history.models";
import { IdbCoreService } from "./idb-core.service";

@Injectable({ providedIn: "root" })
export class CollectionsRepository {
  private readonly core = inject(IdbCoreService);

  // ── Collections ─────────────────────────────────────────────────────

  async listCollections(): Promise<Collection[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["collections"]);
    const index = tx.objectStore("collections").index("by-order");
    const results = await index.getAll();
    await tx.done;
    return this.core.ensureIds(results);
  }

  async createCollection(payload: { name: string; description?: string }): Promise<Collection> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    return this.core.commitOrRollback(tx, async () => {
      const meta = this.core.createMeta();
      const doc: Collection = {
        id: meta.id,
        meta,
        name: payload.name.trim(),
        description: payload.description?.trim() || undefined,
        order: await this.core.nextOrder(store.index("by-order")),
      };
      this.core.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async renameCollection(
    id: CollectionId,
    updates: { name?: string; description?: string }
  ): Promise<Collection | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    return this.core.commitOrRollback(tx, async () => {
      const existing = await store.get(id);
      if (!existing) {
        return null;
      }
      if (updates.name !== undefined) {
        existing.name = updates.name.trim();
      }
      if (updates.description !== undefined) {
        existing.description = updates.description.trim() || undefined;
      }
      existing.meta = this.core.touchMeta(existing.meta);
      this.core.ensureId(existing);
      await store.put(existing);
      return existing;
    });
  }

  async duplicateCollection(id: CollectionId): Promise<Collection | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections", "folders", "requests"]);
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    return this.core.commitOrRollback(tx, async () => {
      const original = await collectionStore.get(id);
      if (!original) {
        return null;
      }

      const duplicate: Collection = {
        ...this.core.clone(original),
        id: this.core.randomId(),
        meta: this.core.createMeta(),
        name: `${original.name} copy`,
        order: await this.core.nextOrder(collectionStore.index("by-order")),
      };
      this.core.ensureId(duplicate);
      await collectionStore.add(duplicate);

      const folderIndex = folderStore.index("by-collectionId");
      const requestIndex = requestStore.index("by-collectionId");
      const sourceFolders = (await folderIndex.getAll(id)).sort(
        (a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id)
      );
      const sourceRequests = (await requestIndex.getAll(id)).sort(
        (a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id)
      );

      const folderIdMap = new Map<string, string>();
      const folderClones = sourceFolders.map((folder) => {
        const clone: Folder = {
          ...this.core.clone(folder),
          id: this.core.randomId(),
          meta: this.core.createMeta(),
          collectionId: duplicate.meta.id,
          order: folder.order,
        };
        folderIdMap.set(folder.meta.id, clone.meta.id);
        return clone;
      });

      for (const clone of folderClones) {
        if (clone.parentFolderId) {
          clone.parentFolderId = folderIdMap.get(clone.parentFolderId) ?? undefined;
        }
        await folderStore.add(clone);
      }

      for (const request of sourceRequests) {
        const clone: RequestDoc = {
          ...this.core.clone(request),
          id: this.core.randomId(),
          meta: this.core.createMeta(),
          collectionId: duplicate.meta.id,
          order: request.order,
          folderId: request.folderId ? folderIdMap.get(request.folderId) : undefined,
        };
        await requestStore.add(clone);
      }

      return duplicate;
    });
  }

  async deleteCollection(id: CollectionId): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections", "folders", "requests"]);
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    await this.core.commitOrRollback(tx, async () => {
      await collectionStore.delete(id);
      const folderIndex = folderStore.index("by-collectionId");
      const requestIndex = requestStore.index("by-collectionId");
      const folders = await folderIndex.getAll(id);
      const requests = await requestIndex.getAll(id);
      await Promise.all(folders.map((folder) => folderStore.delete(folder.meta.id)));
      await Promise.all(requests.map((request) => requestStore.delete(request.meta.id)));
    });
  }

  async reorderCollections(order: { id: CollectionId; order: number }[]): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
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

  async getCollectionExport(id: CollectionId): Promise<CollectionExport | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["collections", "folders", "requests"]);
    const collection = await tx.objectStore("collections").get(id);
    if (!collection) {
      await tx.done;
      return null;
    }
    const folderIndex = tx.objectStore("folders").index("by-collectionId");
    const requestIndex = tx.objectStore("requests").index("by-collectionId");
    const [folders, requests] = await Promise.all([
      folderIndex.getAll(id),
      requestIndex.getAll(id),
    ]);
    await tx.done;
    return {
      meta: collection.meta,
      collection: this.core.ensureId(collection),
      folders: this.core.ensureIds(folders),
      requests: this.core.ensureIds(requests),
    };
  }

  async importCollectionExport(
    payload: CollectionExport,
    options?: { duplicateAsNew?: boolean }
  ): Promise<Collection | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections", "folders", "requests"]);
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    return this.core.commitOrRollback(tx, async () => {
      const data = this.core.clone(payload);
      this.core.ensureId(data.collection);
      data.folders = this.core.ensureIds(data.folders ?? []);
      data.requests = this.core.ensureIds(data.requests ?? []);
      const collectionId = data.collection?.meta?.id ?? data.collection?.id;
      if (!collectionId) {
        throw new Error("Collection payload is missing an identifier.");
      }

      if (!options?.duplicateAsNew) {
        await collectionStore.delete(collectionId);
        const [folders, requests] = await Promise.all([
          folderStore.index("by-collectionId").getAll(collectionId),
          requestStore.index("by-collectionId").getAll(collectionId),
        ]);
        for (const folder of folders) {
          await folderStore.delete(folder.meta.id);
        }
        for (const request of requests) {
          await requestStore.delete(request.meta.id);
        }
      }

      await collectionStore.put(data.collection);
      for (const folder of data.folders) {
        folder.collectionId = collectionId;
        this.core.ensureId(folder);
        await folderStore.put(folder);
      }
      for (const request of data.requests) {
        request.collectionId = collectionId;
        if (
          request.folderId &&
          !data.folders.some(
            (folder) => folder.meta.id === request.folderId || folder.id === request.folderId
          )
        ) {
          request.folderId = undefined;
        }
        this.core.ensureId(request);
        await requestStore.put(request);
      }
      return data.collection;
    });
  }

  // ── Folders ──────────────────────────────────────────────────────────

  async listFolders(collectionId: CollectionId): Promise<Folder[]> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["folders"]);
    const index = tx.objectStore("folders").index("by-collectionId");
    const items = await index.getAll(collectionId);
    await tx.done;
    const sorted = items.sort((a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id));
    return this.core.ensureIds(sorted);
  }

  async createFolder(payload: {
    collectionId: CollectionId;
    name: string;
    parentFolderId?: FolderId;
    order?: number;
  }): Promise<Folder> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders"]);
    const store = tx.objectStore("folders");
    return this.core.commitOrRollback(tx, async () => {
      const meta = this.core.createMeta();
      const doc: Folder = {
        id: meta.id,
        meta,
        collectionId: payload.collectionId,
        parentFolderId: payload.parentFolderId,
        name: payload.name.trim(),
        order: payload.order ?? (await this.core.nextOrder(store.index("by-order"))),
      };
      this.core.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async renameFolder(id: FolderId, name: string): Promise<Folder | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders"]);
    const store = tx.objectStore("folders");
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

  async duplicateFolder(id: FolderId): Promise<Folder | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders", "requests"]);
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    return this.core.commitOrRollback(tx, async () => {
      const original = await folderStore.get(id);
      if (!original) {
        return null;
      }
      const meta = this.core.createMeta();
      const clone: Folder = {
        ...this.core.clone(original),
        id: meta.id,
        meta,
        name: `${original.name} copy`,
        order: await this.core.nextOrder(folderStore.index("by-order")),
      };
      this.core.ensureId(clone);
      await folderStore.add(clone);

      const requestIndex = requestStore.index("by-folderId");
      const requests = await requestIndex.getAll(original.meta.id);
      for (const request of requests) {
        const reqMeta = this.core.createMeta();
        const copy: RequestDoc = {
          ...this.core.clone(request),
          id: reqMeta.id,
          meta: reqMeta,
          folderId: clone.meta.id,
          collectionId: original.collectionId,
          order: await this.core.nextOrder(requestStore.index("by-order")),
        };
        this.core.ensureId(copy);
        await requestStore.add(copy);
      }
      return clone;
    });
  }

  async deleteFolder(id: FolderId): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders", "requests"]);
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    await this.core.commitOrRollback(tx, async () => {
      await folderStore.delete(id);
      const requestIndex = requestStore.index("by-folderId");
      const requests = await requestIndex.getAll(id);
      await Promise.all(requests.map((request) => requestStore.delete(request.meta.id)));
    });
  }

  async reorderFolders(order: { id: FolderId; order: number }[]): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders"]);
    const store = tx.objectStore("folders");
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

  // ── Requests ─────────────────────────────────────────────────────────

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
