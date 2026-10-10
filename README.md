# Wayfarer

[![CI](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml/badge.svg)](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/AshwinSathian/wayfarer?style=flat&color=yellow)](https://github.com/AshwinSathian/wayfarer/stargazers)

**The API client that can't rug-pull you.**

Wayfarer is a local-first API client. No account. No cloud. No telemetry. <!-- claim:C-001 --> Your requests, collections, environments and history live in your browser's IndexedDB, exportable any time; <!-- claim:C-002 --> values you put in the secrets vault are encrypted, everything else is stored as plain text. <!-- claim:C-003 --> When you outgrow solo use, sync and team features will be opt-in and self-hostable, never a requirement.

> **v2.1.0 status:** pre-request and post-response scripts run again, in every build, in a sandbox, with the parts of Postman's script API listed in [`docs/postman-compatibility.md`](docs/postman-compatibility.md) ([changelog](CHANGELOG.md)). Wayfarer 2 stores its data in a new shape and does **not** carry over what 1.x stored or exported: the first time it opens, earlier collections, environments, secrets and history are removed, and the page says so. See [Known limitations](#known-limitations).

**Live demo:** https://wayfarer.ashwinsathian.com/

---

## Why Wayfarer?

- Your work stays on your device. There's no account or server, so no update, acquisition, or pricing page can gate access to data you already have. <!-- claim:C-001 --> <!-- claim:C-002 --> Browser storage can still be cleared or evicted (Safari removes site data after 7 days without a visit), so export what you can't lose.
- Zero clutter, just the essentials. Compose a request and see a clean, structured response.
- Great defaults: sensible method/body pairing, helpful validation, and safe fallbacks.
- Shareable results. Export a request/response as **HAR 1.2** for teammates and tooling. <!-- claim:C-035 -->
- No cloud, no account, no telemetry. Collections, environments, history, and secrets all live **per‑browser, per‑device** in **IndexedDB (IDB)**, and none of it is uploaded anywhere. <!-- claim:C-001 --> <!-- claim:C-002 -->
- Dark‑first UI, with a fully designed light theme. Minimal, accessible, and keyboard‑friendly. <!-- claim:C-037 --> <!-- claim:C-038 --> <!-- claim:C-030 -->

---

## Highlights

- **Request Composer**

  - Methods: any HTTP method, typed (`PURGE`, `PROPFIND`, …) and sent in upper case, with `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` one click away <!-- claim:C-017 -->
  - URL field with live validation <!-- claim:C-018 -->
  - Query Params, Headers, Auth (Bearer / Basic / API Key, in a header or the query), and Scripts tabs; a collection and a folder can hold auth too, and a request set to "Inherit from parent" is sent with it <!-- claim:C-019 -->
  - Body tab for every method but `GET` and `HEAD`, with the modes none, raw (JSON, text, XML, HTML, JavaScript), form (URL-encoded), multipart (text and files) and binary file <!-- claim:C-039 -->
  - **Copy as cURL** for any request once it has a URL, with its body in every mode: text, a form, a multipart form, a file by its name <!-- claim:C-020 -->
  - **Copy as code**: the same request for JavaScript `fetch`, Python `requests` or HTTPie, masked as the cURL command is <!-- claim:C-055 -->. See [`docs/export.md`](docs/export.md)

- **Pre/Post-Request Scripts & Test Assertions**

  - A Monaco script editor, and the parts of Postman's script API listed in [`docs/postman-compatibility.md`](docs/postman-compatibility.md): the `pm` object (variables in every scope, `pm.request`, `pm.response`, `pm.test`, Chai's `pm.expect`, `pm.sendRequest`), the older `postman.*` globals, and `require` for five libraries. Each row of that list is a test, and what is not supported says so by name when a script calls it <!-- claim:C-040 -->
  - Scripts run in a QuickJS sandbox (a JavaScript engine compiled to WebAssembly) in every build, the hosted app included, under its strict Content-Security-Policy <!-- claim:C-006 -->. See [`docs/scripts.md`](docs/scripts.md)
  - A script reaches nothing but `pm`, Postman's older globals (`postman`, `tests`, `responseBody` and the rest), `console`, `atob`, `btoa`, `setTimeout` and `require` (five libraries that ship with the app): no `fetch` or any other network API, no worker scope, no storage. A script makes no request itself: with `pm.sendRequest` it asks the app, which sends the request the way it sends yours and never reads the vault for it. Nothing of one run is left for the next <!-- claim:C-052 -->
  - Scripts that arrive in a collection file or a backup do not run until you have read them in the review dialog and said you trust them; a script changed by a later import does not run either <!-- claim:C-051 -->
  - When a request's pre-request script has moved it to another host and the request uses a vault secret, the app names both hosts and asks before it sends; on "Don't send" nothing goes out and the variables that script set are put back <!-- claim:C-053 -->. It compares one send: [`docs/scripts.md`](docs/scripts.md) says what that does not catch
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
  - An **Export** menu that copies the exchange as cURL or HAR <!-- claim:C-035 -->

