# Claims ledger

Every factual statement that Wayfarer's README and Trust Center make about
what the app does is a **claim**, with a stable ID: privacy, security, data
handling and network behaviour, and every feature the README lists. Each
claim is:

- marked where the docs make it, with `<!-- claim:C-NNN -->` (the same ID can
  be marked in several places);
- listed below with the test that proves it;
- proved by at least one automated test whose title contains `@claim:C-NNN`.
  e2e claim tests run in Chromium, Firefox and WebKit against the production
  build with production headers, with retries disabled (`claims-*` projects).

`npm run check:claims` ([`scripts/check-claims.mjs`](../scripts/check-claims.mjs))
runs in CI and fails when a marker has no row, a row has no marker, a row has
no test (for example, because the test was deleted or renamed), or a test is
tagged with an ID that has no row.

Not claims, by design, so not in this ledger:

- opinion and tone ("zero clutter", "great defaults");
- facts about third parties (Safari's storage eviction, what CORS requires);
- history (the rename from API Sandbox) and roadmap intent;
- process commitments (disclosure handling, changelog practice), which
  `SECURITY.md` owns;
- known-limitation bullets that link an issue: the issue tracks them, and
  they disappear when it is fixed.

To add a claim: write the test first (title `@claim:C-NNN …`), add the row,
then add the marker next to the sentence. A statement that no test can
back gets reworded until one can, or removed.

| ID | Statement | Source | Test |
|---|---|---|---|
| C-001 | No account, no cloud, no telemetry: apart from loading the app, the only network traffic is the request the user composes, sent to the host they chose. | README.md, docs/trust-center.md | e2e/no-third-party-requests.spec.ts |
| C-002 | Collections, environments and history are stored in the browser's IndexedDB on the user's device. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-003 | Values in the secrets vault are stored only as ciphertext; nothing the app persists holds the plaintext. Everything else is plain text. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-004 | Vault crypto: a key derived from the passphrase with PBKDF2-SHA-256 (600,000 iterations, a random 16-byte salt) wraps a random AES-GCM-256 data key; each secret is encrypted under the data key with a random 12-byte IV of its own. | README.md, docs/trust-center.md | packages/core/src/vault/vault-crypto.spec.ts |
| C-005 | The vault key is held in memory only: reloading the page locks the vault, and a tab locks itself after 15 idle minutes (configurable). | README.md, docs/trust-center.md | e2e/claims.spec.ts, e2e/vault.spec.ts |
| C-006 | Pre- and post-request scripts run in every build, the hosted app included, in a QuickJS sandbox under the production Content-Security-Policy. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/scripts.spec.ts |
| C-007 | A vault secret is sent as its plaintext when the vault is unlocked; a locked vault asks for the passphrase first; a secret's placeholder never reaches the network; and nothing stored, exported or copied holds the plaintext. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/secrets-wire.spec.ts |
| C-008 | History stores what was sent and what came back with credentials and vault secrets masked. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-009 | A response body is shown by its content type: formatted JSON, text, indented XML, an HTML preview, an image, or a hex dump. Any text body can be read as it was sent, and a binary body downloaded with its exact bytes. | README.md | e2e/tripwire.spec.ts, e2e/viewers.spec.ts |
| C-010 | Network failures show the real network error, never a synthetic `504` from a service worker. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/service-worker.spec.ts |
| C-011 | The Content-Security-Policy forbids `eval` and inline script, so injected script does not run. | docs/trust-center.md | e2e/claims.spec.ts |
| C-012 | The production page loads with no script the app didn't ship (0 CSP violations); checked every 6 hours. | docs/runbook.md | e2e/no-edge-injection.spec.ts |
| C-013 | Settings → Reset all data deletes the database; if another tab holds it open, that tab is told to reload. | README.md, docs/trust-center.md | e2e/reset-all-data.spec.ts |
| C-014 | Collection exports mask credentials unless the user asks for them in that export. | README.md, docs/trust-center.md | e2e/claims.spec.ts, src/app/services/collections-store.integration.spec.ts |
| C-015 | After one visit the app loads offline; its service worker caches only the app's own files and never answers requests to other origins. | README.md, docs/trust-center.md | e2e/service-worker.spec.ts |
| C-016 | The Content-Security-Policy requires Trusted Types for DOM script sinks; only same-origin script URLs pass the app's default policy. | docs/trust-center.md | e2e/trusted-types.spec.ts |
| C-017 | Any HTTP method can be typed and is sent in upper case; GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS are offered. | README.md | e2e/features.spec.ts |
| C-018 | The URL field is validated live; an unparseable URL is rejected instead of sent. | README.md | e2e/send-request.spec.ts |
| C-019 | Bearer, Basic and API-key auth (header or query) set in the Auth tab reach the server. | README.md | e2e/features.spec.ts |
| C-020 | Copy as cURL copies a command for the current request once it has a URL. | README.md | e2e/features.spec.ts |
| C-021 | Visual assertions (10 operators; status, headers, body, duration) run after the call and report in the Tests tab. | README.md | e2e/features.spec.ts, src/app/shared/scripts/assertion-runner.spec.ts |
| C-022 | The response viewer has Body (pretty JSON), Headers, Timings and Tests tabs. | README.md | e2e/send-request.spec.ts |
| C-023 | Phase timings are withheld unless the server sends `Timing-Allow-Origin`. | README.md | e2e/features.spec.ts |
| C-024 | Collections have folders, drag-and-drop reorder, inline rename, and load a request into the composer. | README.md | e2e/features.spec.ts, e2e/collections.spec.ts |
| C-025 | The environment manager switches environments and shows live `{{var}}` chips with source and resolved value. | README.md | e2e/environments.spec.ts |
| C-026 | Collection export (file format 2) and re-import is a byte-identical round trip. | README.md | src/app/shared/collections/collection-io.spec.ts |
| C-027 | First use of the vault guides the user through creating a passphrase. | README.md | e2e/secrets.spec.ts |
| C-028 | The Secrets view lists every secret with reveal, rename, locate and delete. | README.md | e2e/secrets-manager.spec.ts |
| C-029 | History groups entries by day; an entry can be loaded back, deleted, or all history cleared. | README.md | e2e/features.spec.ts |
| C-030 | ⌘K opens a command palette. | README.md | e2e/settings.spec.ts, src/app/components/collections/collections-sidebar.spec.ts |
| C-031 | The composer/response split is resizable and remembered across reloads. | README.md | e2e/layout.spec.ts |
| C-032 | On mobile the composer shows one section at a time, with labels. | README.md | e2e/layout.spec.ts |
| C-033 | Settings covers theme, environment export and import, Reset all data, Local Bridge and a shortcuts reference. | README.md | e2e/settings.spec.ts, e2e/features.spec.ts |
| C-034 | Animations respect `prefers-reduced-motion`. | README.md | e2e/features.spec.ts |
| C-035 | Responses export as HAR 1.2 (or cURL) from the Export menu; bodies over 256 KB or not JSON are left out with a comment. | README.md | e2e/features.spec.ts, src/app/shared/inspect/export.spec.ts |
| C-036 | The app is installable: a web app manifest with name, start URL, standalone display and 192/512 icons. | README.md | e2e/features.spec.ts |
| C-037 | Dark and light themes both ship, switchable in Settings. | README.md | e2e/settings.spec.ts |
| C-038 | The primary views have no critical or serious axe accessibility violations. | README.md | e2e/accessibility.spec.ts |
| C-039 | The Body tab offers the modes none, raw, form, multipart and binary; GET and HEAD have no Body tab and send no body. | README.md | e2e/features.spec.ts |
| C-040 | The Monaco script editor supports a small `pm.*` subset (`pm.environment`, `pm.response`, `pm.test`, `pm.expect`). | README.md | e2e/layout.spec.ts, src/app/shared/scripts/script-sandbox.spec.ts |
| C-041 | The Local Bridge relays only for an allowed origin that presents its token. | docs/trust-center.md | local-bridge/test/server.test.js |
| C-043 | The vault passphrase can be changed: the old one stops working and no secret is re-encrypted. | README.md, docs/trust-center.md | src/app/services/secrets-vault.spec.ts |
| C-044 | The vault can be exported as a file that holds only ciphertext and opens with its passphrase, and imported into another vault. | README.md, docs/trust-center.md | src/app/services/secrets-vault.spec.ts |
| C-045 | A request with a `{{variable}}` that has no value is held back until the user chooses to send it as written. | README.md | e2e/secrets-wire.spec.ts |
| C-046 | The whole workspace can be backed up to one file and restored from it; the vault's secrets are in it encrypted, and a restored collection's scripts are untrusted until approved. | README.md, docs/trust-center.md | e2e/durability.spec.ts |
| C-047 | An environments export leaves protected values out by default (no secret, no reference); it can instead carry the references with the encrypted vault, or plain text after a typed confirmation. | README.md | e2e/durability.spec.ts |
| C-048 | The HTML preview of a response runs none of its scripts, loads nothing from the network, and cannot leave its frame. | README.md, docs/trust-center.md | e2e/viewers.spec.ts |
| C-049 | Before a request is sent, the composer says what the browser will do to it: the headers it will not send, whether it asks the server first and why, and whether it will block the request as mixed content. | README.md, docs/browser-limits.md, docs/trust-center.md | e2e/browser-limits.spec.ts, packages/core/src/browser/browser-limits.spec.ts |
| C-050 | When a response arrives it fades in and nothing on the page changes position: not the response tabs, the split gutter, the status bar or the body. | README.md | e2e/no-movement.spec.ts |
| C-051 | The scripts of a collection that came from a file or a backup do not run until you have read them and said you trust them; a script that changed since then does not run either. | README.md, docs/trust-center.md | e2e/script-trust.spec.ts, src/app/services/script-trust.spec.ts |
| C-052 | A script reaches nothing but the API it is given: it has no network, no worker scope and no storage, `require` gives five libraries that ship with the app and no other module, a script makes no request except the ones it asks the app for with `pm.sendRequest`, and nothing of one run is left for the next. | README.md, docs/trust-center.md | e2e/sandbox-escape.spec.ts, packages/core/src/scripting/host.spec.ts |
