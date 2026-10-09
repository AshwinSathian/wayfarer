import { Injectable, signal } from "@angular/core";
import { IDBPDatabase, IDBPTransaction, openDB } from "idb";
import { Meta, META_VERSION } from "../models/collections";
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
import { recordDiagnostic } from "../services/diagnostics";
import { newId } from "@wayfarer/core";

export type { HistoryRecord, StoreName, StoreCollection, MetaState, ApiSandboxDB } from "./idb-schema";
export { META_STATE_KEY } from "./idb-schema";

const LIFECYCLE_CHANNEL = "wayfarer:lifecycle";
const RESET_GRACE_MS = 2000;

interface LifecycleMessage {
  type: "close";
}

/** Reset All Data could not delete the database because another tab still has it open. */
export class DatabaseResetBlockedError extends Error {
  override readonly name = "DatabaseResetBlockedError";

  constructor() {
    super("Close other Wayfarer tabs and try again.");
  }
}

/**
 * Owns everything that's shared across the per-aggregate repositories
 * (HistoryRepository, CollectionsRepository, EnvironmentsRepository,
 * SecretsRepository): the single IndexedDB connection and its
 * open/upgrade/fallback lifecycle, transaction helpers, and the id/meta
 * bookkeeping every store needs. None of this is aggregate-specific, which
 * is exactly why it used to make Idb a 1,300+ line god object —
 * every repository injects this instead of duplicating connection logic.
 *
 * The actual object-store/index/migration definitions live in
 * idb-migrations.ts (this service just wires that in as its `upgrade`
 * callback), and the schema types live in idb-schema.ts — both extracted
 * so this file is left holding only the connection lifecycle itself.
 */
@Injectable({ providedIn: "root" })
export class IdbCore {
  private dbPromise?: Promise<IDBPDatabase<ApiSandboxDB>>;
  /**
   * Shared by concurrent `init()` callers. It used to be an `initialized`
   * flag set only after the open finished, so every caller that arrived
   * meanwhile opened its own connection (three per tab at startup). The
   * untracked ones were never closed and blocked Reset All Data forever (F37).
   */
  private initPromise?: Promise<void>;
  private resetting = false;

  /** True once another tab reset all data; the app shows a reload banner. */
  readonly closedByOtherTab = signal(false);

  /**
   * True when IndexedDB could not be opened (blocked storage, some private
   * windows): history lives in memory for this tab and nothing else can be
   * saved. The app says so in a banner instead of failing save by save.
   */
  readonly memoryOnly = signal(false);

  private readonly lifecycle =
    new BroadcastChannel(LIFECYCLE_CHANNEL);

  constructor() {
    this.lifecycle.addEventListener("message", (event: MessageEvent<LifecycleMessage>) => {
      if (event.data?.type === "close") {
        void this.closeForReset();
      }
    });
  }

  get useMemoryFallback(): boolean {
    return this.memoryOnly();
  }

  init(): Promise<void> {
    this.initPromise ??= this.open();
    return this.initPromise;
  }

  private async open(): Promise<void> {
    if (typeof indexedDB === "undefined") {
      this.logError(
        "indexedDB is not available in this environment. Falling back to in-memory store."
      );
      this.enableMemoryFallback();
      return;
    }

    try {
      this.dbPromise = openDB<ApiSandboxDB>(DB_NAME, DB_VERSION, {
        upgrade: (db, oldVersion, newVersion, transaction) => {
          // A failed migration aborts the whole upgrade: the database keeps
          // its old version and schema instead of a half-migrated one.
          runUpgrade(db, oldVersion, newVersion, transaction).catch((error: unknown) => {
            this.logError("Database upgrade failed; rolling back.", error);
            transaction.abort();
          });
        },
        // Another tab is deleting (or upgrading) the database; holding the
        // connection would block it.
        blocking: () => void this.closeForReset(),
      });

      await this.dbPromise;
      await this.ensureMetaDocument();
    } catch (error) {
      this.logError(
        "Failed to open IndexedDB. Falling back to in-memory store.",
        error
      );
      this.enableMemoryFallback();
    }
  }

