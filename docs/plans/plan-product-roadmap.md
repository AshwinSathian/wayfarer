# Plan: Product Roadmap — Where to Take This
> **Destroy this file after implementation is complete.**
> This document covers Phase 3 and beyond. Phase 2 (parity + polish) is tracked in `plan-feature-audit.md`.

---

## 1. Competitive Landscape

### Market Map

| Tool | Model | Strengths | Weaknesses | Pricing |
|---|---|---|---|---|
| **Postman** | Cloud-first | Team collab, scripting, mock servers, monitors, Newman CLI, OpenAPI, docs generation | Account required, bloated, slow, paywalled team features, data leaves device | Free / $14/mo/user |
| **Insomnia** | Cloud-optional | Clean UX, plugins, git sync, GraphQL/gRPC/WebSocket, OpenAPI import | Less active post-Kong acquisition, cloud recommended | Free / $8/mo/user |
| **Bruno** | Local-first / git-native | No cloud, files on disk (git-friendly), CLI runner, open source | Rough UX, no encryption, steeper for non-devs | Free (paid Pro coming) |
| **Hoppscotch** | Web-first | WebSocket/SSE/GraphQL/gRPC, real-time, open source, beautiful | Account for teams, web-only (Electron port exists but secondary), less collection depth | Free (OSS) / $12/mo (Cloud) |
| **Thunder Client** | VS Code extension | Lightweight, deeply VS Code-integrated | VS Code only, limited features | Free / $12/yr |
| **Yaak** | Local-first, Rust | Beautiful UX, no cloud, fast, all protocols | Very new (2024), limited ecosystem, no extensions | Free beta |
| **RapidAPI (Paw)** | Mac-native | Excellent Mac UX, code gen, extensions | Mac-only, expensive, declining investment | $20/mo |

### What Competitors Do Better Than Us (as of today)

| Capability | Who has it | Our gap |
|---|---|---|
| Auth presets (Bearer/Basic/API Key/OAuth) | Everyone | Missing — tracked in feature-audit plan |
| Query params editor | Everyone | Missing — tracked in feature-audit plan |
| Copy as cURL | Everyone | Missing — tracked in feature-audit plan |
| Pre/post request scripts | Postman, Insomnia, Bruno | Missing |
| Test assertions / response validation | Postman, Hoppscotch, Bruno | Missing |
| OpenAPI / Swagger import | Postman, Insomnia, Yaak | Missing |
| Import from Postman / Insomnia | Bruno, Yaak, Hoppscotch | Missing |
| WebSocket support | Postman, Insomnia, Hoppscotch, Yaak | Missing |
| GraphQL (introspection + query editor) | Postman, Insomnia, Hoppscotch | Missing |
| Code generation (curl, fetch, axios, etc.) | Postman, Insomnia, Hoppscotch | Missing (adding cURL in audit phase) |
| Collection runner (batch execution) | Postman, Insomnia, Bruno | Missing |
| Response comparison / diff | Nobody does this well | **Opportunity** |
| SSE viewer | Hoppscotch, Insomnia | Missing |

### What We Do Better Than Competitors

| Capability | Why it's better |
|---|---|
| **Encrypted at-rest secrets** | No other mainstream API client encrypts environment secrets. Postman stores secrets as plaintext. Bruno keeps them in plain JSON files. This is a genuine differentiator for security-conscious users. |
| **Network timing waterfall** | The granular TTFB/DNS/TCP/TLS breakdown is present in browser DevTools but not in any API client UI. Postman's timings are minimal. We show the full waterfall with phases, sizes, and CORS-limitation detection. |
| **Privacy-first, no account** | Bruno is the only competitor in this space. We match it but with a far better UX. |
| **Angular PWA (no Electron)** | All desktop-native tools (Postman, Insomnia, Bruno on desktop) ship as Electron apps (100MB+ installs, high memory). We are a PWA — installable from the browser, <5MB, no separate binary. |
| **Keyboard-first design** | Command palette, keyboard shortcuts, context menus — more complete than most web-based tools |

