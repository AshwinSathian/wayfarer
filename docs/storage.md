# Storage Layout

Wayfarer persists everything in a single IndexedDB database. Version upgrades live inside `src/app/data/idb-core.service.ts`; the current schema version is **4** and includes the following stores:

> The database's internal name (`api-sandbox`) is a preserved historical identifier from before the project's rename to Wayfarer. It's never shown to users and renaming it would require a lossy copy-and-migrate of every existing user's local data for zero functional benefit, so it's left as-is by design.

| Store        | Key path   | Indexes                                | Purpose                                           |
|--------------|------------|----------------------------------------|---------------------------------------------------|
| `history`    | `id` (auto)| `by-createdAt`, `by-url`, `by-method`  | Past requests for the sidebar history.            |
| `collections`| `meta.id`  | `by-order`, `by-name`                  | Collection documents (name/order/meta).           |
| `folders`    | `meta.id`  | `by-collectionId`, `by-parentFolderId`, `by-order` | Folder tree under each collection.                |
| `requests`   | `meta.id`  | `by-collectionId`, `by-folderId`, `by-order`        | Request documents tied to collections/folders.    |
| `environments`| `meta.id` | `by-name`, `by-order`                  | Environment documents, including variables.       |
| `secrets`    | `meta.id`  | `by-environmentId`, `by-name`          | Encrypted secret envelopes only (no plaintext).   |
| `meta`       | `key`      | —                                      | App state such as `schemaVersion` and active env. |

## Transactions and Helpers

`IdbService` centralises IndexedDB access and exposes helpers:

* `txReadWrite/storeNames` and `txReadonly` ensure multi‑store transactions.
* `commitOrRollback` wraps write transactions so bulk operations (reorders, imports, duplications) remain atomic.
* High‑level CRUD for collections, folders, requests, environments, and secrets all live here, keeping the UI layers declarative.

## Migrations

Forward migrations hook into the upgrade callback and are staged through helpers such as `ensureCollectionsStore` and `ensureIndex`. A placeholder `migrateV1toV2()` is wired up and unit‑tested so future schema changes can slot in without surprises.

## Resetting

`IdbCoreService.resetDatabase()` closes any open connection, deletes the local database, and resets the internal state. The UI exposes this via **Reset All Data**, which also clears app-specific `localStorage`/`sessionStorage` keys and reloads the page, ensuring the next launch starts from a clean slate.
