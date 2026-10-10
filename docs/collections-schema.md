# Collections Schema

Collections live in IndexedDB and travel as JSON files. A file is written the same way every time, so two exports of the same collection are the same bytes.

## Documents

| Document     | Fields | Notes |
|--------------|--------|-------|
| `Collection` | `meta`, `id`, `name`, `order`, `variables`, `auth`, `scripts`, optional `description`; stored only: `scriptTrust` | `meta.id` is the key. `variables` is a list of `{key, value, enabled}` rows that every request of the collection can use (see [Variables](variables.md)); a file must have it, and it may be empty. `auth` is what a request or a folder set to inherit is sent with; it is one of the request auth types below and never `inherit`. `scripts` is `{ pre, post }`, run for every request of the collection before its folders' and its own. `scriptTrust.trusted` is true for a collection made in this browser and false for an imported one. It is not written to a file. |
| `Folder`     | `meta`, `id`, `collectionId`, `name`, `order`, `variables`, `auth`, `scripts`, optional `parentFolderId` | A folder at the top has no `parentFolderId`. `variables` win over the collection's and lose to the environment's, the nearest folder first. `auth` is `{ "type": "inherit" }` for a new folder. `scripts` run after the collection's, the outer folder's before the inner one's. |
| `RequestDoc` | `meta`, `id`, `collectionId`, optional `folderId`, `name`, `order`, and the request fields below | |
| `Meta`       | `id`, `createdAt`, `updatedAt`, `version: 1` | Times are milliseconds since the epoch. `version` is the version of this block, not of the file. |

## Request fields

| Field      | Shape | Notes |
|------------|-------|-------|
| `method`   | an HTTP method: one word of at most 32 characters (an RFC 9110 token), in upper case | `CONNECT`, `TRACE` and `TRACK` can be stored; a browser will not send them, only the Local Bridge. |
| `url`      | text | May hold `{{variables}}`; it is never parsed and rewritten. |
| `params`   | rows | The query parameters as the composer lists them. The URL is what is sent; the rows are read from it when a request is opened. |
| `headers`  | rows | In order. A name may appear more than once. A row that is switched off is kept and not sent. |
| `body`     | `{ "mode", optional "raw", optional "urlencoded", optional "multipart", optional "binary" }` | See "Body" below. |
| `auth`     | `{ "type": "inherit" }` (what the nearest folder that does not inherit says, then the collection; a request made in a collection starts with it), `{ "type": "none" }`, `{ "type": "bearer", "token" }`, `{ "type": "basic", "username", "password" }` or `{ "type": "apikey", "key", "value", "in": "header" \| "query" }` | Plain text, also in a file. |
| `scripts`  | `{ "pre", "post" }` | Both are text; empty when there is none. |
| `tests`    | list of `{ "id", "target", "operator", optional "key", optional "expected" }` | In the order they were added. |
| `settings` | `{ optional "timeoutMs", optional "followRedirects", optional "route" }` | Empty today: the composer sets none of them yet. |

A row is `{ "key": text, "value": text, "enabled": true | false }`.

### Body

`mode` is `none`, `raw`, `urlencoded`, `multipart` or `binary` and says which part is sent. The other parts are kept, so changing the mode and changing it back loses nothing. `GET` and `HEAD` send no body whatever the mode.

| Part         | Shape | Sent as |
|--------------|-------|---------|
| `raw`        | `{ "language", "text" }`; `language` is `json`, `text`, `xml`, `html` or `javascript` | The text as typed, `{{variables}}` filled in. `Content-Type` follows the language (`application/json`, `text/plain`, `application/xml`, `text/html`, `application/javascript`) unless a header row sets one. Empty text sends no body. |
| `urlencoded` | rows | `name=value&…`, percent-encoded, enabled rows in order. `Content-Type: application/x-www-form-urlencoded` unless a header row sets one. |
| `multipart`  | list of `{ "key", "enabled", "kind": "text", "value" }` or `{ "key", "enabled", "kind": "file", "fileId", "fileName" }` | `multipart/form-data`. The browser writes the `Content-Type` with the boundary; a header row that sets one is flagged in the Body tab, because it replaces the boundary. |
| `binary`     | `{ "fileId", "fileName", optional "contentType" }` | The file's bytes. `Content-Type` is `contentType`, else the file's own type, else `application/octet-stream`, unless a header row sets one. |

