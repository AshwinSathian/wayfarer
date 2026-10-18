# Storage Layout

Wayfarer keeps everything in one IndexedDB database, `wayfarer`. Its stores are made on a browser's first open by `createStores` in `src/app/data/idb-stores.ts`. IndexedDB needs a number for a database's shape: `DB_VERSION` in `src/app/data/idb-schema.ts` is 1, and it stays 1. There is one shape and no upgrade.

| Store          | Key path    | Indexes                                             | Holds                                                     |
|----------------|-------------|-----------------------------------------------------|-----------------------------------------------------------|
| `history`      | `id` (auto) | `by-createdAt`                                      | Exchanges: the request as composed, as sent, and the response, with credentials and vault secrets masked. See "History" below. |
| `collections`  | `meta.id`   | `by-order`, `by-name`                               | Collections: name, order, variables, the auth and the scripts they hold for their requests, and `scriptTrust`: whether the collection is trusted and the SHA-256 of each script approved in it. |
| `folders`      | `meta.id`   | `by-collectionId`, `by-parentFolderId`, `by-order`  | The folder tree under each collection. A folder holds variables, auth and scripts for the requests in it. |
| `requests`     | `meta.id`   | `by-collectionId`, `by-folderId`, `by-order`        | Saved requests (see [Collections schema](collections-schema.md)). |
| `environments` | `meta.id`   | `by-name`, `by-order`                               | Environments; variables are ordered rows. A row a script set to something that is not text holds its JSON, with `json: true`. |
| `secrets`      | `meta.id`   | `by-environmentId`, `by-name`                       | Encrypted secret envelopes only (no plaintext). See [Secrets vault](secrets.md). An OAuth 2.0 token got while the vault was unlocked is one of them, named "OAuth 2.0 token" and what it is for ([Auth](auth.md)). The Local Bridge's token, saved while the vault was unlocked, is another, named "Local Bridge token"; `localStorage`'s `wayfarer:bridge` holds the device's route (`auto`, `direct` or `bridge`) and the bridge's address, never the token. |
| `files`        | the file id | —                                                   | The files of multipart and binary request bodies: bytes and type. |
| `cookies`      | `key`       | —                                                   | The cookie jar of the Local Bridge, by domain, path and name. |
| `tabs`         | `id`        | —                                                   | The composer's tabs: for each, the request being composed in it, as a saved request is stored, and where it belongs. See "Tabs" below. |
| `meta`         | `key`       | —                                                   | Three records: `state` (the active environment), `globals` (the global variables) and `vault` (how the passphrase key is derived, and the wrapped data key). |

## One shape

The database has one shape, the one above, and files have one format each: a collection, environments, workspace or vault file holds its `$id` (`wayfarer/collection`, `wayfarer/environments`, `wayfarer/workspace`, `wayfarer/vault`), and a file with any other `$id` is refused.

## History

One entry per request sent:

| Field | Holds |
|---|---|
| `template` | The request as it was composed: `{{variables}}` not resolved. A credential typed by hand is `***`. |
| `sent` | Method, URL and headers as they went out, masked. `bodyPreview` is the text of a text body; of a form or a file, the field names, file names and sizes, never the bytes. |
| `response` | Status, headers and, for a text body, up to 1 MB of it, masked. A binary body is not kept: bytes cannot be searched for a secret. Absent when no response arrived. |
| `route`, `durationMs`, `error` | `direct` or `bridge`; milliseconds; the message of a failure. |

History keeps the newest 500 entries (Settings, "History size", 1 to 5000); the oldest are deleted in the transaction that writes a new one. "Keep response bodies in history" switches the bodies off. Opening an entry loads `template` into the composer and shows the recorded response. A file a body referred to may be gone by then (it is deleted when no saved request names it), and the composer says so when the request is sent.

## Tabs

The composer's tabs are stored, so a reload brings them back. One record per tab:

| Field | Holds |
|---|---|
| `draft` | The request as it is in the tab, in the fields a saved request has. A `{{variable}}` is its name; a vault secret is its `{{$secret.<id>}}` reference; a credential typed into a field is that text, as in a saved request. |
| `baseline` | The request as it was when the tab was opened, loaded or last saved. A tab whose `draft` differs is shown as unsaved. |
| `requestId` | The saved request the tab belongs to, if any. Save writes back to it. |
| `historyKey` | The history entry of the tab's last send, or the entry it was opened from. |
| `scripts` | The SHA-256 of each script in `draft` that was allowed to run when the tab was stored. See [Scripts](scripts.md), "Which scripts may run". |
| `order` | The tab's place in the strip. |

