# Claims ledger

Every factual statement that Wayfarer's README and trust center make about
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
| C-001 | No account, no cloud, no telemetry: apart from loading the app, the only network traffic is the request the user composes, sent to the host they chose, and, when its auth is OAuth 2.0, the token request and the sign-in window, sent to the two addresses the user gave for them. | README.md, docs/trust-center.md | e2e/no-third-party-requests.spec.ts, e2e/oauth.spec.ts, e2e/openapi.spec.ts, packages/core/test/import/openapi-fixtures.test.ts |
| C-002 | Collections, environments and history are stored in the browser's IndexedDB on the user's device. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-003 | Values in the secrets vault are stored only as ciphertext; nothing the app persists holds the plaintext. Everything else is plain text. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-004 | Vault crypto: a key derived from the passphrase with PBKDF2-SHA-256 (600,000 iterations, a random 16-byte salt) wraps a random AES-GCM-256 data key; each secret is encrypted under the data key with a random 12-byte IV of its own. | README.md, docs/trust-center.md | packages/core/src/vault/vault-crypto.spec.ts |
| C-005 | The vault key is held in memory only: reloading the page locks the vault, and a tab locks itself after 15 idle minutes (configurable). | README.md, docs/trust-center.md | e2e/claims.spec.ts, e2e/vault.spec.ts |
| C-006 | Pre- and post-request scripts run in every build, the hosted app included, in a QuickJS sandbox under the production Content-Security-Policy. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/scripts.spec.ts |
| C-007 | A vault secret is sent as its plaintext when the vault is unlocked; a locked vault asks for the passphrase first; a secret's placeholder never reaches the network; and nothing stored, exported or copied holds the plaintext. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/secrets-wire.spec.ts, src/app/services/socket-client.spec.ts |
| C-008 | History stores what was sent and what came back with credentials and vault secrets masked. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-009 | A response body is shown by its content type: formatted JSON, text, indented XML, an HTML preview, an image, or a hex dump. Any text body can be read as it was sent, and a binary body downloaded with its exact bytes. | README.md | e2e/tripwire.spec.ts, e2e/viewers.spec.ts |
| C-010 | Network failures show the real network error, never a synthetic `504` from a service worker. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/service-worker.spec.ts |
| C-011 | The Content-Security-Policy forbids `eval` and inline script, so injected script does not run. | docs/trust-center.md | e2e/claims.spec.ts |
| C-012 | The production page runs no script but the app's: the Content-Security-Policy blocks any other, also one the host adds on the way; checked every 6 hours. | docs/runbook.md | e2e/no-edge-injection.spec.ts |
| C-013 | Settings → Reset all data deletes the database; if another tab holds it open, that tab is told to reload. | README.md, docs/trust-center.md | e2e/reset-all-data.spec.ts |
| C-014 | Collection exports mask credentials unless the user asks for them in that export: those of a request, and those of the auth and the variables a collection or a folder holds. | README.md, docs/trust-center.md | e2e/claims.spec.ts, src/app/services/collections-store.integration.spec.ts |
| C-015 | After one visit the app loads offline; its service worker caches only the app's own files and never answers requests to other origins. | README.md, docs/trust-center.md | e2e/service-worker.spec.ts |
| C-016 | The Content-Security-Policy requires Trusted Types for DOM script sinks; only same-origin script URLs pass the app's default policy. | docs/trust-center.md | e2e/trusted-types.spec.ts |
| C-017 | Any HTTP method can be typed and is sent in upper case; GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS are offered. | README.md | e2e/features.spec.ts |
| C-018 | The URL field is validated live; an unparseable URL is rejected instead of sent. | README.md | e2e/send-request.spec.ts |
| C-019 | Bearer, Basic and API-key auth (header or query) set in the Auth tab reach the server; so does auth set on the collection or on a folder, for a request set to inherit. | README.md | e2e/features.spec.ts, e2e/inheritance.spec.ts, src/app/components/composer/composer-inherit.spec.ts |
| C-020 | Copy as cURL copies a command for the current request once it has a URL; the command carries the body in every mode (text, a form, a multipart form, a file by its name) and `HEAD`, and run by bash it sends what the app sends. | README.md, docs/export.md | e2e/features.spec.ts, e2e/export-curl.spec.ts, src/app/components/composer/composer-body.spec.ts |
| C-021 | Visual assertions (10 operators; status, headers, body, duration) run after the call and report in the Tests tab. | README.md | e2e/features.spec.ts, packages/core/src/send/assertions.spec.ts |
| C-022 | The response viewer has Body (pretty JSON), Headers, Timings and Tests tabs. | README.md | e2e/send-request.spec.ts |
| C-023 | Phase timings are withheld unless the server sends `Timing-Allow-Origin`. | README.md | e2e/features.spec.ts |
| C-024 | Collections have folders, drag-and-drop reorder, inline rename, and load a request into the composer. | README.md | e2e/features.spec.ts, e2e/collections.spec.ts |
| C-025 | The environment manager switches environments and shows live `{{var}}` chips with source and resolved value. | README.md | e2e/environments.spec.ts |
| C-026 | Collection export and re-import is a byte-identical round trip. | README.md | packages/core/src/import/wayfarer-collection.spec.ts |
| C-027 | First use of the vault guides the user through creating a passphrase. | README.md | e2e/secrets.spec.ts |
| C-028 | The Secrets view lists every secret with reveal, rename, locate and delete. | README.md | e2e/secrets-manager.spec.ts |
| C-029 | History groups entries by day; an entry can be loaded back, deleted, or all history cleared. | README.md | e2e/features.spec.ts |
| C-030 | ⌘K opens a command palette. | README.md | e2e/settings.spec.ts, e2e/palette.spec.ts |
| C-031 | The composer/response split is resizable and remembered across reloads. | README.md | e2e/layout.spec.ts |
| C-032 | On mobile the composer shows one section at a time, with labels. | README.md | e2e/layout.spec.ts |
| C-033 | Settings covers theme, environment export and import, Reset all data, Local Bridge and a shortcuts reference. | README.md | e2e/settings.spec.ts, e2e/features.spec.ts |
| C-034 | Animations respect `prefers-reduced-motion`. | README.md | e2e/features.spec.ts |
| C-035 | An exchange exports as a HAR 1.2 file with every field the format requires, from the response's Export menu or for several history entries at once, and the file is shown before it is written. A body of text is kept whatever its type; one that is not text, or is longer than 256 KB, is left out with a comment. The file imports again as the same requests. | README.md, docs/export.md | e2e/features.spec.ts, e2e/export-har.spec.ts, packages/core/src/export/har.spec.ts |
| C-036 | The app is installable: a web app manifest with name, start URL, standalone display and 192/512 icons. | README.md | e2e/features.spec.ts |
| C-037 | Dark and light themes both ship. Settings chooses one, or System, which follows the device and changes with it; a browser with no choice follows the system. | README.md | e2e/settings.spec.ts |
| C-038 | The primary views and dialogs have no axe violation of WCAG 2.2 at levels A and AA, of any impact. | README.md | e2e/accessibility.spec.ts |
| C-039 | The Body tab is there for every method and offers the modes none, raw, form, multipart, binary and GraphQL; a GET or HEAD request is sent without a body, and its Body tab says so. | README.md | e2e/features.spec.ts |
| C-040 | Scripts are edited in Monaco and have the parts of Postman's script API that `docs/postman-compatibility.md` lists; that document is written from the compatibility matrix, each row of which is a test that runs in Node and in the app's worker, and what is not supported throws an error that names it. | README.md, docs/postman-compatibility.md | e2e/layout.spec.ts, src/app/shared/scripts/script-sandbox.spec.ts, src/app/shared/scripts/pm-compat.spec.ts, packages/core/test/pm-compat/pm-compat.test.ts, scripts/gen-compat-doc.test.mjs |
| C-041 | The Local Bridge relays only for an allowed origin that presents its token. | docs/trust-center.md | packages/bridge/test/server.test.js |
| C-042 | A request on its way can be cancelled, and a request timeout can be set in Settings; by default there is none. | README.md | e2e/transport.spec.ts |
| C-043 | The vault passphrase can be changed: the old one stops working and no secret is re-encrypted. | README.md, docs/trust-center.md | src/app/services/secrets-vault.spec.ts |
| C-044 | The vault can be exported as a file that holds only ciphertext and opens with its passphrase, and imported into another vault. | README.md, docs/trust-center.md | src/app/services/secrets-vault.spec.ts |
| C-045 | A request with a `{{variable}}` that has no value is held back until the user chooses to send it as written. | README.md | e2e/secrets-wire.spec.ts |
| C-046 | The whole workspace (collections, environments, the vault, settings, and history when asked for; not the composer's open tabs) can be backed up to one file and restored from it; the vault's secrets are in it encrypted, and a restored collection's scripts are untrusted until approved. | README.md, docs/trust-center.md | e2e/durability.spec.ts |
| C-047 | An environments export leaves protected values out by default (no secret, no reference); it can instead carry the references with the encrypted vault, or plain text after a typed confirmation. | README.md | e2e/durability.spec.ts |
| C-048 | The HTML preview of a response runs none of its scripts, loads nothing from the network, and cannot leave its frame. | README.md, docs/trust-center.md | e2e/viewers.spec.ts |
| C-049 | Before a request is sent, the composer says what the browser will do to it: the headers it will not send, whether it asks the server first and why, and whether it will block the request as mixed content. | README.md, docs/browser-limits.md, docs/trust-center.md | e2e/browser-limits.spec.ts, packages/core/src/browser/browser-limits.spec.ts |
| C-050 | When a response arrives it fades in and nothing on the page changes position: not the response tabs, the split gutter, the status bar or the body. | README.md | e2e/no-movement.spec.ts |
| C-051 | The scripts of a collection that came from a file or a backup do not run until you have read them and said you trust them; a script that changed since then does not run either. | README.md, docs/trust-center.md | e2e/script-trust.spec.ts, e2e/inheritance.spec.ts, src/app/services/script-trust.spec.ts |
| C-052 | A script reaches nothing but the API it is given: it has no network, no worker scope and no storage, `require` gives five libraries that ship with the app and no other module, a script makes no request except the ones it asks the app for with `pm.sendRequest`, and nothing of one run is left for the next. | README.md, docs/trust-center.md | e2e/sandbox-escape.spec.ts, packages/core/src/scripting/host.spec.ts |
| C-053 | When the pre-request script of a send moved the request to another host and the request uses a vault secret or an OAuth 2.0 token, the app asks before it reads the vault or fetches the token; answered no, it sends nothing and puts back the variables that script set. In a collection run the same is asked of a request that a script of an earlier request of that run moved; answered no, the run ends. | README.md, docs/trust-center.md | e2e/script-redirect.spec.ts, src/app/components/composer/composer-scripts.spec.ts, src/app/services/collection-runner.spec.ts, packages/core/src/send/build.spec.ts |
| C-054 | An import shows what the file will add, and what of it could not be kept, before anything is stored; cancelled, it stores nothing. | README.md, docs/import.md | e2e/import.spec.ts |
| C-055 | The request can be copied as code for JavaScript `fetch`, Python `requests` and HTTPie, with credentials and vault secrets masked as in the cURL command. | README.md, docs/export.md | src/app/components/composer/composer-secrets.spec.ts |
| C-056 | A cURL command pasted into the address field becomes the request in the open tab, which is kept in the browser like any tab, and nothing is saved to a collection or to history; pasted into the import dialog it is imported with a report first; a HAR 1.2 file imports as one request per entry. The command is read, never run, and no file it names is opened. | README.md, docs/import.md | e2e/import-curl-har.spec.ts, src/app/components/composer/composer-paste.spec.ts |
| C-057 | A collection exports as a Postman Collection v2.1 file (folders, variables, auth and scripts at every level, each body mode) and an environment as a Postman environment file, masked as the app's own files are; Newman runs the exported collection and gives the test results the app's engine gives for the collection; and a Postman collection that was imported, exported as such a file and imported again is the same collection. | README.md, docs/export.md | e2e/export-postman.spec.ts, packages/core/test/export/postman.test.ts, packages/core/test/import/postman-fixtures.test.ts |
| C-058 | Postman Collection v2.0 and v2.1 files, Postman environments and globals import, with a report of what could not be kept and scripts unapproved; the Newman integration collections that use only what the app has give, in the app's engine, the test results Newman gives. | README.md, docs/import.md | e2e/import.spec.ts, packages/core/test/import/postman-fixtures.test.ts, packages/core/test/import/postman-newman.test.ts |
| C-059 | Insomnia exports in format 4 (JSON or YAML) and format 5 (YAML) import, with a report of what could not be kept: folders, requests, auth (none given inherits the folder's), bodies, and environments (the base environment as the collection's variables). Nothing of the file runs. A YAML file that grows through aliases is refused. | README.md, docs/import.md | e2e/insomnia.spec.ts, packages/core/test/import/insomnia-fixtures.test.ts |
| C-060 | OpenAPI 3.0 and 3.1 descriptions and Swagger 2.0 ones import, in JSON or YAML, as a request per operation, with a report of what could not be kept. A reference to another file or to an address is not fetched: the report names it. | README.md, docs/import.md | e2e/openapi.spec.ts, packages/core/src/import/openapi.spec.ts, packages/core/test/import/openapi-fixtures.test.ts |
| C-061 | AWS Signature Version 4 signs the request as it is sent: the signature that arrives is the one AWS would compute from the request that arrived. A multipart form is refused with a message. | README.md, docs/auth.md | e2e/aws-sigv4.spec.ts, packages/core/test/auth/sigv4-vectors.test.ts |
| C-062 | OAuth 2.0 with three grants: Authorization Code with PKCE, Client Credentials and Password. The app takes a sign-in's answer only when it carries the `state` the app issued. A token is kept in the vault when it is unlocked and otherwise in memory only; one that has expired is renewed when the request is sent. | README.md, docs/auth.md | e2e/oauth.spec.ts |
| C-063 | Through the Local Bridge, a request that holds a vault secret is not followed by a redirect to another host (another name or port, or the same host without TLS): the redirect is shown as the response, with the reason. | README.md, docs/trust-center.md, docs/browser-limits.md | e2e/redirects.spec.ts, packages/core/src/transport/redirect.spec.ts, packages/core/src/transport/bridge.spec.ts, packages/core/src/send/exchange.spec.ts |
| C-064 | The route Auto sends a request from the page, and through the Local Bridge when the page got no answer: at once when the request cannot have reached the server (the browser's preflight failed first) or is a GET, HEAD or OPTIONS, and otherwise only after you say yes. A response is never sent again. | README.md, docs/trust-center.md, docs/browser-limits.md | e2e/route.spec.ts, packages/core/src/transport/route.spec.ts, src/app/services/transport-router.spec.ts |
| C-065 | A collection run from the command line (`wayfarer-cli`) gives the results the same run gives in the app: the same requests in the same order, statuses, tests and errors. | docs/cli.md, README.md | e2e/runner.spec.ts |
| C-066 | The command line runs a collection file's scripts only when told to (`--allow-scripts`): without it, a collection that has a script is not run, and nothing is sent. | docs/cli.md, README.md | packages/cli/test/cli.test.mjs |
| C-067 | The app can be used by keyboard alone: the core flow (a collection, a new tab, an address, a header, send, save, run) needs no pointer, a dialog opens on the field it asks for, and closing one gives focus back to what opened it. | README.md | e2e/keyboard-flow.spec.ts |
| C-068 | Settings → Diagnostics shows the app's errors and what the Content-Security-Policy blocked, with self-tests; the report it copies, and the GitHub issue it opens, hold no address, header, body or vault secret of a request sent before. | docs/trust-center.md | e2e/diagnostics.spec.ts |
| C-069 | AI is off until a provider is added in Settings › AI: until then no AI control is drawn, the palette has no AI command, and no request goes to a model. | README.md, docs/ai.md | e2e/ai-settings.spec.ts, e2e/ai-tests.spec.ts, e2e/ai-draft.spec.ts, e2e/ai-explain.spec.ts |
| C-070 | A prompt sent to a model holds no vault secret's plaintext and no credential: it quotes the exchange as history keeps it, masked. | README.md, docs/ai.md | e2e/ai-claims.spec.ts |
| C-071 | What is sent to a model is shown before it is sent, byte for byte, and nothing is sent until Send to model. | README.md, docs/ai.md | e2e/ai-settings.spec.ts, e2e/ai-tests.spec.ts, e2e/ai-draft.spec.ts, e2e/ai-explain.spec.ts |
| C-072 | A response body goes into a prompt only when it is ticked for that call; the tick starts unticked every time. | README.md, docs/ai.md | e2e/ai-tests.spec.ts, e2e/ai-explain.spec.ts |
| C-073 | A model's proposal changes nothing until it is accepted, and Undo puts the script or the request back as it was. | README.md, docs/ai.md | e2e/ai-tests.spec.ts, e2e/ai-draft.spec.ts |
| C-074 | The AI provider's key is kept only as a vault secret. | README.md, docs/ai.md | e2e/ai-settings.spec.ts |
| C-075 | Removing the AI provider deletes its key from the vault and turns AI off again. | README.md, docs/ai.md | e2e/ai-settings.spec.ts |
| C-076 | A prompt is never a template: `{{name}}` in it is sent as written, not as its value. | README.md, docs/ai.md | e2e/ai-draft.spec.ts, packages/core/src/ai/model-call.spec.ts |
| C-077 | A prompt that names a vault secret's reference (`{{$secret.…}}`) is not sent. | README.md, docs/ai.md | e2e/ai-draft.spec.ts, packages/core/src/ai/model-call.spec.ts |
| C-078 | A model's proposal that names a vault secret's reference is refused and not offered. | README.md, docs/ai.md | e2e/ai-draft.spec.ts, packages/core/src/ai/model-call.spec.ts |
| C-079 | Tests a model wrote run only where the request's scripts may run: accepting them lifts no hold on the scripts of a request not yet reviewed. | README.md, docs/ai.md | e2e/ai-claims.spec.ts |
| C-080 | Nothing calls a model but Send to model: not a send, a reload or a preview that is cancelled. | README.md, docs/ai.md | e2e/ai-claims.spec.ts |
| C-081 | Each model call is a History entry with its exchange record, masked as a send is, and opens in History without loading into a tab. | README.md, docs/ai.md | e2e/ai-log.spec.ts, packages/core/src/ai/call.spec.ts |
| C-082 | With response bodies off in history, a model call whose prompt quoted a response body keeps neither that prompt nor the answer. | README.md, docs/ai.md | e2e/ai-log.spec.ts, packages/core/src/ai/call.spec.ts |
| C-083 | A HAR export of model calls holds no key and nothing history masked. | README.md, docs/ai.md | e2e/ai-log.spec.ts |
| C-084 | A collection shared as a link reaches no server: its content and its code are after the `#` of the address, which the browser does not send, and opening the link asks for the app's own files and nothing else. | docs/sharing.md, docs/trust-center.md | e2e/share.spec.ts |
| C-085 | Opening a shared link takes the part after `#` off the address bar before the app reads anything else. | docs/sharing.md | e2e/share.spec.ts |
| C-086 | A collection received by link shows the import report and is not stored until Import; cancelled, nothing is stored. | docs/sharing.md | e2e/share.spec.ts |
| C-087 | A collection shared as a file or a link holds no vault secret's plaintext. | docs/sharing.md, docs/trust-center.md | e2e/secrets-wire.spec.ts |
| C-088 | In a collection shared as a file or a link, a credential typed into auth is written as `***` unless Include credentials was ticked for that file or link. | docs/sharing.md, docs/trust-center.md | e2e/share.spec.ts |
| C-089 | Before a collection is shared, the Share dialog names where it goes: the file's name, or the link's length. | docs/sharing.md | src/app/components/collections/share-dialog.spec.ts |
| C-090 | The import report names every host a collection sends to before anything is stored: each request's address and each OAuth 2.0 sign-in and token address, with the variables the collection gives a value filled in. | docs/sharing.md, docs/import.md | packages/core/src/import/hosts.spec.ts |
| C-091 | An address that starts with `ws://` or `wss://` opens a WebSocket: each message sent and each received is logged in order, with its direction and its size. | docs/browser-limits.md | e2e/websocket.spec.ts |
| C-092 | A response of type `text/event-stream` is shown event by event as it arrives, each with its id, name and data; Stop ends it, and Reconnect sends `Last-Event-ID`, the last id the stream gave. | docs/browser-limits.md | e2e/sse.spec.ts |
| C-093 | A GraphQL body can fetch the server's schema by introspection; with it, a field the schema does not have is marked in the query's editor. | docs/graphql.md | e2e/graphql.spec.ts |
| C-094 | The composer holds requests in tabs, each with its own request and response; after a reload the tabs are there, their unsaved edits and the open one with them. | docs/getting-started.md | e2e/tabs.spec.ts |
