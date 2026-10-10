# Storage Layout

Wayfarer keeps everything in one IndexedDB database. The schema version is **10** (`DB_VERSION` in `src/app/data/idb-schema.ts`); the stores are created by `runUpgrade` in `src/app/data/idb-migrations.ts`.

> The database's name, `api-sandbox`, is the project's first name. It is never shown and is kept as it is.

| Store          | Key path    | Indexes                                             | Holds                                                     |
|----------------|-------------|-----------------------------------------------------|-----------------------------------------------------------|
| `history`      | `id` (auto) | `by-createdAt`                                      | Exchanges: the request as composed, as sent, and the response, with credentials and vault secrets masked. See "History" below. |
| `collections`  | `meta.id`   | `by-order`, `by-name`                               | Collections: name, order, variables, the auth and the scripts they hold for their requests, and `scriptTrust`: whether the collection is trusted and the SHA-256 of each script approved in it. A collection stored before this field had the list is read as having approved nothing, so its scripts wait for a review once; nothing was removed and the database version did not change. |
| `folders`      | `meta.id`   | `by-collectionId`, `by-parentFolderId`, `by-order`  | The folder tree under each collection. A folder holds variables, auth and scripts for the requests in it. |
| `requests`     | `meta.id`   | `by-collectionId`, `by-folderId`, `by-order`        | Saved requests (see [Collections schema](collections-schema.md)). |
| `environments` | `meta.id`   | `by-name`, `by-order`                               | Environments; variables are ordered rows.                 |
| `secrets`      | `meta.id`   | `by-environmentId`, `by-name`                       | Encrypted secret envelopes only (no plaintext). See [Secrets vault](secrets.md). |
| `files`        | the file id | —                                                   | The files of multipart and binary request bodies: bytes and type. |
| `meta`         | `key`       | —                                                   | Three records: `state` (the active environment), `globals` (the global variables) and `vault` (how the passphrase key is derived, and the wrapped data key). |

## Version 5 starts empty

Version 5 does not read what versions 1 to 4 stored. When it opens a database an earlier version left, it deletes that database's stores and creates its own, in one upgrade transaction: either all of it happens or the database is still the old one. The page then says, once, that the earlier data was removed. There is no conversion and no backup copy. This was decided on 2026-10-09, while the app had no users with data to keep.

Collection and environment files written before version 5 (they have no `$id`) are not imported either.

Version 6 added the `files` store and changed nothing else: a version 5 database keeps its data.

Version 7 gave collections their variables. The global variables are a new record, `globals`, in `meta`; a database without it has none.

Version 8 changed how the vault encrypts (one data key, wrapped by the passphrase, where each secret had a key of its own). Secrets stored before it cannot be read with the new key and are **removed** by the upgrade; nothing else is touched. When there were any, the page says so once. An environment variable that referred to a removed secret still holds its `{{$secret.<id>}}` reference, and needs its value again. Like version 5, this was decided while the app had no users with data to keep.

Version 9 changed what history keeps (below). An entry of before held the headers as they were sent, `Authorization` included, so the upgrade **removes** history; nothing else is touched. When there was any, the page says so once.

## History

One entry per request sent:

| Field | Holds |
|---|---|
| `template` | The request as it was composed: `{{variables}}` not resolved. A credential typed by hand is `***`. |
| `sent` | Method, URL and headers as they went out, masked. `bodyPreview` is the text of a text body; of a form or a file, the field names, file names and sizes, never the bytes. |
| `response` | Status, headers and, for a text body, up to 1 MB of it, masked. A binary body is not kept: bytes cannot be searched for a secret. Absent when no response arrived. |
| `route`, `durationMs`, `error` | `direct` or `bridge`; milliseconds; the message of a failure. |

History keeps the newest 500 entries (Settings, "History size", 1 to 5000); the oldest are deleted in the transaction that writes a new one. "Keep response bodies in history" switches the bodies off. Opening an entry loads `template` into the composer and shows the recorded response. A file a body referred to may be gone by then (it is deleted when no saved request names it), and the composer says so when the request is sent.

Version 10 let a collection and a folder hold auth and scripts for the requests in them, a folder variables, and a request's auth be "inherit". The upgrade **removes** every collection, folder and saved request, and the body files only they named; environments, the globals, secrets and history are kept. When there was a collection, the page says so once. Collection and workspace files changed with it: they are format 3 (`wayfarer/collection/3`, `wayfarer/workspace/3`), and a format 2 file is refused; nothing converts it. Like versions 5, 8 and 9, this was decided while the app had no users with data to keep. (The step version 7 took, giving a stored collection its variables, is gone: there is no stored collection for it to act on.)

## Keeping the data

Everything above is in one browser profile, and a browser may delete it: when the disk runs low, or, in Safari, after seven days without a visit to a site that is not installed.

- **Asking the browser to keep it.** The first time you save a request or an environment, Wayfarer calls `navigator.storage.persist()`. Settings, "Storage in this browser", says what the browser answered and how much space is used. A browser that said no is asked again at the next save. In Safari the same place explains the seven-day rule and how to install the app, which lifts it.
- **Workspace backup.** Settings, "Back up", writes `wayfarer-workspace.json` (`"$id": "wayfarer/workspace/3"`): the `collections`, `folders`, `requests`, `environments`, `secrets` and `meta` stores as they are, and `history` when "With history" is ticked. Secrets are in it as stored, encrypted; the file opens the vault with the passphrase the vault had. The files of request bodies are not in it: a request names its file, as in a collection file.
- **Restore** replaces all of those stores with the file's, in one transaction, after a confirmation. Every record is checked first with the validators the single-store importers use, and a file that fails is refused whole with the reasons. Restored collections are marked untrusted, like any import. History is replaced only when the file has one. Stored body files are removed, since no restored request has its file here.
- **Reminder.** When the last backup, or the first use if there is none, is more than 14 days ago, the page says so. "Not now" puts it off for 14 days. The times are the `wayfarer:last-backup` and `wayfarer:backup-reminder-from` keys in `localStorage`.

## Environments file

Exporting environments asks what to write of protected variables:

| Choice | A protected variable is written as | The file also holds |
|---|---|---|
| Leave out (default) | an empty value | nothing about secrets |
| With the vault | its `{{$secret.<id>}}` reference | `vault`: a vault file (see [Secrets vault](secrets.md)), still encrypted |
| Plain text | the secret itself | nothing else. Needs the vault unlocked and `EXPORT SECRETS` typed |

A file "with the vault" imports as environments in the Environments panel and as a vault in Secrets, "Import vault", with the passphrase the vault had.

## Files

A file picked for a request body is kept in memory until the request is saved. Saving writes it to `files` in the same transaction as the request. A file is deleted when no saved request names it any more: when the request is deleted (alone, or with its folder or collection), when its body lets go of the file, or when an import replaces the request. A copy of a request names the same file, and the file stays until the last of them is gone. A file can be 50 MB at most.

## Two tabs

Every tab of the app uses the one database. After a write, the tab says which stores it touched on the BroadcastChannel `wayfarer:data`, and the other tabs read those stores again: a collection, an environment or a sent request made in one tab shows in the others without a reload. The request being composed is not replaced.

A change to an environment's variables is sent as the change (set this name, remove that one), and applied to the stored variables inside the transaction that writes them. So two tabs that each add a variable to the same environment both keep theirs. Replacing an environment from an import file still replaces all of its variables. A collection's variables and the global variables are changed the same way.

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