- **Collections & Environments**

  - Collections tree with folders, drag/drop reorder, inline rename, and one-click **load into composer** <!-- claim:C-024 -->
  - Environment manager with a dropdown switcher and live `{{var}}` autocomplete chips showing source + resolved value as you type <!-- claim:C-025 -->
  - Deterministic collection import/export in file format 3 (a round trip is byte-identical) <!-- claim:C-026 -->
  - **One import road**: every file you import is read and checked off the page's thread, and a report shows what it will add and what of it could not be kept before anything is stored; Cancel stores nothing <!-- claim:C-054 -->. See [`docs/import.md`](docs/import.md)
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
  - A dedicated **Settings** view for theme, environments export/import, Reset All Data, Local Bridge configuration, and a keyboard-shortcuts reference <!-- claim:C-033 -->
  - Deliberate, reduced-motion-aware animation on tab switches, response arrival, and dialogs <!-- claim:C-034 -->

- **Exports**

  - **HAR 1.2** – Standard archive for HTTP requests/responses (great for bug reports)
  - Bodies over 256 KB, and bodies that aren't JSON, are left out of the HAR with a comment, to keep files small <!-- claim:C-035 -->

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

- Calling third‑party APIs may require CORS to be enabled by that API. For CORS-restrictive or intranet-only APIs, run the optional [Local Bridge](local-bridge/README.md) (`npm run bridge`) instead of a hand-rolled proxy.
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
Yes, dark and light themes both ship today, each intentionally designed. <!-- claim:C-037 -->

**Are my secrets/API keys safe?**  
Values in the secrets vault are encrypted at rest with AES‑GCM‑256 under a data key, which is stored only wrapped by a PBKDF2‑derived passphrase key; unwrapped, it only exists in memory. <!-- claim:C-004 --> <!-- claim:C-005 --> Keys typed directly into headers or the Auth tab are not: they are stored in plain text in your collections. History masks them, <!-- claim:C-008 --> and a collection export masks them unless you ask for that export to carry them. <!-- claim:C-014 --> See [`docs/secrets.md`](docs/secrets.md) for the full model.

**Wait, wasn't this called API Sandbox?**  
Yes, this project was renamed from API Sandbox to Wayfarer. Same app, same storage model, same MIT license: only the name and identity changed, never the promise that your data stays on your device. See the [CHANGELOG](CHANGELOG.md) for details.

---

## Known limitations

A September 2026 audit found gaps between these docs and the code. Each is an open issue with label [`audit-2026-09`](https://github.com/AshwinSathian/wayfarer/issues?q=label%3Aaudit-2026-09), scheduled in [`PLAN-airtight-remediation.md`](PLAN-airtight-remediation.md). The ones you are most likely to hit:

- Data and files from Wayfarer 1.x are not read: version 2 starts empty, and a 1.x collection or environment file is refused on import.
- A browser can still delete a site's data (Safari does after seven days without a visit, unless the app is installed). Wayfarer asks the browser to keep it and reminds you to back up; it cannot make the browser promise.
- No Postman/OpenAPI/cURL import ([#78](https://github.com/AshwinSathian/wayfarer/issues/78)).
- The Local Bridge is a global switch and isn't on npm ([#79](https://github.com/AshwinSathian/wayfarer/issues/79)).

---

## Contributing

Contributions are welcome: bug reports, small UX wins, docs tweaks, or focused features that keep the app fast and simple.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch/PR flow, and code style expectations.
- This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
- Found a security issue? Please follow [SECURITY.md](SECURITY.md) rather than opening a public issue.

Please open an issue to propose non-trivial changes before a PR, and keep scope tight.

## Docs

- [Variables](docs/variables.md)
- [Collections schema](docs/collections-schema.md)
- [Export: cURL and code](docs/export.md)
- [Import](docs/import.md): the one road a file takes, and the report before anything is stored
- [Secrets model](docs/secrets.md)
- [Storage layout](docs/storage.md)
- [Scripts & sandbox model](docs/scripts.md)
- [Local Bridge (optional CORS/intranet relay)](local-bridge/README.md)
- [Browser limits](docs/browser-limits.md): what the browser blocks, including reaching the Local Bridge
- [Trust Center](docs/trust-center.md): encryption, data residency, subprocessors, compliance status
- [Security questionnaire (pre-answered)](docs/security-questionnaire.md)
- [Deployment](docs/deployment.md): Cloudflare Workers setup, CI/CD, headers/CSP

---

## Roadmap (public intent, not a contract)

- JSONPath search/filter in responses
- Full OAuth2 grant-type support with token refresh
- OpenAPI/Swagger import
- CSV/XLSX preview & import flows
- WebSocket / SSE / GraphQL support

Tracked as GitHub issues; no fixed timeline.

---

## License

MIT © Ashwin Sathian. See [LICENSE](LICENSE).
