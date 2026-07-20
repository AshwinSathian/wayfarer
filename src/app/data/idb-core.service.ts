import { Injectable } from "@angular/core";
import {
  DBSchema,
  IDBPCursorWithValue,
  IDBPDatabase,
  IDBPObjectStore,
  IDBPTransaction,
  openDB,
} from "idb";
import {
  Collection,
  CollectionId,
  Folder,
  FolderId,
  Meta,
  META_VERSION,
  RequestDoc,
  RequestDocId,
} from "../models/collections.models";
import { EnvironmentDoc, EnvironmentId } from "../models/environments.models";
import { PastRequest, PastRequestKey } from "../models/history.models";
import { SecretDoc, SecretId } from "../models/secrets.models";

export type HistoryRecord = PastRequest & { id: PastRequestKey };
export type StoreName =
  | "history"
  | "collections"
  | "folders"
  | "requests"
  | "environments"
  | "secrets"
  | "meta";
export type StoreCollection = ArrayLike<StoreName>;

export interface MetaState {
  key: typeof META_STATE_KEY;
  schemaVersion: number;
  activeEnvironmentId?: EnvironmentId | null;
}

export interface ApiSandboxDB extends DBSchema {
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

// Preserved historical identifier from the project's "API Sandbox" name — never
// shown to users, and renaming it would require a lossy copy-and-migrate of
// every existing user's local data for zero functional benefit. Left as-is
// intentionally; see docs/storage.md.
const DB_NAME = "api-sandbox";
const DB_VERSION = 4;
export const META_STATE_KEY = "state";
const DEFAULT_SCHEMA_VERSION = 1;

/**
 * Owns everything that's shared across the per-aggregate repositories
 * (HistoryRepository, CollectionsRepository, EnvironmentsRepository,
 * SecretsRepository): the single IndexedDB connection and its
 * open/upgrade/fallback lifecycle, schema migrations, transaction helpers,
 * and the id/meta bookkeeping every store needs. None of this is
 * aggregate-specific, which is exactly why it used to make IdbService a
 * 1,300+ line god object — every repository injects this instead of
 * duplicating connection/migration logic.
 */
@Injectable({ providedIn: "root" })
export class IdbCoreService {
  private dbPromise?: Promise<IDBPDatabase<ApiSandboxDB>>;
  private initialized = false;
  private _useMemoryFallback = false;

  get useMemoryFallback(): boolean {
    return this._useMemoryFallback;
  }

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

  async getDatabase(): Promise<IDBPDatabase<ApiSandboxDB> | null> {
    await this.init();

    if (this._useMemoryFallback) {
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

  async ensurePersistentSupport(): Promise<void> {
    await this.init();
    if (this._useMemoryFallback) {
      throw new Error("Persistent storage is not available in this environment.");
    }
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

  async txReadonly(
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

  async commitOrRollback<T>(
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

  async getMetaState(): Promise<MetaState> {
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
    this._useMemoryFallback = false;
  }

  createMeta(): Meta {
    const now = Date.now();
    return {
      id: this.randomId(),
      createdAt: now,
      updatedAt: now,
      version: META_VERSION,
    };
  }

  createMetaWithId(id: string): Meta {
    const meta = this.createMeta();
    return { ...meta, id };
  }

  touchMeta(meta: Meta): Meta {
    return {
      ...meta,
      updatedAt: Date.now(),
    };
  }

  randomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  async nextOrder(index: { openCursor: (range: null, direction: "prev") => Promise<{ value: unknown } | null> }): Promise<number> {
    const cursor = await index.openCursor(null, "prev");
    if (!cursor) {
      return 1;
    }
    const value = cursor.value as { order?: number };
    return (value?.order ?? 0) + 1;
  }

  clone<T>(value: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  ensureId<T extends { meta: Meta; id?: string }>(doc: T): T {
    if (!doc.id) {
      (doc as T & { id: string }).id = doc.meta.id;
    }
    return doc;
  }

  ensureIds<T extends { meta: Meta; id?: string }>(docs: T[]): T[] {
    docs.forEach((doc) => this.ensureId(doc));
    return docs;
  }

  logError(message: string, error?: unknown): void {
    if (error) {
      console.error(`[IDB] ${message}`, error);
    } else {
      console.warn(`[IDB] ${message}`);
    }
  }

  private enableMemoryFallback(): void {
    this._useMemoryFallback = true;
    this.initialized = true;
    this.dbPromise = undefined;
  }

  // ── Schema / migrations ──────────────────────────────────────────────

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
    if (this._useMemoryFallback || !this.dbPromise) {
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

  private async migrateV1toV2(): Promise<void> {
    // Scaffold for forward migrations. No-op for now.
  }
}