---

## 2. Positioning

> **API Sandbox is the beautiful, privacy-first API client for developers who refuse to compromise between UX quality and local data ownership.**

Everything that follows flows from this. Decisions against it:
- ❌ Cloud sync / accounts — breaks "local data ownership"
- ❌ Team features with server-side data — breaks privacy-first
- ❌ Feature bloat (mock servers, documentation generation, monitors) — breaks "beautiful"
- ❌ Electron desktop app — breaks the PWA/web advantage

Decisions for it:
- ✅ End-to-end local data (IDB + encryption)
- ✅ Design quality over feature quantity
- ✅ Performance (Web Workers, PWA caching, no Electron overhead)
- ✅ Protocol breadth without cloud dependency

---

## 3. Phase 3 — Differentiation (after Phase 2 parity work)

Phase 2 (feature audit plan) gets us to parity. Phase 3 is where we pull ahead.

### 3.1 Pre/Post Request Scripts

**What it enables**: Users write small JavaScript snippets that run before/after a request. This unlocks:
- Dynamic authentication (generate HMAC signatures, JWT tokens)
- Chaining requests (set environment variable from one response, use in next)
- Data generation (random UUIDs, timestamps in request body)
- Response validation (assert status codes, check body shape)

**Scope**: Sandboxed JS execution via `new Function()` or a simple interpreter — NOT Node.js, NOT full eval. Expose a minimal API surface:
```typescript
// Available inside scripts:
pm.environment.get('key')       // read env var
pm.environment.set('key', val)  // write env var (session-scoped, not persisted)
pm.response.json()              // parsed response body (post-request only)
pm.response.code                // HTTP status code
pm.response.headers.get('name') // response header
pm.test('label', fn)            // assert, result shown in response Test Results tab
console.log(...)                // visible in script output panel
```

**Implementation approach**:
- Store pre/post script as `string` fields on `RequestDoc` (`preRequestScript`, `postRequestScript`)
- Execute pre-script in `ApiParamsComponent.sendRequest()` before HTTP call, inside a try/catch
- Execute post-script in the response handler, after parsing response
- Show script execution errors inline (red banner below script editor)
- Script editor: Monaco (already have it) in JavaScript mode
- Security: no DOM access, no network inside scripts (block `fetch`, `XMLHttpRequest`), no `import`

**Why this is better than Postman's implementation**: Postman scripts are powerful but documentation is poor and the Sandbox API is complex. We can design a simpler, better-documented API surface from scratch.

### 3.2 Test Assertions

**What it enables**: After a request, automatically verify the response matches expectations. Results persist alongside the response — making API Sandbox useful for basic regression testing, not just ad-hoc exploration.

**Scope**: A simple visual assertion builder (no code required) plus the `pm.test()` API from scripts (§3.1):

**Visual assertions** (built from dropdowns + inputs):
```
[Status code] [equals] [200]
[Response body] [contains key] [data.users]
[Response body key: data.users] [is array]
[Response body key: data.users[0].id] [matches] [uuid]
[Response header: content-type] [contains] [application/json]
[Duration] [less than] [500ms]
```

**Test results display**: A "Tests" tab in the response viewer (alongside Body, Headers, Timings) showing pass/fail for each assertion with actual vs expected values.

**Storage**: Assertions stored as structured data in `RequestDoc.tests?: TestAssertion[]`. Results not persisted — only shown for the current response.

**Why developers want this**: Most API client users manually verify responses by eye. Having one-click assertions they can set up once and run every time they open a request reduces cognitive load and catches regressions early (e.g., "this endpoint suddenly started returning 401 after a deploy").

### 3.3 Response Comparison / Diff

**What it enables**: Compare two API responses side by side — same endpoint before/after a change, two different environments, two different parameter sets.

