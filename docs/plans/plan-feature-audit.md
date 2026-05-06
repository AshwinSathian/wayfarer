# Plan: Feature Audit & Cleanup
> **Destroy this file after implementation is complete.**

---

## 1. Feature Inventory

Every feature and subsystem that currently exists in the app:

| # | Feature | Description | Value Assessment |
|---|---|---|---|
| 1 | Request Composer | URL + method + headers + body editing | HIGH — core function |
| 2 | Basic editor mode (pairs) | Key-value pair UI for headers/body | MEDIUM — useful for simple requests but has UX friction |
| 3 | JSON editor mode (Monaco) | Monaco-based JSON editor for headers/body | HIGH — power user essential |
| 4 | Body type selectors | String/Number/Boolean toggles per row in basic mode | LOW — confusing, rarely needed, JSON editor handles types |
| 5 | Variable resolution chips | Real-time `{{var}}` preview in request fields | HIGH — unique, genuinely useful |
| 6 | URL validation | Regex validation of endpoint URL | MEDIUM — current regex is too strict (see §2) |
| 7 | Response Viewer | Body/Headers/Timings tabs | HIGH — core function |
| 8 | Response JSON search | Case-insensitive search with excerpt + navigation | HIGH — useful, especially for large responses |
| 9 | Beautify / Minify buttons | JSON formatting in response viewer | LOW — Monaco handles this natively; these are redundant |
| 10 | Timings waterfall | Network phase breakdown (DNS/TCP/TLS/TTFB etc.) | HIGH — unique, developer-facing value |
| 11 | HAR 1.2 export | Copy response as HTTP Archive | MEDIUM — useful for debugging/sharing but niche |
| 12 | NDJSON export | Download as newline-delimited JSON | LOW — virtually unknown format to most developers |
| 13 | Collections sidebar | Hierarchical collection/folder/request tree | HIGH — core function |
| 14 | Collections drag-drop | Reorder requests/folders within a collection | MEDIUM — nice to have, works |
| 15 | Command palette (⌘K) | Quick-access to collection actions | HIGH — power user feature, differentiating |
| 16 | Context menu (right-click) | Right-click actions on tree nodes | MEDIUM — duplicates command palette |
| 17 | Collections import/export | JSON import with conflict analysis | HIGH — essential for portability |
| 18 | Environments manager | Environment creation, variable editing, import/export | HIGH — core function |
| 19 | Pairs / JSON editor tabs in environments | Two modes for editing environment variables | MEDIUM — JSON tab rarely used for environments |
| 20 | Secrets encryption | PBKDF2+AES-GCM encrypted variable values | HIGH — unique, security-critical for teams |
| 21 | Lock/unlock toolbar button | Session-scoped secret access | MEDIUM — the UX is confusing for first-time users |
| 22 | History panel | 50 most recent requests, replay/delete | MEDIUM — exists but buried and information-poor |
| 23 | JSON Web Worker | Off-thread formatting/search for large JSON | HIGH — invisible perf optimization, keep |
| 24 | HAR auth placeholder model | `auth?: HttpAuthPlaceholder` in RequestDoc | VERY LOW — modelled but completely unimplemented in UI |
| 25 | PWA service worker config | `ngsw-config.json` exists but not activated | MEDIUM — configured but never turned on |
| 26 | Variable focus service | Click variable chip → jump to environment editor | HIGH — subtle but delightful UX detail |

---

## 2. Verdict: Keep / Improve / Remove

### REMOVE — Things that add noise without proportional value

#### #12 — NDJSON Export
**Why remove**: NDJSON (Newline-Delimited JSON) is an obscure serialisation format used primarily in log streaming pipelines. API client users have no use case for downloading a single response as NDJSON. In user testing, "Export → NDJSON" would be invisible to >95% of users and confusing to the rest. The export menu currently shows two options: HAR (useful, standard) and NDJSON (confusing, niche). Having an unknown option next to a known one dilutes the perceived quality of the export feature.

**What to do**: Remove the `ExportFormat.Ndjson` path in `export.util.ts`, the menu item in `response-viewer.component.ts`, and the spec test for NDJSON output. Keep HAR.

#### #9 — Beautify / Minify buttons
**Why remove**: Monaco Editor has built-in format document (`⇧⌥F`) and the JSON body is already pretty-printed on arrival from the Angular response parser. These buttons duplicate Monaco's capability and add two buttons to an already-crowded toolbar row. The edge case where the user actually wants to minify the _displayed_ response (not copy it) is contrived.

