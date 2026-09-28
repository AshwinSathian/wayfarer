# Wayfarer

[![CI](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml/badge.svg)](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/AshwinSathian/wayfarer?style=flat&color=yellow)](https://github.com/AshwinSathian/wayfarer/stargazers)

**The API client that can't rug-pull you.**

Wayfarer is a local-first API client. No account. No cloud. No telemetry. Your requests, collections, environments and history live in your browser's IndexedDB, exportable any time; values you put in the secrets vault are encrypted, everything else is stored as plain text. When you outgrow solo use, sync and team features will be opt-in and self-hostable, never a requirement.

> **v1.1.0 status:** some features are disabled or limited while an audit's findings are fixed. See [Known limitations](#known-limitations).

**Live demo:** https://wayfarer.ashwinsathian.com/

---

## Why Wayfarer?

- Your work stays on your device. There's no account or server, so no update, acquisition, or pricing page can gate access to data you already have. Browser storage can still be cleared or evicted (Safari removes site data after 7 days without a visit), so export what you can't lose.
- Zero clutter, just the essentials. Compose a request and see a clean, structured response.
- Great defaults: sensible method/body pairing, helpful validation, and safe fallbacks.
- Shareable results. Export a request/response as **HAR 1.2** for teammates and tooling.
- No cloud, no account, no telemetry. Collections, environments, history, and secrets all live **per‑browser, per‑device** in **IndexedDB (IDB)**, and none of it is uploaded anywhere.
- Dark‑first UI, with a fully designed light theme. Minimal, accessible, and keyboard‑friendly.

---

## Highlights

- **Request Composer**

  - Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
  - URL field with live validation
  - Query Params, Headers, Auth (Bearer / Basic / API Key), and Scripts tabs
  - Body editor (enabled only when it makes sense), with an optional **Monaco JSON editor** mode for power users
  - **Copy as cURL** for any request

- **Pre/Post-Request Scripts & Test Assertions**

  - Monaco-backed script editor with a small `pm.environment` / `pm.response` / `pm.test` / `pm.expect` subset of Postman's script API
  - **Scripts are disabled in the hosted app** while the sandbox is rebuilt ([#58](https://github.com/AshwinSathian/wayfarer/issues/58)); scripts you write are saved but not run. See [`docs/scripts.md`](docs/scripts.md)
  - A visual, no-code test assertion builder (10 operators across status/body/headers/duration) as a friendlier alternative to scripting
  - Results surface in a dedicated **Tests** tab in the response viewer

- **Response Viewer**

  - Pretty JSON with collapsible sections, across **Body**, **Headers**, **Timings**, and **Tests** tabs; HTML, XML and text bodies shown as text; binary bodies offered as a download
  - Total duration and size; phase timings (DNS → Connect → TTFB) only when the server sends `Timing-Allow-Origin`, which most cross-origin APIs don't ([#69](https://github.com/AshwinSathian/wayfarer/issues/69))
  - Copy helpers and raw view

- **Collections & Environments**

  - Collections tree with folders, drag/drop reorder, inline rename, and one-click **load into composer**
  - Environment manager with a dropdown switcher and live `{{var}}` autocomplete chips showing source + resolved value as you type
  - Deterministic collection import/export

- **Secrets Vault**

  - Client-side, encrypted-at-rest secrets: PBKDF2 (200k iterations, SHA‑256) key derivation + AES‑GCM‑256, ciphertext-only in IndexedDB, key held in memory only
  - Protected values can't be used in requests yet: a request that references one is blocked instead of sending the placeholder ([#60](https://github.com/AshwinSathian/wayfarer/issues/60))
  - Guided first-use passphrase setup flow; see [`docs/secrets.md`](docs/secrets.md)
  - A dedicated **Secrets management view** listing every secret across every environment in one place, with lock-aware reveal, rename, delete, and a "locate" chip that jumps to wherever a secret is referenced

- **History & Navigation**

  - History drawer with date‑grouped, relative timestamps
  - Re‑run and delete entries
  - Command palette (⌘K) for fast keyboard-driven navigation

- **Layout & Settings**

  - Resizable split between the composer and response viewer on desktop, with the chosen ratio remembered across reloads
  - A rebuilt mobile composer: one section open at a time, instead of every tab stacked and unlabeled
  - A dedicated **Settings** view for theme, environments export/import, Reset All Data, Local Bridge configuration, and a keyboard-shortcuts reference
  - Deliberate, reduced-motion-aware animation on tab switches, response arrival, and dialogs

- **Exports**

  - **HAR 1.2** – Standard archive for HTTP requests/responses (great for bug reports)
  - Large bodies are safely truncated/omitted in exports to keep files lightweight

- **PWA**

  - Installable from the browser (no offline support yet, see [#63](https://github.com/AshwinSathian/wayfarer/issues/63)); dark and light themes are both intentionally designed, not one inverted from the other

---

## Quick Start (Local)

> Requires **Node 20+** and a modern browser.

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
- History, collections, environments, and secrets are stored locally in **IndexedDB** and are **specific to the browser and device** you're using.

---

## How it works (in 60 seconds)

- The **Request Composer** accepts a URL, method, query params, headers, auth, and (if applicable) a JSON body.
- Optional pre-request and post-response scripts (or visual assertions) run before/after the call.
- The app sends the request and shows:
  - **Body** (pretty‑printed for JSON)
  - **Headers**
  - **Timings** (total duration and sizes; phase timings when the server allows them)
  - **Tests** (assertion + script results)
- Each request can be **saved to a Collection** for later reuse, or replayed from **History**.
- You can **export** any call as HAR to share with teammates or attach to tickets.

---

## Privacy & Data

- Everything (requests, history, collections, environments, and secrets) is stored **locally** in your browser via **IndexedDB (IDB)**.
- **Nothing is uploaded** to Wayfarer; there is no backend and no account system. The hosted app is served as static files by Cloudflare, which, like any web host, sees your IP address and user agent when the page loads (see the [Trust Center](docs/trust-center.md#subprocessors)).
- Only vault secrets are encrypted. History keeps the request headers that were sent, including `Authorization`, in plain text ([#71](https://github.com/AshwinSathian/wayfarer/issues/71)).
- You're in control: clear individual entries or wipe the entire history anytime.
- Need a clean slate? **Settings → Reset all data** deletes the local database and app-specific storage, then reloads. If another Wayfarer tab still has the data open, it tells you to close that tab instead of claiming success.

---

## FAQ

**Does this replace Postman/Insomnia?**  
No. Wayfarer is intentionally smaller and faster for everyday calls, docs checks, and quick debugging.

**Why HAR?**  
It's widely accepted by browsers, proxies, and observability tools, and is great for attaching to bug reports.

**Can I use form data or files?**  
Current focus is JSON APIs. Form/file helpers may land later.

**Will there be a light theme?**  
Yes, dark and light themes both ship today, each intentionally designed.

**Are my secrets/API keys safe?**  
Values in the secrets vault are encrypted at rest with AES‑GCM‑256 and a PBKDF2‑derived key that only exists in memory. Keys typed directly into headers or the Auth tab are not: they are stored in plain text in collections and history. See [`docs/secrets.md`](docs/secrets.md) for the full model.

**Wait, wasn't this called API Sandbox?**  
Yes, this project was renamed from API Sandbox to Wayfarer. Same app, same storage model, same MIT license: only the name and identity changed, never the promise that your data stays on your device. See the [CHANGELOG](CHANGELOG.md) for details.

---

## Known limitations

A September 2026 audit found gaps between these docs and the code. Each is an open issue with label [`audit-2026-09`](https://github.com/AshwinSathian/wayfarer/issues?q=label%3Aaudit-2026-09), scheduled in [`PLAN-airtight-remediation.md`](PLAN-airtight-remediation.md). The ones you are most likely to hit:

- Scripts are disabled in the hosted app ([#58](https://github.com/AshwinSathian/wayfarer/issues/58)).
- Vault secrets can't be used in requests yet ([#60](https://github.com/AshwinSathian/wayfarer/issues/60)).
- Binary responses download but don't preview ([#62](https://github.com/AshwinSathian/wayfarer/issues/62)); no offline support ([#63](https://github.com/AshwinSathian/wayfarer/issues/63)).
- The vault passphrase can't be rotated ([#66](https://github.com/AshwinSathian/wayfarer/issues/66)).
- No request cancel or timeout ([#67](https://github.com/AshwinSathian/wayfarer/issues/67)); duration includes script time ([#68](https://github.com/AshwinSathian/wayfarer/issues/68)).
- History and exports hold credentials in plain text ([#71](https://github.com/AshwinSathian/wayfarer/issues/71), [#72](https://github.com/AshwinSathian/wayfarer/issues/72)).
- No full-workspace backup; browser storage can be evicted ([#73](https://github.com/AshwinSathian/wayfarer/issues/73), [#74](https://github.com/AshwinSathian/wayfarer/issues/74)).
- The script API covers a small part of Postman's `pm.*` ([#77](https://github.com/AshwinSathian/wayfarer/issues/77)); no Postman/OpenAPI/cURL import ([#78](https://github.com/AshwinSathian/wayfarer/issues/78)).
- The Local Bridge is a global switch and isn't on npm ([#79](https://github.com/AshwinSathian/wayfarer/issues/79)).

---

## Contributing

Contributions are welcome: bug reports, small UX wins, docs tweaks, or focused features that keep the app fast and simple.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch/PR flow, and code style expectations.
- This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
- Found a security issue? Please follow [SECURITY.md](SECURITY.md) rather than opening a public issue.

Please open an issue to propose non-trivial changes before a PR, and keep scope tight.

## Docs

- [Collections schema](docs/collections-schema.md)
- [Secrets model](docs/secrets.md)
- [Storage layout](docs/storage.md)
- [Scripts & sandbox model](docs/scripts.md)
- [Local Bridge (optional CORS/intranet relay)](local-bridge/README.md)
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
