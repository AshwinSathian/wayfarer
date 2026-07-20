# Collections Schema

Wayfarer stores collection data entirely in IndexedDB. Each document carries a deterministic shape to keep exports diff‑friendly and to make imports idempotent.

## Canonical Models

| Entity       | Required fields                                                                                                   | Notes                                                                                       |
|--------------|-------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| `Collection` | `meta`, `name`, `order`, optional `description`                                                                   | `meta.id` is the stable primary key. `order` drives sidebar ordering and export determinism. |
| `Folder`     | `meta`, `collectionId`, `name`, `order`, optional `parentFolderId`                                                | Nested folders use `parentFolderId`; omitted for root folders.                              |
| `RequestDoc` | `meta`, `collectionId`, optional `folderId`, `name`, `method`, `url`, `headers`, `order`, optional `params`, `vars`, `body`, `auth` | `params` and `vars` are currently reserved for future editors but always serialised when present. |
| `Meta`       | `id`, `createdAt`, `updatedAt`, `version: 1`                                                                      | All timestamps are local epoch milliseconds.                                                |

## Ordering Rules

* Every array of documents is sorted by `order` ascending, then `meta.id` to break ties.
* During exports we deep‑sort object keys so JSON lines stay in a predictable order.
* Deterministic ordering keeps diffs tiny and enables round‑trip `Export → Import → Export` comparisons.

## Export Shape

```jsonc
{
  "meta": { "id": "export-id", "createdAt": 1717692390115, "updatedAt": 1717692390115, "version": 1 },
  "collection": {
    "meta": { "id": "col-1", "createdAt": 1717692390115, "updatedAt": 1717692390115, "version": 1 },
    "name": "Sample",
    "description": "Demo collection",
    "order": 1
  },
  "folders": [
    {
      "meta": { "id": "fold-1", "createdAt": 1717692390115, "updatedAt": 1717692390115, "version": 1 },
      "collectionId": "col-1",
      "name": "Auth",
      "order": 1
    }
  ],
  "requests": [
    {
      "meta": { "id": "req-1", "createdAt": 1717692390115, "updatedAt": 1717692390115, "version": 1 },
      "collectionId": "col-1",
      "name": "Login",
      "method": "POST",
      "url": "https://api.example.com/login",
      "headers": { "Content-Type": "application/json" },
      "order": 1,
      "body": { "email": "{{email}}", "password": "{{password}}" }
    }
  ]
}
```

The export payload never injects runtime state—no random IDs, timestamps remain unchanged, and arrays stay sorted. This allows:

* deterministic hashing for backups,
* low‑noise git diffs, and
* straightforward re‑imports (optionally duplicating IDs when requested).
