# Collections Schema

Collections live in IndexedDB and travel as JSON files. A file is written the same way every time, so two exports of the same collection are the same bytes.

## Documents

| Document     | Fields | Notes |
|--------------|--------|-------|
| `Collection` | `meta`, `id`, `name`, `order`, optional `description`; stored only: `scriptTrust` | `meta.id` is the key. `scriptTrust.trusted` is true for a collection made in this browser and false for an imported one. It is not written to a file. |
| `Folder`     | `meta`, `id`, `collectionId`, `name`, `order`, optional `parentFolderId` | A folder at the top has no `parentFolderId`. |
| `RequestDoc` | `meta`, `id`, `collectionId`, optional `folderId`, `name`, `order`, and the request fields below | |
| `Meta`       | `id`, `createdAt`, `updatedAt`, `version: 1` | Times are milliseconds since the epoch. `version` is the version of this block, not of the file. |

## Request fields

| Field      | Shape | Notes |
|------------|-------|-------|
| `method`   | one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` | |
| `url`      | text | May hold `{{variables}}`; it is never parsed and rewritten. |
| `params`   | rows | The query parameters as the composer lists them. The URL is what is sent; the rows are read from it when a request is opened. |
| `headers`  | rows | In order. A name may appear more than once. A row that is switched off is kept and not sent. |
| `body`     | `{ "mode": "none" }` or `{ "mode": "raw", "raw": { "language", "text" } }` | `text` is what was typed, `{{variables}}` included. `language` is `json`, `text`, `xml`, `html` or `javascript`. |
| `auth`     | `{ "type": "none" }`, `{ "type": "bearer", "token" }`, `{ "type": "basic", "username", "password" }` or `{ "type": "apikey", "key", "value", "in": "header" \| "query" }` | Plain text, also in a file. |
| `scripts`  | `{ "pre", "post" }` | Both are text; empty when there is none. |
| `tests`    | list of `{ "id", "target", "operator", optional "key", optional "expected" }` | In the order they were added. |
| `settings` | `{ optional "timeoutMs", optional "followRedirects", optional "route" }` | Empty today: the composer sets none of them yet. |

A row is `{ "key": text, "value": text, "enabled": true | false }`.

## Order

* Folders and requests are written by `order`, then by `meta.id`.
* Every object's keys are written in alphabetical order.
* Rows and assertions keep the order the user gave them.

## File format 2

```jsonc
{
  "$id": "wayfarer/collection/2",
  "collection": {
    "description": "Demo collection",
    "id": "col-1",
    "meta": { "createdAt": 1717692390115, "id": "col-1", "updatedAt": 1717692390115, "version": 1 },
    "name": "Sample",
    "order": 1
  },
  "folders": [
    {
      "collectionId": "col-1",
      "id": "fold-1",
      "meta": { "createdAt": 1717692390115, "id": "fold-1", "updatedAt": 1717692390115, "version": 1 },
      "name": "Auth",
      "order": 1
    }
  ],
  "meta": { "createdAt": 1717692390115, "id": "col-1", "updatedAt": 1717692390115, "version": 1 },
  "requests": [
    {
      "auth": { "type": "none" },
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

* The file must say `"$id": "wayfarer/collection/2"`. A file without it, which is what versions before 2.0 wrote, is refused; nothing converts it.
* Every field above is checked against the values the app writes: a method outside the list, a header that is not a row, a body mode or an auth type the app does not know are each reported with their path, and nothing is imported.
* An imported collection is marked untrusted (`scriptTrust.trusted` is false), also when it replaces a collection that was trusted.
* Files over 10 MB are refused before they are parsed.

## Environments file

`"$id": "wayfarer/environments/2"` with `environments`, a list of `{ meta, id, name, order, optional description, vars }`. `vars` is a list of rows, in order; when a name appears twice, the later enabled row is the one used.