**Why this matters**: No API client does this well. Postman has a 3rd-party visualizer plugin. Nobody has first-class diff.

**Use cases**:
- Compare response from staging vs production environments
- Compare response before/after a code change (select from history)
- Compare two different query parameter combinations

**UX**:
- "Pin response" button on current response → stores as "baseline"
- Next response automatically shows a diff view alongside it
- JSON diff: key-by-key with added (green), removed (red), changed (amber) highlighting
- Can diff raw text for non-JSON responses too (line-based diff)

**Implementation approach**:
- Add a `pinnedResponse` signal in `ApiParamsComponent` to hold a snapshot
- Create `DiffViewerComponent` that takes two JSON objects and renders a recursive diff tree
- Library: `fast-json-patch` can compute JSON patch operations (add/replace/remove) — use it to power the diff, then render the patch visually

**This is a genuine competitive advantage** — no mainstream API client offers first-class response comparison. It's a power-user feature that gets shared on dev Twitter ("look at this response diff in API Sandbox").

### 3.4 OpenAPI / Swagger Import

**What it enables**: Point at an OpenAPI 3.x or Swagger 2.0 spec (URL or file) and automatically generate a collection with all endpoints, their schemas, example request bodies, and descriptions.

**Why it's essential**: Most developers work with APIs that have an OpenAPI spec. Being able to import it directly removes the most tedious part of setting up a new API to test.

**Scope**: Parse spec → generate Collection + Folders (by tag) + RequestDocs (one per operation). Populate:
- Method + URL (with path params as `{{paramName}}` variables)
- Headers (Content-Type from spec `consumes`)
- Request body schema as example JSON
- Request description from spec `operationId` / `description`

Do NOT generate test assertions or mock responses from the spec in this phase — just the request scaffold.

**Implementation approach**:
- Use `@readme/openapi-parser` or the smaller `openapi-types` + hand-written traversal
- Support: OpenAPI 3.0, OpenAPI 3.1, Swagger 2.0
- Entry point: File upload (existing import UI pattern) or URL fetch
- Error handling: Partial import (skip unparseable operations, warn user)

### 3.5 Import from Postman / Insomnia Collections

**What it enables**: Users migrate from Postman/Insomnia without re-entering their collections manually. This is the #1 onboarding friction for users coming from other tools.

**Scope**:
- **Postman Collection v2.1**: The most common export format. Parse `item[]` tree into our Collection/Folder/Request structure.
- **Insomnia v4 export**: Similar tree structure, different schema.
- Map auth settings (bearer, basic) to our auth model (once §auth tab is implemented)
- Map environment variables to an imported environment
- Skip anything that doesn't map cleanly (pre/post scripts if not yet supported) with a warning

**Implementation approach**:
- Reuse the existing import dialog UI pattern (file upload → analysis → conflict plan → confirm)
- Add a format detector: examine JSON root keys to identify Postman vs Insomnia vs our native format vs OpenAPI
- Create `postman-import.util.ts` and `insomnia-import.util.ts` alongside existing `collection-io.util.ts`

### 3.6 Code Generation (Export as Code)

**What it enables**: One click to get the current request as executable code in any language. This is how developers share requests with teammates who use different tools.

**Formats** (prioritised by developer demand):
1. **cURL** — already tracked in feature-audit plan, implement first
2. **JavaScript fetch** — universal, no dependencies
3. **Axios** — most popular Node.js HTTP client
4. **Python requests** — most popular Python HTTP library
5. **httpie** (CLI) — popular alternative to curl
6. **TypeScript (fetch)** — typed version of #2

**UX**: Button group "Copy as..." with format picker, or a dedicated "Code" tab in the response/request panel showing the generated snippet in Monaco (read-only, with syntax highlighting).

**Implementation approach**:
- Add to `export.util.ts`: `buildFetchSnippet()`, `buildAxiosSnippet()`, `buildPythonSnippet()` etc.
- All take the same `ExportContext` interface (already exists)
- Variable values resolved to actual values before code generation (same as HAR export)

