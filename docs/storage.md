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

`IdbCoreService.resetDatabase()` closes this tab's connection, tells other tabs to close theirs (BroadcastChannel `wayfarer:lifecycle`, plus the `versionchange` event the delete fires), and deletes the database. If the database is still not deleted 2 s later (a tab that ignores the request, for example one running a build from before v1.1.0), it fails with "Close other Wayfarer tabs and try again". The UI exposes this via **Settings → Reset all data**. Only after a successful delete does it clear app-specific `localStorage`/`sessionStorage` keys and reload. Other tabs close their connection, stop saving, and show "Data was reset in another tab — reload".

A blocked delete request can't be cancelled: it stays queued and completes when the blocking tab closes, so the data may still disappear after the reset reported failure.
