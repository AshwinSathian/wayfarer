import { Injectable } from "@angular/core";
import {
  DBSchema,
  IDBPDatabase,
  IDBPCursorWithValue,
  IDBPIndex,
  IDBPObjectStore,
  IDBPTransaction,
  openDB,
} from "idb";
import {
  Collection,
  CollectionExport,
  CollectionId,
  Folder,
  FolderId,
  RequestDoc,
  RequestDocId,
  META_VERSION,
  Meta,
} from "../models/collections.models";
import { EnvironmentDoc, EnvironmentId } from "../models/environments.models";
import { PastRequest, PastRequestKey } from "../models/history.models";
import {
  SecretDoc,
  SecretEnvelope,
  SecretId,
} from "../models/secrets.models";

type HistoryRecord = PastRequest & { id: PastRequestKey };
type StoreName =
  | "history"
  | "collections"
  | "folders"
  | "requests"
  | "environments"
  | "secrets"
  | "meta";
type StoreCollection = ArrayLike<StoreName>;

interface MetaState {
  key: typeof META_STATE_KEY;
  schemaVersion: number;
  activeEnvironmentId?: EnvironmentId | null;
}

interface ApiSandboxDB extends DBSchema {
  history: {
    key: PastRequestKey;
    value: HistoryRecord;
    indexes: {
      "by-createdAt": number;
      "by-url": string;
      "by-method": PastRequest["method"];
    };
  };
  collections: {
    key: CollectionId;
    value: Collection;
    indexes: {
      "by-order": number;
      "by-name": string;
    };
  };
  folders: {
    key: FolderId;
    value: Folder;
    indexes: {
      "by-collectionId": CollectionId;
      "by-parentFolderId": FolderId;
      "by-order": number;
    };
  };
  requests: {
    key: RequestDocId;
    value: RequestDoc;
    indexes: {
      "by-collectionId": CollectionId;
      "by-folderId": FolderId;
      "by-order": number;
    };
  };
  environments: {
    key: EnvironmentId;
    value: EnvironmentDoc;
    indexes: {
      "by-name": string;
      "by-order": number;
    };
  };
  secrets: {
    key: SecretId;
    value: SecretDoc;
    indexes: {
      "by-environmentId": EnvironmentId;
      "by-name": string;
    };
  };
  meta: {
    key: typeof META_STATE_KEY;
    value: MetaState;
  };
}

const DB_NAME = "api-sandbox";
const DB_VERSION = 4;
const META_STATE_KEY = "state";
const DEFAULT_SCHEMA_VERSION = 1;

@Injectable({
  providedIn: "root",
})
export class IdbService {
  private dbPromise?: Promise<IDBPDatabase<ApiSandboxDB>>;
  private initialized = false;
  private useMemoryFallback = false;
  private memoryStore: HistoryRecord[] = [];
  private memorySequence = 1;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (typeof indexedDB === "undefined") {
      this.logError(
        "indexedDB is not available in this environment. Falling back to in-memory store."
      );
      this.enableMemoryFallback();
      return;
    }

