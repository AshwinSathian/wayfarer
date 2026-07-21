import { Injectable, inject } from "@angular/core";
import {
  Collection,
  CollectionExport,
  CollectionId,
  Folder,
  RequestDoc,
} from "../models/collections.models";
import { IdbCoreService } from "./idb-core.service";

/**
 * Collection-level CRUD + import/export. Folder and request CRUD used to
 * live in this same file (it was all one `CollectionsRepository`) — split
 * into `FoldersRepository`/`CollectionRequestsRepository` once this file
 * crossed ~540 lines. All three still operate on the same underlying
 * "collections"/"folders"/"requests" IndexedDB stores via the shared
 * `IdbCoreService`, and are recombined behind `IdbService`'s facade, so
 * this split is purely about keeping each file's CRUD surface readable —
 * it changes no behavior or storage layout.
 */
@Injectable({ providedIn: "root" })
export class CollectionsRepository {
  private readonly core = inject(IdbCoreService);

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
}
