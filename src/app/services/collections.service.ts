import { Injectable, Signal, computed, signal, inject } from "@angular/core";
import {
  Collection,
  CollectionExport,
  CollectionId,
  Folder,
  FolderId,
  RequestDoc,
  RequestDocId,
} from "../models/collections.models";
import { IdbService } from "../data/idb.service";
import { serializeDeterministic } from "../shared/collections/collection-io.util";

export interface CollectionTree {
  collection: Collection;
  folders: Folder[];
  requests: RequestDoc[];
}

@Injectable({
  providedIn: "root",
})
export class CollectionsService {
  private readonly idb = inject(IdbService);

  private readonly treeState = signal<CollectionTree[]>([]);
  private readonly loadingState = signal(false);

  readonly tree: Signal<CollectionTree[]> = computed(() => this.treeState());
  readonly loading: Signal<boolean> = computed(() => this.loadingState());

  async refresh(): Promise<void> {
    this.loadingState.set(true);
    try {
      const collections = await this.idb.listCollections();
      const trees: CollectionTree[] = [];
      for (const collection of collections) {
        const [folders, requests] = await Promise.all([
          this.idb.listFolders(collection.meta.id),
          this.idb.listRequests(collection.meta.id),
        ]);
        trees.push({ collection, folders, requests });
      }
      this.treeState.set(trees);
    } finally {
      this.loadingState.set(false);
    }
  }

  async ensureLoaded(): Promise<void> {
    if (!this.treeState().length) {
      await this.refresh();
    }
  }

  /**
   * Re-fetches just one collection's folders/requests and patches it into the
   * existing tree, instead of `refresh()`'s 1 + 2×N re-read of every
   * collection. Folder/request CRUD is by far the most frequent mutation in
   * this service — every rename, delete, or reorder inside a collection used
   * to trigger a full-tree reload regardless of how many *other* collections
   * existed. Collection-level mutations (create/rename/delete/reorder the
   * collections themselves) still use `refresh()`, since those change the
   * top-level list shape and are comparatively rare.
   */
  private async refreshCollectionEntry(collectionId: CollectionId): Promise<void> {
    const index = this.treeState().findIndex(
      (entry) => entry.collection.meta.id === collectionId
    );
    if (index === -1) {
      // Not in the current snapshot — fall back to a full reload rather than
      // silently doing nothing.
      await this.refresh();
      return;
    }
    const [folders, requests] = await Promise.all([
      this.idb.listFolders(collectionId),
      this.idb.listRequests(collectionId),
    ]);
    const next = [...this.treeState()];
    next[index] = { ...next[index], folders, requests };
    this.treeState.set(next);
  }

  private findFolderCollectionId(id: FolderId): CollectionId | undefined {
    for (const entry of this.treeState()) {
      if (entry.folders.some((folder) => folder.meta.id === id)) {
        return entry.collection.meta.id;
      }
    }
    return undefined;
  }

  private findRequestCollectionId(id: RequestDocId): CollectionId | undefined {
    for (const entry of this.treeState()) {
      if (entry.requests.some((request) => request.meta.id === id)) {
        return entry.collection.meta.id;
      }
    }
    return undefined;
  }

  async createCollection(payload: {
    name: string;
    description?: string;
  }): Promise<Collection> {
    const created = await this.idb.createCollection(payload);
    await this.refresh();
    return created;
  }

  async renameCollection(
    id: CollectionId,
    updates: { name?: string; description?: string }
  ): Promise<Collection | null> {
    const updated = await this.idb.renameCollection(id, updates);
    await this.refresh();
    return updated;
  }

  async duplicateCollection(id: CollectionId): Promise<Collection | null> {
    const result = await this.idb.duplicateCollection(id);
    await this.refresh();
    return result;
  }

  async deleteCollection(id: CollectionId): Promise<void> {
    await this.idb.deleteCollection(id);
    await this.refresh();
  }

  async reorderCollections(order: { id: CollectionId; order: number }[]): Promise<void> {
    await this.idb.reorderCollections(order);
    await this.refresh();
  }

  async createFolder(payload: {
    collectionId: CollectionId;
    name: string;
    parentFolderId?: FolderId;
  }): Promise<Folder> {
    const folder = await this.idb.createFolder(payload);
    await this.refreshCollectionEntry(payload.collectionId);
    return folder;
  }

  async renameFolder(id: FolderId, name: string): Promise<Folder | null> {
    const folder = await this.idb.renameFolder(id, name);
    if (folder) {
      await this.refreshCollectionEntry(folder.collectionId);
    }
    return folder;
  }

  async duplicateFolder(id: FolderId): Promise<Folder | null> {
    const folder = await this.idb.duplicateFolder(id);
    if (folder) {
      await this.refreshCollectionEntry(folder.collectionId);
    }
    return folder;
  }

  async deleteFolder(id: FolderId): Promise<void> {
    const collectionId = this.findFolderCollectionId(id);
    await this.idb.deleteFolder(id);
    if (collectionId) {
      await this.refreshCollectionEntry(collectionId);
    } else {
      await this.refresh();
    }
  }

  async reorderFolders(order: { id: FolderId; order: number }[]): Promise<void> {
    const collectionId = order[0] ? this.findFolderCollectionId(order[0].id) : undefined;
    await this.idb.reorderFolders(order);
    if (collectionId) {
      await this.refreshCollectionEntry(collectionId);
    } else {
      await this.refresh();
    }
  }

  async createRequest(payload: {
    collectionId: CollectionId;
    folderId?: FolderId;
    name: string;
    method: RequestDoc["method"];
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<RequestDoc> {
    const doc = await this.idb.createRequest(payload);
    await this.refreshCollectionEntry(payload.collectionId);
    return doc;
  }

  async renameRequest(id: RequestDocId, name: string): Promise<RequestDoc | null> {
    const doc = await this.idb.renameRequest(id, name);
    if (doc) {
      await this.refreshCollectionEntry(doc.collectionId);
    }
    return doc;
  }

  async duplicateRequest(id: RequestDocId): Promise<RequestDoc | null> {
    const doc = await this.idb.duplicateRequest(id);
    if (doc) {
      await this.refreshCollectionEntry(doc.collectionId);
    }
    return doc;
  }

  async deleteRequest(id: RequestDocId): Promise<void> {
    const collectionId = this.findRequestCollectionId(id);
    await this.idb.deleteRequest(id);
    if (collectionId) {
      await this.refreshCollectionEntry(collectionId);
    } else {
      await this.refresh();
    }
  }

  async reorderRequests(order: { id: RequestDocId; order: number }[]): Promise<void> {
    const collectionId = order[0] ? this.findRequestCollectionId(order[0].id) : undefined;
    await this.idb.reorderRequests(order);
    if (collectionId) {
      await this.refreshCollectionEntry(collectionId);
    } else {
      await this.refresh();
    }
  }

  getCollection(id: CollectionId): Collection | undefined {
    return this.treeState()
      .map((entry) => entry.collection)
      .find((collection) => collection.meta.id === id);
  }

  getCollectionTree(id: CollectionId): CollectionTree | undefined {
    return this.treeState().find((entry) => entry.collection.meta.id === id);
  }

  async exportCollectionJson(id: CollectionId): Promise<string | null> {
    const snapshot = await this.idb.getCollectionExport(id);
    if (!snapshot) {
      return null;
    }
    return serializeDeterministic(snapshot);
  }

  async importCollection(
    payload: CollectionExport,
    options?: { duplicateAsNew?: boolean }
  ): Promise<Collection | null> {
    const collection = await this.idb.importCollectionExport(payload, options);
    await this.refresh();
    return collection;
  }
}
