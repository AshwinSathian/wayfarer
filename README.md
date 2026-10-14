# Wayfarer

[![CI](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml/badge.svg)](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/AshwinSathian/wayfarer?style=flat&color=yellow)](https://github.com/AshwinSathian/wayfarer/stargazers)

**The API client that can't rug-pull you.**

Wayfarer is a local-first API client. No account. No cloud. No telemetry. <!-- claim:C-001 --> Your requests, collections, environments and history live in your browser's IndexedDB, exportable any time; <!-- claim:C-002 --> values you put in the secrets vault are encrypted, everything else is stored as plain text. <!-- claim:C-003 --> When you outgrow solo use, sync and team features will be opt-in and self-hostable, never a requirement.

> **v2.4.0 status:** a route for every request (Direct, Local Bridge, or Auto, which goes through the bridge when the page gets no answer); Local Bridge 2.2.0 with pairing, HTTPS on loopback, timings, a proxy and certificate options; and `wayfarer-cli`, which runs a collection from a terminal or a CI job with the app's results ([changelog](CHANGELOG.md)). Wayfarer 2 stores its data in a format of its own and reads nothing a 1.x version stored; **what is live at the demo address may be older than this**: a release here is a tag, and a deploy is a separate step.

**Live demo:** https://wayfarer.ashwinsathian.com/

---

## Why Wayfarer?

- Your work stays on your device. There's no account or server, so no update, acquisition, or pricing page can gate access to data you already have. <!-- claim:C-001 --> <!-- claim:C-002 --> Browser storage can still be cleared or evicted (Safari removes site data after 7 days without a visit), so export what you can't lose.
- Zero clutter, just the essentials. Compose a request and see a clean, structured response.
- Great defaults: sensible method/body pairing, helpful validation, and safe fallbacks.
- Shareable results. Export a request and its response, or several entries of history at once, as **HAR 1.2** for teammates and tooling. <!-- claim:C-035 -->
- No cloud, no account, no telemetry. Collections, environments, history, and secrets all live **per‑browser, per‑device** in **IndexedDB (IDB)**, and none of it is uploaded anywhere. <!-- claim:C-001 --> <!-- claim:C-002 -->
- A dark and a light theme, each fully designed: the app follows your system until you choose one in Settings. Minimal, accessible (no WCAG 2.2 AA violation that axe finds), and usable by keyboard alone, with a focus ring on every stop. <!-- claim:C-037 --> <!-- claim:C-038 --> <!-- claim:C-067 --> <!-- claim:C-030 -->

---

## Highlights

- **Request Composer**

  - Methods: any HTTP method, typed (`PURGE`, `PROPFIND`, …) and sent in upper case, with `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` one click away <!-- claim:C-017 -->
  - URL field with live validation <!-- claim:C-018 -->
  - **Tabs**: several requests open at once, each with its own request and response, kept over a reload; a request, a run, an event stream or a WebSocket goes on in its tab while you work in another
  - Query Params, Headers, Auth (Bearer / Basic / API Key, in a header or the query / AWS Signature / OAuth 2.0), and Scripts tabs; a collection and a folder can hold auth too, and a request set to "Inherit from parent" is sent with it <!-- claim:C-019 -->
  - **AWS Signature Version 4**: the request is signed as it is sent, with the access key, secret key, region and service you give, and a session token for temporary credentials. Held to AWS's own test suite. A multipart form cannot be signed, and the app says so <!-- claim:C-061 -->. See [`docs/auth.md`](docs/auth.md)
  - **OAuth 2.0**: Authorization Code with PKCE (the sign-in opens in a window), Client Credentials and Password. The token is kept in the vault when it is unlocked and otherwise in memory only, is renewed when it expires, and is masked in history and in every export. A token endpoint that does not allow the app's origin needs the Local Bridge <!-- claim:C-062 -->. See [`docs/auth.md`](docs/auth.md)
  - Body tab for every method but `GET` and `HEAD`, with the modes none, raw (JSON, text, XML, HTML, JavaScript), form (URL-encoded), multipart (text and files), binary file and GraphQL <!-- claim:C-039 -->
  - **GraphQL**: a query editor with a variables pane. **Fetch schema** asks the request's address for its schema, with the request's headers and auth; the query is then checked against it as you type, the editor completes from it, and the schema can be looked through under the editor. See [`docs/graphql.md`](docs/graphql.md)
  - **Copy as cURL** for any request once it has a URL, with its body in every mode: text, a form, a multipart form, a file by its name <!-- claim:C-020 -->
  - **Copy as code**: the same request for JavaScript `fetch`, Python `requests` or HTTPie, masked as the cURL command is <!-- claim:C-055 -->. See [`docs/export.md`](docs/export.md)

- **Pre/Post-Request Scripts & Test Assertions**

  - A Monaco script editor, and the parts of Postman's script API listed in [`docs/postman-compatibility.md`](docs/postman-compatibility.md): the `pm` object (variables in every scope, `pm.request`, `pm.response`, `pm.test`, Chai's `pm.expect`, `pm.sendRequest`), the older `postman.*` globals, and `require` for five libraries. Each row of that list is a test, and what is not supported says so by name when a script calls it <!-- claim:C-040 -->
  - Scripts run in a QuickJS sandbox (a JavaScript engine compiled to WebAssembly) in every build, the hosted app included, under its strict Content-Security-Policy <!-- claim:C-006 -->. See [`docs/scripts.md`](docs/scripts.md)
  - A script reaches nothing but `pm`, Postman's older globals (`postman`, `tests`, `responseBody` and the rest), `console`, `atob`, `btoa`, `setTimeout` and `require` (five libraries that ship with the app): no `fetch` or any other network API, no worker scope, no storage. A script makes no request itself: with `pm.sendRequest` it asks the app, which sends the request the way it sends yours and never reads the vault for it. Nothing of one run is left for the next <!-- claim:C-052 -->
  - Scripts that arrive in a collection file or a backup do not run until you have read them in the review dialog and said you trust them; a script changed by a later import does not run either <!-- claim:C-051 -->
  - When a request's pre-request script has moved it to another host and the request uses a vault secret, the app names both hosts and asks before it sends; on "Don't send" nothing goes out and the variables that script set are put back <!-- claim:C-053 -->. A collection run asks the same of a request that a script of an earlier request of the run moved, and a no ends the run. It compares one send, or one run: [`docs/scripts.md`](docs/scripts.md) says what that does not catch
  - A visual, no-code test assertion builder (10 operators across status/body/headers/duration) as a friendlier alternative to scripting
  - Results surface in a dedicated **Tests** tab in the response viewer <!-- claim:C-021 -->