**What to do**: Remove the Beautify and Minify `<button>` elements from `response-viewer.component.html`. Remove the `beautifyResponse()` and `minifyResponse()` methods from `response-viewer.component.ts`. The response arrives formatted; the worker handles large payloads. Users who want minified output can use the existing copy-raw path.

**Note**: Keep the underlying `JsonWorkerService.prettify()` — it still serves the response formatting pipeline. Just remove the UI buttons.

#### #4 — Body type selectors (String / Number / Boolean toggles)
**Why remove**: The basic editor shows a per-row data type dropdown (String, Number, Boolean) alongside the value input. The intention is good — it maps to JSON types when the request is serialised. However:
- Most users switch to JSON mode for typed bodies anyway
- The boolean dropdown with "true"/"false" text options is clunky
- Number detection could be done silently by inspecting the value (if it parses as a number, send it as one)
- It adds a third column to an already tight key-value-action grid

**What to do**: Remove the `showDataTypes` prop, the `dataTypes`/`availableDataTypes`/`booleanOptions` inputs from `api-params-basic.component`. Remove the type-selector column from the basic editor template. Body values in basic mode are sent as strings; JSON mode remains the canonical path for typed payloads. Update `ApiParamsComponent` to stop tracking `requestBodyDataTypes`.

---

### IMPROVE — Things with clear issues that need fixing

#### #6 — URL Validation (Bug Fix)
**Problem**: The current regex is:
```
^(https?:\/\/)?[a-z0-9]+([\-\.][a-z0-9]+)*\.[a-z]{2,5}(:\d{1,5})?(\/.*)?$i
```
This **rejects**:
- `http://localhost:3000` — no dot in hostname
- `http://127.0.0.1:8080` — IP addresses
- `http://api.internal/v1` — internal `.internal` TLD
- `https://my-api.co.uk/v2` — `.co.uk` is 5+ chars with dot
- URLs with query strings in the URL bar (though users will add them)

**Fix**: Replace with a permissive parser that only errors on clearly malformed input:
```typescript
private isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
```
Use the browser's native `URL` constructor — it handles all valid URL forms including localhost, IPs, custom ports, and complex paths.

#### #22 — History Panel (Significant UX Improvement)
**Problem**: The history panel is crammed into the bottom of the sidebar inside a `max-h-60 overflow-y-auto` container. On desktop this gives approximately 4-5 visible request rows. There is no method badge, no status code, no time displayed — just the truncated URL. The "Clear history" danger button is pinned to the bottom of the sidebar, permanently visible and large.

**What to do**:

1. **Move history out of the sidebar bottom section**. Give it a dedicated drawer/tab. Options:
   - History as a right-side drawer panel (mirror of the left sidebar) triggered by a toolbar button — clean and spatial
   - History as a full-page sheet triggered from toolbar — simpler to implement with PrimeNG Drawer

2. **Richer history item display**: Each history row should show:
   - Method badge (colored, monospace — see design system)
   - URL (truncated, monospace, `text-label-primary`)
   - Status code badge (colored green/red/amber by range)
   - Duration (`label-secondary`, formatted as "123ms" or "1.2s")
   - Timestamp (relative: "2 min ago", absolute on hover)

3. **Date grouping**: Group by Today / Yesterday / This week / Older

4. **"Clear history" button**: Move into an overflow menu or place it at the top with a confirmation, not as a permanent visible danger button at the sidebar bottom.

5. **Loading a history item**: After clicking a history item to load it, scroll to and focus the request composer URL input.

#### #7 (Response Viewer) + #10 (Timings) — Response Status Prominence
**Problem**: The response status code is only visible in the Headers tab. A user who looks at the Body tab has no immediate visual feedback on whether the request succeeded. The status 200/404/500 is the most important piece of response metadata.

**Fix**: Add a persistent status bar between the request button and the response viewer that shows:
- Status code badge (colored by range: 2xx green, 3xx blue, 4xx amber, 5xx red)
- Status text (e.g., "OK", "Not Found")
- Duration (e.g., "234ms")
- Response size (e.g., "12.4 KB")

This bar appears immediately after a response is received and stays visible regardless of which response tab is selected.

#### #21 — Secrets Lock/Unlock UX
**Problem**: First-time user experience is broken. A user who adds variables and tries to "Protect" one hits an error/confusion because they have never set a passphrase. There is no first-use setup flow.

