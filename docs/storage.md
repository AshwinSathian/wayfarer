# Storage Layout

Wayfarer keeps everything in one IndexedDB database. The schema version is **5** (`DB_VERSION` in `src/app/data/idb-schema.ts`); the stores are created by `runUpgrade` in `src/app/data/idb-migrations.ts`.

> The database's name, `api-sandbox`, is the project's first name. It is never shown and is kept as it is.

| Store          | Key path    | Indexes                                             | Holds                                                     |
|----------------|-------------|-----------------------------------------------------|-----------------------------------------------------------|
| `history`      | `id` (auto) | `by-createdAt`, `by-url`, `by-method`               | Requests as they were sent, with status and duration.     |
| `collections`  | `meta.id`   | `by-order`, `by-name`                               | Collections: name, order, and whether their scripts are trusted. |
| `folders`      | `meta.id`   | `by-collectionId`, `by-parentFolderId`, `by-order`  | The folder tree under each collection.                    |
| `requests`     | `meta.id`   | `by-collectionId`, `by-folderId`, `by-order`        | Saved requests (see [Collections schema](collections-schema.md)). |
| `environments` | `meta.id`   | `by-name`, `by-order`                               | Environments; variables are ordered rows.                 |
| `secrets`      | `meta.id`   | `by-environmentId`, `by-name`                       | Encrypted secret envelopes only (no plaintext).           |
| `meta`         | `key`       | —                                                   | App state: the active environment.                        |

## Version 5 starts empty

Version 5 does not read what versions 1 to 4 stored. When it opens a database an earlier version left, it deletes that database's stores and creates its own, in one upgrade transaction: either all of it happens or the database is still the old one. The page then says, once, that the earlier data was removed. There is no conversion and no backup copy. This was decided on 2026-10-09, while the app had no users with data to keep.

Collection and environment files written before version 5 (they have no `$id`) are not imported either.

## When versions meet

- **Another tab is running an older build and keeps the database open.** The update cannot start until that tab is closed. The page says "Close other Wayfarer tabs to finish the update" and finishes by itself when they are gone. Nothing is saved meanwhile.
- **Another tab updates the database to a newer version.** This tab closes its connection, so the update is not held up, stops saving, and says "Wayfarer was updated in another tab — reload".
- **The database is from a newer version than this tab's code** (a stale cached page, a rollback). The database is not opened and not changed. The page says "This tab is running an older Wayfarer … reload".

## Transactions and helpers

`Idb` is the one entry to the stores; each kind of document has its own repository behind it.

* `txReadWrite` and `txReadonly` open a transaction over the stores named.
* `commitOrRollback` wraps a write so that a reorder, an import or a duplication is all or nothing.

## Resetting

`IdbCore.resetDatabase()` closes this tab's connection, tells other tabs to close theirs (BroadcastChannel `wayfarer:lifecycle`, plus the `versionchange` event the delete fires), and deletes the database. If the database is still not deleted 2 s later (a tab that ignores the request, for example one running a build from before v1.1.0), it fails with "Close other Wayfarer tabs and try again". The UI exposes this via **Settings → Reset all data**. Only after a successful delete does it clear app-specific `localStorage`/`sessionStorage` keys and reload. Other tabs close their connection, stop saving, and show "Data was reset in another tab — reload".

A blocked delete request can't be cancelled: it stays queued and completes when the blocking tab closes, so the data may still disappear after the reset reported failure.
