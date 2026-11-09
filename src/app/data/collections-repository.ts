import { Injectable, inject } from "@angular/core";
import {
  COLLECTION_FORMAT,
  Collection,
  CollectionExport,
  Folder,
  InheritedPatch,
  RequestDoc,
} from "../models/collections";
import { IDBPTransaction } from "idb";
import { IdbCore } from "./idb-core";
import { StoreCollection, WayfarerDB } from "./idb-schema";
import { sweepFiles } from "./request-files";
import { filesOf, putBack, Removed } from "./removed";
import { applyVariableChanges, type VariableChange } from "@wayfarer/core";

/**
 * Collection-level CRUD + import/export. Folder and request CRUD used to
 * live in this same file (it was all one `CollectionsRepository`) — split
 * into `FoldersRepository`/`CollectionRequestsRepository` once this file
 * crossed ~540 lines. All three still operate on the same underlying
 * "collections"/"folders"/"requests" IndexedDB stores via the shared
 * `IdbCore`, so this split is purely about keeping each file's CRUD surface readable —
 * it changes no behavior or storage layout.
 */
@Injectable({ providedIn: "root" })
export class CollectionsRepository {
  private readonly core = inject(IdbCore);

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
        variables: [],
        auth: { type: "none" },
        scripts: { pre: "", post: "" },
        scriptTrust: { trusted: true },
      };
      this.core.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  /**
   * Records script texts, by their digests, as approved for a collection.
   * `review` is the user's "Trust these scripts": the collection becomes
   * trusted and the list is exactly these. Otherwise the digests are of a
   * script the user just saved here, and they are added only if the
   * collection is trusted already: an edit does not approve an import.
   */
  async approveScripts(id: string, digests: string[], review: boolean): Promise<Collection | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    return this.core.commitOrRollback(tx, async () => {
      const existing = await store.get(id);
      if (!existing || (!review && !existing.scriptTrust?.trusted)) {
        return null;
      }
      // ponytail: an edit only adds, so the list keeps the digest of every version saved (64 characters each). A review starts it again; prune here if a collection's list ever gets large.
      const approved = review ? digests : [...new Set([...(existing.scriptTrust.approved ?? []), ...digests])];
      existing.scriptTrust = { trusted: true, approved };
      existing.meta = this.core.touchMeta(existing.meta);
      await store.put(existing);
      return existing;
    });
  }

  /** Changes some variables of a collection, reading the stored rows inside the transaction that writes them (D22). */
  async changeCollectionVariables(id: string, changes: VariableChange[]): Promise<Collection | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    return this.core.commitOrRollback(tx, async () => {
      const existing = await store.get(id);
      if (!existing) {
        return null;
      }
      existing.variables = applyVariableChanges(existing.variables, changes);
      existing.meta = this.core.touchMeta(existing.meta);
      await store.put(existing);
      return existing;
    });
  }

  /** The auth, the scripts and the route a collection holds for its requests (P4.9, P6.4). Approving a script is not done here: see `approveScripts`. */
  async setCollectionInherited(id: string, patch: InheritedPatch<Collection>): Promise<Collection | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    return this.core.commitOrRollback(tx, async () => {
      const existing = await store.get(id);
      if (!existing) {
        return null;
      }
      const { route: _was, ...rest } = existing;
      const updated: Collection = {
        ...rest,
        auth: patch.auth,
        scripts: patch.scripts,
        ...(patch.route && { route: patch.route }),
        meta: this.core.touchMeta(existing.meta),
      };
      await store.put(updated);
      return updated;
    });
  }

  async renameCollection(id: string, updates: { name?: string; description?: string }): Promise<Collection | null> {
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

  async duplicateCollection(id: string): Promise<Collection | null> {
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

      // One id a copy, as duplicateFolder and duplicateRequest write: `id` is `meta.id`.
      const fresh = () => {
        const meta = this.core.createMeta();
        return { id: meta.id, meta };
      };
      const duplicate: Collection = {
        ...structuredClone(original),
        ...fresh(),
        name: `${original.name} copy`,
        order: await this.core.nextOrder(collectionStore.index("by-order")),
      };
      this.core.ensureId(duplicate);
      await collectionStore.add(duplicate);

      const folderIndex = folderStore.index("by-collectionId");
      const requestIndex = requestStore.index("by-collectionId");
      const sourceFolders = (await folderIndex.getAll(id)).sort(
        (a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id),
      );
      const sourceRequests = (await requestIndex.getAll(id)).sort(
        (a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id),
      );

      const folderIdMap = new Map<string, string>();
      const folderClones = sourceFolders.map((folder) => {
        const clone: Folder = {
          ...structuredClone(folder),
          ...fresh(),
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
          ...structuredClone(request),
          ...fresh(),
          collectionId: duplicate.meta.id,
          order: request.order,
          folderId: request.folderId ? folderIdMap.get(request.folderId) : undefined,
        };
        await requestStore.add(clone);
      }

      return duplicate;
    });
  }

  /** Deletes a collection with everything in it, and gives back what went, for Undo (U-080). */
  async deleteCollection(id: string): Promise<Removed> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections", "folders", "requests", "files"]);
    return this.core.commitOrRollback(tx, async () => {
      const removed = await this.take(tx, id);
      await sweepFiles(tx);
      return removed;
    });
  }

  /** Undo (U-080): puts back what a delete in the tree removed, as it was. */
  async restore(removed: Removed): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections", "folders", "requests", "files"]);
    await this.core.commitOrRollback(tx, () => putBack(tx, removed));
  }

  /** An import's Undo, in one transaction: the collections it added go and those it replaced come back, or neither. */
  async undoImport(added: string[], replaced: Removed[]): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections", "folders", "requests", "files"]);
    await this.core.commitOrRollback(tx, async () => {
      for (const id of added) await this.take(tx, id);
      // Before the put-backs: they write the replaced requests' files back.
      await sweepFiles(tx);
      for (const removed of replaced) await putBack(tx, removed);
    });
  }

  private async take(tx: IDBPTransaction<WayfarerDB, StoreCollection, "readwrite">, id: string): Promise<Removed> {
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");
    const collection = await collectionStore.get(id);
    const folders = await folderStore.index("by-collectionId").getAll(id);
    const requests = await requestStore.index("by-collectionId").getAll(id);
    const files = await filesOf(tx, requests);
    await collectionStore.delete(id);
    await Promise.all(folders.map((folder) => folderStore.delete(folder.meta.id)));
    await Promise.all(requests.map((request) => requestStore.delete(request.meta.id)));
    return { collections: collection ? [collection] : [], folders, requests, files };
  }

  async reorderCollections(order: { id: string; order: number }[]): Promise<void> {
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

  async getCollectionExport(id: string): Promise<CollectionExport | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadonly(["collections", "folders", "requests"]);
    const collection = await tx.objectStore("collections").get(id);
    if (!collection) {
      await tx.done;
      return null;
    }
    const folderIndex = tx.objectStore("folders").index("by-collectionId");
    const requestIndex = tx.objectStore("requests").index("by-collectionId");
    const [folders, requests] = await Promise.all([folderIndex.getAll(id), requestIndex.getAll(id)]);
    await tx.done;
    const { scriptTrust: _trust, ...content } = this.core.ensureId(collection);
    return {
      $id: COLLECTION_FORMAT,
      meta: collection.meta,
      collection: content,
      folders: this.core.ensureIds(folders),
      requests: this.core.ensureIds(requests),
    };
  }

  async importCollectionExport(
    payload: CollectionExport,
    /** `replaced` is handed what an import over a stored collection takes out, as it was: its Undo (U-161). */
    options?: { duplicateAsNew?: boolean; replaced?: (removed: Removed) => void },
  ): Promise<Collection | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["collections", "folders", "requests", "files"]);
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    return this.core.commitOrRollback(tx, async () => {
      const data = structuredClone(payload);
      this.core.ensureId(data.collection);
      data.folders = this.core.ensureIds(data.folders ?? []);
      data.requests = this.core.ensureIds(data.requests ?? []);
      const collectionId = data.collection?.meta?.id ?? data.collection?.id;
      if (!collectionId) {
        throw new Error("Collection payload is missing an identifier.");
      }

      if (!options?.duplicateAsNew) {
        const [existing, folders, requests] = await Promise.all([
          collectionStore.get(collectionId),
          folderStore.index("by-collectionId").getAll(collectionId),
          requestStore.index("by-collectionId").getAll(collectionId),
        ]);
        if (existing)
          options?.replaced?.({ collections: [existing], folders, requests, files: await filesOf(tx, requests) });
        await collectionStore.delete(collectionId);
        for (const folder of folders) {
          await folderStore.delete(folder.meta.id);
        }
        for (const request of requests) {
          await requestStore.delete(request.meta.id);
        }
      }

      // A file's scripts are not the user's own until they approve them (D6),
      // also when it replaces a collection that was trusted.
      const collection: Collection = { ...data.collection, scriptTrust: { trusted: false } };
      await collectionStore.put(collection);
      // A folder or a request of the file may carry the id of one another collection holds: `put` takes it from
      // there. It is put back by the Undo with the rest of what the import replaced.
      const taken: Removed = { collections: [], folders: [], requests: [], files: [] };
      for (const folder of data.folders) {
        this.core.ensureId(folder);
        const other = await folderStore.get(folder.meta.id);
        if (other && other.collectionId !== collectionId) taken.folders.push(other);
      }
      for (const request of data.requests) {
        this.core.ensureId(request);
        const other = await requestStore.get(request.meta.id);
        if (other && other.collectionId !== collectionId) taken.requests.push(other);
      }
      if (taken.folders.length || taken.requests.length)
        options?.replaced?.({ ...taken, files: await filesOf(tx, taken.requests) });
      for (const folder of data.folders) {
        folder.collectionId = collectionId;
        this.core.ensureId(folder);
        await folderStore.put(folder);
      }
      for (const request of data.requests) {
        request.collectionId = collectionId;
        if (
          request.folderId &&
          !data.folders.some((folder) => folder.meta.id === request.folderId || folder.id === request.folderId)
        ) {
          request.folderId = undefined;
        }
        this.core.ensureId(request);
        await requestStore.put(request);
      }
      // After the new requests are in: a file the replaced ones used is kept if these still name it.
      await sweepFiles(tx);
      return collection;
    });
  }
}