**Fix**:
1. On first "Protect" action, if no vault exists: open a setup dialog that says "Create a vault passphrase to encrypt secrets. You'll need this to access secrets in future sessions." with passphrase + confirm passphrase fields.
2. After passphrase creation, automatically unlock for the session.
3. Add "Change passphrase" option (requires current + new + confirm passphrase, re-encrypts all secrets).
4. Add vault info in the lock/unlock tooltip: "Vault: 3 secrets encrypted. Click to unlock."

#### #13/#14 — Collections Tree: Add Method Badges to Request Nodes
**Problem**: The collections tree shows only node names. A collection with 20 requests named "Get users", "Create user", "Delete user" etc. provides full context from the name, but a collection with names like "users", "auth", "profile" provides none. The HTTP method is critical context that should be visible at a glance.

**Fix**: In `collections-sidebar.component.html`, update the tree item template to render a method badge when the node represents a request:

```html
<ng-template let-node pTemplate="default">
  <div class="flex w-full items-center gap-2">
    @if (node.data?.type === 'request') {
      <span class="method-badge method-{{node.data.method | lowercase}}">
        {{ node.data.method }}
      </span>
    }
    @if (editingKey() === node.key) {
      <input ... />
    } @else {
      <span class="text-sm">{{ node.label }}</span>
    }
  </div>
</ng-template>
```

The `CollectionsService.buildTree()` already has the method on request nodes via `RequestDoc.method` — just surface it in the template.

