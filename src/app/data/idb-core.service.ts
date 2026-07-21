import { Injectable } from "@angular/core";
import { IDBPDatabase, IDBPTransaction, openDB } from "idb";
import { Meta, META_VERSION } from "../models/collections.models";
import {
  ApiSandboxDB,
  DB_NAME,
  DB_VERSION,
  DEFAULT_SCHEMA_VERSION,
  MetaState,
  META_STATE_KEY,
  StoreCollection,
  StoreName,
} from "./idb-schema";
import { runUpgrade } from "./idb-migrations";

export type { HistoryRecord, StoreName, StoreCollection, MetaState, ApiSandboxDB } from "./idb-schema";
export { META_STATE_KEY } from "./idb-schema";

/**
 * Owns everything that's shared across the per-aggregate repositories
 * (HistoryRepository, CollectionsRepository, EnvironmentsRepository,
 * SecretsRepository): the single IndexedDB connection and its
 * open/upgrade/fallback lifecycle, transaction helpers, and the id/meta
 * bookkeeping every store needs. None of this is aggregate-specific, which
 * is exactly why it used to make IdbService a 1,300+ line god object —
 * every repository injects this instead of duplicating connection logic.
 *
 * The actual object-store/index/migration definitions live in
 * idb-migrations.ts (this service just wires that in as its `upgrade`
 * callback), and the schema types live in idb-schema.ts — both extracted
 * so this file is left holding only the connection lifecycle itself.
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
          runUpgrade(db, oldVersion, newVersion, transaction),
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
}