A file is not in a collection file: only its `fileId` and `fileName` are. The bytes stay in the `files` store of the browser that picked them (50 MB a file at most). A request imported elsewhere names a file that browser does not have, and says so when it is sent: "The file … is not stored in this browser. Choose it again."

## Order

* Folders and requests are written by `order`, then by `meta.id`.
* Every object's keys are written in alphabetical order.
* Rows and assertions keep the order the user gave them.

## File format 3

```jsonc
{
  "$id": "wayfarer/collection/3",
  "collection": {
    "auth": { "token": "{{token}}", "type": "bearer" },
    "description": "Demo collection",
    "id": "col-1",
    "meta": { "createdAt": 1717692390115, "id": "col-1", "updatedAt": 1717692390115, "version": 1 },
    "name": "Sample",
    "order": 1,
    "scripts": { "post": "", "pre": "" },
    "variables": [{ "enabled": true, "key": "base", "value": "https://api.example.com" }]
  },
  "folders": [
    {
      "auth": { "type": "inherit" },
      "collectionId": "col-1",
      "id": "fold-1",
      "meta": { "createdAt": 1717692390115, "id": "fold-1", "updatedAt": 1717692390115, "version": 1 },
      "name": "Auth",
      "order": 1,
      "scripts": { "post": "", "pre": "" },
      "variables": []
    }
  ],
  "meta": { "createdAt": 1717692390115, "id": "col-1", "updatedAt": 1717692390115, "version": 1 },
  "requests": [
    {
      "auth": { "type": "inherit" },
      "body": { "mode": "raw", "raw": { "language": "json", "text": "{ \"email\": \"{{email}}\" }" } },
      "collectionId": "col-1",
      "folderId": "fold-1",
      "headers": [{ "enabled": true, "key": "Content-Type", "value": "application/json" }],
      "id": "req-1",
      "meta": { "createdAt": 1717692390115, "id": "req-1", "updatedAt": 1717692390115, "version": 1 },
      "method": "POST",
      "name": "Login",
      "order": 1,
      "params": [],
      "scripts": { "post": "", "pre": "" },
      "settings": {},
      "tests": [],
      "url": "https://api.example.com/login"
    }
  ]
}
```

An export adds nothing of its own: no new ids, no new times. Exporting, importing and exporting again gives the same bytes.

## Import

How any file is imported, and the report shown first, is in [Import](import.md). Of this format:

* The file must say `"$id": "wayfarer/collection/3"`. A file without it, which is what versions before 2.0 wrote, and a format 2 file, which is what 2.0 and 2.1 wrote, are refused; nothing converts them.
* Every field above is checked against the values the app writes: a method that is not one upper-case word, a header that is not a row, a body mode or an auth type the app does not know are each reported with their path, and nothing is imported.
* **Export** writes `***` in place of a credential typed into the auth of a request, of a folder or of the collection, or into a credential header (`Authorization`, `Cookie`, `X-API-Key`, and any name with token, secret, key or pass in it), and in place of a collection or folder variable with such a name. A value that holds a `{{variable}}` is a reference and is written as it is. **Export with credentials** writes everything as typed. Importing a masked file gives requests whose credentials read `***`.
* An imported collection is marked untrusted (`scriptTrust` is `{ "trusted": false }`, with no approved scripts), also when it replaces a collection that was trusted. `scriptTrust` is `{ trusted, approved }`: `approved` lists the SHA-256, in hex, of each script text that was reviewed or written in this app. A script runs only when the collection is trusted and the script's digest is in the list.
* Files over 10 MB are refused before they are parsed.

## Environments file

`"$id": "wayfarer/environments/2"` with `environments`, a list of `{ meta, id, name, order, optional description, vars }`. `vars` is a list of rows, in order; when a name appears twice, the later enabled row is the one used.
