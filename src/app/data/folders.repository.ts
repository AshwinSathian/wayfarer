import { Injectable, inject } from "@angular/core";
import { CollectionId, Folder, FolderId, RequestDoc } from "../models/collections.models";
import { IdbCoreService } from "./idb-core.service";

/**
 * Folder-level CRUD, split out of `CollectionsRepository` (which used to
 * also own this) once that file crossed ~540 lines. Still operates on the
 * same "folders"/"requests" IndexedDB stores via the shared
 * `IdbCoreService`, and is recombined behind `IdbService`'s facade
 * alongside `CollectionsRepository`/`CollectionRequestsRepository`.
 */
@Injectable({ providedIn: "root" })
export class FoldersRepository {
  private readonly core = inject(IdbCoreService);

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
}