**No response is stored with a tab.** After a reload a tab shows the response of its last send as history kept it: masked, and without a body when "Keep response bodies in history" is off or the entry is gone. A file chosen for a body and never saved with a request is in the page's memory only; after a reload the tab still names it, and a send says to choose it again.

A tab is written about a quarter of a second after it last changed, and when the page is hidden. A reload sooner than that after a keystroke can lose that keystroke.

**A tab follows its saved request.** When the request is renamed or moved in the list, here or in another browser tab, the tab has its new name and place at once, and with the place what it inherits from its folders. When the request is deleted, the tab keeps what it held, as a request that is not saved. When the request is saved from another browser tab, a tab that holds it keeps its own text: saving it then writes that text over the other's. Scripts keep their standing through all of this: a script that waited for a review still waits.

**Two browser tabs share the composer's tabs.** A tab opened, closed or edited in one appears so in the other. Each browser tab keeps which tab is open for itself (`wayfarer:open-tab` in `sessionStorage`). When both edit the same tab, the later write is what is stored, and the browser tab that is not in the middle of an edit takes the other's text.

A tab of a collection run is not stored, and neither is anything of the run: its requests are not written to history, its data file is read into the page and kept nowhere, and a reload does not bring the tab back.

The tabs are not in a workspace backup, and a restore leaves them as they are: a tab whose saved request the restore removed stays, as a request that is not saved. Reset all data removes them.

## Keeping the data

Everything above is in one browser profile, and a browser may delete it: when the disk runs low, or, in Safari, after seven days without a visit to a site that is not installed.

- **Asking the browser to keep it.** The first time you save a request or an environment, Wayfarer calls `navigator.storage.persist()`. Settings, "Storage in this browser", says what the browser answered and how much space is used. A browser that said no is asked again at the next save. In Safari the same place explains the seven-day rule and how to install the app, which lifts it.
- **Workspace backup.** Settings, "Back up", writes `wayfarer-workspace.json` (`"$id": "wayfarer/workspace"`): the `collections`, `folders`, `requests`, `environments`, `secrets` and `meta` stores as they are, and `history` when "With history" is ticked. Secrets are in it as stored, encrypted; the file opens the vault with the passphrase the vault had. The files of request bodies are not in it: a request names its file, as in a collection file.
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

## Transactions and helpers

## Cookies

The cookie jar of requests sent through the Local Bridge ([Browser limits](browser-limits.md#cookies)) is the `cookies` store: one record per cookie, under its domain, path and name, with its value as the server sent it, its flags, and when it ends. A value is text here, as a credential typed into a request is; history and exports hold it masked. A cookie whose value holds a vault secret of the request that got it is not written: it stays in the tab's memory until the tab reloads.

Two browser tabs share the jar: a cookie one stores, the other reads. The jar is not in a workspace backup, and a restore leaves it as it is. Reset all data removes it.

Each kind of document has its own repository (`CollectionsRepository`, `HistoryRepository`, …), over `IdbCore`, which holds the connection.

* `txReadWrite` and `txReadonly` open a transaction over the stores named.
* `commitOrRollback` wraps a write so that a reorder, an import or a duplication is all or nothing.

## Resetting

`IdbCore.resetDatabase()` closes this tab's connection, tells other tabs to close theirs (BroadcastChannel `wayfarer:lifecycle`, plus the `versionchange` event the delete fires), and deletes the database. If the database is still not deleted 2 s later (a tab that ignores the request, for example one running a build from before v1.1.0), it fails with "Close other Wayfarer tabs and try again". The UI exposes this via **Settings → Reset all data**. Only after a successful delete does it clear app-specific `localStorage`/`sessionStorage` keys and reload. Between the delete and the reload the tab refuses to open the database: a request that was on its way and ends just then, or a tab's delayed write, would otherwise make the database again with that one record in it. Other tabs close their connection, stop saving, and show "Data was reset in another tab — reload".

A blocked delete request can't be cancelled: it stays queued and completes when the blocking tab closes, so the data may still disappear after the reset reported failure.