  async getDatabase(): Promise<IDBPDatabase<ApiSandboxDB> | null> {
    if (this.closedByOtherTab()) {
      // Reopening would recreate the database the other tab just deleted.
      throw new Error("Data was reset in another tab; reload this tab.");
    }
    if (this.resetting) {
      // Reopening now would block this tab's own delete.
      throw new Error("Data is being reset.");
    }
    await this.init();

    if (this.memoryOnly()) {
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
    if (this.memoryOnly()) {
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
      // Aborting rejects tx.done with an AbortError. The caller gets the
      // original error below, so that rejection is expected, not unhandled.
      tx.done.catch((doneError: unknown) => {
        if (!(doneError instanceof DOMException && doneError.name === "AbortError")) {
          recordDiagnostic(doneError, "idb: transaction failed after its work threw");
        }
      });
      try {
        tx.abort();
      } catch (abortError) {
        // InvalidStateError: the transaction already aborted or finished.
        if (!(abortError instanceof DOMException && abortError.name === "InvalidStateError")) {
          recordDiagnostic(abortError, "idb: abort after a failed transaction");
        }
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

  /**
   * Deletes the whole database (Reset All Data). Resolves only once the
   * database is actually gone (F37):
   * 1. Other tabs are told to close their connection (BroadcastChannel,
   *    plus the `versionchange` event the delete itself fires).
   * 2. The delete gets 2 s for them to do so. `blocked` alone isn't
   *    failure: it also fires while a tab is still closing.
   * 3. If the database still isn't deleted, this throws
   *    DatabaseResetBlockedError.
   *
   * One delete request only: a second request would queue behind a blocked
   * one and never fire any event.
   *
   * ponytail: an IndexedDB delete request can't be cancelled. A blocked one
   * stays queued and completes when the blocking tab closes, so the data may
   * disappear after this has reported failure.
   */
  async resetDatabase(): Promise<void> {
    this.resetting = true;
    try {
      await this.closeConnection();
      if (typeof indexedDB !== "undefined") {
        this.lifecycle.postMessage({ type: "close" } satisfies LifecycleMessage);
        await this.deleteDatabase();
      }
    } finally {
      this.resetting = false;
    }
    this.memoryOnly.set(false);
  }

  private deleteDatabase(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      const deadline = setTimeout(() => reject(new DatabaseResetBlockedError()), RESET_GRACE_MS);
      request.onsuccess = () => {
        clearTimeout(deadline);
        resolve();
      };
      request.onerror = () => {
        clearTimeout(deadline);
        reject(request.error ?? new Error("Failed to delete database"));
      };
    });
  }

  private async closeConnection(): Promise<void> {
    const pending = this.dbPromise;
    this.dbPromise = undefined;
    this.initPromise = undefined;
    if (!pending) {
      return;
    }
    try {
      (await pending).close();
    } catch (error) {
      // The open had already failed, so there is no connection to close.
      this.logError("Closing a database connection that never opened.", error);
    }
  }

  /** Another tab reset the data: drop this tab's connection so its delete isn't blocked, and never reopen. */
  private async closeForReset(): Promise<void> {
    if (this.closedByOtherTab() || this.resetting) {
      return;
    }
    this.closedByOtherTab.set(true);
    await this.closeConnection();
  }

  createMeta(): Meta {
    const now = Date.now();
    return {
      id: newId(),
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

  async nextOrder(index: { openCursor: (range: null, direction: "prev") => Promise<{ value: unknown } | null> }): Promise<number> {
    const cursor = await index.openCursor(null, "prev");
    if (!cursor) {
      return 1;
    }
    const value = cursor.value as { order?: number };
    return (value?.order ?? 0) + 1;
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
    this.memoryOnly.set(true);
    this.initPromise ??= Promise.resolve();
    this.dbPromise = undefined;
  }

  private async ensureMetaDocument(): Promise<void> {
    if (this.memoryOnly() || !this.dbPromise) {
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