- **Response Viewer**

  - **Body**, **Headers**, **Timings**, and **Tests** tabs, with pretty JSON in the Body <!-- claim:C-022 -->
  - The body is shown by its type, and you can switch the view: formatted JSON (with a path filter such as `data.items[*].id`, and find with Ctrl/Cmd+F), text, indented XML, an HTML preview, an image, or a hex dump. Text can always be read as it was sent, and a binary body downloaded with its exact bytes <!-- claim:C-009 -->
  - The HTML preview is a drawing of the page and nothing more: its scripts do not run, it loads nothing from the network, and its links go nowhere <!-- claim:C-048 -->
  - Before you send, the composer says what the browser will do to the request: the headers it will not send (`Cookie`, `Host` and the rest), whether it asks the server first with a CORS preflight and why, and whether it will block an `http://` address. [`docs/browser-limits.md`](docs/browser-limits.md) explains each <!-- claim:C-049 -->
  - A response fades in; nothing on the page moves when it arrives, so what you aim at is where you press <!-- claim:C-050 -->
  - The Headers tab says when the browser withheld headers (a response from another origin shows only the CORS-safelisted ones and those the server exposes)
  - Total duration and size; phase timings (DNS → Connect → TTFB) only when the server sends `Timing-Allow-Origin`, which most cross-origin APIs don't ([#69](https://github.com/AshwinSathian/wayfarer/issues/69)) <!-- claim:C-023 -->
  - **Event streams (SSE)**: a response of type `text/event-stream` is listed event by event as it arrives (id, event, data, time), with any header the request has, since it is read with `fetch` and not with `EventSource`. **Stop** ends it; **Reconnect** sends the last id as `Last-Event-ID`. Through the Local Bridge a stream is shown when it has ended. See [`docs/browser-limits.md`](docs/browser-limits.md), "Event streams"
  - **Route, per request, per collection or for the device**: **Direct** (from the page), **Local Bridge**, or **Auto**, the default. Auto sends a request from the page, and through the Local Bridge when the page got no answer: at once when the request cannot have reached the server (the browser's preflight failed first) or is a GET, HEAD or OPTIONS, and otherwise only after you say yes. A response is never sent again. <!-- claim:C-064 --> Each response says where it came from: **Direct** or **Via bridge**. See [`docs/browser-limits.md`](docs/browser-limits.md), "Routes"
  - **Through the Local Bridge, redirects hop by hop**: each redirect that was followed is listed with its status, its address and its `Location`, 20 at most; **Follow redirects** is a setting of the request. Sent directly, the browser follows unseen and the response says where it ended. A request that holds a vault secret is not followed to another host: that redirect is the response, with the reason <!-- claim:C-063 -->. See [`docs/browser-limits.md`](docs/browser-limits.md), "Redirects"
  - **Through the Local Bridge, what a browser cannot do for a request**: timings of the name lookup, the connection, the TLS handshake and the wait, measured on the bridge's own connection; a `Host` header of your own; certificate verification switched off for one request, with a red "TLS verification off" pill; a certificate authority of your own (`--ca`); and a proxy (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`).
  - **A command-line runner**, `wayfarer-cli`: runs a Wayfarer collection, a workspace backup or a Postman collection with an environment and a data file, writes the JSON and JUnit reports, and exits with 1 when a test fails. It sends with the app's engine, and gives the results the app's runner gives <!-- claim:C-065 -->. A file's scripts run only with `--allow-scripts`; without it a collection with scripts is not run <!-- claim:C-066 -->. See [`docs/cli.md`](docs/cli.md)
  - **Through the Local Bridge, a cookie jar**: what a response sets is kept and sent with later requests to its domain and path, as a browser would; Settings, **Cookies** lists it, to change or delete. A page cannot read or fill the browser's own jar, so a direct request has none. See [`docs/browser-limits.md`](docs/browser-limits.md), "Cookies"
  - **WebSocket**: an address that starts with `ws://` or `wss://` is connected to instead of sent. Subprotocols, a message field (text, or text that must be JSON), and a log of what was sent and received with time and size, and the close code when the connection ends. A browser adds no header to a WebSocket's handshake, so the request's headers and auth do not go with it. See [`docs/browser-limits.md`](docs/browser-limits.md), "WebSockets"
  - An **Export** menu that copies the exchange as cURL or HAR, or shows the HAR file before you copy or save it <!-- claim:C-035 -->

- **Collections & Environments**

  - Collections tree with folders, drag/drop reorder, inline rename, and one-click **load into composer** <!-- claim:C-024 -->
  - Environment manager with a dropdown switcher and live `{{var}}` autocomplete chips showing source + resolved value as you type <!-- claim:C-025 -->
  - Deterministic collection import/export (a round trip is byte-identical) <!-- claim:C-026 -->
  - **One import road**: every file you import is read and checked off the page's thread, and a report shows what it will add and what of it could not be kept before anything is stored; Cancel stores nothing <!-- claim:C-054 -->. See [`docs/import.md`](docs/import.md)
  - **Export for Postman**: a collection as a Postman Collection v2.1 file, with its folders, variables, auth and scripts at every level and each request's body, credentials masked unless asked for; an environment as a Postman environment file. Newman runs the exported collection and gives the results the app gives <!-- claim:C-057 -->. See [`docs/export.md`](docs/export.md)
  - **Import from Postman**: Collection v2.0 and v2.1 files, with folders, variables, auth and scripts at every level, and environment and globals files. The report says what could not be kept, and scripts wait for your review <!-- claim:C-058 -->. See [`docs/import.md`](docs/import.md)
  - **Import from Insomnia**: an export in format 4 (JSON or YAML) or format 5 (YAML), with its folders, requests, auth, bodies and environments. Insomnia's scripts and template tags are not kept, and the report says so <!-- claim:C-059 -->
  - **Import from OpenAPI**: an OpenAPI 3.0 or 3.1 description, or a Swagger 2.0 one, in JSON or YAML, as a request per operation in a folder per tag, with parameters, a body written from the schema or the file's example, and auth from the security schemes. A reference to another file or to an address is never fetched, and the report names it <!-- claim:C-060 -->
  - **Paste a cURL command** into the address field and it becomes the request, or import it, or a **HAR 1.2** file, as a collection <!-- claim:C-056 -->
  - **Run a collection or a folder**: its requests one after another, each sent as Send would send it, for a number of iterations or once for each row of a CSV or JSON data file, with a delay, "stop on the first failure" and Cancel. `pm.execution.setNextRequest` and `skipRequest` move the run as they move Postman's. The results are a table that fills as the run goes, and a JSON, a JUnit XML and a HAR 1.2 report. A run has a tab of its own and goes on while you work in another. See [`docs/scripts.md`](docs/scripts.md), "Collection runs"
  - A collection and a folder have **settings**: auth for the requests set to inherit, variables, and scripts that run before and after every request in them
  - **Workspace backup**: every collection, request, environment, the global variables and the vault (still encrypted) in one file, and a restore from it; a restored collection's scripts are untrusted until approved <!-- claim:C-046 -->
  - Environment export asks what to write of protected variables: nothing (the default), their references with the encrypted vault beside them, or plain text after you type a confirmation <!-- claim:C-047 -->

- **Secrets Vault**

  - Client-side, encrypted-at-rest secrets: a passphrase key (PBKDF2, 600k iterations, SHA‑256) wraps a random AES‑GCM‑256 data key that encrypts each secret; ciphertext-only in IndexedDB <!-- claim:C-003 --> <!-- claim:C-004 -->
  - The vault key is held in memory only: a reload locks the vault, and a tab locks itself after 15 idle minutes (1 to 240, or never, in Settings) <!-- claim:C-005 -->
  - Change the vault passphrase without re-encrypting a secret <!-- claim:C-043 -->; export the vault as an encrypted file and import it into another browser <!-- claim:C-044 -->
  - Protected values are sent as their plaintext when the vault is unlocked. A locked vault asks for the passphrase first, a secret's placeholder is never sent, and history, exports and copies never hold the plaintext <!-- claim:C-007 -->
  - A request with a `{{variable}}` that has no value is held back until you choose **Send anyway** (a setting turns this off) <!-- claim:C-045 -->
  - Guided first-use passphrase setup flow <!-- claim:C-027 -->; see [`docs/secrets.md`](docs/secrets.md)
  - A dedicated **Secrets management view** listing every secret across every environment in one place, with lock-aware reveal, rename, delete, and a "locate" chip that jumps to wherever a secret is referenced <!-- claim:C-028 -->

- **History & Navigation**

  - History drawer with date‑grouped, relative timestamps
  - Load an entry back into the composer, delete one, or clear all <!-- claim:C-029 -->
  - Command palette (⌘K) for fast keyboard-driven navigation <!-- claim:C-030 -->

- **Layout & Settings**

  - Resizable split between the composer and response viewer on desktop, with the chosen ratio remembered across reloads <!-- claim:C-031 -->
  - A rebuilt mobile composer: one section open at a time, instead of every tab stacked and unlabeled <!-- claim:C-032 -->
  - **Settings**, a list of sections beside the section you chose (on a phone: the list, then the section): theme, request and history settings, backup and environments export/import, the vault, Local Bridge configuration, a keyboard-shortcuts reference, and Reset All Data in a danger zone of its own <!-- claim:C-033 -->
  - Deliberate, reduced-motion-aware animation on tab switches, response arrival, and dialogs <!-- claim:C-034 -->

- **Exports**

  - **HAR 1.2** – Standard archive for HTTP requests/responses (great for bug reports): one response from its Export menu, or the history entries you tick, in one file. The file is shown before it is written, and imports again as the same requests
  - A body of text is in the HAR whatever its type. A body that is not text, or is longer than 256 KB, is left out with a comment, to keep files small <!-- claim:C-035 -->. See [`docs/export.md`](docs/export.md)

- **PWA**

  - Installable from the browser <!-- claim:C-036 -->, and loads offline after the first visit; the service worker only caches the app's own files and never touches the requests you send <!-- claim:C-015 --> <!-- claim:C-010 -->. Dark and light themes are both intentionally designed, not one inverted from the other <!-- claim:C-037 -->

---

## Quick Start (Local)

> Requires **Node 24** (see `.nvmrc`; 22.22.3 or later also works) and a modern browser.

```bash
# 1) Clone the repo
git clone https://github.com/AshwinSathian/wayfarer.git
cd wayfarer

# 2) Install dependencies
npm ci
# (or: npm install)

# 3) Run the app (Angular dev server)
npm run start
# falls back to: ng serve --open
# then open http://localhost:4200

# 4) Production build (optimized, hashed; the same build CI runs)
npm run build

# 5) Lint / test
npm run lint
npm run test:ci
```

**Notes**

- Calling third‑party APIs may require CORS to be enabled by that API. For CORS-restrictive or intranet-only APIs, run the optional [Local Bridge](packages/bridge/README.md) (`npm run bridge`) instead of a hand-rolled proxy.
- History, collections, environments, and secrets are stored locally in **IndexedDB** and are **specific to the browser and device** you're using. <!-- claim:C-002 -->

---

## How it works (in 60 seconds)

- The **Request Composer** accepts a URL, method, query params, headers, auth, and (for every method but GET and HEAD) a body.
- Visual assertions run after the call <!-- claim:C-021 -->. Pre- and post-request scripts run before and after it <!-- claim:C-006 -->.
- The app sends the request and shows:
  - **Body** (pretty‑printed for JSON)
  - **Headers**
  - **Timings** (total duration and sizes; phase timings when the server allows them)
  - **Tests** (assertion results) <!-- claim:C-022 -->
- Each request can be **saved to a Collection** for later reuse, or loaded back from **History**. <!-- claim:C-024 --> <!-- claim:C-029 -->
- You can **export** any call as HAR to share with teammates or attach to tickets. <!-- claim:C-035 -->

---

## Privacy & Data

- Everything (requests, history, collections, environments, and secrets) is stored **locally** in your browser via **IndexedDB (IDB)**. <!-- claim:C-002 -->
- **Nothing is uploaded** to Wayfarer; there is no backend and no account system. <!-- claim:C-001 --> The hosted app is served as static files by Cloudflare, which, like any web host, sees your IP address and user agent when the page loads (see the [Trust Center](docs/trust-center.md#subprocessors)).
- Only vault secrets are encrypted. <!-- claim:C-003 --> History is not encrypted, but it stores what was sent and what came back with credentials and vault secrets masked. <!-- claim:C-008 -->
- You're in control: clear individual entries or wipe the entire history anytime. <!-- claim:C-029 -->
- Need a clean slate? **Settings → Reset all data** deletes the local database and app-specific storage, then reloads. If another Wayfarer tab still has the data open, it tells you to close that tab instead of claiming success. <!-- claim:C-013 -->

---

## FAQ

**Does this replace Postman/Insomnia?**  
No. Wayfarer is intentionally smaller and faster for everyday calls, docs checks, and quick debugging.

**Why HAR?**  
It's widely accepted by browsers, proxies, and observability tools, and is great for attaching to bug reports.

**Can I use form data or files?**  
Current focus is JSON APIs. Form/file helpers may land later.

**Will there be a light theme?**  
Yes, dark and light themes both ship today, each intentionally designed. The app follows your system until you choose one in Settings. <!-- claim:C-037 -->

**Are my secrets/API keys safe?**  
Values in the secrets vault are encrypted at rest with AES‑GCM‑256 under a data key, which is stored only wrapped by a PBKDF2‑derived passphrase key; unwrapped, it only exists in memory. <!-- claim:C-004 --> <!-- claim:C-005 --> Keys typed directly into headers or the Auth tab are not: they are stored in plain text in your collections. History masks them, <!-- claim:C-008 --> and a collection export masks them unless you ask for that export to carry them. <!-- claim:C-014 --> See [`docs/secrets.md`](docs/secrets.md) for the full model.

**Wait, wasn't this called API Sandbox?**  
Yes, this project was renamed from API Sandbox to Wayfarer. Same app, same storage model, same MIT license: only the name and identity changed, never the promise that your data stays on your device. See the [CHANGELOG](CHANGELOG.md) for details.

---

## Known limitations

A September 2026 audit found gaps between these docs and the code. Each is an open issue with label [`audit-2026-09`](https://github.com/AshwinSathian/wayfarer/issues?q=label%3Aaudit-2026-09), scheduled in [`PLAN-airtight-remediation.md`](PLAN-airtight-remediation.md). The ones you are most likely to hit:

- Data and files from Wayfarer 1.x are not read: version 2 starts empty, and a 1.x collection or environment file is refused on import.
- A browser can still delete a site's data (Safari does after seven days without a visit, unless the app is installed). Wayfarer asks the browser to keep it and reminds you to back up; it cannot make the browser promise.
- The Local Bridge isn't on npm ([#79](https://github.com/AshwinSathian/wayfarer/issues/79)).

---

## Contributing

Contributions are welcome: bug reports, small UX wins, docs tweaks, or focused features that keep the app fast and simple.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch/PR flow, and code style expectations.
- This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
- Found a security issue? Please follow [SECURITY.md](SECURITY.md) rather than opening a public issue.
- Can you break the script sandbox, the vault or the Local Bridge? [Take the challenge](SECURITY.md#break-the-sandbox): no money, a place in the [hall of fame](docs/trust-center.md#hall-of-fame).

Please open an issue to propose non-trivial changes before a PR, and keep scope tight.

## Docs

- [Variables](docs/variables.md)
- [Collections schema](docs/collections-schema.md)
- [Export: cURL, code and Postman files](docs/export.md)
- [Import](docs/import.md): the one road a file takes, and the report before anything is stored
- [Secrets model](docs/secrets.md)
- [Storage layout](docs/storage.md)
- [Scripts & sandbox model](docs/scripts.md)
- [Local Bridge (optional CORS/intranet relay)](packages/bridge/README.md)
- [Command line (`wayfarer-cli`)](docs/cli.md)
- [Browser limits](docs/browser-limits.md): what the browser blocks, including reaching the Local Bridge
- [Trust Center](docs/trust-center.md): encryption, data residency, subprocessors, compliance status
- [Security questionnaire (pre-answered)](docs/security-questionnaire.md)
- [Deployment](docs/deployment.md): Cloudflare Workers setup, CI/CD, headers/CSP

---

## Roadmap (public intent, not a contract)

- The command-line runner and the Local Bridge on npm
- Full JSONPath (filters, recursive descent) in the response filter
- GraphQL subscriptions; a WebSocket through the Local Bridge, for handshake headers
- CSV/XLSX preview

Tracked as GitHub issues; no fixed timeline.

---

## License

MIT © Ashwin Sathian. See [LICENSE](LICENSE).
