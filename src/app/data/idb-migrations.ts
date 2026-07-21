import { IDBPCursorWithValue, IDBPDatabase, IDBPObjectStore, IDBPTransaction } from "idb";
import { ApiSandboxDB, DB_VERSION, HistoryRecord, StoreCollection } from "./idb-schema";

/**
 * Object-store creation + index/upgrade logic for `IdbCoreService`'s
 * `openDB(...).upgrade` callback. Split out from the service itself because
 * none of this needs the service's own connection/transaction-helper state —
 * it's a pure (if IndexedDB-native-API-heavy) function of
 * `(db, oldVersion, newVersion, transaction)`.
 */

/* istanbul ignore next -- helper invoked only during IndexedDB migrations */
async function ensureFields(
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

function ensureIndex(
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

async function ensureHistoryStore(
  db: IDBPDatabase<ApiSandboxDB>,
  transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">,
  oldVersion: number
): Promise<void> {
  let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "history", "versionchange">;
  if (!db.objectStoreNames.contains("history")) {
    store = db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
    ensureIndex(store, "by-createdAt", "createdAt");
    ensureIndex(store, "by-url", "url");
    ensureIndex(store, "by-method", "method");
  } else {
    store = transaction.objectStore("history");
    ensureIndex(store, "by-createdAt", "createdAt");
    ensureIndex(store, "by-url", "url");
    ensureIndex(store, "by-method", "method");
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
    await ensureFields(store, { error: undefined, method: "GET" });
  }
}

function ensureCollectionsStore(
  db: IDBPDatabase<ApiSandboxDB>,
  transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
): void {
  let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "collections", "versionchange">;
  if (!db.objectStoreNames.contains("collections")) {
    store = db.createObjectStore("collections", { keyPath: "meta.id" });
    ensureIndex(store, "by-order", "order");
    ensureIndex(store, "by-name", "name", { unique: false });
  } else {
    store = transaction.objectStore("collections");
    ensureIndex(store, "by-order", "order");
    ensureIndex(store, "by-name", "name", { unique: false });
  }
}

function ensureFoldersStore(
  db: IDBPDatabase<ApiSandboxDB>,
  transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
): void {
  let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "folders", "versionchange">;
  if (!db.objectStoreNames.contains("folders")) {
    store = db.createObjectStore("folders", { keyPath: "meta.id" });
    ensureIndex(store, "by-collectionId", "collectionId");
    ensureIndex(store, "by-parentFolderId", "parentFolderId", { unique: false });
    ensureIndex(store, "by-order", "order");
  } else {
    store = transaction.objectStore("folders");
    ensureIndex(store, "by-collectionId", "collectionId");
    ensureIndex(store, "by-parentFolderId", "parentFolderId", { unique: false });
    ensureIndex(store, "by-order", "order");
  }
}

function ensureRequestsStore(
  db: IDBPDatabase<ApiSandboxDB>,
  transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
): void {
  let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "requests", "versionchange">;
  if (!db.objectStoreNames.contains("requests")) {
    store = db.createObjectStore("requests", { keyPath: "meta.id" });
    ensureIndex(store, "by-collectionId", "collectionId");
    ensureIndex(store, "by-folderId", "folderId", { unique: false });
    ensureIndex(store, "by-order", "order");
  } else {
    store = transaction.objectStore("requests");
    ensureIndex(store, "by-collectionId", "collectionId");
    ensureIndex(store, "by-folderId", "folderId", { unique: false });
    ensureIndex(store, "by-order", "order");
  }
}

function ensureEnvironmentsStore(
  db: IDBPDatabase<ApiSandboxDB>,
  transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
): void {
  let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "environments", "versionchange">;
  if (!db.objectStoreNames.contains("environments")) {
    store = db.createObjectStore("environments", { keyPath: "meta.id" });
    ensureIndex(store, "by-name", "name", { unique: false });
    ensureIndex(store, "by-order", "order");
  } else {
    store = transaction.objectStore("environments");
    ensureIndex(store, "by-name", "name", { unique: false });
    ensureIndex(store, "by-order", "order");
  }
}

function ensureSecretsStore(
  db: IDBPDatabase<ApiSandboxDB>,
  transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
): void {
  let store: IDBPObjectStore<ApiSandboxDB, StoreCollection, "secrets", "versionchange">;
  if (!db.objectStoreNames.contains("secrets")) {
    store = db.createObjectStore("secrets", { keyPath: "meta.id" });
    ensureIndex(store, "by-environmentId", "environmentId", { unique: false });
    ensureIndex(store, "by-name", "name", { unique: false });
  } else {
    store = transaction.objectStore("secrets");
    ensureIndex(store, "by-environmentId", "environmentId", { unique: false });
    ensureIndex(store, "by-name", "name", { unique: false });
  }
}

function ensureMetaStore(db: IDBPDatabase<ApiSandboxDB>): void {
  if (!db.objectStoreNames.contains("meta")) {
    db.createObjectStore("meta", { keyPath: "key" });
  }
}

/** Scaffold for forward migrations beyond the current DB_VERSION. No-op today. */
async function migrateV1toV2(): Promise<void> {
  // Scaffold for forward migrations. No-op for now.
}

/** The full `openDB(...).upgrade` handler — creates/updates every object store and index, then runs any versioned data migrations. */
export async function runUpgrade(
  db: IDBPDatabase<ApiSandboxDB>,
  oldVersion: number,
  _newVersion: number | null,
  transaction: IDBPTransaction<ApiSandboxDB, StoreCollection, "versionchange">
): Promise<void> {
  await ensureHistoryStore(db, transaction, oldVersion);
  ensureCollectionsStore(db, transaction);
  ensureFoldersStore(db, transaction);
  ensureRequestsStore(db, transaction);
  ensureEnvironmentsStore(db, transaction);
  ensureSecretsStore(db, transaction);
  ensureMetaStore(db);

  if (oldVersion < DB_VERSION) {
    await migrateV1toV2();
  }
}
