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
| C-004 | Vault crypto: PBKDF2-SHA-256 with 200,000 iterations, AES-GCM-256, a random 16-byte salt and 12-byte IV per secret. | README.md, docs/trust-center.md | src/app/shared/secrets/secret-crypto.spec.ts |
| C-005 | The vault key is held in memory only; reloading the page locks the vault. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-006 | Scripts are disabled in the hosted app and say so with a banner; Tests-tab assertions still run. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts |
| C-007 | A request that references a vault secret is blocked, never sent with the placeholder. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts |
| C-008 | History keeps the headers that were sent, including `Authorization`, in plain text. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-009 | HTML, XML and text responses render as text; binary responses are offered as a download with the exact bytes. | README.md | e2e/tripwire.spec.ts |
| C-010 | Network failures show the real network error, never a synthetic `504` from a service worker. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/service-worker.spec.ts |
| C-011 | The Content-Security-Policy forbids `eval` and inline script, so injected script does not run. | docs/trust-center.md | e2e/claims.spec.ts |
| C-012 | The production page loads with no script the app didn't ship (0 CSP violations); checked every 6 hours. | docs/runbook.md | e2e/no-edge-injection.spec.ts |
| C-013 | Settings → Reset all data deletes the database; if another tab holds it open, that tab is told to reload. | README.md, docs/trust-center.md | e2e/reset-all-data.spec.ts |
| C-014 | Collection exports include auth fields in plain text. | docs/trust-center.md | e2e/claims.spec.ts |
| C-015 | After one visit the app loads offline; its service worker caches only the app's own files and never answers requests to other origins. | README.md, docs/trust-center.md | e2e/service-worker.spec.ts |
| C-016 | The Content-Security-Policy requires Trusted Types for DOM script sinks; only same-origin script URLs pass the app's default policy. | docs/trust-center.md | e2e/trusted-types.spec.ts |
| C-017 | The composer offers GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS and sends the chosen method. | README.md | e2e/features.spec.ts |
| C-018 | The URL field is validated live; an unparseable URL is rejected instead of sent. | README.md | e2e/send-request.spec.ts |
| C-019 | Bearer, Basic and API-key auth (header or query) set in the Auth tab reach the server. | README.md | e2e/features.spec.ts |
| C-020 | Copy as cURL copies a command for the current request once it has a URL. | README.md | e2e/features.spec.ts |
| C-021 | Visual assertions (10 operators; status, headers, body, duration) run after the call and report in the Tests tab. | README.md | e2e/features.spec.ts, src/app/shared/scripts/assertion-runner.spec.ts |
| C-022 | The response viewer has Body (pretty JSON), Headers, Timings and Tests tabs. | README.md | e2e/send-request.spec.ts |
| C-023 | Phase timings are withheld unless the server sends `Timing-Allow-Origin`. | README.md | e2e/features.spec.ts |
| C-024 | Collections have folders, drag-and-drop reorder, inline rename, and load a request into the composer. | README.md | e2e/features.spec.ts, e2e/collections.spec.ts |
| C-025 | The environment manager switches environments and shows live `{{var}}` chips with source and resolved value. | README.md | e2e/environments.spec.ts |
| C-026 | Collection export and re-import is a byte-identical round trip. | README.md | src/app/shared/collections/collection-io.spec.ts |
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
| C-039 | The Body tab exists only for POST, PUT and PATCH, with a Basic or JSON editor. | README.md | e2e/features.spec.ts |
| C-040 | The Monaco script editor supports a small `pm.*` subset (`pm.environment`, `pm.response`, `pm.test`, `pm.expect`). | README.md | e2e/layout.spec.ts, src/app/shared/scripts/script-sandbox.spec.ts |
| C-041 | The Local Bridge relays only for an allowed origin that presents its token. | docs/trust-center.md | local-bridge/test/server.test.js |