### 3.7 Collection Runner

**What it enables**: Execute an entire collection or folder sequentially. Each request runs in order; responses are collected and shown as a summary (pass/fail if tests exist, or status code + duration per request).

**Why developers want this**: Manual testing of "user journey" scenarios (create account → login → use API → logout) requires clicking each request manually. The collection runner automates this.

**Scope**:
- "Run collection" button in collections sidebar (context menu + command palette)
- Execution order: same as tree order (the `order` field is already set)
- Between requests: respect `postRequestScript` environment mutations (variables set in script carry into next request's environment)
- Result view: A table of all executed requests with status code, duration, test results (pass/fail), and a time-series bar chart
- Stop execution on first failure (optional toggle)
- No parallel execution in this phase — strictly sequential

**Implementation approach**:
- `CollectionRunnerService` that takes an ordered list of `RequestDoc`, resolves variables, calls `MainService.sendRequest()` sequentially
- Results stored in component-level signal (not persisted — too large)
- Runner UI as a full-screen modal or dedicated route

---

## 4. Phase 4 — Advanced Protocol Support

Implement after Phase 3 is stable. These require deeper architectural changes.

### 4.1 WebSocket Support

**UX**:
- Request method selector gets a "WS" option (alongside GET, POST, etc.)
- Connecting: shows connection state (Connecting → Connected → Disconnected)
- Message panel: split into "Send" (text input) and "Receive" (message stream, newest at top)
- Each message: timestamp, direction (→ sent / ← received), size, expandable content
- Disconnect button

**Architecture**:
- `WebSocketService` wrapping the browser `WebSocket` API
- Messages stored as a session-scoped array (not persisted to IDB — connections are ephemeral)
- `RequestDoc.protocol?: 'http' | 'ws'` discriminator field
- URL bar uses `ws://` or `wss://` protocol detection to auto-switch mode

### 4.2 Server-Sent Events (SSE) Viewer

**UX**:
- GET request to an `text/event-stream` endpoint auto-switches to SSE viewer
- Events stream into a live log (newest at top, with event type + data + timestamp)
- "Stop" button disconnects
- Copy full event log as JSON

**Architecture**:
- Detect SSE via response `Content-Type: text/event-stream`
- Use `EventSource` API (browser-native)
- Or: use `fetch` with `ReadableStream` for fine-grained control (allows custom headers, unlike EventSource)

### 4.3 GraphQL Support

**UX**:
- New request type "GraphQL" (separate from HTTP)
- Schema introspection: fetch + cache `__schema` from the endpoint
- Query editor: Monaco with GraphQL syntax + IntelliSense against the introspected schema
- Variables panel: JSON editor for `variables`
- Operation name field (for multi-operation documents)
- Response: standard response viewer (GraphQL responses are JSON)

**Architecture**:
- `GraphQLService` that handles introspection (sends POST `{"query": "{ __schema { ... } }"}`)
- Introspection result cached in IDB with TTL (avoid re-fetching on every open)
- Monaco GraphQL language provider: `monaco-graphql` package
- `RequestDoc.graphql?: { query: string, variables: Record<string, unknown>, operationName?: string }` extension field

---

## 5. Phase 5 — Unique Long-Term Vision

These are directional, not scheduled. Validate with users before building.

### 5.1 Response Visualization
Transform JSON array responses into charts and tables:
- `[{date: "2024-01", value: 42}, ...]` → auto-detect series data → offer line/bar chart
- `[{id: 1, name: "Alice", ...}, ...]` → offer table view with sortable columns
- This is a "magic" feature — zero configuration required

### 5.2 API Monitoring (Scheduled Requests)
Run a request on a cron schedule (in a Service Worker periodic task) and maintain a status history. Alerts for status code changes or error responses. Entirely local — no external infrastructure.

### 5.3 Share Request Link (No Server)
Encode the current request state (URL, method, headers, body — NOT secrets) as a base64 URL fragment: `https://apisandbox.app/#req=<base64>`. Anyone who opens the link has the request pre-filled. No server needed; state lives in the URL.

### 5.4 Browser Extension
A companion browser extension that:
- Intercepts XHR/fetch calls from any website
- Sends captured requests to the main PWA ("Import from browser")
- Useful for reverse engineering APIs, debugging web apps

---

## 6. Build vs Buy vs Integrate

| Capability | Build it ourselves | Use a library | Notes |
|---|---|---|---|
| JSON diff | ✅ Build | `fast-json-patch` for computation | Visual renderer is custom |
| OpenAPI parsing | Library | `@readme/openapi-parser` | Spec is complex, don't parse yourself |
| GraphQL IntelliSense | Library | `monaco-graphql` | Heavy but necessary for good UX |
| Script sandbox | ✅ Build minimal API | — | Keep surface area small |
| WebSocket | ✅ Browser native | — | No library needed |
| SSE | ✅ Browser native | — | EventSource or fetch + ReadableStream |
| Code generation | ✅ Build | — | Templates are simple, no library needed |
| Postman import | ✅ Build | — | Schema transformation, manageable |
| Response visualization | Library | `chart.js` or `d3.js` | Don't build a charting lib |

---

## 7. What We Will NOT Build

Explicitly out of scope to maintain positioning:

- **Cloud sync or accounts**: Kills privacy-first positioning. If users want team sharing, they use our native export/import + their own file sharing (git, email, Slack).
- **Mock server / service virtualisation**: Postman's territory. Complex, rarely used well, adds operational burden.
- **API documentation generation**: Not our use case. Users who need docs use Stoplight, ReadMe, or Redocly.
- **Postman-level scripting (npm packages, full Node.js)**: Scope creep, security surface nightmare. Our scripting sandbox is intentionally minimal.
- **Electron desktop app**: We are a PWA. No Electron.
- **Native mobile app**: No meaningful use case for API testing on mobile.

---

## 8. Prioritised Implementation Order

```
Phase 2 (Feature Audit) — current sprint
  ├── Remove NDJSON, type selectors, redundant buttons
  ├── Fix URL validation
  ├── Add Auth tab (Bearer/Basic/API Key)
  ├── Add Query params editor
  ├── Add Copy as cURL
  ├── Improve history panel
  ├── Add response status bar
  ├── Activate PWA
  └── Method badges in tree

Phase 2 (Design System) — parallel with Feature Audit
  ├── Foundation: tokens, Tailwind config, font stack, Aura preset
  ├── Typography + color normalization
  ├── Component redesign (toolbar, sidebar, request form, response viewer)
  └── Light mode + polish

Phase 3A — Pre/Post Scripts + Test Assertions (together, mutually reinforcing)
Phase 3B — OpenAPI Import (high adoption unlock)
Phase 3C — Postman/Insomnia Import (migration unlock)
Phase 3D — Code Generation (extend cURL to full suite)
Phase 3E — Response Comparison / Diff (differentiator)
Phase 3F — Collection Runner (depends on pre/post scripts)

Phase 4 — WebSocket → SSE → GraphQL (in that order)
```

---

## 9. Success Metrics (per phase)

These are qualitative signals, not vanity metrics (we have no telemetry and won't add any):

| Phase | Signal of success |
|---|---|
| Phase 2 | A developer can pick up the app cold and send an authenticated request in under 60 seconds without reading any docs |
| Phase 3A | A user can chain two requests (login → use token in next request) without touching the URL or headers manually |
| Phase 3B | Importing a real-world OpenAPI spec (e.g., Stripe, GitHub, PetStore) generates a usable collection with <5 manual corrections |
| Phase 3C | A Postman user can migrate their workspace to API Sandbox in one import action with no data loss |
| Phase 4 | A WebSocket connection to a real WS echo server works end-to-end on first attempt |