    try {
      this.dbPromise = openDB<ApiSandboxDB>(DB_NAME, DB_VERSION, {
        upgrade: async (db, oldVersion, newVersion, transaction) =>
          this.handleUpgrade(db, oldVersion, newVersion, transaction),
      });

      await this.dbPromise;
      await this.ensureMetaDocument();
      this.initialized = true;
    } catch (error) {
      this.logError(
        "Failed to open IndexedDB. Falling back to in-memory store.",
        error
      );
      this.enableMemoryFallback();
    }
  }

  async add(req: PastRequest): Promise<PastRequestKey | null> {
    try {
      const item: PastRequest = {
        ...req,
        createdAt: req.createdAt ?? Date.now(),
      };

      if (this.useMemoryFallback) {
        const record = { ...item, id: this.memorySequence++ } as HistoryRecord;
        this.memoryStore.push(record);
        this.sortMemoryStore();
        return record.id;
      }

      const db = await this.getDatabase();
      if (!db) {
        const record = { ...item, id: this.memorySequence++ } as HistoryRecord;
        this.memoryStore.push(record);
        this.sortMemoryStore();
        return record.id;
      }

      const tx = db.transaction("history", "readwrite");
      const key = await tx.store.add(item as HistoryRecord);
      await tx.done;
      return key;
    } catch (error) {
      this.logError("add operation failed.", error);
      return null;
    }
  }

  async get(id: PastRequestKey): Promise<PastRequest | null> {
    try {
      if (this.useMemoryFallback) {
        return this.memoryStore.find((item) => item.id === id) ?? null;
      }

      const db = await this.getDatabase();
      if (!db) {
        return this.memoryStore.find((item) => item.id === id) ?? null;
      }

      const tx = db.transaction("history", "readonly");
      const result = await tx.store.get(id);
      await tx.done;
      return result ?? null;
    } catch (error) {
      this.logError("get operation failed.", error);
      return null;
    }
  }

  async getLatest(limit = 50): Promise<PastRequest[]> {
    try {
      if (this.useMemoryFallback) {
        return this.memoryStore.slice(0, limit);
      }

      const db = await this.getDatabase();
      if (!db) {
        return this.memoryStore.slice(0, limit);
      }

      const tx = db.transaction("history", "readonly");
      const index = tx.store.index("by-createdAt");
      const results: PastRequest[] = [];
      let cursor = await index.openCursor(null, "prev");
      while (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor = await cursor.continue();
      }
      await tx.done;
      return results;
    } catch (error) {
      this.logError("getLatest operation failed.", error);
      return this.memoryStore.slice(0, limit);
    }
  }

  async findByUrl(url: string, limit = 20): Promise<PastRequest[]> {
    try {
      if (this.useMemoryFallback) {
        return this.memoryStore.filter((item) => item.url === url).slice(0, limit);
      }

      const db = await this.getDatabase();
      if (!db) {
        return this.memoryStore.filter((item) => item.url === url).slice(0, limit);
      }

      const tx = db.transaction("history", "readonly");
      const index = tx.store.index("by-url");
      const results: PastRequest[] = [];
      const range = IDBKeyRange.only(url);
      let cursor = await index.openCursor(range, "prev");

      while (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor = await cursor.continue();
      }

      await tx.done;
      return results;
    } catch (error) {
      this.logError("findByUrl operation failed.", error);
      return this.memoryStore.filter((item) => item.url === url).slice(0, limit);
    }
  }

  async delete(id: PastRequestKey): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        this.memoryStore = this.memoryStore.filter((item) => item.id !== id);
        return;
      }

      const db = await this.getDatabase();
      if (!db) {
        this.memoryStore = this.memoryStore.filter((item) => item.id !== id);
        return;
      }

      const tx = db.transaction("history", "readwrite");
      await tx.store.delete(id);
      await tx.done;
    } catch (error) {
      this.logError("delete operation failed.", error);
    }
  }

  async clear(): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        this.memoryStore = [];
        this.memorySequence = 1;
        return;
      }

      const db = await this.getDatabase();
      if (!db) {
        this.memoryStore = [];
        this.memorySequence = 1;
        return;
      }

      const tx = db.transaction("history", "readwrite");
      await tx.store.clear();
      await tx.done;
    } catch (error) {
      this.logError("clear operation failed.", error);
    }
  }

  async listCollections(): Promise<Collection[]> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadonly(["collections"]);
    const index = tx.objectStore("collections").index("by-order");
    const results = await index.getAll();
    await tx.done;
    return this.ensureIds(results);
  }

  async createCollection(payload: {
    name: string;
    description?: string;
  }): Promise<Collection> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    return this.commitOrRollback(tx, async () => {
      const meta = this.createMeta();
      const doc: Collection = {
        id: meta.id,
        meta,
        name: payload.name.trim(),
        description: payload.description?.trim() || undefined,
        order: await this.nextOrder(store.index("by-order")),
      };
      this.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async renameCollection(
    id: CollectionId,
    updates: { name?: string; description?: string }
  ): Promise<Collection | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    return this.commitOrRollback(tx, async () => {
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
      existing.meta = this.touchMeta(existing.meta);
      this.ensureId(existing);
      await store.put(existing);
      return existing;
    });
  }

  async duplicateCollection(id: CollectionId): Promise<Collection | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["collections", "folders", "requests"]);
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    return this.commitOrRollback(tx, async () => {
      const original = await collectionStore.get(id);
      if (!original) {
        return null;
      }

      const duplicate: Collection = {
        ...this.clone(original),
        id: this.randomId(),
        meta: this.createMeta(),
        name: `${original.name} copy`,
        order: await this.nextOrder(collectionStore.index("by-order")),
      };
      this.ensureId(duplicate);
      await collectionStore.add(duplicate);

      const folderIndex = folderStore.index("by-collectionId");
      const requestIndex = requestStore.index("by-collectionId");
      const sourceFolders = (await folderIndex.getAll(id)).sort((a, b) =>
        a.order - b.order || a.meta.id.localeCompare(b.meta.id)
      );
      const sourceRequests = (await requestIndex.getAll(id)).sort((a, b) =>
        a.order - b.order || a.meta.id.localeCompare(b.meta.id)
      );

      const folderIdMap = new Map<string, string>();
      const folderClones = sourceFolders.map((folder) => {
        const clone: Folder = {
          ...this.clone(folder),
          id: this.randomId(),
          meta: this.createMeta(),
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
          ...this.clone(request),
          id: this.randomId(),
          meta: this.createMeta(),
          collectionId: duplicate.meta.id,
          order: request.order,
          folderId: request.folderId
            ? folderIdMap.get(request.folderId)
            : undefined,
        };
        await requestStore.add(clone);
      }

      return duplicate;
    });
  }

  async deleteCollection(id: CollectionId): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["collections", "folders", "requests"]);
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    await this.commitOrRollback(tx, async () => {
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
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["collections"]);
    const store = tx.objectStore("collections");
    await this.commitOrRollback(tx, async () => {
      for (const entry of order) {
        const doc = await store.get(entry.id);
        if (!doc) {
          continue;
        }
        doc.order = entry.order;
        doc.meta = this.touchMeta(doc.meta);
        await store.put(doc);
      }
    });
  }

  async getCollectionExport(id: CollectionId): Promise<CollectionExport | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadonly(["collections", "folders", "requests"]);
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
      collection: this.ensureId(collection),
      folders: this.ensureIds(folders),
      requests: this.ensureIds(requests),
    };
  }

  async importCollectionExport(
    payload: CollectionExport,
    options?: { duplicateAsNew?: boolean }
  ): Promise<Collection | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["collections", "folders", "requests"]);
    const collectionStore = tx.objectStore("collections");
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    return this.commitOrRollback(tx, async () => {
      const data = this.clone(payload);
      this.ensureId(data.collection);
      data.folders = this.ensureIds(data.folders ?? []);
      data.requests = this.ensureIds(data.requests ?? []);
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
        this.ensureId(folder);
        await folderStore.put(folder);
      }
      for (const request of data.requests) {
        request.collectionId = collectionId;
        if (
          request.folderId &&
          !data.folders.some(
            (folder) =>
              folder.meta.id === request.folderId || folder.id === request.folderId
          )
        ) {
          request.folderId = undefined;
        }
        this.ensureId(request);
        await requestStore.put(request);
      }
      return data.collection;
    });
  }

  async listFolders(collectionId: CollectionId): Promise<Folder[]> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadonly(["folders"]);
    const index = tx.objectStore("folders").index("by-collectionId");
    const items = await index.getAll(collectionId);
    await tx.done;
    const sorted = items.sort((a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id));
    return this.ensureIds(sorted);
  }

  async createFolder(payload: {
    collectionId: CollectionId;
    name: string;
    parentFolderId?: FolderId;
    order?: number;
  }): Promise<Folder> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["folders"]);
    const store = tx.objectStore("folders");
    return this.commitOrRollback(tx, async () => {
      const meta = this.createMeta();
      const doc: Folder = {
        id: meta.id,
        meta,
        collectionId: payload.collectionId,
        parentFolderId: payload.parentFolderId,
        name: payload.name.trim(),
        order:
          payload.order ?? (await this.nextOrder(store.index("by-order"))),
      };
      this.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async renameFolder(id: FolderId, name: string): Promise<Folder | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["folders"]);
    const store = tx.objectStore("folders");
    return this.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      doc.name = name.trim();
      doc.meta = this.touchMeta(doc.meta);
      this.ensureId(doc);
      await store.put(doc);
      return doc;
    });
  }

  async duplicateFolder(id: FolderId): Promise<Folder | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["folders", "requests"]);
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    return this.commitOrRollback(tx, async () => {
      const original = await folderStore.get(id);
      if (!original) {
        return null;
      }
      const meta = this.createMeta();
      const clone: Folder = {
        ...this.clone(original),
        id: meta.id,
        meta,
        name: `${original.name} copy`,
        order: await this.nextOrder(folderStore.index("by-order")),
      };
      this.ensureId(clone);
      await folderStore.add(clone);

      const requestIndex = requestStore.index("by-folderId");
      const requests = await requestIndex.getAll(original.meta.id);
      for (const request of requests) {
        const reqMeta = this.createMeta();
        const copy: RequestDoc = {
          ...this.clone(request),
          id: reqMeta.id,
          meta: reqMeta,
          folderId: clone.meta.id,
          collectionId: original.collectionId,
          order: await this.nextOrder(requestStore.index("by-order")),
        };
        this.ensureId(copy);
        await requestStore.add(copy);
      }
      return clone;
    });
  }

  async deleteFolder(id: FolderId): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["folders", "requests"]);
    const folderStore = tx.objectStore("folders");
    const requestStore = tx.objectStore("requests");

    await this.commitOrRollback(tx, async () => {
      await folderStore.delete(id);
      const requestIndex = requestStore.index("by-folderId");
      const requests = await requestIndex.getAll(id);
      await Promise.all(requests.map((request) => requestStore.delete(request.meta.id)));
    });
  }

  async reorderFolders(order: { id: FolderId; order: number }[]): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["folders"]);
    const store = tx.objectStore("folders");
    await this.commitOrRollback(tx, async () => {
      for (const entry of order) {
        const doc = await store.get(entry.id);
        if (!doc) {
          continue;
        }
        doc.order = entry.order;
        doc.meta = this.touchMeta(doc.meta);
        await store.put(doc);
      }
    });
  }

  async listRequests(collectionId: CollectionId): Promise<RequestDoc[]> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadonly(["requests"]);
    const index = tx.objectStore("requests").index("by-collectionId");
    const items = await index.getAll(collectionId);
    await tx.done;
    const sorted = items.sort((a, b) => a.order - b.order || a.meta.id.localeCompare(b.meta.id));
    return this.ensureIds(sorted);
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
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    return this.commitOrRollback(tx, async () => {
      const meta = this.createMeta();
      const doc: RequestDoc = {
        id: meta.id,
        meta,
        collectionId: payload.collectionId,
        folderId: payload.folderId,
        name: payload.name.trim(),
        order:
          payload.order ?? (await this.nextOrder(store.index("by-order"))),
        method: payload.method,
        url: payload.url,
        headers: payload.headers ?? {},
        body: payload.body,
      };
      this.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async renameRequest(id: RequestDocId, name: string): Promise<RequestDoc | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    return this.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      doc.name = name.trim();
      doc.meta = this.touchMeta(doc.meta);
      this.ensureId(doc);
      await store.put(doc);
      return doc;
    });
  }

  async duplicateRequest(id: RequestDocId): Promise<RequestDoc | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    return this.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      const meta = this.createMeta();
      const clone: RequestDoc = {
        ...this.clone(doc),
        id: meta.id,
        meta,
        name: `${doc.name} copy`,
        order: await this.nextOrder(store.index("by-order")),
      };
      this.ensureId(clone);
      await store.add(clone);
      return clone;
    });
  }

  async deleteRequest(id: RequestDocId): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["requests"]);
    await this.commitOrRollback(tx, async () => {
      await tx.objectStore("requests").delete(id);
    });
  }

  async reorderRequests(order: { id: RequestDocId; order: number }[]): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["requests"]);
    const store = tx.objectStore("requests");
    await this.commitOrRollback(tx, async () => {
      for (const entry of order) {
        const doc = await store.get(entry.id);
        if (!doc) {
          continue;
        }
        doc.order = entry.order;
        doc.meta = this.touchMeta(doc.meta);
        await store.put(doc);
      }
    });
  }

  async listEnvironments(): Promise<EnvironmentDoc[]> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadonly(["environments"]);
    const index = tx.objectStore("environments").index("by-order");
    const items = await index.getAll();
    await tx.done;
    return this.ensureIds(items);
  }

  async createEnvironment(payload: {
    name: string;
    description?: string;
    vars?: Record<string, string>;
  }): Promise<EnvironmentDoc> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    return this.commitOrRollback(tx, async () => {
      const meta = this.createMeta();
      const doc: EnvironmentDoc = {
        id: meta.id,
        meta,
        name: payload.name.trim(),
        description: payload.description?.trim() || undefined,
        vars: payload.vars ?? {},
        order: await this.nextOrder(store.index("by-order")),
      };
      this.ensureId(doc);
      await store.add(doc);
      return doc;
    });
  }

  async updateEnvironment(
    id: EnvironmentId,
    updates: Partial<Pick<EnvironmentDoc, "name" | "description" | "vars">>
  ): Promise<EnvironmentDoc | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    return this.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      if (updates.name !== undefined) {
        doc.name = updates.name.trim();
      }
      if (updates.description !== undefined) {
        doc.description = updates.description.trim() || undefined;
      }
      if (updates.vars !== undefined) {
        doc.vars = { ...updates.vars };
      }
      doc.meta = this.touchMeta(doc.meta);
      this.ensureId(doc);
      await store.put(doc);
      return doc;
    });
  }

  async duplicateEnvironment(id: EnvironmentId): Promise<EnvironmentDoc | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    return this.commitOrRollback(tx, async () => {
      const doc = await store.get(id);
      if (!doc) {
        return null;
      }
      const meta = this.createMeta();
      const clone: EnvironmentDoc = {
        ...this.clone(doc),
        id: meta.id,
        meta,
        name: `${doc.name} copy`,
        order: await this.nextOrder(store.index("by-order")),
      };
      this.ensureId(clone);
      await store.add(clone);
      return clone;
    });
  }

  async deleteEnvironment(id: EnvironmentId): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["environments"]);
    await this.commitOrRollback(tx, async () => {
      await tx.objectStore("environments").delete(id);
    });

    const meta = await this.getMetaState();
    if (meta.activeEnvironmentId === id) {
      await this.setActiveEnvironment(null);
    }
  }

  async reorderEnvironments(order: { id: EnvironmentId; order: number }[]): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["environments"]);
    const store = tx.objectStore("environments");
    await this.commitOrRollback(tx, async () => {
      for (const entry of order) {
        const doc = await store.get(entry.id);
        if (!doc) {
          continue;
        }
        doc.order = entry.order;
        doc.meta = this.touchMeta(doc.meta);
        await store.put(doc);
      }
    });
  }

  async getActiveEnvironmentId(): Promise<EnvironmentId | null> {
    await this.ensurePersistentSupport();
    const meta = await this.getMetaState();
    return meta.activeEnvironmentId ?? null;
  }

  async setActiveEnvironment(id: EnvironmentId | null): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["meta"]);
    const store = tx.objectStore("meta");
    await this.commitOrRollback(tx, async () => {
      const state = (await store.get(META_STATE_KEY)) ?? {
        key: META_STATE_KEY,
        schemaVersion: DEFAULT_SCHEMA_VERSION,
        activeEnvironmentId: null,
      };
      state.activeEnvironmentId = id;
      await store.put(state);
    });
  }

  async writeCipher(params: {
    id: SecretId;
    name: string;
    environmentId?: EnvironmentId;
    envelope: SecretEnvelope;
  }): Promise<void> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadWrite(["secrets"]);
    const store = tx.objectStore("secrets");
    await this.commitOrRollback(tx, async () => {
      const doc: SecretDoc = {
        id: params.id,
        meta: this.createMetaWithId(params.id),
        name: params.name,
        environmentId: params.environmentId,
        envelope: params.envelope,
      };
      this.ensureId(doc as unknown as { meta: Meta; id?: string });
      await store.put(doc);
    });
  }

  async readCipher(id: SecretId): Promise<SecretEnvelope | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadonly(["secrets"]);
    const doc = await tx.objectStore("secrets").get(id);
    await tx.done;
    return doc?.envelope ?? null;
  }

  async peekSecretEnvelope(): Promise<SecretEnvelope | null> {
    await this.ensurePersistentSupport();
    const tx = await this.txReadonly(["secrets"]);
    const store = tx.objectStore("secrets");
    const cursor = await store.openCursor();
    const envelope = cursor?.value?.envelope ?? null;
    await tx.done;
    return envelope;
  }

  async txReadWrite(
    storeNames: StoreName[]
  ): Promise<IDBPTransaction<ApiSandboxDB, StoreCollection, "readwrite">> {
    return (await this.openTransaction(storeNames as StoreCollection, "readwrite")) as IDBPTransaction<
      ApiSandboxDB,
      StoreCollection,
      "readwrite"
    >;
  }

  private async txReadonly(
    storeNames: StoreName[]
  ): Promise<IDBPTransaction<ApiSandboxDB, StoreCollection, "readonly">> {
    return (await this.openTransaction(storeNames as StoreCollection, "readonly")) as IDBPTransaction<
      ApiSandboxDB,
      StoreCollection,
      "readonly"
    >;
  }

  private async openTransaction(
    storeNames: StoreCollection,
    mode: IDBTransactionMode
  ): Promise<IDBPTransaction<ApiSandboxDB, StoreCollection, IDBTransactionMode>> {
    const db = await this.getDatabase();
    if (!db) {
      throw new Error("Database unavailable");
    }
    return db.transaction(storeNames, mode);
  }

  private async commitOrRollback<T>(
    tx: IDBPTransaction<ApiSandboxDB, StoreCollection, "readwrite">,
    work: () => Promise<T>
  ): Promise<T> {
    try {
      const result = await work();
      await tx.done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // ignore secondary failures
      }
      throw error;
    }
  }

  /* istanbul ignore next -- helper invoked only during IndexedDB migrations */
  private async ensureFields(
    store: IDBPObjectStore<any, any, any, "versionchange">,
    defaults: Record<string, unknown>
  ): Promise<void> {
    let cursor: IDBPCursorWithValue<any, any, any, any, "versionchange"> | null =
      await store.openCursor();
    while (cursor) {
      const value = { ...cursor.value } as HistoryRecord;
      let updated = false;

      const mutableValue = value as unknown as Record<string, unknown>;

      Object.entries(defaults).forEach(([field, defaultValue]) => {
        if (!(field in mutableValue)) {
          mutableValue[field] = defaultValue;
          updated = true;
        }
      });

      if (updated) {
        await cursor.update(value);
      }

      cursor = await cursor.continue();
    }
  }

  private async getDatabase(): Promise<IDBPDatabase<ApiSandboxDB> | null> {
    await this.init();

    if (this.useMemoryFallback) {
      return null;
    }

    try {
      return await this.dbPromise!;
    } catch (error) {
      this.logError(
        "Failed to resolve database instance. Switching to in-memory store.",
        error
      );
      this.enableMemoryFallback();
      return null;
    }
  }

  private async handleUpgrade(
    db: IDBPDatabase<ApiSandboxDB>,
    oldVersion: number,
    _newVersion: number | null,
    transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
  ): Promise<void> {
    await this.ensureHistoryStore(db, transaction, oldVersion);
    this.ensureCollectionsStore(db, transaction);
    this.ensureFoldersStore(db, transaction);
    this.ensureRequestsStore(db, transaction);
    this.ensureEnvironmentsStore(db, transaction);
    this.ensureSecretsStore(db, transaction);
    this.ensureMetaStore(db);

    if (oldVersion < DB_VERSION) {
      await this.migrateV1toV2();
    }
  }

  private async ensureHistoryStore(
    db: IDBPDatabase<ApiSandboxDB>,
    transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">,
    oldVersion: number
  ): Promise<void> {
    let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "history", "versionchange">;
    if (!db.objectStoreNames.contains("history")) {
      store = db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
      this.ensureIndex(store, "by-createdAt", "createdAt");
      this.ensureIndex(store, "by-url", "url");
      this.ensureIndex(store, "by-method", "method");
    } else {
      store = transaction.objectStore("history");
      this.ensureIndex(store, "by-createdAt", "createdAt");
      this.ensureIndex(store, "by-url", "url");
      this.ensureIndex(store, "by-method", "method");
    }

    const legacyStoreName = "pastRequests";
    const storeNames = Array.from(db.objectStoreNames as DOMStringList);
    if (storeNames.includes(legacyStoreName)) {
      const legacy = (transaction as IDBPTransaction<any, any, any>).objectStore(legacyStoreName);
      let cursor = await legacy.openCursor();
      while (cursor) {
        await store.put(cursor.value as HistoryRecord);
        cursor = await cursor.continue();
      }
      (db as IDBPDatabase<any>).deleteObjectStore(legacyStoreName);
    }

    if (oldVersion < 3) {
      await this.ensureFields(store, { error: undefined, method: "GET" });
    }
  }

  private ensureCollectionsStore(
    db: IDBPDatabase<ApiSandboxDB>,
    transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
  ): void {
    let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "collections", IDBTransactionMode>;
    if (!db.objectStoreNames.contains("collections")) {
      store = db.createObjectStore("collections", { keyPath: "meta.id" });
      this.ensureIndex(store, "by-order", "order");
      this.ensureIndex(store, "by-name", "name", { unique: false });
    } else {
      store = transaction.objectStore("collections");
      this.ensureIndex(store, "by-order", "order");
      this.ensureIndex(store, "by-name", "name", { unique: false });
    }
  }

  private ensureFoldersStore(
    db: IDBPDatabase<ApiSandboxDB>,
    transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
  ): void {
    let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "folders", IDBTransactionMode>;
    if (!db.objectStoreNames.contains("folders")) {
      store = db.createObjectStore("folders", { keyPath: "meta.id" });
      this.ensureIndex(store, "by-collectionId", "collectionId");
      this.ensureIndex(store, "by-parentFolderId", "parentFolderId", { unique: false });
      this.ensureIndex(store, "by-order", "order");
    } else {
      store = transaction.objectStore("folders");
      this.ensureIndex(store, "by-collectionId", "collectionId");
      this.ensureIndex(store, "by-parentFolderId", "parentFolderId", { unique: false });
      this.ensureIndex(store, "by-order", "order");
    }
  }

  private ensureRequestsStore(
    db: IDBPDatabase<ApiSandboxDB>,
    transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
  ): void {
    let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "requests", IDBTransactionMode>;
    if (!db.objectStoreNames.contains("requests")) {
      store = db.createObjectStore("requests", { keyPath: "meta.id" });
      this.ensureIndex(store, "by-collectionId", "collectionId");
      this.ensureIndex(store, "by-folderId", "folderId", { unique: false });
      this.ensureIndex(store, "by-order", "order");
    } else {
      store = transaction.objectStore("requests");
      this.ensureIndex(store, "by-collectionId", "collectionId");
      this.ensureIndex(store, "by-folderId", "folderId", { unique: false });
      this.ensureIndex(store, "by-order", "order");
    }
  }

  private ensureEnvironmentsStore(
    db: IDBPDatabase<ApiSandboxDB>,
    transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
  ): void {
    let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "environments", IDBTransactionMode>;
    if (!db.objectStoreNames.contains("environments")) {
      store = db.createObjectStore("environments", { keyPath: "meta.id" });
      this.ensureIndex(store, "by-name", "name", { unique: false });
      this.ensureIndex(store, "by-order", "order");
    } else {
      store = transaction.objectStore("environments");
      this.ensureIndex(store, "by-name", "name", { unique: false });
      this.ensureIndex(store, "by-order", "order");
    }
  }

  private ensureSecretsStore(
    db: IDBPDatabase<ApiSandboxDB>,
    transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
  ): void {
    let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "secrets", IDBTransactionMode>;
    if (!db.objectStoreNames.contains("secrets")) {
      store = db.createObjectStore("secrets", { keyPath: "meta.id" });
      this.ensureIndex(store, "by-environmentId", "environmentId", { unique: false });
      this.ensureIndex(store, "by-name", "name", { unique: false });
    } else {
      store = transaction.objectStore("secrets");
      this.ensureIndex(store, "by-environmentId", "environmentId", { unique: false });
      this.ensureIndex(store, "by-name", "name", { unique: false });
    }
  }

  private ensureMetaStore(db: IDBPDatabase<ApiSandboxDB>): void {
    if (!db.objectStoreNames.contains("meta")) {
      db.createObjectStore("meta", { keyPath: "key" });
    }
  }

  private async ensureMetaDocument(): Promise<void> {
    if (this.useMemoryFallback || !this.dbPromise) {
      return;
    }
    const db = await this.dbPromise;
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    const existing = await store.get(META_STATE_KEY);
    if (!existing) {
      await store.add({
        key: META_STATE_KEY,
        schemaVersion: DEFAULT_SCHEMA_VERSION,
        activeEnvironmentId: null,
      } satisfies MetaState);
    }
    await tx.done;
  }

  private ensureIndex(
    store: IDBPObjectStore<any, any, any, "versionchange">,
    name: string,
    keyPath: string | string[],
    options?: IDBIndexParameters
  ): void {
    const indexNames = store.indexNames as DOMStringList;
    if (!indexNames.contains(name)) {
      store.createIndex(name, keyPath, options);
    }
  }

  private createMeta(): Meta {
    const now = Date.now();
    return {
      id: this.randomId(),
      createdAt: now,
      updatedAt: now,
      version: META_VERSION,
    };
  }

  private createMetaWithId(id: string): Meta {
    const meta = this.createMeta();
    return { ...meta, id };
  }

  private touchMeta(meta: Meta): Meta {
    return {
      ...meta,
      updatedAt: Date.now(),
    };
  }

  private randomId(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  private async nextOrder(
    index: IDBPIndex<any, any, any, any, any>
  ): Promise<number> {
    const cursor = await index.openCursor(null, "prev");
    if (!cursor) {
      return 1;
    }
    const value = cursor.value as { order?: number };
    return (value?.order ?? 0) + 1;
  }

  private async getMetaState(): Promise<MetaState> {
    const db = await this.getDatabase();
    if (!db) {
      return {
        key: META_STATE_KEY,
        schemaVersion: DEFAULT_SCHEMA_VERSION,
        activeEnvironmentId: null,
      };
    }
    const tx = db.transaction("meta", "readonly");
    const state = (await tx.store.get(META_STATE_KEY)) ?? {
      key: META_STATE_KEY,
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      activeEnvironmentId: null,
    };
    await tx.done;
    return state;
  }

  private async migrateV1toV2(): Promise<void> {
    // Scaffold for forward migrations. No-op for now.
  }

  async resetDatabase(): Promise<void> {
    if (this.dbPromise) {
      try {
        const db = await this.dbPromise;
        db.close();
      } catch {
        // ignore
      }
    }

    if (typeof indexedDB !== "undefined") {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("Failed to delete database"));
        request.onblocked = () => resolve();
      }).catch(() => undefined);
    }

    this.dbPromise = undefined;
    this.initialized = false;
    this.useMemoryFallback = false;
    this.memoryStore = [];
    this.memorySequence = 1;
  }

  private async ensurePersistentSupport(): Promise<void> {
    await this.init();
    if (this.useMemoryFallback) {
      throw new Error("Persistent storage is not available in this environment.");
    }
  }

  private enableMemoryFallback(): void {
    this.useMemoryFallback = true;
    this.initialized = true;
    this.dbPromise = undefined;
    this.memoryStore.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const maxId = this.memoryStore.reduce(
      (max, item) => Math.max(max, item.id ?? 0),
      0
    );
    this.memorySequence = maxId + 1;
  }

  private sortMemoryStore(): void {
    this.memoryStore.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  private clone<T>(value: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private ensureId<T extends { meta: Meta; id?: string }>(doc: T): T {
    if (!doc.id) {
      (doc as T & { id: string }).id = doc.meta.id;
    }
    return doc;
  }

  private ensureIds<T extends { meta: Meta; id?: string }>(docs: T[]): T[] {
    docs.forEach((doc) => this.ensureId(doc));
    return docs;
  }

  private logError(message: string, error?: unknown): void {
    if (error) {
      console.error(`[IDB] ${message}`, error);
    } else {
      console.warn(`[IDB] ${message}`);
    }
  }
}
