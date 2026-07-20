# Wayfarer

[![CI](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml/badge.svg)](https://github.com/AshwinSathian/wayfarer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Coverage](https://img.shields.io/badge/coverage-not%20yet%20measured-lightgrey.svg)](CONTRIBUTING.md)

**The API client that can't rug-pull you.**

Wayfarer is a local-first API client. No account. No cloud. No telemetry. Everything — requests, collections, secrets — lives in your browser, encrypted at rest, exportable any time. When you outgrow solo use, sync and team features will be opt-in and self-hostable, never a requirement.

**Live demo:** https://api-sandbox.ashwinsathian.com/

---

## Why Wayfarer?

- **You can't be locked out of your own work.** Everything you build lives on your device by construction, not by policy — there's no update, acquisition, or pricing page that can gate access to data you already own.
- **Zero clutter, just the essentials.** Compose a request and see a clean, structured response.
- **Great defaults.** Sensible method/body pairing, helpful validation, and safe fallbacks.
- **Shareable results.** Export a request/response as **HAR 1.2** for teammates and tooling.
- **No cloud, no account, no telemetry.** Collections, environments, history, and secrets all live **per‑browser, per‑device** in **IndexedDB (IDB)** — nothing is ever uploaded.
- **Dark‑first UI**, with a fully designed light theme. Minimal, accessible, and keyboard‑friendly.

---

## Highlights

- **Request Composer**

  - Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
  - URL field with live validation
  - Query Params, Headers, Auth (Bearer / Basic / API Key), and Scripts tabs
  - Body editor (enabled only when it makes sense), with an optional **Monaco JSON editor** mode for power users
  - **Copy as cURL** for any request

- **Pre/Post-Request Scripts & Test Assertions**

  - Monaco-backed script editor with a `pm.environment` / `pm.response` / `pm.test` / `pm.expect` API for dynamic auth, request chaining, and response validation
  - Scripts run sandboxed in an isolated Web Worker with no access to the page, DOM, cookies, or network — see [`docs/scripts.md`](docs/scripts.md) for the full, verified isolation model
  - A visual, no-code test assertion builder (10 operators across status/body/headers/duration) as a friendlier alternative to scripting
  - Results surface in a dedicated **Tests** tab in the response viewer

- **Response Viewer**

  - Pretty JSON with collapsible sections, across **Body**, **Headers**, **Timings**, and **Tests** tabs
  - Timing (DNS → Connect → TTFB → Total) and size breakdowns
  - Copy helpers and raw view

- **Collections & Environments**

  - Collections tree with folders, drag/drop reorder, inline rename, and one-click **load into composer**
  - Environment manager with a dropdown switcher and live `{{var}}` autocomplete chips showing source + resolved value as you type
  - Deterministic collection import/export

- **Secrets Vault**

  - Client-side, encrypted-at-rest secrets: PBKDF2 (200k iterations, SHA‑256) key derivation + AES‑GCM‑256, ciphertext-only in IndexedDB, key held in memory only
  - Guided first-use passphrase setup flow — see [`docs/secrets.md`](docs/secrets.md)

- **History & Navigation**

  - History drawer with date‑grouped, relative timestamps
  - Re‑run and delete entries
  - Command palette (⌘K) for fast keyboard-driven navigation

- **Exports**

  - **HAR 1.2** – Standard archive for HTTP requests/responses (great for bug reports)
  - Large bodies are safely truncated/omitted in exports to keep files lightweight

- **PWA**

  - Installable from the browser; dark and light themes are both intentionally designed, not one inverted from the other

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

# 4) Production build (optimized, hashed — the same build CI runs)
npm run build

# 5) Lint / test
npm run lint
npm run test:ci
```

**Notes**

- Calling third‑party APIs may require CORS to be enabled by that API. For private APIs, consider a proxy if needed.
- History, collections, environments, and secrets are stored locally in **IndexedDB** and are **specific to the browser and device** you're using.

---

## How it works (in 60 seconds)

- The **Request Composer** accepts a URL, method, query params, headers, auth, and (if applicable) a JSON body.
- Optional pre-request and post-response scripts (or visual assertions) run before/after the call.
- The app sends the request and shows:
  - **Body** (pretty‑printed for JSON)
  - **Headers**
  - **Timings** (DNS → Connect → TTFB → Total, plus size breakdowns)
  - **Tests** (assertion + script results)
- Each request can be **saved to a Collection** for later reuse, or replayed from **History**.
- You can **export** any call as HAR to share with teammates or attach to tickets.

---

## Privacy & Data

- Everything — requests, history, collections, environments, and secrets — is stored **locally** in your browser via **IndexedDB (IDB)**.
- **Nothing is uploaded** to our servers; there is no backend and no account system.
- You're in control: clear individual entries or wipe the entire history anytime.
- Need a clean slate? Hit **Reset All** in the toolbar — it closes the IDB connection, deletes the local database, clears app-specific storage, and reloads the app.

---

## FAQ

**Does this replace Postman/Insomnia?**  
No. Wayfarer is intentionally smaller and faster for everyday calls, docs checks, and quick debugging.

**Why HAR?**  
It's widely accepted by browsers, proxies, and observability tools, and is great for attaching to bug reports.

**Can I use form data or files?**  
Current focus is JSON APIs. Form/file helpers may land later.

**Will there be a light theme?**  
Yes — dark and light themes both ship today, each intentionally designed.

**Are my secrets/API keys safe?**  
Secrets are encrypted at rest with AES‑GCM‑256 and a PBKDF2‑derived key that only ever exists in memory. See [`docs/secrets.md`](docs/secrets.md) for the full model, and [`docs/scripts.md`](docs/scripts.md) for what scripts can and can't reach.

**Wait, wasn't this called API Sandbox?**  
Yes — this project was renamed from API Sandbox to Wayfarer. Same app, same storage model, same MIT license: only the name and identity changed, never the promise that your data stays on your device. See the [CHANGELOG](CHANGELOG.md) for details.

---

## Contributing

Contributions are welcome — bug reports, small UX wins, docs tweaks, or focused features that keep the app fast and simple.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch/PR flow, and code style expectations.
- This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
- Found a security issue? Please follow [SECURITY.md](SECURITY.md) rather than opening a public issue.

Please open an issue to propose non-trivial changes before a PR, and keep scope tight.

## Docs

- [Collections schema](docs/collections-schema.md)
- [Secrets model](docs/secrets.md)
- [Storage layout](docs/storage.md)
- [Scripts & sandbox model](docs/scripts.md)

---

## Roadmap (public intent, not a contract)

- JSONPath search/filter in responses
- Full OAuth2 grant-type support with token refresh
- OpenAPI/Swagger import
- CSV/XLSX preview & import flows
- WebSocket / SSE / GraphQL support

See [`docs/plans/plan-product-roadmap.md`](docs/plans/plan-product-roadmap.md), the Phase 4 backlog in [`docs/plans/plan-specimen-modernization.md`](docs/plans/plan-specimen-modernization.md), and the rebrand/enterprise roadmap in [`docs/plans/plan-rebrand-enterprise-strategy.md`](docs/plans/plan-rebrand-enterprise-strategy.md) for the full, ranked list.

---

## License

MIT © Ashwin Sathian — see [LICENSE](LICENSE).