#### #18 — Environments: Layout and Selection Clarity
**Problem**: "Selected" (which environment you're editing) and "Active" (which environment resolves variables) are two different states represented by similar UI. Users are confused about why clicking an environment in the list doesn't change what environment is active for requests.

**Fix**:
1. Rename "Active" label to "In use for requests" with a green `●` indicator before the name
2. The row-level check button to "set active" should be more prominent — or, make the entire row click = set active (currently it = select for editing)
3. Split the two actions: clicking the env name = select for editing (current behavior), clicking a "Use for requests" action = set active

This is a UX/copy change, not an architectural one. The service layer already handles this correctly.

#### #24 — Auth Placeholder: Implement or Remove
**Problem**: `RequestDoc.auth?: HttpAuthPlaceholder` exists in the model with types `none | basic | bearer | custom`. It is stored in IndexedDB. It is never rendered, never populated from the UI, never applied to outgoing requests. This is dead code that inflates the model.

**Verdict**: Implement a minimal Auth tab (see §3 below — New Features). If not implementing in the current phase, remove the `auth` field from `RequestDoc` and `collection.schema.ts` to avoid model drift. Do not leave dead model fields.

#### #25 — PWA: Activate Service Worker
**Problem**: `ngsw-config.json` is configured. The `provideServiceWorker` call is commented out in `app.config.ts`. The PWA manifest exists with full icon set. This app would be genuinely useful as an installable PWA (desktop shortcut, works offline for static assets, opens instantly on reload). Everything needed is already in place — it just needs to be turned on.

**Fix**: Uncomment `provideServiceWorker` in `app.config.ts`. Test that offline mode shows a graceful "offline" state rather than broken UI for requests (requests need network, but the app shell should load offline).

---

## 3. New Features to Add (Scoped to This Audit Phase)

These are not speculative roadmap items — they are missing table-stakes features that all competitors have and that are needed for the app to feel complete.

### A. Auth Tab in Request Composer

The `auth` field on `RequestDoc` should be a first-class UI concept. Add an **Auth** tab alongside Headers and Body with three presets:

**Bearer Token**
- Single input: "Token"
- On send: adds `Authorization: Bearer <token>` header automatically (does not pollute the Headers tab)

**Basic Auth**
- Two inputs: "Username" and "Password"
- On send: adds `Authorization: Basic <base64(user:pass)>` header
- "Show password" toggle

**API Key**
- Three inputs: "Key name", "Key value", "Send as" (Header or Query param)
- If Header: adds `<key>: <value>` to request headers
- If Query param: appends `?<key>=<value>` to URL

**None** (default)
- No auth applied

**Implementation notes**:
- Auth values support `{{variable}}` interpolation (same resolution as headers/body)
- Auth tab content is saved to `RequestDoc.auth` when the request is saved to a collection
- Auth values are applied just before HTTP dispatch in `ApiParamsComponent.sendRequest()`, not stored in the headers/body form state
- Do NOT add OAuth 2.0 in this phase — it is complex and requires redirect handling. Defer to Phase 3.

### B. Query Params Editor

Currently users type `?foo=bar&baz=qux` directly in the URL. This is fine for simple cases but breaks variable interpolation, makes long URLs unreadable, and doesn't allow disabling individual params.

Add a **Params** tab (between URL bar and Headers tab, or as a section above headers):
- Key-value pairs editor (same `app-api-params-basic` component, `showDataTypes: false`)
- Params sync bidirectionally with the URL bar:
  - Typing `?foo=bar` in URL → auto-populates pairs
  - Adding a pair → appends to URL
- Each row has an enabled/disabled toggle (same as headers disabling)
- On send: enabled params are serialised into the URL query string

**Implementation notes**:
- Parse URL on input with `new URL(endpoint)` to extract `searchParams`
- Build final URL for dispatch by merging base URL + enabled params
- Store params as `Record<string, string>` in `RequestDoc.params` (field already exists in the model but unused in UI)

### C. "Copy as cURL" Export

This is the most universally requested feature in every API client. It allows sharing a request as a command anyone can run in their terminal.

**Output format**:
```bash
curl -X POST 'https://api.example.com/users' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer abc123' \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

**Implementation**:
Add `buildCurlCommand(context: ExportContext): string` in `export.util.ts`:
- Method → `-X METHOD` (omit for GET)
- Headers → `-H 'key: value'` per header
- Body → `-d 'json'` for POST/PUT/PATCH
- Query params → encoded into URL
- Variable values resolved before output (use already-resolved values from ExportContext)

Add a "Copy as cURL" button to the response viewer export menu AND to the request composer (as a standalone icon button next to "Send").

The request-side copy-as-cURL (pre-send) is arguably more useful than post-send — it allows sharing before you've even sent it. Add it to both surfaces.

---

## 4. Summary Table

| Feature | Action | Priority |
|---|---|---|
| NDJSON export | **Remove** | Immediate |
| Beautify/Minify buttons | **Remove** | Immediate |
| Body type selectors (String/Number/Boolean) | **Remove** | Immediate |
| URL validation regex | **Fix (bug)** | Immediate |
| Auth placeholder model w/o UI | **Remove dead field** OR implement Auth tab | High |
| History panel | **Improve** — move, add metadata, group by date | High |
| Response status bar (persistent) | **Add** | High |
| Method badges in collections tree | **Improve** | High |
| Secrets first-use setup flow | **Improve** | High |
| PWA service worker activation | **Fix** | Medium |
| Auth tab (Bearer / Basic / API Key) | **Add** | High |
| Query params editor | **Add** | High |
| "Copy as cURL" | **Add** | High |
| Environment active vs selected UX | **Improve** (copy/UX only) | Medium |
| Collections: load request scrolls to composer | **Fix** | Medium |
| Secrets: change passphrase capability | **Improve** | Low |
| Environments JSON editor tab | Keep as-is | — |
| JSON Web Worker | Keep as-is | — |
| Collections drag-drop | Keep as-is | — |
| Command palette | Keep as-is | — |
| Variable focus service | Keep as-is | — |
| HAR export | Keep, improve discoverability | Medium |

---

## 5. Code Locations for Each Change

| Change | File(s) |
|---|---|
| Remove NDJSON | `shared/inspect/export.util.ts`, `response-viewer.component.ts`, `export.util.spec.ts` |
| Remove Beautify/Minify | `response-viewer.component.html`, `response-viewer.component.ts` |
| Remove type selectors | `api-params/basic-editor/basic-editor.component.html|ts`, `api-params.component.html|ts` |
| Fix URL validation | `api-params.component.ts` — replace `endpointPattern` regex |
| Remove `auth` dead field OR implement Auth tab | `models/collections.models.ts`, `data/idb.service.ts`, `shared/collections/collection.schema.ts` |
| History panel UX | `components/past-requests/past-requests.component.html|ts`, `app-shell.component.html|ts` |
| Response status bar | `api-params.component.html`, `response-viewer.component.html|ts` |
| Method badges in tree | `components/collections/collections-sidebar.component.html` |
| Secrets first-use flow | `components/environments/environments-manager.component.ts|html`, `app-shell.component.ts|html` |
| PWA activation | `app.config.ts` — uncomment `provideServiceWorker` |
| Auth tab | `components/api-params/` — new sub-component `auth-editor/` |
| Query params editor | `components/api-params/api-params.component.html|ts` — add Params tab, bidirectional URL sync |
| Copy as cURL | `shared/inspect/export.util.ts` — new `buildCurlCommand()`, `response-viewer.component.ts|html`, `api-params.component.html|ts` |
| Env active vs selected UX | `components/environments/environments-manager.component.html` — copy/class changes only |
| Collections: load → scroll | `components/collections/collections-sidebar.component.ts` — emit event; `api-params.component.ts` — handle focus |
