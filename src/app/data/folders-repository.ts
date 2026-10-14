import { Injectable, inject } from "@angular/core";
import { applyVariableChanges, type VariableChange } from "@wayfarer/core";
import { CollectionId, Folder, FolderId, InheritedPatch, RequestDoc, RequestDocId } from "../models/collections";
import { IdbCore } from "./idb-core";
import { sweepFiles } from "./request-files";

/**
 * Folder-level CRUD, split out of `CollectionsRepository` (which used to
 * also own this) once that file crossed ~540 lines. Still operates on the
 * same "folders"/"requests" IndexedDB stores via the shared
 * `IdbCore`, and is recombined behind `Idb`'s facade
 * alongside `CollectionsRepository`/`CollectionRequestsRepository`.
 */
@Injectable({ providedIn: "root" })
export class FoldersRepository {
  private readonly core = inject(IdbCore);

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
    const tx = await this.core.txReadWrite(["folders", "requests"]);
    const store = tx.objectStore("folders");
    return this.core.commitOrRollback(tx, async () => {
      const meta = this.core.createMeta();
      const doc: Folder = {
        id: meta.id,
        meta,
        collectionId: payload.collectionId,
        parentFolderId: payload.parentFolderId,
        name: payload.name.trim(),
        order: payload.order ?? (await this.core.nextOrder(store.index("by-order"), tx.objectStore("requests").index("by-order"))),
        variables: [],
        auth: { type: "inherit" },
        scripts: { pre: "", post: "" },
      };
      this.core.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  /** The auth and the scripts a folder holds for the requests in it (P4.9). */
  async setFolderInherited(id: FolderId, patch: InheritedPatch<Folder>): Promise<Folder | null> {
    return this.change(id, (folder) => ({ ...folder, auth: patch.auth, scripts: patch.scripts }));
  }

  /** Changes some variables of a folder, reading the stored rows inside the transaction that writes them (D22). */
  async changeFolderVariables(id: FolderId, changes: VariableChange[]): Promise<Folder | null> {
    return this.change(id, (folder) => ({ ...folder, variables: applyVariableChanges(folder.variables, changes) }));
  }

  private async change(id: FolderId, next: (folder: Folder) => Folder): Promise<Folder | null> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders"]);
    const store = tx.objectStore("folders");
    return this.core.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      const updated = { ...next(doc), meta: this.core.touchMeta(doc.meta) };
      await store.put(updated);
      return updated;
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

  /** A copy of a folder with everything in it: its requests, and the folders inside it at every depth. */
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
      // Read whole before the first copy is written: a copy is a folder of the same parent.
      const subtree = await this.subtree((parent) => folderStore.index("by-parentFolderId").getAll(parent), id);
      const copies = new Map<FolderId, FolderId>();
      let top: Folder | null = null;
      for (const folder of [original, ...subtree]) {
        const meta = this.core.createMeta();
        copies.set(folder.meta.id, meta.id);
        const clone: Folder =
          folder === original
            ? { ...structuredClone(folder), id: meta.id, meta, name: `${folder.name} copy`, order: await this.core.nextOrder(folderStore.index("by-order"), requestStore.index("by-order")) }
            : // A folder inside keeps its name and its place, in the copy of its parent.
              { ...structuredClone(folder), id: meta.id, meta, parentFolderId: copies.get(folder.parentFolderId ?? "") };
        this.core.ensureId(clone);
        await folderStore.add(clone);
        top ??= clone;

        for (const request of await requestStore.index("by-folderId").getAll(folder.meta.id)) {
          const reqMeta = this.core.createMeta();
          // Its place in the folder, as the original's.
          const copy: RequestDoc = { ...structuredClone(request), id: reqMeta.id, meta: reqMeta, folderId: meta.id, collectionId: original.collectionId };
          this.core.ensureId(copy);
          await requestStore.add(copy);
        }
      }
      return top;
    });
  }

  /** A folder is deleted with everything in it: the folders inside it are not moved up (the tree draws them inside since version 13). */
  async deleteFolder(id: FolderId): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders", "requests", "files"]);
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    await this.core.commitOrRollback(tx, async () => {
      for (const folderId of [id, ...(await this.subtree((parent) => folderStore.index("by-parentFolderId").getAll(parent), id)).map((folder) => folder.meta.id)]) {
        await folderStore.delete(folderId);
        for (const key of await requestStore.index("by-folderId").getAllKeys(folderId)) await requestStore.delete(key);
      }
      await sweepFiles(tx);
    });
  }

  /** The folders inside a folder, each after its parent. A folder is taken once, so folders that name each other end. */
  private async subtree(inside: (parent: FolderId) => Promise<Folder[]>, id: FolderId): Promise<Folder[]> {
    const found: Folder[] = [];
    const seen = new Set<FolderId>([id]);
    const queue: FolderId[] = [id];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      for (const folder of await inside(next)) {
        if (seen.has(folder.meta.id)) continue;
        seen.add(folder.meta.id);
        found.push(folder);
        queue.push(folder.meta.id);
      }
    }
    return found;
  }

  /** The new places of a parent's folders and requests: the two share one order, so they are written together. */
  async reorderChildren(order: { id: FolderId | RequestDocId; order: number }[]): Promise<void> {
    await this.core.ensurePersistentSupport();
    const tx = await this.core.txReadWrite(["folders", "requests"]);
    await this.core.commitOrRollback(tx, async () => {
      for (const entry of order) {
        const folder = await tx.objectStore("folders").get(entry.id);
        if (folder) {
          await tx.objectStore("folders").put({ ...folder, order: entry.order, meta: this.core.touchMeta(folder.meta) });
          continue;
        }
        const request = await tx.objectStore("requests").get(entry.id);
        if (request) await tx.objectStore("requests").put({ ...request, order: entry.order, meta: this.core.touchMeta(request.meta) });
      }
    });
  }
}
