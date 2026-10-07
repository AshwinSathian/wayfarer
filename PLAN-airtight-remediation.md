# RFC: Airtight Remediation — make every Wayfarer claim true, tested, and shipped

> Status: LOCKED (v1.0, 2026-09-28; current v1.1.10, 2026-10-07). Changes after lock need an entry in section 16 (Change log).
> Scale: Epic
> Target start: 2026-09-29
> Created: 2026-09-28
> Author: Ashwin Sathian
> Estimated effort: 95 engineering days + 25% buffer = 119 days (~24 weeks) for one engineer (83 at lock; Phase 1.5 added 12 in v1.1.0)
> Supersedes: nothing (no prior plan in repo)
> Follow-on: re-run the Phase 2 competitive analysis after Phase 7 exit criteria pass

---

## 1. Goals

### Problem statement

A September 2026 adversarial audit found that Wayfarer's three differentiators are broken or incomplete in production, and that its public docs claim more than the code delivers:

- Every pre/post-request script fails on the production site. The sandbox worker calls `new Function(...)` (`src/app/shared/scripts/script-runner.worker.ts:275`), and Cloudflare serves that worker with `script-src 'self'` from `public/_headers`, so the browser throws a CSP `unsafe-eval` violation. Verified live on 2026-09-27.
- The secrets vault never places a secret on the wire. Protected variables hold `{{$secret.<uuid>}}`, `resolveTemplate` does a single pass, and `PLACEHOLDER_PATTERN` (`src/app/shared/environments/env-resolution.util.ts:21`) does not match `$`. `SecretsService.readSecret` is called only by UI components.
- Non-JSON responses render as Angular's parse-failure wrapper (`{"error":{},"text":"..."}`), because `MainService.sendRequest` (`src/app/services/main.service.ts:51`) uses `HttpClient` with its default `responseType: 'json'`. Verified live against httpbin `/html`, `/xml`, `/robots.txt` and `/image/png`.
- The Angular service worker turns DNS, CORS and connection failures into a synthetic `504 Gateway Timeout`. Verified live.
- The remaining findings are listed in section 12 (Traceability matrix), IDs F01–F42.

### What success looks like

When Phase 7's exit criteria pass, all of the following are true and verified by CI on every commit:

1. Every factual claim in `README.md` and `docs/trust-center.md` carries a claim ID. Each ID is enforced by at least one automated test that runs against production-equivalent headers in Chromium, Firefox and WebKit. CI fails if a claim has no test.
2. Every finding F01–F50 (F43 was found during Phase 1, F44–F50 during Phase 1.5) is closed by a merged task whose AC is met, or is explicitly moved to section 15 (Follow-up Work) with a reason.
3. A Postman user can import a v2.1 collection (with environment), run it in-app and from `npx wayfarer-cli`, and get identical pass/fail results for scripts inside the published compatibility matrix.
4. The production site passes a synthetic smoke suite every 6 hours. A failure opens a GitHub issue automatically.

### Decisions already made (2026-09-28, by the maintainer)

| Topic | Decision |
|---|---|
| Script engine | QuickJS compiled to WASM, running in a dedicated worker (`quickjs-emscripten`). Allow-list sandbox, not deny-list. |
| Postman compatibility | Implement the commonly used `pm.*` surface plus legacy `postman.*` globals, and publish a compatibility matrix. Unsupported calls throw a named error. |
| Scope | Everything: imports, body and response types, OAuth2, cookies, redirects, cancel/timeout, runner, CLI, GraphQL, WebSocket, SSE, multi-tab composer. |
| At-rest claim | Narrow the claim to what is true. Redact credentials from history, HAR, cURL and exports by default. Auth fields can reference vault secrets. An encrypted-workspace mode is follow-up work. |
| Browsers | Latest two versions of Chrome/Edge, Firefox and Safari are fully supported. Chromium-only APIs are progressive enhancements with a visible fallback. CI runs e2e on all three engines. |
| Escape hatch | No Electron and no extension. The Local Bridge becomes first-class: published to npm, with per-request routing, a cookie jar, raw headers and Private/Local Network Access handling. The UI discloses what the browser changed or hid. |
| Product goal | OSS traction now, enterprise later. Keep only enterprise foundations that cost little: SBOM, provenance, a self-host tarball and a test-backed Trust page. Drop SOC 2 roadmap prose. |
| Validation | No network telemetry. Add local-only in-app diagnostics that a user can copy into an issue, plus scheduled synthetic monitoring of production. |
| npm names | Unscoped `wayfarer-bridge` and `wayfarer-cli` (both unclaimed on 2026-09-28). Reserved in Phase 0 (P0.13). Scoping can be revisited later. |
| Cloudflare zone | Turn Bot Fight Mode off for the whole `ashwinsathian.com` zone (it can't be scoped to a hostname, and it forces JavaScript Detections). Disable Web Analytics, Email Obfuscation and Rocket Loader for the Wayfarer hostname with a Configuration Rule. Disable NEL for the zone. See P0.12. |
| History bodies | Stored by default, capped at 1 MB each; a setting turns this off. |
| Request timeout | Default 0 (no timeout), matching Postman; configurable per request and globally. |
| Plan file | Stays at the repo root while in progress; moved to `docs/archive/` at P7.8. |
| Compatibility fixtures | Newman's own integration collections (Apache-2.0) with Newman as the reference runner, plus two real-world MIT collections: Adyen and Microsoft Graph. See P4.2. |

## 2. Background

### Current state (verified in source, 2026-09-28)

- Angular 20.3, zoneless, PrimeNG 20, Monaco 0.54, `idb` 8, Tailwind 3. Deployed as static assets on Cloudflare Workers (`wrangler.jsonc`).
- Request path: `ApiParamsComponent.sendRequest()` → `RequestExecutionService.execute()` → `MainService.sendRequest()` → `HttpClient` (XHR backend; `provideHttpClient(withInterceptorsFromDi())` without `withFetch()` in `src/app/app.config.ts`).
- All composer and response state lives as signals in `ApiParamsComponent` (896 lines), which is why multi-tab is not possible today.
- Persistence: IndexedDB database `api-sandbox`, `DB_VERSION = 4` (`src/app/data/idb-schema.ts:106`). Stores: `history`, `collections`, `folders`, `requests`, `environments`, `secrets`, `meta`.
- `RequestDoc.body` is `unknown`, but the composer only builds `Record<string, unknown>` (`bodyObjectFromRows`).
- Scripts: `ScriptSandboxService` spawns a module worker per run and posts `{script, env, response}`. The worker strips 14 globals by reassignment and then calls `new Function`.
- Vault: `SecretCryptoService` imports the passphrase as PBKDF2 key material (200k iterations, SHA-256) and derives a per-secret AES-GCM key from each envelope's salt. There is no verifier and no DEK.
- History: `HistoryRepository` silently falls back to an in-memory array when IndexedDB fails. It stores resolved headers, including `Authorization`.
- 36 `catch {}` blocks in non-spec app code swallow errors silently.
- `IdbCoreService.resetDatabase()` resolves on `onblocked` and swallows errors, so "Reset All Data" can report success while another tab keeps the database alive.
- There is no `versionchange`, `blocked` or cross-tab handling. `RequestExecutionService.applyEnvMutations` writes a full `vars` object computed from an in-memory snapshot, which causes lost updates across tabs.
- CI: lint, unit (Vitest in Chromium), prod build, bridge tests and e2e. e2e serves `dist/` with `python3 -m http.server`, which applies no `_headers`, and runs Chromium only. The e2e suite calls live `jsonplaceholder.typicode.com` and `httpbin.org`.
- Deploy: `deploy.yml` rebuilds from source instead of deploying the artifact CI tested. No post-deploy smoke test, no rollback.
- Fonts and icons: `src/styles.css:3-5` imports Inter, JetBrains Mono and Material Symbols from Google Fonts. PrimeIcons is also bundled. There are two icon systems: 30 Material Symbols glyphs and 21 PrimeIcons.
- Local Bridge (`local-bridge/`) is `private: true` and not on npm. It joins `Set-Cookie` with `, `, does not decompress, decodes bodies as UTF-8 unless the content-type looks binary, and has no Private Network Access header.
- Repo traction as of 2026-09-28: 5 stars, 2 forks, 0 issues.

### Constraints

- Browser platform: Fetch forbids setting `Cookie`, `Host`, `Origin`, `Content-Length`, `Connection`, `Referer` (via `referrer` only), `Sec-*` and `Proxy-*` headers, and hides `Set-Cookie` plus any response header not in `Access-Control-Expose-Headers`. `redirect: 'manual'` returns an opaque redirect with no `Location`. None of this can be fixed in-page. The bridge is the only escape.
- CSP must never gain `'unsafe-eval'` or `'unsafe-inline'` for scripts. `'wasm-unsafe-eval'` is acceptable.
- The IndexedDB name `api-sandbox` is kept (see `docs/storage.md`).
- One engineer. Each phase must be independently shippable to production.

### Glossary

- **Claim ID**: `C-NNN`, a stable identifier for one public factual statement. Defined in `docs/claims.md`.
- **Prod-parity server**: the local static server used by e2e, which applies `public/_headers` exactly as Cloudflare does.
- **DEK / KEK**: data-encryption key (random AES-GCM-256, encrypts secrets) and key-encryption key (derived from the passphrase, wraps the DEK).
- **Taint**: tracking that a string value came from a vault secret, so it can be redacted wherever it is persisted or exported.
- **Core**: the framework-agnostic TypeScript package `packages/core`, shared by the web app and the CLI.

## 3. Non-Goals

- Not in scope: Electron app, browser extension, or a native desktop build.
- Not in scope: any Wayfarer-operated backend, account system, cloud sync, or team collaboration. Phase 2 of the market analysis may revisit this.
- Not in scope: an encrypted-workspace mode that encrypts collections and history (moved to Follow-up, section 15).
- Not in scope: gRPC, gRPC-web, Socket.IO, MQTT, SOAP-specific tooling, and WebSocket with custom handshake headers (the browser cannot set them; a bridge WebSocket proxy is follow-up).
- Not in scope: Postman features outside the compatibility matrix — `pm.visualizer`, monitors, mock servers, API spec hosting, `xml2js`, `cheerio`, `tv4`, `ajv` inside scripts.
- Not in scope: Digest, NTLM, Hawk, Akamai EdgeGrid, and OAuth 1.0 auth. Importers flag them as unsupported.
- Not in scope: Bruno `.bru` import (Bruno can export to Postman format), and File System Access "workspace folders" (a Phase 2 wedge candidate).
- Not in scope: SOC 2, ISO 27001, paid pen test, SSO/SCIM.
- Not in scope: rewriting the app away from Angular. (PrimeNG was also listed here at lock; D14 reversed that in v1.1.0, and Phase 1.5 removes it.)
- Not in scope: marketing site, launch campaign, positioning. The Phase 2 re-run owns these.

## 4. Architecture

### 4.1 Target system diagram

```
┌──────────────────────────── Browser tab (app origin) ─────────────────────────────┐
│ Angular UI (apps shell, composer tabs, viewers, runner UI, diagnostics)            │
│   │ signals                                                                        │
│   ▼                                                                                │
│ WorkspaceStore (tabs + drafts) ── RepoLayer (IDB v5) ── BroadcastChannel sync      │
│   │                                  │  Web Locks (migrations, env writes)        │
│   ▼                                                                                │
│ packages/core  (no Angular imports)                                                │
│   RequestModel ─ VariableResolver(scopes, dynamic vars, secrets, taint)            │
│   AuthProviders(basic, bearer, apikey, oauth2, sigv4, inherit)                     │
│   Importers/Exporters(postman, insomnia, openapi, curl, har, codegen)              │
│   Redactor ─ AssertionRunner ─ RunnerEngine ─ ScriptHost(pm API bindings)          │
│   │                                                                                │
│   ├─► Transport: FetchTransport (direct) | BridgeTransport (relay) | route policy  │
│   └─► ScriptHost ── postMessage ──► [Worker] QuickJS WASM VM (no host globals)     │
│                                        ▲ pm.sendRequest via host broker            │
│ VaultService (DEK/KEK, verifier, auto-lock, cross-tab lock) ─ WebCrypto            │
│ Custom service worker: same-origin precache ONLY, never intercepts cross-origin    │
└────────────────────────────────────────────────────────────────────────────────────┘
          │ direct fetch (CORS-bound)                 │ http://127.0.0.1:7717/relay
          ▼                                           ▼
     Target API                         wayfarer-bridge (npm, Node ≥ 20.19)
                                          raw headers, cookie jar feed, timings,
                                          decompression, redirect chain, proxy env

Node CLI: npx wayfarer-cli run <file> ── packages/core + undici fetch + QuickJS (node)
```

### 4.2 Component inventory

| Component | Path | New / Modified | Notes |
|---|---|---|---|
| npm workspaces root | `package.json` (`"workspaces": ["packages/*"]`) | Modified | App stays at repo root to avoid churn. |
| Core engine | `packages/core/` | New | Zero Angular imports, enforced by ESLint `no-restricted-imports` and its own `tsconfig`. |
| CLI | `packages/cli/` | New | Published as `wayfarer-cli` (reserved in P0.13). |
| Bridge | `local-bridge/` → `packages/bridge/` | Moved + Modified | Published as `wayfarer-bridge` (reserved in P0.13). |
| Transport | `packages/core/src/transport/{fetch,bridge,route-policy}.ts` | New | Replaces `MainService`, which is deleted. |
| Variable resolver | `packages/core/src/variables/resolver.ts` | New | Replaces `env-resolution.util.ts` resolution functions. Chip/token extraction moves too. |
| Redactor | `packages/core/src/redaction/redactor.ts` | New | Used by history, HAR, cURL, codegen, exports, diagnostics. |
| Script host | `packages/core/src/scripting/host.ts` + `src/app/shared/scripts/quickjs.worker.ts` | New | Deletes `script-runner.worker.ts` and rewrites `script-sandbox.service.ts`. |
| Vault v2 | `src/app/shared/secrets/vault.service.ts` | New | Supersedes `SecretCryptoService` session logic. Envelope v2. |
| Data layer v5 | `src/app/data/idb-schema.ts`, `idb-migrations.ts` | Modified | New stores: `tabs`, `globals`, `cookies`, `files`, `backups`, `diagnostics`, `vault`. |
| Workspace store | `src/app/state/workspace.store.ts` | New | Owns tabs and drafts. `ApiParamsComponent` becomes a view over the active draft. |
| Composer panels | `src/app/components/composer/*` | New (split from `api-params`) | url-bar, params, headers, body (per mode), auth, scripts, tests. |
| Response viewers | `src/app/components/response-viewer/viewers/*` | New | json, text, html (sandboxed iframe), xml, image, hex, and a search/JSONPath bar. |
| Service worker | `src/sw.ts` + `scripts/build-sw.mjs` | New | Replaces `@angular/service-worker` and `ngsw-config.json`. |
| CSP source | `security/csp.json` + `scripts/gen-csp.mjs` | New | Generates the `public/_headers` CSP line and the `src/index.html` meta. CI diff check. |
| Prod-parity server | `e2e/support/prod-server.mjs` | New | Serves `dist/` and applies `public/_headers`. |
| Echo fixture | `e2e/support/echo-server.mjs` | New | Deterministic target: CORS variants, content types, redirects, cookies, gzip, SSE, WS, mock OAuth IdP, delays. |
| Claims ledger | `docs/claims.md` + `scripts/check-claims.mjs` | New | CI gate. |
| Diagnostics | `src/app/components/diagnostics/*` + `src/app/services/diagnostics.service.ts` | New | Local only. |
| Icons | `src/app/shared/icon/icon.component.ts` + `src/assets/icons/*.svg` | New | Replaces Material Symbols webfont. |
| Fonts | `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` | New deps | Self-hosted. Removes Google Fonts. |

### 4.3 Data flow: send a request (target state)

```
User hits Send on tab T
 → WorkspaceStore.draft(T) snapshot (template form, unresolved)
 → ScriptTrust.check(collection)          [untrusted → modal, no execution]
 → ScriptHost.run(pre, ctx)               [QuickJS worker; pm.request mutable]
 → persist variable mutations             [one IDB tx per scope, Web Lock 'env-write']
 → VariableResolver.resolve(draft)        [scopes, dynamic vars, {{$secret.*}} via Vault]
      → returns ResolvedRequest + taint set (secret plaintexts)
      → unresolved {{x}} left? → block + inline error (override per send)
      → secret referenced while vault locked? → prompt unlock, never send placeholder
 → AuthProvider.apply(resolved)           [inherit chain; oauth2 refresh if expired]
 → BrowserLimits.lint(resolved)           [forbidden headers, preflight trigger, cookies]
 → RoutePolicy.choose(direct|bridge)      [per-request > collection > global setting]
 → Transport.send(resolved, AbortSignal, timeoutMs)
      → ResponseEnvelope {status, statusText, headers[] (multi), bodyBytes, contentType,
         redirected, finalUrl, timings (measured|unavailable+reason), route, sizes}
 → ScriptHost.run(post, ctx+response) → AssertionRunner.run(tests)
 → Redactor.apply(taint) → HistoryRepo.add(template + redacted resolved + capped body)
 → Viewer picks renderer by content-type + sniffing
```

### 4.4 Data model (IDB v5)

```ts
// packages/core/src/model/request.ts
type BodyMode = "none" | "raw" | "urlencoded" | "multipart" | "binary" | "graphql";
type RawLanguage = "json" | "text" | "xml" | "html" | "javascript";
interface RequestBody {
  mode: BodyMode;
  raw?: { language: RawLanguage; text: string };                 // template text, {{vars}} intact
  urlencoded?: { key: string; value: string; enabled: boolean }[];
  multipart?: ({ kind: "text"; key: string; value: string; enabled: boolean }
             | { kind: "file"; key: string; fileId: string; fileName: string; enabled: boolean })[];
  binary?: { fileId: string; fileName: string; contentType?: string };
  graphql?: { query: string; variables: string; operationName?: string };
}
type AuthConfig =
  | { type: "inherit" } | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" }
  | { type: "oauth2"; grant: "authorization_code_pkce" | "client_credentials" | "password";
      authUrl?: string; tokenUrl: string; clientId: string; clientSecret?: string;
      scope?: string; audience?: string; tokenRef?: string /* vault secret id */ }
  | { type: "awsv4"; accessKey: string; secretKey: string; region: string; service: string; sessionToken?: string };
interface RequestDocV2 {                       // RequestDoc schema version 2
  meta: Meta; collectionId: UUID; folderId?: UUID; name: string; order: number;
  method: string;                             // free text; forbidden methods blocked at send
  url: string; params: { key: string; value: string; enabled: boolean; description?: string }[];
  headers: { key: string; value: string; enabled: boolean }[];   // ordered, duplicates allowed
  body: RequestBody; auth: AuthConfig;
  scripts: { pre: string; post: string };
  tests: TestAssertion[]; settings: { timeoutMs?: number; followRedirects?: boolean; route?: "auto" | "direct" | "bridge" };
}
// Collection and Folder gain: variables: {key,value,enabled}[]; auth: AuthConfig; scripts; scriptTrust?: {trusted: boolean; hash: string}
// New stores: globals(key), tabs(id: draft + response snapshot ref), files(id: Blob, ≤ 50 MB each),
//   cookies(domain+path+name), backups(auto pre-migration snapshots, keep last 3),
//   diagnostics(ring buffer, 200 entries), vault(single record: kdf params, verifier, wrapped DEK)
```

Migration v4 → v5 (`migrateV4toV5` in `src/app/data/idb-migrations.ts`):

1. Snapshot all v4 stores into `backups` before transforming.
2. Convert `Record` bodies to `{mode: "raw", raw: {language: "json", text: JSON.stringify(body, null, 2)}}`.
3. Convert header `Record`s to ordered rows.
4. Map `HttpAuthPlaceholder` to `AuthConfig`.
5. Map `preRequestScript`/`postRequestScript` to `scripts`.
6. Mark every existing collection `scriptTrust.trusted = true`. The user authored it locally, and imports from the v4 format came from the user's own exports.
7. Move non-empty `RequestDoc.vars` into the parent collection's `variables` when the key is absent there; on a key collision keep the collection value and list the dropped request value in the migration report shown after upgrade.
8. Convert `history` records the same way (body and headers), so replay works after upgrade.
9. Move `{{$secret.*}}` references unchanged. The Vault v2 migration (Phase 2) re-wraps envelopes at first unlock.

Export format v2 gets a new `$id`. The importer accepts both v1 and v2.

### 4.5 Interfaces

```ts
// Transport
interface Transport { send(req: ResolvedRequest, opts: { signal: AbortSignal; timeoutMs: number }): Promise<ResponseEnvelope>; }
// Resolver
resolve(template: RequestDocV2 | Draft, scopes: ScopeStack, vault: VaultReader): Promise<{ request: ResolvedRequest; taint: Set<string>; unresolved: string[] }>;
// Script host
runScript(kind: "pre" | "post", src: string, ctx: ScriptContext, limits: { timeoutMs: 5000; memoryBytes: 64 * 2**20; maxSendRequests: 10; maxLogBytes: 1 * 2**20 }): Promise<ScriptResult>;
// Bridge protocol v2 (breaking; versioned via /health → { version, protocol: 2, capabilities: [...] })
POST /relay { method, url, headers: [name, value][], bodyB64?, followRedirects, timeoutMs, tls: { insecure?: boolean } }
 → 200 { status, statusText, headers: [name, value][] /* raw, Set-Cookie separate */, bodyB64, encodedSize, decodedSize,
         timings: { dns, tcp, tls, ttfb, download, total }, redirects: { status, location }[] }
```

### 4.6 Infrastructure changes

- `public/_headers`: CSP generated from `security/csp.json`. Adds `'wasm-unsafe-eval'` to `script-src` and `blob:` to `img-src`. Drops `fonts.googleapis.com` and `fonts.gstatic.com`. Adds `require-trusted-types-for 'script'` if spike P1.9 passes.
- CI: build once, upload `dist/` as an artifact. e2e runs the artifact on the prod-parity server in 3 browsers. Deploy downloads the same artifact.
- Deploy: `wrangler versions upload` → smoke against the version preview URL → `wrangler versions deploy` at 100% → prod smoke → on failure, `wrangler rollback`.
- New workflows: `synthetic.yml` (cron `0 */6 * * *`, prod smoke in 3 browsers, opens or updates an issue labeled `prod-down`), `release.yml` (tag → GitHub Release with `dist` tarball, CycloneDX SBOM via `npm sbom`, npm publish of CLI and bridge with `--provenance`), `codeql.yml`, `scorecard.yml`.
- All third-party GitHub Actions pinned to commit SHAs. Dependabot keeps them current.
- Cloudflare zone (manual, owner action, P0.12): Bot Fight Mode off zone-wide; a Configuration Rule turns off Web Analytics, Email Obfuscation and Rocket Loader for `wayfarer.ashwinsathian.com`; NEL off for the zone.

## 5. Alternatives considered

| Option | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| Native worker + scoped `unsafe-eval` | Stable filename for sandbox worker, per-path CSP header | Smallest diff, full JS speed | Deny-list isolation; new browser APIs (WebTransport, WebSocketStream, `fetchLater`) re-open exfiltration; `postMessage` result spoofing | Rejected (maintainer decision) |
| Opaque-origin sandboxed iframe | `<iframe sandbox="allow-scripts">` with `connect-src 'none'` | Browser-enforced network block | `frame-src 'none'` must be relaxed; iframe CSP inheritance differs per browser; main-thread jank | Rejected |
| QuickJS WASM in worker | Interpreter with zero host globals | Allow-list by construction, memory/instruction limits, identical engine in CLI (Node) | ~1 MB lazy chunk, ~10–50x slower than JIT, library shims needed | **Chosen** |
| QuickJS asyncify variant | Sync-looking `pm.sendRequest` | Simpler binding | 2x size, 40% speed, no nested async | Rejected: use the sync variant, VM promises, and `executePendingJobs()` |
| Keep Angular SW, use `ngsw-bypass` | Add a bypass header to API calls | No SW rewrite | Header on cross-origin requests triggers CORS preflight and changes the user's request | Rejected |
| Remove SW entirely | No offline support | Zero SW bugs | Drops PWA offline claim, install UX degrades | Rejected; custom same-origin-only SW chosen |
| Argon2id (WASM) for vault KDF | Memory-hard KDF | Stronger vs GPUs | Extra WASM, slow on mobile, no WebCrypto | Rejected; PBKDF2-SHA256 at 600,000 iterations (OWASP 2023) |
| Provenance-only taint tracking | Mark values as they flow | Precise | Loses taint through concatenation, base64 (Basic auth), HMAC inputs | Rejected alone; combined with output value-matching (section 6, D5) |
| `wrangler dev` for e2e | Real workerd applies `_headers` | Highest fidelity | Slower startup, occasional flake | Chosen for the nightly job; `prod-server.mjs` for PR e2e (fast); real version URL is the final gate |

## 6. Key decisions and trade-offs

- **D1 — Core extraction first (Phase 2) before new features.** Rationale: the runner, CLI and importers need the same resolver, auth and script host. Building them inside Angular components would need a second extraction later. Trade-off: about 3 weeks before visible new features. Phases 0 and 1 ship the P0 fixes before that.
- **D2 — Replace `HttpClient` in the request path with raw `fetch`.** Rationale: need raw bytes, `AbortSignal`, `redirect` control, `response.redirected`/`url`, no injected `Accept`, and duplicate header visibility. `HttpClient` stays for nothing in the request path.
- **D3 — Unresolved variables block send by default.** A one-click "Send anyway" keeps Postman's literal behaviour. Rationale: sending `{{token}}` to a production API is never intended. Postman users can turn the block off in Settings.
- **D4 — Secrets are never sent as placeholders and never persisted in plaintext outside the vault.** A request referencing a secret while locked prompts for unlock.
- **D5 — Redaction is output-based.** Before anything is written to history, exported (HAR, cURL, codegen, Postman), copied to the clipboard, or recorded in diagnostics:
  - every tainted plaintext of length ≥ 6 is masked, along with its base64, base64url and percent-encoded forms;
  - `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key` and headers matching `/token|secret|key|pass/i` are fully masked unless the user opts in per export.
  Rationale: provenance tracking alone misses derived values.
- **D6 — Scripts from imported collections are untrusted until approved.** Approval is stored as a SHA-256 hash of all scripts in the collection. Any change from a re-import re-prompts. Local edits update the hash automatically. Untrusted scripts do not run, and the request shows a banner. Rationale: `pm.sendRequest` plus secret access is an exfiltration channel, and shared collections are a supply-chain vector (F41).
- **D7 — Auto-routing never duplicates a non-idempotent request.** The bridge fallback happens only when:
  - (a) the browser request required a CORS preflight (the Fetch spec "non-simple" computation), so the real request was never sent; or
  - (b) the method is GET, HEAD or OPTIONS.
  Otherwise the user sees "The browser may have sent this request; retry via bridge?".
- **D8 — Vault v2 uses DEK/KEK.** Unlock is per tab; lock propagates to all tabs. A random AES-GCM-256 DEK encrypts secrets. The KEK is PBKDF2-SHA256 (600k, 16-byte salt) from the passphrase and wraps the DEK. A verifier (AES-GCM encryption of a fixed 32-byte constant under the DEK) validates unlock. Rotation re-wraps the DEK only. Auto-lock after 15 minutes idle (configurable 1–240, or never). A lock in any tab locks all tabs via BroadcastChannel `wayfarer:vault`.
- **D9 — Shortcuts avoid browser-reserved chords.** Browser tabs cannot intercept Cmd/Ctrl+T, W, N, Tab. New/close tab use Alt+T / Alt+W (Option on macOS), listed in the palette. An installed PWA (standalone window) additionally maps Cmd/Ctrl+T/W where the browser allows it.
- **D10 — Material Symbols webfont replaced by inline SVG icons.** Rationale: removes a Google request, removes ligature text leaking into accessible names (F33), and ships only the 30 used glyphs. PrimeIcons stays only where PrimeNG requires it (until Phase 1.5 removes both; D15).
- **D11 — Semver release per phase.** v1.1.0 (Phase 0), v1.2.0 (Phase 1), v1.3.0 (Phase 1.5), v2.0.0 (Phase 2: data model v5 and export v2 are breaking), v2.1–v2.5 for Phases 3–7.
- **D12 — Enterprise paperwork trimmed.** `docs/security-questionnaire.md` is merged into `docs/trust-center.md` as a "Procurement quick answers" section. The SOC 2 roadmap prose is replaced by one line: "No third-party audits or certifications exist."

- **D13 — Trusted Types enforced (spike P1.9, 2026-09-28).** `require-trusted-types-for 'script'` is in `security/csp.json`. With it enforced and no policy, Chromium, Firefox and WebKit reported exactly three sinks: `ServiceWorkerContainer.register('/sw.js')`, `new Worker(new URL('worker-*.js', import.meta.url))` (Monaco's editor/json/css/html/ts workers, the JSON worker, the script sandbox worker) and PrimeNG Tooltip's `innerHTML = ""`. Angular and Monaco use their own named policies and reported nothing. The fix is one `default` policy (`src/app/shared/security/trusted-types.ts`): script URLs only on the app's own origin over http(s), HTML only the empty string, no `createScript`. No `trusted-types` name allow-list: Monaco creates many version-specific policy names, and an allow-list would break editors on upgrade without adding sink protection. Claim C-016 tests it in 3 browsers.

- **D14 — Leave PrimeNG; move to Angular 22 first (maintainer, 2026-10-06).** Checked against the registry on 2026-10-06:
  - `primeng@22.1.2` ships a `LICENSE.md` titled "PrimeUI License" (commercial, licence key). `primeng@21.1.10` and `20.4.0` ship the MIT text.
  - `primeng@21` peers on `@angular/core ^21.0.7`; nothing MIT peers on Angular 22. `@primeng/themes` stops at 21.0.4.
  - So staying on PrimeNG caps the app at Angular 21, on a line that gets no further MIT releases.
  - The app is at its smallest now. Phases 2 and 5 add editors, viewers, tabs and a runner; building them on PrimeNG would mean migrating them later.
  - Trade-off: about 12 days with no new user-visible feature, and the project owns its widgets' accessibility. Mitigation: the 41 claim tests in 3 engines, plus a keyboard-only e2e per overlay and composite widget (P1.5.9–P1.5.14).
- **D15 — Replacement stack: Angular CDK primitives plus the project's own components.** They live in `src/app/ui/`, are standalone, signal-based and OnPush, and are styled with the existing tokens (`src/design-system/`, Tailwind).
  - Default: custom components on CDK and Tailwind. Angular Material (MIT, same release train as Angular and the CDK) is allowed where a custom widget would cost more than it is worth (maintainer, 2026-10-06); the migration map (P1.5.7) names each such widget and the reason, and Material is themed from the project's tokens so nothing looks different. No other UI library, and no other new runtime dependency without the maintainer's approval.
  - Native elements where they are enough (`<button>`, `<input>`, `<textarea>`, `<input type="checkbox">`, `<details>`); CSS for skeleton, spinner, chip, panel, toolbar and float label; CDK Overlay, Dialog, FocusTrap, Listbox, Menu, Tree, Accordion and DragDrop for the rest.
  - Icons: the existing inline-SVG `<app-icon>` replaces every `pi pi-*` glyph. This completes D10; no icon font remains.
  - Theme: the Aura preset is replaced by the project's own CSS custom properties. Dark and light look the same as before.
  - API rule: each component exposes only what the app uses today. No speculative options.

Trade-offs accepted:
- Scripts run slower than in Postman. Mitigation: host-native crypto shims, and a benchmark gate in P3.10.
- Chromium-only enhancements are limited to optional features.
- The bridge requires Node on the user's machine.
- About 20 weeks of work before the market re-analysis.

## 7. Risks

| # | Risk | L | I | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R1 | Scope too large for one engineer; plan stalls mid-way with half-shipped features | M | H | 6 | Every phase ships to prod behind its own release. Checkpoint after Phase 2: if actual/estimate > 1.5, move P5.5–P5.7 (GraphQL/WS/SSE) to Follow-up and re-baseline in this file. | Maintainer |
| R2 | IDB v4 → v5 migration corrupts or loses user data | M | H | 6 | Pre-migration snapshot to `backups` plus an offered download. Migration runs under Web Lock `wayfarer-migrate`. Fixture DBs from v1–v4 are migrated in unit tests. Property test: `migrate(v4Fixture)` preserves request count, URLs and header multiset. IDB cannot downgrade, so the old app's tabs get `versionchange` → forced reload banner. | Maintainer |
| R3 | QuickJS too slow for real Postman scripts (crypto-js HMAC, large JSON) | M | M | 4 | Benchmark gate P3.10. Crypto-js `HmacSHA256`/`SHA256`/`MD5`/`enc.Base64` get host-native sync shims (`@noble/hashes` on the host side). JSON parse and stringify of the response happen host-side and are passed in as a value. | Maintainer |
| R4 | Chrome Local Network Access (public → loopback permission) or Safari mixed-content rules block bridge calls from the HTTPS site | H | H | 9 | Spike P1.10 runs in Phase 1 week 1, before any bridge work. If Safari blocks `http://127.0.0.1`, the bridge serves HTTPS on loopback with a locally generated certificate the user trusts once, documented per OS. If the LNA prompt appears, the UI pre-explains it and the fetch passes `targetAddressSpace: "loopback"`. | Maintainer |
| R5 | Redaction misses a secret-derived value and it lands in history or exports | M | H | 6 | D5 output value-matching. Mutation testing ≥ 85% on `redactor.ts`. Property tests with random secrets across base64, URL-encode and concatenation. The export UI previews the redacted output before download. | Maintainer |
| R6 | 3-browser e2e flake makes CI untrustworthy | H | M | 6 | Deterministic local fixtures only (no internet in PR e2e). `@claim` tests may not use retries (a `retries: 0` project). A flake register in `e2e/FLAKES.md` needs an issue link. One external canary runs only in the nightly `synthetic.yml`. | Maintainer |
| R7 | Trusted Types breaks Monaco or PrimeNG | M | L | 2 | Spike P1.9. If it fails, record the decision in section 6 and ship without TT. Not blocking. | Maintainer |
| R13 | Replacing 26 PrimeNG entry points regresses behaviour or accessibility that no test covers | M | H | 6 | Test-first: an untested behaviour gets a test against the PrimeNG version before its slice starts. No test is deleted, skipped or loosened. One slice at a time, each fully green in 3 engines. Before/after screenshots of every view and dialog (P1.5.17). | Maintainer |
| R14 | PrimeNG 21 does not run on Angular 22 behind a peer override | M | M | 4 | Decided by experiment in P1.5.2. Fallback: Part A lands Angular 21, and Angular 22 lands after PrimeNG is gone (P1.5.15). PrimeNG 22 is never installed. | Maintainer |
| R8 | OAuth token endpoints lack CORS, so the flows fail in-browser | H | M | 6 | Token requests use RoutePolicy. When the bridge is unavailable, the error names the missing `Access-Control-Allow-Origin` and links `docs/browser-limits.md#oauth`. The mock IdP fixture tests both paths. | Maintainer |
| R9 | Bundle size regresses the "lightweight" feel (QuickJS, GraphQL, OpenAPI parser, Monaco) | M | M | 4 | All heavy modules load lazily. Budgets are set in P1.12 from the measured baseline and are CI-enforced. | Maintainer |
| R10 | Postman compatibility claims drift from reality | M | M | 4 | `docs/postman-compatibility.md` is generated from the conformance suite. Each row is a test. CI fails on mismatch. | Maintainer |
| R11 | npm names `wayfarer-cli` / `wayfarer-bridge` squatted before first release | L | L | 1 | Both unclaimed on 2026-09-28; reserved in Phase 0 (P0.13). Fallback: scope `@wayfarer-http/*`. | Maintainer |
| R12 | Custom SW ships a broken update and pins users on an old version | L | H | 3 | The SW never caches `index.html` beyond a network-first strategy. It checks the version manifest on each navigation. A kill-switch version (`sw-kill.js`) is committed, and its deploy is documented in `docs/deployment.md`. e2e covers the offline and update flows. | Maintainer |

## 8. Dependencies

- **Upstream / libraries (new):**
  - Runtime: `quickjs-emscripten` + `@jitl/quickjs-wasmfile-release-sync`, `chai` (bundled into the VM), `crypto-js`, `lodash`, `uuid`, `moment` (lazy, inside the VM), `yaml` (`maxAliasCount: 100`), `@scalar/openapi-parser` (TBC in P4.3 spike), `set-cookie-parser`, `jsonpath-plus` (only if it runs without eval under our CSP; otherwise a hand-written JSONPath subset), `graphql`, `@noble/hashes`, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono`.
  - Runtime (lazy, P5.5): `graphql-language-service`. Icons: Material Symbols SVG sources (Apache-2.0, attribution via `extractLicenses` + `THIRD_PARTY_NOTICES.md`).
  - Dev: `newman` (reference runner for golden results, P3.4 and P4.2), `fast-check`, `@stryker-mutator/core` + vitest runner, `knip`, `@lhci/cli` (P7.2), `lychee` link checker via its GitHub Action (P7.6).
- **Upstream / platform:** Cloudflare Workers static assets (`_headers`, versions, rollback), GitHub Actions, npm registry (provenance), Playwright browsers (Chromium, Firefox, WebKit).
- **Downstream:** users' existing IndexedDB data (v1–v4), existing exported collection/environment files (`$id` v1), the Phase 2 market re-analysis.
- **External / owner actions:** Cloudflare dashboard zone settings (P0.12), npm account with 2FA (P0.13), GitHub repo settings (enable private vulnerability reporting, branch protection requiring all CI jobs).
- **Blocked by:** nothing. P0.12 and P0.13 are owner actions in the Cloudflare dashboard and npm; everything else in Phase 0 can start without them.

## 9. Phases and milestones

Task format: `ID — task — AC`. Every AC is binary. "Tested" means a test exists in the named file and passes in CI.

### Phase 0 — Stop the bleeding and tell the truth (~4 days) → v1.1.0

**Goal:** no user-visible feature silently misbehaves, and no public claim is false, before any big refactor.

**Deliverable:** a production release where broken features are either fixed or visibly disabled with an explanation, and the docs match reality.

**Tasks:**

- [x] **P0.1** Write a failing tripwire test per P0 finding before fixing it: scripts under prod CSP must either run or show the disabled banner, never fail silently (F01), secret placeholder on the wire (F03), non-JSON body (F04), network-failure status (F06), auth-tab variable (F07), nested body variable (F08).
  - AC: `e2e/tripwire.spec.ts` exists; each test is linked to its F-ID in its title; the commit history shows each failing on `3a6ccb0` and passing after its fix.
  - Note: F01 must run against a server that applies `_headers`, so the minimal `e2e/support/prod-server.mjs` from P1.1 is pulled forward here.
- [x] **P0.2** Disable script execution in production builds. Show a banner in the Scripts tab: "Scripts are temporarily disabled while the sandbox is rebuilt (tracking #N)". Tests-tab assertions keep working.
  - AC: with prod headers, a request that has a script shows the banner, `ScriptSandboxService.execute` is never called (spy in the unit test), and the assertions still produce results.
- [x] **P0.3** Block sends that would transmit a literal `{{$secret.*}}`.
  - Scan the resolved URL, headers and body for `/\{\{\s*\$secret\./`. If found, show the inline error "Protected variables are not yet applied to requests; vault resolution ships in v2.0".
  - AC: tripwire F03 asserts no network request is made and the error text is visible.
- [x] **P0.4** Change `MainService.sendRequest` to `responseType: 'arraybuffer'`, decode text with `TextDecoder` (charset from content-type, default UTF-8), parse JSON only when content-type matches `/json|\+json/` or the text parses. Binary content-types show "Binary response (N bytes) — preview ships in v2.0" plus a Download button.
  - AC: tripwire F04 passes for text/html, application/xml and text/plain; image/png shows the binary notice, not mojibake.
- [x] **P0.5** Replace the Angular SW with Angular's shipped `safety-worker.js` (unregisters itself, clears caches), copied to the output path `ngsw-worker.js` so already-registered clients pick it up. Remove "works offline" wording from README, Trust Center and manifest description until P1.6.
  - AC: tripwire F06 shows "Network error" plus the CORS/DNS guidance, not 504; `navigator.serviceWorker.getRegistrations()` is empty after one reload in e2e.
- [x] **P0.6** Resolve `{{vars}}` in auth fields (bearer token, basic username/password, API-key name/value) and recursively in nested body values, arrays included.
  - AC: tripwires F07 and F08 pass; unit tests in `api-params.component.spec.ts` cover depth 3 and arrays.
- [x] **P0.7** Honest reset: `resetDatabase()` treats `onblocked` as failure.
  - It broadcasts `close` on BroadcastChannel `wayfarer:lifecycle` (other tabs close their DB and show "Data was reset in another tab — reload") and retries once after 2 s.
  - If the retry fails, the UI says "Close other Wayfarer tabs and try again". No `.catch(() => undefined)` remains.
  - AC: e2e with two pages: reset in page A succeeds and page B shows the banner; a unit test with a held connection gets the failure message.
- [x] **P0.8** Self-host fonts. Replace Material Symbols with the `<app-icon>` inline-SVG component (30 glyphs, `aria-hidden="true"`, with `aria-label` on the owning button). Remove Google domains from CSP (both copies).
  - AC: new `@claim` test `no-third-party-requests`: a full session (load, send to echo-server, open every view) makes 0 requests to origins other than the app and the user's target; with all non-self requests blocked in Playwright, the page loads with 0 failed requests; the accessibility snapshot contains no button named `bolt`, `upload`, `light_mode` or any other ligature name; `grep -r googleapis src public` returns nothing.
- [x] **P0.9** Claims correction pass on `README.md`, `docs/trust-center.md`, `docs/security-questionnaire.md`, `docs/secrets.md`, `docs/scripts.md`, `local-bridge/README.md` and `package.json` `description`.
  - Remove "everything encrypted at rest", "can't be locked out by construction", "Postman-grade", "no subprocessors" (name Cloudflare as static host that sees IP and user-agent), the passphrase rotation procedure, "retry through the bridge" and "works offline".
  - Add a "Known limitations" section linking the tracking issues.
  - AC: a reviewer checklist in the PR maps each removed or changed sentence to an F-ID, and none of the removed phrases appear in `grep -ri` over the repo.
- [ ] **P0.12** Cloudflare zone hardening (owner action, guided by `docs/runbook.md#cloudflare-zone`, written in this task). In the dashboard for `ashwinsathian.com`:
  1. Security → Bots → turn **Bot Fight Mode** off. This is zone-wide; there is no per-hostname scope, and while it is on, JavaScript Detections cannot be disabled.
  2. Rules → Configuration Rules → create rule "wayfarer-no-injection", matching `http.host eq "wayfarer.ashwinsathian.com"`, with Web Analytics (RUM) **off**, Email Obfuscation **off** and Rocket Loader **off**.
  3. Analytics & Logs → Web Analytics → if a site exists for the hostname, remove its automatic-setup rule.
  4. Network → **Network Error Logging** off (or `PATCH /zones/{zone_id}/settings/nel` with `{"value":{"enabled":false}}`).
  5. Record in the runbook what was changed and when, so it can be audited and reverted.
  - AC: `curl -s https://wayfarer.ashwinsathian.com/` contains neither `/cdn-cgi/challenge-platform` nor `cloudflareinsights`; `curl -sI` shows no `nel` or `report-to` header; a new `@claim` smoke test `no-edge-injection` asserts 0 CSP violation events on page load in 3 browsers and runs in `synthetic.yml` (P1.8), so a zone setting that is turned back on is caught within 6 h.
- [ ] **P0.13** Reserve the npm names (owner action, needs npm login with 2FA): publish `wayfarer-bridge@0.0.0-reserved` and `wayfarer-cli@0.0.0-reserved`, each with a README that says "Name reserved for github.com/AshwinSathian/wayfarer; first release ships with v2.4.0", npm points `latest` at the placeholder until the first real release replaces it, and the README says so.
  - AC: `npm view wayfarer-bridge maintainers` and `npm view wayfarer-cli maintainers` list the maintainer's npm account.
- [x] **P0.10** Open GitHub issues for every F-ID (label `audit-2026-09`) and link them from this file's section 12.
  - AC: 42 issues exist, and the matrix has an issue number per row.
- [ ] **P0.11** Release v1.1.0 with a CHANGELOG entry that lists what is disabled and why.
  - AC: tag `v1.1.0` exists, and the production site's Settings view shows version `1.1.0`.

**Exit criteria:**
- All tripwires green in CI.
- Production shows no false claims.
- No feature silently fails: each is either working or bannered.

### Phase 1 — Verification rails (~8 days) → v1.2.0

**Goal:** CI can catch every class of failure found in the audit before users see it.

**Deliverable:** 3-browser e2e on prod-parity headers, a claims ledger gate, artifact-once deploy with smoke tests and rollback, and a synthetic monitor.

**Tasks:**

- [x] **P1.1** `e2e/support/prod-server.mjs` (Node, zero dependencies): serves `dist/wayfarer/browser`, parses `public/_headers` (path globs and header lines), and falls back to SPA `index.html`. `playwright.config.ts` uses it in CI.
  - AC: `curl -sI localhost:4200/<sandbox worker>` shows the same CSP as production; a unit test covers the `_headers` parser with the 3 rule shapes Cloudflare documents.
- [x] **P1.2** `e2e/support/echo-server.mjs`: deterministic target on `127.0.0.1:4300` and a second origin on `:4301`. Routes:
  - `/echo` (reflects method, headers, body);
  - `/content/:type`;
  - `/redirect/:n`;
  - `/cookies/set`;
  - `/gzip`;
  - `/delay/:ms`;
  - `/status/:code`;
  - `/cors/{none,simple,full,no-expose}`;
  - `/sse`;
  - `/ws`;
  - `/oauth/{authorize,token}`;
  - `/big/:mb`;
  - Postman Echo–compatible routes used by Newman's integration collections, on their own origin `127.0.0.1:4302` so their paths match Postman's exactly (`/get`, `/post`, `/put`, `/patch`, `/delete`, `/headers`, `/response-headers`, `/cookies`, `/cookies/set`, `/cookies/delete`, `/basic-auth`, `/status/:code`, `/delay/:s`, `/gzip`, `/deflate`, `/encoding/utf8`), with the same JSON response shapes. Fixture URLs pointing at `postman-echo.com` are rewritten to the echo-server at load time.
  - AC: no e2e spec references `jsonplaceholder` or `httpbin` (`grep` in CI fails the build if any does).
- [x] **P1.3** Playwright projects for `chromium`, `firefox` and `webkit`, plus a `claims` project (retries 0) that runs tests tagged `@claim`.
  - AC: the CI e2e job runs 3 browsers and reports per-browser results; a test tagged `@claim` fails CI on first failure.
- [x] **P1.4** Claims ledger: `docs/claims.md` lists `C-001…` with statement, source doc and test file. Docs mark claims inline with `<!-- claim:C-001 -->`. `scripts/check-claims.mjs` fails if:
  - a doc marker has no ledger row;
  - a ledger row has no test whose title contains `@claim:C-001`;
  - a ledger row has no doc marker.
  - AC: `npm run check:claims` runs in the CI lint job; deleting any claimed test makes CI red (verified once in a throwaway PR).
- [x] **P1.5** CSP single source: `security/csp.json` → `scripts/gen-csp.mjs` writes the CSP into `public/_headers` and `src/index.html` (meta, without `frame-ancestors`).
  - AC: `npm run check:csp` fails when either file is hand-edited out of sync.
- [x] **P1.6** Custom service worker (`src/sw.ts`, built by `scripts/build-sw.mjs` with a hashed asset manifest):
  - network-first for navigations;
  - cache-first for hashed same-origin assets;
  - `if (new URL(request.url).origin !== self.location.origin) return;` so cross-origin traffic is never intercepted;
  - an update prompt when a new manifest is detected.
  - AC:
    - (a) e2e offline test: the app loads with the network disabled after one visit;
    - (b) a DNS-failure request shows the real network error in all 3 browsers;
    - (c) deploying a new build shows the "Update available" toast within one navigation;
    - (d) `@angular/service-worker` is removed from `package.json`;
    - (e) `ngsw-worker.js` keeps serving the safety worker permanently, so clients registered before v1.1.0 unregister; an e2e seeds an old registration and asserts it is gone after one navigation.
- [ ] **P1.7** Artifact-once pipeline:
  - `ci.yml` builds once, uploads `dist` (retention 14 days), and e2e and deploy consume it;
  - `deploy.yml` uses `wrangler versions upload`, then smoke (`@smoke` tests against the version URL), then `wrangler versions deploy`, then prod smoke, with `wrangler rollback` on failure.
  - AC: a deliberately failing smoke in a test branch leaves production unchanged (the previous version id is still active in `wrangler deployments list`).
- [ ] **P1.8** `synthetic.yml` (cron every 6 h) runs `@smoke` on production in 3 browsers and creates or updates an issue labelled `prod-down` on failure.
  - AC: a manual `workflow_dispatch` run against a broken preview URL opens the issue.
- [x] **P1.9** Spike: Trusted Types (`require-trusted-types-for 'script'`) with Angular, Monaco and PrimeNG.
  - AC: the decision is recorded in section 6 with the list of violations observed; if it passes, the header is in `security/csp.json`.
- [x] **P1.10** Spike, risk R4: bridge reachability from `https://wayfarer.ashwinsathian.com` to `http://127.0.0.1:7717` in the current stable Chrome, Firefox and Safari. Record LNA prompts, mixed-content blocks, and whether `Access-Control-Allow-Private-Network` is needed.
  - AC: `docs/browser-limits.md#bridge-reachability` has a 3-row result table with browser versions, and the Phase 6 design is updated if HTTPS loopback is required.
- [x] **P1.11** Hygiene gates:
  - ESLint `no-empty` with `allowEmptyCatch: false`, plus a custom rule or `no-restricted-syntax` banning `.catch(() => undefined)`;
  - `@typescript-eslint/no-explicit-any: error`;
  - `tsconfig.json` `lib` set to `["ES2022", "DOM", "DOM.Iterable"]`;
  - `knip` with zero unused files, exports or deps;
  - all 36 silent catches either rethrow or call `DiagnosticsService.record(error, context)` (a stub in this phase, completed in P7.3).
  - AC: `npm run lint` and `npx knip` pass with the rules enabled; `grep -rn "catch {" src/app --include=*.ts | grep -v '\.spec\.ts'` returns 0 lines. (The original `grep -v spec` also hid `src/app/shared/inspect/`; see change log v1.0.2.)
- [x] **P1.12** Measure the bundle baseline (initial JS/CSS transfer size, gzip) and set `angular.json` budgets to `maximumError = baseline × 1.10` for initial. Add a `bundle-report` CI artifact.
  - AC: budgets in `angular.json` equal the recorded baseline numbers in this file's Appendix A; the build fails if they are exceeded.
- [ ] **P1.13** *(Deferred 2026-09-28 by the maintainer, then scheduled as P1.5.5 in v1.1.0; ticked when P1.5.5 is.)* Coverage: Vitest v8 coverage in browser mode, with thresholds `src/app/**` lines ≥ 70% and `packages/core/**` lines ≥ 90% (enforced once core exists).
  - AC: CI fails below threshold.
- [ ] **P1.14** Supply chain:
  - pin all Actions to SHAs;
  - add `codeql.yml` and `scorecard.yml`;
  - add `npm audit signatures` to CI;
  - enable branch protection requiring the lint, unit, build, e2e (3 browsers), bridge and claims jobs.
  - AC: the Scorecard run completes and its score is recorded in Appendix A; a PR cannot merge with a red required job.

**Exit criteria:**
- Every Phase 0 tripwire runs in 3 browsers on prod-parity headers.
- Deploy is artifact-once with rollback proven.
- The synthetic monitor is live.
- The claims ledger covers every claim in README and Trust Center.

### Phase 1.5 — Platform reset: Angular 22, PrimeNG removed (~12 days) → v1.3.0

**Goal:** the app runs on the current Angular major with no PrimeNG, PrimeNG theme or PrimeIcons, so Phases 2–5 build their UI once, on the final stack (D14, D15).

**Deliverable:** Angular 22 with its coupled tooling; `src/app/ui/` components on CDK primitives; a coverage gate; a tighter Trusted Types policy; a smaller initial bundle. No new feature and no visual change.

**Rules for this phase (binding on every task):**
- No test is deleted, skipped, marked `.fixme` or loosened. A test that encodes a PrimeNG class gets a role- or label-based locator; its assertion stays.
- Every user-visible behaviour that exists before a slice exists after it. An untested behaviour of a component about to be replaced gets a test first, passing against the PrimeNG version.
- No redesign: same layout, spacing, colours and motion in both themes.
- A claim's wording changes only together with its ledger row and its test.
- Not touched: `ApiParamsComponent` structure beyond swapping widgets (P2.17 owns the split), Cloudflare settings, `ZONE_HARDENED`, `SYNTHETIC_ENABLED`.

**Delivery (maintainer decision, 2026-10-06):** every branch starts from `main` and merges back through a PR, continuously: one PR for Part A (`phase-1.5/a-angular-22`), then one PR per Part B slice (`phase-1.5/b-<slice>`). A PR merges when CI is green, except PRs that change security posture (CSP, Trusted Types), stored data or public claims, which wait for the maintainer's explicit OK. Node, TypeScript and the other tools move to whatever the target Angular version requires, without a separate decision.

**Baseline (main at `0dfe14b`, 2026-10-06, Node 24.19.0 locally):** see Appendix A, row "Phase 1.5 baseline".

**Part A — Angular upgrade**

- [x] **P1.5.1** Angular 20.3 → 21 with the official migrations (`ng update @angular/core@21 @angular/cli@21`, then `@angular/cdk@21`), PrimeNG 20 → 21 (MIT), and Vitest 3 → 4 with the browser provider package the Angular 21 unit-test builder requires. The migration output is read and recorded in the commit body.
  - AC: every baseline command passes; unit count ≥ 216 and e2e count ≥ 231; `ng version` shows 21.x; one commit.
- [x] **P1.5.2** Angular 21 → 22 (`ng update @angular/core@22 @angular/cli@22`, `@angular/cdk@22`). `.nvmrc` moves to a Node release inside Angular 22's range (`^22.22.3 || ^24.15.0`; today it is 22.16.0) and `engines.node` follows. PrimeNG stays at 21 behind an npm `overrides` entry for its Angular peers, commented as temporary and naming P1.5.15 as its removal.
  - AC: every baseline command passes in 3 engines with PrimeNG 21 on Angular 22; `ng version` shows 22.x; `npm ls primeng` shows 21.x. If any baseline command fails because of PrimeNG 21 on Angular 22, work stops and the maintainer chooses the R14 fallback; the failure output is recorded in section 16.
- [x] **P1.5.3** Coupled tooling, one commit each: the builders in `angular.json` move from `@angular-devkit/build-angular` to `@angular/build` (the package is then removed); TypeScript to the newest version in Angular 22's peer range (`>=6.0 <6.1` today; not TypeScript 7); `angular-eslint` 22; `typescript-eslint` to the newest release that supports that TypeScript; Vitest and its browser provider to the newest version in `@angular/build@22`'s peer range; `@types/node` to the `.nvmrc` major.
  - AC: every baseline command passes after each commit; `npm ls` reports no invalid peer other than the commented PrimeNG override; the lockfile installs with `npx npm@10 ci`.
- [x] **P1.5.4** Proofs that the upgrade broke nothing that tests do not already name, each a command with output kept in the commit body:
  - zoneless: `grep -rn "zone.js" src angular.json package.json` returns nothing and `provideZonelessChangeDetection` (or its Angular 22 default) is in effect;
  - service worker: `scripts/build-sw.mjs` runs in `npm run build` and `e2e/service-worker.spec.ts` passes in 3 engines;
  - Trusted Types: `e2e/trusted-types.spec.ts` reports 0 violations in 3 engines;
  - Monaco: the build output still contains the 5 Monaco worker chunks and the sandbox worker, and `e2e/layout.spec.ts` C-040 passes;
  - budgets: `npm run bundle:report` is re-run and the new numbers go into Appendix A with the reason for any change; a budget is raised only with a recorded reason, never silently;
  - `npx knip` is clean.
  - AC: all six hold; every deprecation warning that the migrations or the build print is either fixed or listed in section 16 with a reason.
- [x] **P1.5.5** Coverage gate (closes P1.13 for `src/app/**`): v8 coverage in browser mode through the unit-test builder's `coverage` and `coverageThresholds` options, lines ≥ 70% for `src/app/**`, enforced by `npm run test:ci` in CI. If measured coverage is below 70%, the number and the 10 largest uncovered files are reported, cheap tests are added, and the threshold is lowered only with the maintainer's decision.
  - AC: CI fails below the threshold, proven once by a throwaway PR that raises the threshold above the measured value (run link recorded in section 16); the measured percentage is in Appendix A.
- [x] **P1.5.6** Close the Dependabot PRs this supersedes (#45–#53, and #55 if every package in it is covered), each with a comment naming the PR that replaces it. #41–#43 (GitHub Actions) are not superseded and stay open.
  - AC: `gh pr list --author app/dependabot --state open` lists no npm PR for a package upgraded in P1.5.1–P1.5.3.

**Part B — PrimeNG removal** (starts when Part A's PR is merged)

Inventory re-measured on 2026-10-06 at `0dfe14b`: 26 `primeng/*` entry points in 16 files, plus `@primeng/themes` and `@primeng/themes/aura` in `src/app/app.config.ts`; 26 distinct `pi-*` tokens in `src` and `e2e`; 63 distinct `.p-*` selectors in `src` and `e2e`.

- [x] **P1.5.7** Migration map `docs/ui-migration.md`: one row per PrimeNG usage with its replacement, the CDK primitive behind it, the tests that cover it today and the tests to add, ordered by risk, lowest first. Shown to the maintainer; work continues unless they object. Deleted in P1.5.18.
  - AC: the file has a row for each of the 26 entry points, the Aura preset, every `pi-*` icon and every `.p-*` selector group; every row names at least one existing or planned test.
- [x] **P1.5.8** Slice 1, leaf controls: button, text input, textarea, checkbox, chip, skeleton, spinner, panel, toolbar, float label. Native elements and CSS under `src/app/ui/`.
  - AC: `grep -rnE "primeng/(button|inputtext|textarea|checkbox|chip|skeleton|progressspinner|panel|toolbar|floatlabel)" src` returns nothing; every baseline command passes in 3 engines; test counts are not lower.
- [x] **P1.5.9** Slice 2, tooltip and popover on CDK Overlay. The Trusted Types default policy loses `createHTML` (PrimeNG Tooltip's `innerHTML = ""` was its only reason); `docs/trust-center.md`, the C-016 ledger row and its test change together if the wording does.
  - AC: `primeng/tooltip` and `primeng/popover` are not imported; `allowHtml` and `createHTML` are gone from `src/app/shared/security/trusted-types.ts`; `e2e/trusted-types.spec.ts` reports 0 violations in 3 engines; a keyboard-only e2e covers each (focus shows the tooltip and Escape hides it; the popover opens, traps nothing, closes on Escape and returns focus).
- [x] **P1.5.10** Slice 3, tabs, accordion and select button, following the WAI-ARIA tabs, accordion and radio-group patterns.
  - AC: the three entry points are not imported; a keyboard-only e2e per widget (arrow keys, Home/End, Enter/Space) passes in 3 engines; `e2e/accessibility.spec.ts` has 0 critical or serious violations.
- [x] **P1.5.11** Slice 4, select, menu and context menu on CDK Overlay with Listbox and Menu.
  - AC: the three entry points are not imported; keyboard-only e2e per widget (open, arrow keys, type-ahead for select, Enter, Escape, focus return) passes in 3 engines.
- [x] **P1.5.12** Slice 5, dialog, drawer, confirm dialog and confirm popup on CDK Dialog with FocusTrap. `ConfirmationService` is replaced by a small typed confirm service.
  - AC: `primeng/dialog`, `drawer`, `confirmdialog`, `confirmpopup` are not imported and `ConfirmationService` does not appear in `src`; for each overlay a keyboard-only e2e proves focus moves in, Tab stays inside, Escape closes and focus returns to the trigger, in 3 engines.
- [x] **P1.5.13** Slice 6, splitter with pointer events and CSS, keyboard-resizable (`role="separator"`, arrow keys), ratio persisted as today.
  - AC: `primeng/splitter` is not imported; C-031 passes unchanged in 3 engines; a keyboard e2e resizes the split with arrow keys.
- [x] **P1.5.14** Slice 7, collections tree with drag-and-drop reorder, inline rename and context menu, on CDK Tree and DragDrop.
  - AC: `primeng/tree` is not imported; C-024 passes in 3 engines; a keyboard-only e2e expands, collapses, renames and opens the context menu.
- [ ] **P1.5.15** Slice 8, delete PrimeNG: the three packages, the peer override from P1.5.2, `providePrimeNG` and the Aura preset (replaced by the project's CSS custom properties), `primeicons.css` in `angular.json`, `src/design-system/primeng-overrides.css`, every `pi pi-*` class (replaced by `<app-icon>`), every `.p-*` selector, the `primeng` keyword in `package.json`. `THIRD_PARTY_NOTICES.md` is updated. If R14's fallback was taken, Angular 22 lands here.
  - AC: `grep -rniE "primeng|primeicons|@primeng|providePrimeNG|pi pi-" src e2e angular.json package.json` returns nothing; `grep -rnE "\.p-[a-z]" e2e src` returns nothing; `grep -ciE "primeng|primeicons" package-lock.json` is 0; every baseline command passes in 3 engines; 41 or more claims are green with retries 0; unit and e2e counts are not lower than the baseline.
- [ ] **P1.5.16** CSP: with PrimeNG gone, test whether `style-src 'unsafe-inline'` can be dropped (CDK Overlay positions through the CSSOM; Monaco and Angular's component styles are checked too). If it can, it is dropped through `security/csp.json` and `npm run gen:csp`, with a new claim and test. If it cannot, section 16 records exactly which code still needs it. No `innerHTML`, `bypassSecurityTrust*` or `eval` is added anywhere in the phase.
  - AC: either `security/csp.json` has no `'unsafe-inline'` and a `@claim` test proves 0 CSP violations across every view in 3 engines, or section 16 names each remaining inline-style source with the violation report that shows it; `grep -rnE "innerHTML|bypassSecurityTrust|\beval\(" src/app --include=*.ts | grep -v '\.spec\.ts'` shows no line added by this phase.
- [ ] **P1.5.17** Bundle and screenshots. Initial bundle (raw and gzip) is lower than the Part A number; both are in Appendix A; `angular.json` budgets and `bundle:report`'s gzip limit are tightened to the new baseline × 1.10. Screenshots of every view and dialog, dark and light, at desktop width and 390 px, taken before Part B and after it, are attached to the final PR; every difference is listed and explained, and an unexplained difference is a bug.
  - AC: Appendix A has both rows and the budgets equal the new baseline × 1.10; the final PR has both screenshot sets and the difference list.
- [ ] **P1.5.18** Release: delete `docs/ui-migration.md`; tick the tasks; update section 12 and Appendix A; version 1.3.0, tag `v1.3.0`, CHANGELOG entry. No deploy (v1.0.3: Cloudflare work is done at the end of the plan).
  - AC: tag `v1.3.0` exists on a commit whose CI run is green; `docs/ui-migration.md` is gone; the CHANGELOG has a 1.3.0 entry.

**Exit criteria:**
- `ng version` shows 22.x and no PrimeNG package is installed.
- Every baseline command passes in 3 engines, with 41 or more claims green at retries 0 and test counts not lower than the baseline.
- The coverage gate is live.
- The Trusted Types policy has no HTML allowance; the `style-src` question is answered with evidence.
- The initial bundle is smaller than after Part A, and the budgets are tightened to match.

### Phase 2 — Core engine, transport, variables, vault, data model (~18 days) → v2.0.0

**Goal:** one correct request pipeline shared by all later features. The vault and history are trustworthy.

**Deliverable:** `packages/core`, IDB v5, fetch transport, full variable system, vault v2, redaction, trustworthy history, durability features, full body and response types.

**Tasks:**

- [ ] **P2.1** npm workspaces and the `packages/core` skeleton (own `tsconfig`, Vitest in Node, ESLint ban on `@angular/*`, `rxjs` and DOM globals except `fetch`, `crypto`, `TextEncoder`, `URL`, `AbortController`, `Blob`).
  - AC: `npm -w packages/core test` passes; importing `@angular/core` in core fails lint.
- [ ] **P2.2** Request model v2 types plus the IDB v5 migration (section 4.4), with pre-migration backup, Web Lock, and `versionchange`/`blocked` handling (other tabs: close the connection, show the reload banner).
  - AC: unit tests migrate fixture DBs captured from v1, v2, v3 and v4 without loss (request count, URLs, header multisets, body JSON-equality); an e2e with two tabs where tab B holds v4 open completes the migration after tab B shows the banner.
- [ ] **P2.3** `FetchTransport`:
  - raw `fetch` with `cache: 'no-store'`, `credentials` from settings (default `omit`), `redirect` from the request setting (default `follow`);
  - body streamed to an `ArrayBuffer` with a progress signal and a 50 MB display cap (beyond that: stream to Blob, offer download);
  - response headers as an ordered list;
  - `redirected` and final `url` captured;
  - `AbortController` wired to a Cancel button and a per-request timeout (default 0 = none, Settings default configurable).
  - Delete `MainService`.
  - AC:
    - echo-server e2e: `Accept` equals only what the user set, or the browser default `*/*`, in all 3 browsers;
    - `/delay/10000` cancels within 200 ms of clicking Cancel;
    - a timeout of 1000 ms against `/delay/5000` shows "Timed out after 1000 ms";
    - `/redirect/2` shows "Redirected → final URL";
    - `/big/60` offers a download without a tab crash.
- [ ] **P2.4** `VariableResolver`:
  - Postman precedence (local > data > environment > collection > global);
  - recursive resolution (max depth 10, cycle detection with an error naming the cycle);
  - dynamic variables `$guid`, `$randomUUID`, `$timestamp`, `$isoTimestamp`, `$randomInt`, `$randomAlphaNumeric`;
  - `{{$secret.<id>}}` decryption via the Vault;
  - returns taint and unresolved lists.
  - Globals store and collection variables UI (replaces the reserved `vars` and the hard-coded `globals: {}`).
  - AC: fast-check property tests (idempotence on fully resolved text, cycle detection, precedence table), 100% branch coverage on `resolver.ts`, and e2e: a protected variable in a header reaches `/echo` as plaintext.
- [ ] **P2.5** Unresolved-variable guard (D3) and locked-vault prompt (D4). Remove the P0.3 block.
  - AC: e2e: an unresolved `{{x}}` blocks with an inline error and "Send anyway" sends it literally; a locked vault plus a secret reference opens the unlock dialog, and cancelling makes no network request.
- [ ] **P2.6** Vault v2 (D8):
  - `vault` store record `{v: 2, kdf: {alg: "PBKDF2-SHA256", iterations: 600000, salt}, wrappedDek, verifier}`;
  - v1 → v2 migration at first unlock (decrypt v1 envelopes with the old derivation, re-encrypt under the DEK);
  - rotation UI;
  - auto-lock idle timer;
  - cross-tab lock broadcast;
  - "wrong passphrase" is detected by the verifier even with zero secrets;
  - encrypted vault export and import (file contains the wrapped DEK and envelopes, passphrase required).
  - AC: unit tests for a wrong passphrase with 0 secrets returning false, rotation (old passphrase fails and new succeeds, secrets intact), migration of 3 v1 secrets; e2e: locking in tab A locks tab B within 1 s; idle 60 s with the test setting of 1 min auto-locks.
- [ ] **P2.7** Script-set protected variables: `pm.environment.set` on a variable whose current value is a `$secret` reference re-encrypts into the same secret id. If locked, the mutation is rejected with a log line.
  - AC: a unit test covers the locked and unlocked paths; the IDB `environments` store never contains the plaintext (asserted by scanning all stores in the test).
- [ ] **P2.8** `Redactor` (D5), applied to history, HAR, cURL, codegen, Postman export, clipboard copy and diagnostics.
  - AC: mutation score ≥ 85% on `redactor.ts` (Stryker); an e2e sends a secret-bearing request and then scans every IDB store and every exported file for the plaintext and its base64/URL-encoded forms, with 0 hits.
- [ ] **P2.9** History v2:
  - stores the template plus the redacted resolved request plus response status, headers and body (cap 1 MB, setting to store none);
  - retention cap 500 entries (configurable);
  - search by URL, method and status;
  - the memory-only fallback shows a persistent "Storage unavailable — nothing will be saved" banner.
  - AC: an e2e with 510 sends leaves 500 entries; search filters correctly; a unit test with IDB `open` throwing shows the banner signal set.
- [ ] **P2.10** Multi-tab coherence:
  - every repository write posts `{store, ids}` on BroadcastChannel `wayfarer:data`, and listeners reload the affected signals;
  - environment mutations are read-modify-write inside one IDB transaction under Web Lock `env-write`;
  - AC: e2e with two pages: saving different keys of the same environment from both pages' environment editors within 100 ms keeps both keys; an edit in A appears in B within 1 s; a unit test of the host-side variable-mutation applier (used by scripts in Phase 3) shows the same no-lost-update behaviour.
- [ ] **P2.11** Durability:
  - `navigator.storage.persist()` on the first write and a status display in Settings;
  - `storage.estimate()` shown;
  - full workspace backup and restore as a single JSON file (schema `$id` v2), including the encrypted vault blob and excluding history by default;
  - a local-only backup reminder after 14 days (dismissable);
  - a Safari notice explaining 7-day ITP eviction for non-installed sites, with an "Install app" guide;
  - environment export dialog with three options: strip protected values (default), include references plus an encrypted vault bundle, or plaintext (typed confirmation required).
  - AC: e2e round-trip: backup, then Reset, then restore gives deep-equal stores except `meta.updatedAt`; the default environment export contains no `$secret` references and no plaintext secret; the reminder appears when the clock is faked +15 days; the Safari notice renders only in the WebKit project.
- [ ] **P2.12** Body modes: raw (json, text, xml, html, javascript, with automatic `Content-Type` unless the user set one), urlencoded, multipart (text and file parts, files in the `files` store with a 50 MB per-file cap), binary, none. Monaco for raw.
  - AC: an echo-server e2e for each mode asserts the received content-type and bytes; multipart with a 1 MB file matches byte-for-byte; a root-level JSON array body works.
- [ ] **P2.13** Response viewers:
  - JSON (existing, virtualized beyond 5 MB);
  - raw text;
  - XML pretty;
  - HTML preview in `<iframe sandbox srcdoc>` with an injected `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`;
  - image via `blob:` URL (revoked on change);
  - hex dump plus download for other binary;
  - Monaco find for search;
  - JSONPath filter (eval-free);
  - `security/csp.json` gains `img-src blob:`; if `frame-src 'none'` blocks the `srcdoc` iframe in any engine, change it to `frame-src 'self'` and record why;
  - a headers tab listing duplicates separately and noting "N headers hidden by CORS (not in Access-Control-Expose-Headers)" when detectable.
  - AC: e2e per viewer; the HTML preview of a page containing `<script>` and `<img src=https://…>` executes nothing and makes 0 network requests; JSONPath works under prod CSP (no `unsafe-eval` violation event).
- [ ] **P2.14** Browser-limits disclosure panel ("What the browser did"):
  - forbidden request headers the user set, and that they were dropped;
  - whether the request triggers a CORS preflight and why;
  - `credentials` mode;
  - browser-added headers (`Origin`, `Sec-Fetch-*`, `Referer` policy);
  - hidden response headers.
  - `docs/browser-limits.md` explains each item and what the bridge changes.
  - AC: unit tests of the "non-simple request" computation against the Fetch spec cases (10 cases); e2e: setting a `Cookie` header shows the "dropped by browser" notice.
- [ ] **P2.15** Timings honesty: duration measured around `fetch` only. Scripts are timed separately (shown as "pre-script 12 ms / request 340 ms / post-script 8 ms"). Phase bars shown only when `Timing-Allow-Origin` permits; otherwise the text "Detailed timings unavailable: server does not send Timing-Allow-Origin".
  - AC: e2e against `/cors/full` (with TAO) shows DNS/TCP/TTFB bars; `/cors/simple` (no TAO) shows the unavailable text and no zero-width bars.
- [ ] **P2.16** Methods: free-text method with suggestions. `CONNECT`, `TRACE` and `TRACK` are blocked in direct mode with the reason, and allowed via the bridge.
  - AC: a `PURGE` request reaches `/echo` with that method; `TRACE` direct shows the reason.
- [ ] **P2.17** Split `ApiParamsComponent` into `src/app/components/composer/*` panels backed by a `Draft` model (a prerequisite for P5.1). No component file over 400 lines.
  - AC: `wc -l` check in CI (`scripts/check-file-size.mjs`, threshold 400 for `*.component.ts`); all existing composer unit tests are ported and pass.

**Exit criteria:**
- Vault secrets reach the wire and never persist in plaintext outside the vault (scan test green).
- All body and response types work in 3 browsers.
- v1–v4 data migrates losslessly.
- Release v2.0.0 carries a migration note.

**Checkpoint (R1):** compare actual vs estimated days for Phases 0–2, record the ratio in Appendix A, and re-baseline if the ratio is > 1.5.

### Phase 3 — Scripting on QuickJS with Postman compatibility (~12 days) → v2.1.0

**Goal:** scripts work in production under strict CSP, cannot escape, and run the common Postman surface.

**Deliverable:** the QuickJS worker, the `pm`/`postman` API per matrix, the trust model, the compatibility doc, and the conformance suite.

**Tasks:**

- [ ] **P3.1** `quickjs.worker.ts`:
  - lazy-loads `@jitl/quickjs-wasmfile-release-sync`;
  - one runtime per run with `setMemoryLimit(64 MB)`, `setMaxStackSize(1 MB)` and an interrupt handler at deadline;
  - the VM global contains only `pm`, `postman`, `console`, `require`, `atob`, `btoa`, `setTimeout` (host-scheduled, capped to the script deadline) and the legacy globals from P3.4;
  - `script-runner.worker.ts` deleted; `'wasm-unsafe-eval'` added via `security/csp.json`.
  - AC: under prod CSP in 3 browsers, `pm.test('t', () => pm.expect(1).to.equal(1))` passes, and the CSP violation listener records 0 events.
- [ ] **P3.2** Host bindings in `packages/core/src/scripting/host.ts`. Only JSON-serializable values cross the boundary (dump and re-hydrate). Host functions validate argument types. Logs are capped at 1 MB and 1,000 lines.
  - AC: a unit test passes a value with a getter, prototype and function from the VM and the host receives plain data.
- [ ] **P3.3** Compatibility surface:
  - `pm.environment`, `pm.variables`, `pm.globals`, `pm.collectionVariables`, `pm.iterationData` (`get`, `set`, `unset`, `has`, `toObject`, `replaceIn`, `clear` where Postman has it);
  - `pm.request` (`url` object with `toString`, `method`, `headers.add/upsert/remove/get`, `body` — mutable in pre-request and applied to the sent request);
  - `pm.response` (`code`, `status`, `headers`, `json()`, `text()`, `responseTime`, `responseSize`, `to.have.status/header/body/jsonBody`, `to.be.ok/success/error/clientError/serverError`);
  - `pm.test`;
  - `pm.expect` (full chai `expect` bundled into the VM);
  - `pm.info` (`eventName`, `iteration`, `iterationCount`, `requestName`, `requestId`);
  - `pm.cookies` (bridge-sourced jar);
  - `pm.execution.setNextRequest`/`skipRequest` (runner only);
  - `pm.sendRequest(req, cb)` and its promise form, brokered by the host through RoutePolicy, max 10 per run, and redacted in logs.
  - AC: the conformance suite `packages/core/test/pm-compat/*.test.ts` has one test per matrix row, and all pass in Node and in the browser worker.
- [ ] **P3.4** Legacy Postman sandbox globals: `postman.setEnvironmentVariable/getEnvironmentVariable/clearEnvironmentVariable/setGlobalVariable/setNextRequest/getResponseHeader`, `tests[...]`, `responseBody`, `responseCode`, `responseTime`, `responseHeaders`, `request`, `environment`, `globals`, `iteration`.
  - AC: a fixture collection using only legacy syntax (10 scripts) produces the same assertion names and pass/fail results as Newman (dev dependency, the reference implementation) running the same collection against the same echo-server; the golden file `packages/core/test/fixtures/postman-legacy.golden.json` is regenerated by `npm run golden` and CI fails on drift.
- [ ] **P3.5** `require` shim for `crypto-js`, `lodash`, `uuid`, `chai`, `moment`, `atob`, `btoa`. Sources are pre-bundled as strings and loaded into the VM on first `require`. Host-native shims back crypto-js `SHA256`, `HmacSHA256`, `MD5`, `SHA1`, `HmacSHA1` and `enc.Base64/Hex/Utf8`. Any other module throws `WayfarerUnsupportedError: require('xml2js') is not supported — see docs/postman-compatibility.md#require`.
  - AC: a unit test checks HMAC output equals Node `crypto` for 100 random inputs; `require('cheerio')` throws the named error.
- [ ] **P3.6** Resource limits:
  - `while(true){}` stops at the 5 s deadline with "Script timed out after 5000 ms";
  - allocating 200 MB stops with "Script exceeded memory limit (64 MB)";
  - recursion depth 100k gives a stack error;
  - the worker is terminated and recreated after any limit error.
  - AC: each is a test in the escape suite and passes in 3 browsers.
- [ ] **P3.7** Escape suite `e2e/sandbox-escape.spec.ts` (`@claim`), under prod headers in 3 browsers. Assert from inside a script:
  - `typeof fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `postMessage`, `self`, `globalThis.constructor` and `Function('return this')()` expose no host capability;
  - dynamic `import('https://…')` fails;
  - network capture shows 0 requests made by script execution other than brokered `pm.sendRequest` calls;
  - a forged `{type: 'result'}` message cannot be sent.
  - AC: suite green; `docs/scripts.md` isolation section rewritten to reference these tests by claim ID.
- [ ] **P3.8** Script trust (D6):
  - `scriptTrust` on collections;
  - import sets `trusted: false`;
  - the first run shows a review modal listing every script with syntax highlighting and an "I trust these scripts" action (stores the hash);
  - untrusted requests show a banner, and scripts are skipped while assertions still run.
  - AC: e2e: import a collection with a script, send, and the script does not run while the modal appears; trust it and the script runs; re-import with a changed script and the modal appears again.
- [ ] **P3.9** Pre-request script mutations of `pm.request` apply before resolution. Post-request scripts see the resolved request (only trusted scripts run, per D6).
  - AC: e2e: a pre-script adds header `X-Signed` that reaches `/echo`.
- [ ] **P3.10** Benchmark gate (R3). On the CI `ubuntu-latest` Chromium runner, a script doing `CryptoJS.HmacSHA256` over a 1 KB string, parsing a 1 MB JSON response and running 50 `pm.test` assertions finishes in ≤ 300 ms p95 over 20 runs, excluding the WASM cold load, which is measured separately at ≤ 250 ms.
  - AC: `packages/core/bench/script.bench.ts` result stored in Appendix A; CI fails if p95 regresses more than 25%.
- [ ] **P3.11** `docs/postman-compatibility.md` generated from the conformance suite (`scripts/gen-compat-doc.mjs`), with "supported / partial (note) / unsupported (error name)" per API. Remove the P0.2 banner.
  - AC: CI regenerates it and fails on diff; the P0.2 banner code is deleted.

**Exit criteria:**
- Scripts run in production in 3 browsers.
- The escape suite and conformance suite are green.
- The benchmark gate passes.

### Phase 4 — Interop and auth (~13 days) → v2.2.0

**Goal:** a user of Postman, Insomnia, OpenAPI or cURL can bring their work in and take it out, with an honest report of anything lost.

**Deliverable:** 5 importers, 4 exporters plus codegen, OAuth2, AWS SigV4, auth and variable inheritance.

**Tasks:**

- [ ] **P4.1** Import pipeline:
  - runs in a worker;
  - bulk IDB transactions;
  - produces an `ImportReport` with counts, per-item warnings (unsupported auth type, body mode, script APIs found by static scan against the matrix, dropped fields);
  - a report UI shown before commit (Cancel/Import);
  - input caps: 50 MB file, YAML `maxAliasCount: 100`.
  - AC: a 5,000-request Postman fixture imports in ≤ 10 s in Chromium CI; a YAML alias-bomb fixture is rejected with a message in ≤ 1 s.
- [ ] **P4.2** Postman importer: Collection v2.0/v2.1 (folders, variables, auth including inherit and noauth, all body modes, events → scripts, descriptions); Postman environment and globals dumps.
  - Fixtures, vendored at pinned commits under `packages/core/test/fixtures/postman/` with their LICENSE files:
    - `postmanlabs/newman` `test/integration/**` collections (Apache-2.0, 42 entries on 2026-09-28) — the compatibility oracle;
    - `Adyen/adyen-postman` (MIT, maintained) — real-world API-key auth, environments and scripts;
    - `microsoftgraph/microsoftgraph-postman-collections` (MIT, archived 2021, used as a frozen snapshot) — real-world OAuth2 and large folder trees.
  - AC: all 3 sources import with 0 errors (unsupported features show up only as report warnings); export back to v2.1 (P4.6) and re-import gives a deep-equal model; for every Newman integration collection whose scripts use only matrix-supported APIs, the Wayfarer runner and Newman give identical assertion names and pass/fail results against the echo-server. The count of such collections is recorded in Appendix A, and collections excluded by the matrix are listed with the unsupported API that excludes them.
- [ ] **P4.3** OpenAPI 3.0/3.1 and Swagger 2.0 importer. Spike first: `@scalar/openapi-parser` vs `@apidevtools/swagger-parser` — pick by bundle size and browser compatibility, and record the decision.
  - Mapping: tags → folders; `servers[0]` → collection variable `baseUrl`; parameters → params and headers with example values; request bodies from `example`/`examples`/schema-generated sample; security schemes → auth (apiKey, http bearer/basic, oauth2 flows).
  - AC: the Petstore 3.0, 3.1 and Swagger 2.0 fixtures import with operation count equal to the spec's path × method count; `$ref` cycles terminate.
- [ ] **P4.4** Insomnia importer: v4 export JSON and v5 YAML (`collection.insomnia.rest/5.0`). Map environments (base and sub), folders, requests, auth and body.
  - AC: fixtures for both versions import with 0 errors and the expected counts.
- [ ] **P4.5** cURL importer (paste into the URL bar or the import dialog): `-X`, `-H`, `-d`/`--data`/`--data-raw`/`--data-binary`/`--data-urlencode`, `-F`, `-u`, `-b`, `-G`, `--url`, `-I`/`--head`, `--compressed` (ignored with a note), `-k` (maps to bridge insecure TLS with a warning), bash and cmd quoting, line continuations. Plus a HAR 1.2 importer.
  - AC: fast-check round-trip `parse(buildCurl(req)) ≅ req` for generated requests; 30 real-world cURL fixtures from Chrome, Firefox and Safari "Copy as cURL" parse correctly.
- [ ] **P4.6** Exporters:
  - Postman v2.1 collection and environment;
  - cURL (fixes: `HEAD` → `--head`, `--data-raw`, `-F` for multipart, `--data-urlencode`);
  - codegen for JS `fetch`, Python `requests` and HTTPie;
  - HAR 1.2 with redaction (D5) and a preview, for a single response, a multi-select of history entries, or a whole runner run.
  - AC: generated cURL executed against the echo-server in CI (bash) gives an identical `/echo` reflection to the in-app send, for 12 fixture requests covering every body mode.
- [ ] **P4.7** OAuth 2.0:
  - Authorization Code with PKCE (popup; callback route `/oauth/callback` validates `state`, posts the code to `window.opener` with the exact origin, no third-party scripts);
  - Client Credentials;
  - Password (labelled legacy);
  - refresh token rotation;
  - token stored in the vault (`tokenRef`) when unlocked, otherwise memory only;
  - auto refresh on expiry and optionally on 401 (one retry);
  - token requests routed per RoutePolicy.
  - AC: e2e against the mock IdP in the echo-server: all 3 grants obtain a token that reaches `/echo`; state mismatch is rejected; the expired token refreshes once; a token endpoint without CORS shows the documented error in direct mode and succeeds via the bridge (Phase 6 re-runs this test).
- [ ] **P4.8** AWS Signature V4 (WebCrypto HMAC; signs the resolved request after all mutations).
  - AC: signatures match the AWS SigV4 test suite vectors (vendored subset of 20 cases).
- [ ] **P4.9** Auth and variable inheritance: collection → folder → request, with `inherit` default for new requests in collections. Collection and folder auth and variables UI. Effective-auth preview in the composer.
  - AC: unit tests for the inheritance chain (8 cases); e2e: collection bearer auth reaches `/echo` for a request set to inherit.

**Exit criteria:**
- Postman, Insomnia, OpenAPI, cURL and HAR import with reports.
- Round-trip Postman export works.
- OAuth2 and SigV4 pass their tests.

### Phase 5 — Workspace UX: tabs, runner, cookies, protocols (~10 days) → v2.3.0

**Goal:** daily-driver ergonomics on par with desktop clients for REST, GraphQL, SSE and WebSocket.

**Deliverable:** multi-tab composer, in-app runner with reports, cookie manager, GraphQL, SSE and WebSocket.

**Tasks:**

- [ ] **P5.1** `WorkspaceStore`:
  - tabs persisted in the `tabs` store (draft plus last response reference);
  - dirty indicator;
  - close-with-unsaved confirm;
  - restore on reload;
  - duplicate tab;
  - shortcuts per D9;
  - a tab bound to a saved request shows its breadcrumb.
  - AC: e2e: open 5 tabs, edit 2, reload, and all 5 restore with 2 dirty; closing a dirty tab prompts; the keyboard test passes in 3 browsers without triggering browser tab actions.
- [ ] **P5.2** Runner UI and `RunnerEngine` (core):
  - select a collection or folder;
  - iterations;
  - data file (CSV via RFC 4180 parser, JSON array);
  - delay;
  - stop on first failure;
  - `setNextRequest`/`skipRequest`;
  - live results table;
  - export JSON and JUnit XML;
  - Cancel.
  - AC: a fixture collection with 3 requests × 5 data rows produces 15 results equal to a snapshot; JUnit validates against the JUnit XSD; Cancel stops within one request.
- [ ] **P5.3** Cookie manager: shows jar entries (bridge-sourced `Set-Cookie`), edit and delete, applied to bridge-routed requests by domain, path and secure rules; the direct-mode notice explains the browser jar is not accessible.
  - AC: an e2e via the bridge: `/cookies/set` followed by `/echo` shows the `Cookie` header sent; deleting the cookie removes it from the next request.
- [ ] **P5.4** Redirect inspection: in bridge mode, the full redirect chain (status, Location) is shown when "follow redirects" is on; when off, the 3xx response is shown as-is. Direct mode shows "Redirected → final URL" only, with an explanation.
  - AC: e2e `/redirect/3` via the bridge lists 3 hops.
- [ ] **P5.5** GraphQL body mode: query editor with a variables pane; schema introspection (cached per URL, manual refresh) using `graphql`; autocomplete and validation in Monaco via `graphql-language-service` (lazy).
  - AC: e2e against the echo-server's GraphQL endpoint: introspection populates the schema explorer; an invalid field shows a validation marker; the query result renders.
- [ ] **P5.6** SSE: streamed via `fetch` reading `text/event-stream` (so custom headers work), with an event list (id, event, data, time), stop/reconnect, and `Last-Event-ID` support.
  - AC: e2e `/sse` emits 5 events, and all 5 are listed with correct fields in 3 browsers.
- [ ] **P5.7** WebSocket (direct): connect with subprotocols, a message log (in/out, time, size), send text or JSON, close codes, and a notice that custom handshake headers need the bridge WebSocket proxy (follow-up).
  - AC: e2e `/ws` echo of 3 messages is logged in order in 3 browsers.

**Exit criteria:**
- Tabs, runner, cookies (via the bridge), GraphQL, SSE and WebSocket pass their e2e tests in 3 browsers (cookies and redirect chain in Chromium plus the bridge job).

### Phase 6 — Local Bridge first-class and the CLI (~10 days) → v2.4.0

**Goal:** everything the browser cannot do is one `npx` away, and collections run in CI.

**Deliverable:** `wayfarer-bridge` and `wayfarer-cli` on npm with provenance; bridge protocol v2; route policy.

**Tasks:**

- [ ] **P6.1** Move `local-bridge/` to `packages/bridge/`. Protocol v2 (section 4.5):
  - lossless base64 bodies;
  - raw header list with `Set-Cookie` separate;
  - decompression of gzip, deflate and br (Node `zlib`) with both sizes reported;
  - timings from socket events (`lookup`, `connect`, `secureConnect`, first byte, end);
  - redirect chain with optional follow (max 20);
  - `Host` override allowed;
  - `tls.insecure` per request (the UI shows a red "TLS verification off" pill);
  - custom CA via `--ca <file>`;
  - honours `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`;
  - `/health` returns `{version, protocol, capabilities}`.
  - Zero runtime dependencies kept.
  - AC: `node --test` suite extended with one test per capability; a gzip response decodes correctly; the `Set-Cookie` pair with a comma in `Expires` arrives as 2 entries.
- [ ] **P6.2** Bridge hardening:
  - the `Host` header must be `127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding defence);
  - `Access-Control-Allow-Private-Network: true` on preflights that request it;
  - HTTPS loopback mode (required: P1.10 found WebKit blocks `http://127.0.0.1` from the HTTPS site as mixed content; see `docs/browser-limits.md#bridge-reachability`);
  - a pre-explained Local Network Access prompt (P1.10: Chrome 153 denies loopback until the user grants it);
  - a one-time pairing code shown in the terminal that the app exchanges for the token (no manual token copy);
  - the token is still revocable via `--rotate-token`.
  - AC: tests: a wrong `Host` gives 403; the PNA preflight header is present; pairing with a wrong code 3 times locks pairing for 60 s.
- [ ] **P6.3** Version handshake: the app reads `/health`. On a protocol mismatch it shows "Bridge vX is too old/new — run `npx wayfarer-bridge@latest`".
  - AC: a unit test with a mocked protocol-1 bridge shows the message.
- [ ] **P6.4** RoutePolicy (D7): per-request, collection and global settings `auto | direct | bridge`, and a route badge on every response ("direct" / "via bridge").
  - AC: unit tests for the 8 D7 cases; e2e: a POST with a JSON body (non-simple) against `/cors/none` auto-retries via the bridge; a simple POST form against `/cors/none` asks for confirmation instead of retrying.
- [ ] **P6.5** `packages/cli`: `wayfarer-cli run <collection|workspace-backup|postman.json> [-e env.json] [-d data.csv] [-n iterations] [--reporter cli,junit,json] [--bail] [--timeout ms] [--insecure]`. Uses the same `packages/core` (resolver, auth, QuickJS Node variant, runner), undici `fetch`, and the file-based vault via `--vault-file` plus the `WAYFARER_VAULT_PASSPHRASE` env var.
  - AC: the CLI run of the P5.2 fixture produces the same results JSON as the in-app runner (a CI diff test); exit code 1 on any failed test and 0 otherwise; runs on Node 20 and 22 in CI.
- [ ] **P6.6** Publish `wayfarer-bridge` and `wayfarer-cli` via `release.yml` with `npm publish --provenance`. `docs/cli.md` gets a GitHub Actions example.
  - AC: `npx wayfarer-bridge --help` and `npx wayfarer-cli --version` work from a clean machine; the npm page shows the provenance badge; `npm deprecate` is set on both `0.0.0-reserved` placeholders.

**Exit criteria:**
- `npx wayfarer-bridge` paired in under 60 s in the documented flow on 3 browsers (or the documented HTTPS alternative).
- The CLI matches in-app results.
- Both packages published with provenance.

### Phase 7 — Hardening and release gate (~8 days) → v2.5.0

**Goal:** accessibility, performance, security and documentation are at a level where the claims can be defended publicly.

**Deliverable:** WCAG 2.2 AA pass, performance budgets, diagnostics, threat model, rewritten docs, SBOM and self-host tarball.

**Tasks:**

- [ ] **P7.1** Accessibility:
  - axe scans for every dialog and view in 3 browsers (extend `e2e/accessibility.spec.ts`);
  - keyboard-only e2e of the core flow (new tab → URL → header → send → save → run);
  - visible focus;
  - focus returns to the trigger on dialog close;
  - `prefers-reduced-motion` respected;
  - screen-reader labels on all icon buttons.
  - AC: 0 axe violations at WCAG 2.2 AA tags in all scanned states; the keyboard e2e passes in 3 browsers.
- [ ] **P7.2** Performance:
  - Lighthouse CI on the prod-parity build with assertions: performance ≥ 90, LCP ≤ 2.0 s and TBT ≤ 200 ms (desktop preset);
  - a runtime check that typing into the URL bar with 5 tabs open stays at INP ≤ 100 ms (Playwright `PerformanceObserver` event timing);
  - Monaco, QuickJS, GraphQL, OpenAPI and YAML confirmed lazy (absent from the initial chunk list).
  - AC: Lighthouse assertions pass in CI; the initial bundle is within the P1.12 budget.
- [ ] **P7.3** Diagnostics view (local only):
  - app version and commit;
  - browser;
  - storage persisted and quota;
  - IDB schema version;
  - SW state and version;
  - bridge version and protocol;
  - self-tests (QuickJS `1+1`, vault crypto round-trip, IDB write/read/delete, same-origin fetch);
  - last 200 errors (redacted);
  - CSP violations;
  - "Copy report" (markdown) and "Open GitHub issue" (prefilled title and body, with URLs, headers and bodies excluded).
  - AC: e2e: a forced IDB error appears in the list; the copied report contains no string from a secret-bearing request sent earlier (redaction scan).
- [ ] **P7.4** Threat model `docs/threat-model.md` (STRIDE per trust boundary: page ↔ worker, page ↔ bridge, imported files, OAuth callback, SW, CDN). Each mitigation links to a claim ID or test.
  - AC: every boundary row has a mitigation with a linked `@claim` test; `check:claims` validates the links.
- [ ] **P7.5** Public "break the sandbox" challenge: `SECURITY.md` section with scope (script sandbox, vault, bridge), rules, and credit in a hall of fame in `docs/trust-center.md`. No money.
  - AC: the section is published and linked from the README.
- [ ] **P7.6** Docs rewrite:
  - README (accurate tagline, feature list generated from the claims ledger, "What the browser can't do" section);
  - Trust Center with the questionnaire merged in (D12) and `docs/security-questionnaire.md` deleted;
  - `docs/scripts.md`, `docs/secrets.md`, `docs/storage.md` (v5), `docs/collections-schema.md` (v2), `docs/browser-limits.md`, `docs/cli.md`, `docs/self-hosting.md` (static folder on any host; required headers; OAuth callback path);
  - the CHANGELOG uses terse Keep-a-Changelog entries.
  - AC: `check:claims` green; every doc under `docs/` is linked from README; no doc references a deleted file (link checker via `lychee` offline mode in CI).
- [ ] **P7.7** Release engineering: `release.yml` attaches a `dist` tarball, a CycloneDX SBOM (`npm sbom --sbom-format cyclonedx`) and SHA-256 checksums to the GitHub Release. Settings shows the version and commit.
  - AC: the v2.5.0 release page has 3 assets and the checksum verifies.
- [ ] **P7.8** Close-out audit (then move this file to `docs/archive/PLAN-airtight-remediation.md`): re-run the Phase 1 audit procedure (live Playwright probes of the 8 original P0 behaviours on production, in 3 browsers) and update section 12 with final statuses.
  - AC: every F-ID row is `Closed` with a PR link, or `Deferred` with a follow-up issue; the probe script `scripts/audit-probes.spec.ts` is committed and passes on production; this file lives at `docs/archive/` and the root copy is gone.

**Exit criteria:**
- All section 1 success criteria hold.
- Section 12 has no `Open` rows.
- Trigger the Phase 2 market re-analysis.

### Milestones

| Milestone | Deliverable | Acceptance criteria | Estimate (cumulative, working days) |
|---|---|---|---|
| M0 Truthful | v1.1.0 | Phase 0 exit criteria | 4 |
| M1 Verified | v1.2.0 | Phase 1 exit criteria | 12 |
| M1.5 Platform reset | v1.3.0 | Phase 1.5 exit criteria | 24 |
| M2 Correct core | v2.0.0 | Phase 2 exit criteria, R1 checkpoint recorded | 42 |
| M3 Scripts | v2.1.0 | Phase 3 exit criteria | 54 |
| M4 Interop | v2.2.0 | Phase 4 exit criteria | 67 |
| M5 Workspace | v2.3.0 | Phase 5 exit criteria | 77 |
| M6 Bridge + CLI | v2.4.0 | Phase 6 exit criteria | 87 |
| M7 Gate | v2.5.0 | Phase 7 exit criteria; Phase 2 re-analysis started | 95 (+24 buffer = 119) |

## 10. Testing strategy

- **Unit (Vitest):**
  - `packages/core` in Node: resolver, redactor, importers, exporters, auth providers, runner engine, cURL parser, non-simple-request computation, inheritance.
  - App specs in Chromium browser mode: repositories and migrations with fixture DBs, vault v2, services, components.
  - Coverage gates per P1.13. Mutation testing (Stryker, weekly scheduled plus on PRs touching the files) for `resolver.ts`, `redactor.ts` and `vault.service.ts`, with score ≥ 85%.
- **Property-based (fast-check):** resolver idempotence and precedence, cURL round-trip, redaction completeness over random secrets and encodings, importer robustness (no throw other than `ImportError`, bounded time) on arbitrary JSON/YAML.
- **Conformance:** `pm-compat` suite (P3.3), SigV4 vectors (P4.8), Fetch "simple request" cases (P2.14), JUnit XSD validation (P5.2).
- **Integration / e2e (Playwright, 3 browsers, prod-parity headers, local echo-server only):**
  - tripwires;
  - `@claim` tests;
  - the escape suite;
  - per-feature specs listed in the task ACs;
  - multi-tab specs (two pages sharing one context);
  - migration spec (seed v4 DB via `page.evaluate`, then load v5 app);
  - offline and update SW spec.
- **Load / performance:** script benchmark gate (P3.10), 5,000-request import (P4.1), 60 MB response download (P2.3), Lighthouse CI (P7.2).
- **Security:** escape suite; redaction scans across all IDB stores and exports; CodeQL; Scorecard; `npm audit signatures`; HTML-preview network-silence test; OAuth state and origin checks.
- **Rollout strategy:** one release per phase. Features that change stored data (v5 migration, vault v2) ship with automatic pre-migration backups. Any feature not finished by its phase exit stays behind a `settings.experimental.<name>` flag, off by default, and is excluded from claims.
- **Rollback plan:**
  - web: `wrangler rollback` to the previous version (automated on smoke failure, P1.7);
  - data: IDB cannot downgrade, so rollback of a data-model release means shipping a hotfix forward; users can restore from the automatic pre-migration backup via Settings → Backups;
  - SW: deploy `sw-kill.js` (R12);
  - npm: `npm deprecate` the bad version and publish a patch.

## 11. Operations

- **Observability (local only):** diagnostics store (P7.3), CSP violation capture, bridge terminal log line per relay (method, host, status, ms — no headers or bodies).
- **Monitoring:** `synthetic.yml` every 6 h in 3 browsers; the deploy smoke gates every release.
- **Alerts:** a GitHub issue labelled `prod-down` (with repo notifications) from the synthetic workflow or a failed deploy smoke.
- **Runbook:** a new `docs/runbook.md` with steps for rollback, SW kill switch, a broken migration hotfix, rotating Cloudflare API tokens, and yanking an npm release.
- **On-call implications:** solo maintainer; response target for `prod-down` issues is 48 h, stated in `SECURITY.md` and the Trust Center.

## 12. Traceability matrix (audit finding → tasks)

Status values: Open / In progress / Closed (PR #) / Deferred (issue #). Issue numbers were filled in by P0.10 (label `audit-2026-09`).

| ID | Finding | Tasks | Issue | Status |
|---|---|---|---|---|
| F01 | Scripts fail in prod (CSP blocks `new Function`) | P0.1, P0.2, P3.1, P3.7 | #58 | In progress (tripwire #57; disabled #100) |
| F02 | Sandbox isolation is a deny-list | P3.1, P3.2, P3.7 | #59 | Open |
| F03 | Vault secrets never resolved into requests | P0.3, P2.4, P2.5, P2.6 | #60 | In progress (#100) |
| F04 | Non-JSON responses render as parse-error wrapper | P0.4, P2.3, P2.13 | #61 | In progress (#100) |
| F05 | Binary responses shown as mojibake | P0.4, P2.13 | #62 | In progress (#100) |
| F06 | Angular SW fakes 504 on network/CORS failure | P0.5, P1.6 | #63 | In progress (#100; same-origin SW #102) |
| F07 | Auth tab ignores `{{vars}}` | P0.6, P2.4, P4.9 | #64 | In progress (#100) |
| F08 | Body is JSON-object only; nested vars unresolved | P0.6, P2.12 | #65 | In progress (#100) |
| F09 | Rotation impossible; no verifier; zero-secret unlock accepts any passphrase | P0.9, P2.6 | #66 | In progress (docs #100) |
| F10 | No cancel, no timeout | P2.3 | #67 | Open |
| F11 | Duration includes pre-script time | P2.15 | #68 | Open |
| F12 | Phase timings empty cross-origin, presented as complete | P2.15, P6.1 | #69 | Open |
| F13 | "Encrypted at rest" overclaim | P0.9, P1.4, P7.6 | #70 | In progress (docs #100) |
| F14 | History stores resolved credentials in plaintext | P2.8, P2.9 | #71 | In progress (docs #100) |
| F15 | Collection export writes credentials in plaintext | P2.8, P4.6 | #72 | Open |
| F16 | No `storage.persist`; Safari eviction; "can't be locked out" overclaim | P0.9, P2.11 | #73 | In progress (docs #100) |
| F17 | No full backup; vault not exportable; env export has dangling secret refs | P2.6, P2.11 | #74 | Open |
| F18 | Google Fonts request; Cloudflare injection/NEL; "no subprocessors" overclaim | P0.8, P0.9, P0.12 | #75 | In progress (#100; P0.12 owner action pending) |
| F19 | Viewer lacks search/JSONPath/HTML/image; redirects invisible | P2.13, P2.3, P5.4 | #76 | Open |
| F20 | `pm.*` is a small subset while the name implies compatibility | P3.3, P3.4, P3.5, P3.11 | #77 | In progress (docs #100) |
| F21 | No Postman/Insomnia/OpenAPI/cURL/HAR import | P4.1–P4.5 | #78 | Open |
| F22 | Bridge: global toggle vs docs, not on npm, token handling, no PNA | P0.9, P6.2, P6.3, P6.4, P6.6 | #79 | In progress (docs #100) |
| F23 | Bridge: `Set-Cookie` joined, no decompression, lossy text decode | P6.1 | #80 | In progress (docs #100) |
| F24 | Injected `Accept`; forbidden and hidden headers undisclosed | P2.3, P2.14 | #81 | Open |
| F25 | Enterprise paperwork premature and unverified | P0.9, P1.4, P7.6 (D12) | #82 | In progress (docs #100) |
| F26 | No runner, no CLI | P5.2, P6.5 | #83 | Open |
| F27 | No GraphQL/WebSocket/SSE | P5.5, P5.6, P5.7 | #84 | Open |
| F28 | No OAuth2, no cookie jar | P4.7, P5.3 | #85 | Open |
| F29 | No multi-tab; history unbounded, unsearchable | P2.9, P2.17, P5.1 | #86 | Open |
| F30 | Request vars reserved, globals hard-coded, no inheritance | P2.4, P4.9 | #87 | Open |
| F31 | Codegen cURL only; cURL export bugs | P4.6 | #88 | Open |
| F32 | Tests miss seams; no prod smoke; third-party e2e deps; weak network test; Chromium only | P0.1, P1.1–P1.4, P1.5.5 (coverage gate), P1.7, P1.8 | #89 | In progress (#102) |
| F33 | Icon ligature text as accessible names | P0.8, P1.5.15, P7.1 | #90 | In progress (#100) |
| F34 | Loose budgets, heavy eager bundles | P1.12, P1.5.17, P7.2 | #91 | In progress (budgets #102) |
| F35 | Docs volume exceeds product; prose-heavy changelog | P7.6 | #92 | Open |
| F36 | 36 silent catches; silent memory fallback | P1.11, P2.9, P7.3 | #93 | In progress (silent catches #102) |
| F37 | Multi-tab lost updates; no versionchange handling; reset succeeds while blocked | P0.7, P2.2, P2.10 | #94 | In progress (#100) |
| F38 | Deploy rebuilds instead of shipping tested artifact; no rollback | P1.7 | #95 | In progress (#102; deploy drill pending owner) |
| F39 | CSP meta/header drift risk; no Trusted Types | P1.5, P1.9; tightened by P1.5.9 (no HTML allowance) and P1.5.16 (`style-src`) | #96 | Closed (#102) |
| F40 | `tsconfig` lib mismatch, dead config, explicit `any` | P1.11 | #97 | Closed (#102) |
| F41 | Imported collection scripts run without review (supply-chain vector) | P3.8 | #98 | Open |
| F42 | Bridge unreachable risk under Chrome LNA / Safari mixed content (unverified) | P1.10, P6.2 | #99 | In progress (spike #102; fix in P6.2) |
| F43 | Every query parameter typed in the URL was sent twice (found by the Phase 1 rails) | P1.4 (claims), tripwire F43 | #104 | Closed (#102) |
| F44 | A failed IndexedDB write left an unhandled `AbortError` beside the real error (found by the P1.5.5 data-layer tests) | P1.5.5 | #106 | Closed (#107) |
| F45 | The app's JSON worker is never bundled (its URL is built in a constant the bundler does not recognise), so large responses are formatted on the main thread through the inline fallback (found by the P1.5.5 tests) | Own PR during Phase 1.5 (maintainer, 2026-10-07) | #109 | Closed (#117) |
| F46 | After a drawer closed, its backdrop stayed and blocked every click: a regression from #107 (PrimeNG 21's backdrop removal went through Angular's animation renderer, which never flushed in a zoneless app). Found while capturing the Part B screenshots | Hotfix before Part B | #111 | Closed (#112) |
| F47 | "Secondary text" buttons were near-black on dark surfaces (1.03:1; Cancel in the history delete popup was invisible) and "danger text" buttons were 3.8:1 in the light theme; no axe scan covered those states | P1.5.8, P1.5.12 | #114 | Closed (slice 1 PR for the buttons; slice 5 PR for the popup's name and message, now scanned whole) |
| F48 | (1) For about 340 ms after a response arrives the panes keep resizing, so tabs and the gutter move under the pointer. (2) The phone accordions and the Basic/JSON switch show PrimeNG default colours, because the overrides targeted class names PrimeNG no longer uses | Maintainer decision; candidates P1.5.13 (splitter) and a token change in `controls.css` | #119 | Open |
| F49 | Copying through the clipboard fallback (hidden textarea, used when the Clipboard API rejects) left keyboard focus on the page body | P1.5.12 (own commit) | #122 | Closed (slice 5 PR) |
| F50 | A context menu opened inside a drawer let Escape close the drawer instead, and its items could lag one render behind the clicked row | P1.5.14 | #125 | Closed (slice 7 PR) |

## 13. Adversarial review log

Objections raised against draft 1 of this plan, and how the plan changed. Kept so later readers know why the plan is shaped this way.

1. **"Fixing secret resolution in Phase 0 is small — why wait until Phase 2?"** A quick fix would resolve plaintext secrets into `request.headers`. `RequestExecutionService` then persists that into history. The quick fix would therefore turn a harmless literal-placeholder bug into a plaintext credential leak. Phase 0 blocks the send instead (P0.3); the real fix ships together with redaction (P2.4 + P2.8).
2. **"Temporarily allow `unsafe-eval` on worker files to restore scripts fast."** That restores the deny-list sandbox this plan rejects. Also, without a stable file name the header would have to cover every `worker-*.js`, including Monaco's. Phase 0 disables scripts with a banner instead (P0.2).
3. **"Auto-fallback to the bridge on CORS failure is a nice UX win."** For CORS-simple requests the browser already sent the request before failing to read the response, so an automatic retry duplicates POSTs. D7 restricts auto-retry to preflighted or safe-method requests.
4. **"Taint tracking will catch every secret."** It does not survive concatenation, Basic-auth base64 or HMAC inputs. D5 adds output value-matching across encodings, plus header-name rules, and R5 adds mutation testing.
5. **"Cmd+T for new tab."** Browser tabs cannot intercept it. D9 picks non-reserved chords and AC P5.1 tests this in 3 browsers.
6. **"Use `ngsw-bypass` to stop the fake 504."** On cross-origin requests that header triggers CORS preflight and changes the user's request. Replaced by a same-origin-only custom SW (P1.6).
7. **"e2e with `wrangler dev` gives prod parity."** It is closer, but still not Cloudflare's edge. The real gate is the version-URL smoke before promotion (P1.7). The PR e2e uses the fast header-applying server (P1.1).
8. **"Claims ledger is paperwork."** It is only useful because CI enforces it in both directions (doc → test and test → doc, P1.4). Otherwise it would be dropped.
9. **"OAuth2 from the browser just works."** Many token endpoints have no CORS. R8 routes token calls through RoutePolicy and tests both paths.
10. **"Migration is low-risk; it's just reshaping JSON."** IDB versions cannot downgrade, and other open tabs block upgrades. P2.2 adds backups, Web Locks, `versionchange` handling and fixture DBs from every past version.
11. **"QuickJS will be fine for performance."** Unmeasured. P3.10 is a hard gate with a named mitigation (host-native crypto shims) decided in advance.
12. **"Scope is fine."** It is 83+ days for one person. R1 sets a checkpoint with a pre-agreed cut list (P5.5–P5.7), and every phase ships independently, so stopping early still leaves a correct product.
13. **"Import any Postman script and run it."** Imported scripts plus `pm.sendRequest` plus secret access form an exfiltration path. D6 and P3.8 gate untrusted scripts.
14. **"Delete the Trust Center, it's premature."** The goal is enterprise later, and the facts are cheap to keep true once they are test-backed. D12 trims instead of deleting.
15. **"Local Bridge HTTPS on loopback is overkill."** It is included only if spike P1.10 proves browsers block HTTP loopback. The spike runs in week 1 because R4 scores 9.

Second pass (draft 2 → draft 3):

16. **P0.4 used `responseType: 'text'`.** That still corrupts binary bodies before the download button can save them. Changed to `arraybuffer` plus `TextDecoder`.
17. **The P0.5 safety worker only helps clients that fetch it at the old path.** It is now emitted as `ngsw-worker.js` and kept there permanently (P1.6 AC e), so pre-v1.1.0 installs are cleaned up.
18. **The v5 migration ignored `history` and the reserved `RequestDoc.vars`.** Both are now migrated (section 4.4 steps 7–8), with a collision report instead of silent drops.
19. **The P2.10 AC depended on scripts, which are disabled until Phase 3.** Rewritten to use the environment editor plus a host-side unit test.
20. **Environment export still leaked dangling `$secret` references (F17).** P2.11 adds a 3-option export dialog with a safe default.
21. **Phase 2 had 17 tasks in 15 days, including the component split and all viewers.** Raised to 18 days, and the milestones were recomputed.
22. **The "no telemetry" claim had no test.** P0.8 now adds the `no-third-party-requests` `@claim` test.

Lock review (v1.0):

23. **"A hand-recorded Postman result is a weak oracle."** Newman is Postman's own open-source runtime. P3.4 and P4.2 now generate golden results by running Newman against the same local echo-server, so compatibility is measured against the reference implementation, not a snapshot someone recorded once.
24. **"Newman's fixtures call postman-echo.com, which breaks the no-internet rule for PR e2e."** The echo-server implements the Postman Echo routes those fixtures use, and fixture URLs are rewritten at load (P1.2).
25. **"Turning off zone settings once is not durable; someone can re-enable them."** P0.12 adds the `no-edge-injection` `@claim` test to the 6-hourly synthetic run, so a regression is caught within 6 hours.
26. **"The npm names are free today but not guaranteed tomorrow."** P0.13 reserves them in Phase 0 rather than at Phase 6 publish time.
27. **"Microsoft Graph's collection repo is archived."** It is used only as a frozen import fixture for OAuth2 and large-tree import. No behaviour depends on it being maintained.

Final review against the plan-quality checklist:
- goal observable (section 1);
- every task has a binary AC;
- ≥ 2 non-goals;
- 12 scored risks;
- real paths and symbols;
- behaviour-level tests;
- named dependencies;
- first task startable now (P0.1);
- open questions listed;
- no time-relative language.

Phase 1 execution review (PR #102):

28. **"Tag the tests that exist; untested bullets are marketing."** Rejected: every behavioural bullet got a test. That found a wire bug (F43), a history-delete popup bug and a false bullet ("raw view"). A claim ledger that skips features only checks the sentences that were easy to check.
29. **"Serve Postman Echo under a path prefix."** Rejected after review: a prefix changes `pm.request.url` and every path Newman's scripts assert on. A separate origin keeps them byte-identical.
30. **"Block service workers in e2e so routes are deterministic."** Kept only where a route needs it (the tripwires). The C-001 test uses a real echo target with the worker active, so it also covers requests the worker makes.

## 14. Open questions

None as of the lock (2026-09-28). The answers to the six pre-lock questions are recorded in section 1 ("Decisions already made"). Questions that come up during execution are added here with an owner and a deadline, and the change is logged in section 16.

## 15. Follow-up work (out of scope)

- Encrypted-workspace mode (collections, history and environments under the vault DEK).
- Bridge WebSocket proxy for custom handshake headers; gRPC via the bridge.
- File System Access workspace folders (Bruno-style files in Git) — Phase 2 wedge candidate.
- CORS debugger and encrypted repro links — Phase 2 wedge candidates, seeded by P2.14 and D5.
- mTLS client certificates in the bridge.
- Digest, NTLM, Hawk and OAuth 1.0 auth.
- Docker image for self-hosting.
- *(Moved into the plan in v1.1.0: the Angular upgrade and the P1.13 coverage gate for `src/app/**` are Phase 1.5, tasks P1.5.1–P1.5.5. `packages/core` ≥ 90% still starts with P2.1.)*

## 16. Change log

| Date | Version | Change |
|---|---|---|
| 2026-09-28 | draft 1–3 | Initial plan and two adversarial review passes (section 13, items 1–22). |
| 2026-09-28 | v1.0 LOCKED | Maintainer answers applied: unscoped npm names reserved early (P0.13); Cloudflare zone hardening with Bot Fight Mode off zone-wide (P0.12); history bodies on and timeout 0 confirmed; plan archived at P7.8; Newman integration collections plus Adyen and Microsoft Graph chosen as fixtures, with Newman as the reference runner (P3.4, P4.2). Final review items 23–27 in section 13. |
| 2026-09-28 | v1.0.1 | Maintainer decision: `deploy.yml` and `preview.yml` removed; production deploys are manual from the CLI (`docs/deployment.md`) until P1.7, which now creates `deploy.yml` rather than modifying it. |
| 2026-09-28 | v1.0.2 | Phase 1 deviations, each reviewed adversarially and decided under the maintainer's delegation (PR #102). **P1.2** Postman Echo–compatible routes get their own origin, `127.0.0.1:4302`, and fixtures rewrite only the origin: Postman's `/delay/:s` (seconds) collides with the native `/delay/:ms`, and a path prefix (the first draft) would have changed every path Newman's scripts see. **P1.3** kept: one retry-free claims project per engine (`claims-<browser>`), since success criterion 1 needs every claim in 3 browsers. **P1.4** reversed: the first draft excluded README feature bullets; the ledger now covers every behavioural statement in README and Trust Center (C-001–C-041), and `docs/claims.md` defines the exclusions (opinion, third-party facts, history, process commitments, issue-linked limitations). Writing those tests found F43 (#104, query sent twice), a stacked-popup bug in history delete, one false bullet ("raw view") and three imprecise ones (cURL, HAR size, "How it works" scripts); all fixed. **P1.11** fact: 42 silent catches, not 36; the AC grep is corrected to `grep -v '\.spec\.ts'`. **P1.7** kept: `deploy.yml` is manual (`workflow_dispatch`), consistent with v1.0.1; a push trigger would deploy every merge, including before P0.12. **P1.6** kept: Playwright's WebKit can't emulate offline for worker-served navigations, so WebKit offline is tested by stopping the server; the C-001 test no longer needs to block service workers. **P1.13** deferred by the maintainer to the post-plan Angular upgrade (section 15). **P1.9/P1.10** see D13 and P6.2. |
| 2026-10-06 | v1.0.3 | Maintainer decision: all Cloudflare work moves to the end of the plan and is done in one pass: P0.12 (zone), the deploy secrets and `production` environment, the P1.7 rollback drill, the P1.8 alert check, and switching the 6-hourly schedule on. Until then two repository variables keep the pipeline honest instead of red: without `ZONE_HARDENED=true`, deploy and synthetic skip `no-edge-injection` with a warning; without `SYNTHETIC_ENABLED=true`, the schedule is idle. Phase 1's exit criteria "rollback proven" and "synthetic monitor is live" close in that pass; the rest of Phase 1 is met by PR #102. |
| 2026-10-06 | v1.1.0 | Maintainer decisions: **Phase 1.5 inserted** between Phases 1 and 2 (Angular 20.3 → 22, PrimeNG, `@primeng/themes` and `primeicons` removed; release v1.3.0). D14 and D15 added; the non-goal "not rewriting away from PrimeNG" is reversed; D10's PrimeIcons exception ends at P1.5.15; D11 gains v1.3.0. P1.13 becomes P1.5.5 and leaves section 15. Risks R13 and R14 added. Milestones and the effort estimate move by 12 days. Section 12: F32, F33, F34 and F39 gain Phase 1.5 tasks. **Delivery:** PR #102 merged by the maintainer's instruction; Phase 1.5 work goes through PRs based on `main`, merged continuously. Angular Material is allowed as a fallback inside D15. Baseline for the phase recorded in Appendix A. **Baseline finding:** `@claim:C-031` (split ratio persists) failed in the full local run and in 2 of 10 repeats on Chromium (0 of 10 on Firefox and WebKit) at `0dfe14b`, on PrimeNG's splitter; the test reads `localStorage` straight after `mouse.up`. Cause: the test measured the gutter while the panes were still settling after the response arrived (x moved from about 921 to 939.9 px), so the press landed beside it; the app saves correctly once a drag happens. The test now waits for the gutter to stop moving; 120 of 120 repeats pass in 3 engines. The assertion is unchanged. |
| 2026-10-06 | v1.1.1 | Part A of Phase 1.5, as executed. **R14 experiment:** PrimeNG 21.1.10 runs on Angular 22.2.1 behind an npm `overrides` entry for its six Angular peers; every baseline command passes in 3 engines, so Part A ships Angular 22 and the fallback is not used. **Order:** the `@angular/build` builder switch (planned for P1.5.3) happened in P1.5.1, because Angular 21's unit-test builder rejects the `@angular-devkit/build-angular` application builder; TypeScript 6 and typescript-eslint 8.71 landed with Angular 22 in P1.5.2, because Angular 22 does not accept TypeScript 5.9 and lint needs a typescript-eslint that accepts 6. **Node:** `.nvmrc` 22.16.0 → 24.19.0 (Angular 22 needs `^22.22.3 \|\| ^24.15.0`). **Workaround kept:** `vitest.config.mts` serves the script sandbox worker to specs; `@angular/build` 21 and 22 emit it at the workspace root while Vite requests it from the spec's directory with a `?worker_file` query. Remove it when the builder handles this. **Tests changed, assertions unchanged:** C-031 (waits for the gutter to stop moving) and C-038 (axe waits for finite animations; PrimeNG 21 fades dialogs in with CSS). **Removed:** `src/polyfills.ts` (comment-only), `baseUrl` (deprecated in TypeScript 6). **Deprecation warnings left:** none; the build, unit and lint logs are clean. **Not run:** the optional `router-current-navigation` migration (the app never calls `Router.getCurrentNavigation`). **Migrations reverted:** `$safeNavigationMigration` wrappers and two suppressed extended diagnostics (neither was needed), and the removal of `tsconfig` `lib` (P1.11 keeps it explicit). **Coverage:** measured 50.91%, below the 70% target; raised to 70.71% with real tests instead of lowering the threshold. **F44** found and fixed (#106). **F45** found and left open (#109): not on the migration path. **Unit tests run isolated:** `angular.json` sets `"isolate": true` for the test target. With the builder's default (`false`), CI ran some spec files without the builder's TestBed reset hooks, so every test after the first in those files failed with "Cannot configure the test module when the test module has already been instantiated". It happened on every CI run, on Vitest 4 and 5, in 3 to 5 files that changed from run to run, and never locally (also not with caches cleared, `CI=true`, or under CPU load). A diagnostic run (throwaway PR #108) showed neither `beforeEach` nor `afterEach` from the setup file firing in the failing files. Isolated, CI passes 276 of 276 in 29 s. Cost: each spec file gets its own iframe. **Coverage gate proven in CI:** throwaway PR #108 raised the threshold to 99 and its Unit tests job failed with "Coverage for lines (70.74%) does not meet global threshold (99%)" (run 37553485655, job 112574203560). **Dependabot:** #45–#53 closed as superseded by #107; #55 stays open (monaco, Playwright, axe, autoprefixer, postcss, wrangler are not part of this phase), as do #41–#43 (Actions). `dependabot.yml` now ignores PrimeNG majors, so PrimeNG 22 is never proposed, and TypeScript minors and majors, which move with Angular. |
| 2026-10-07 | v1.1.2 | **F46, a regression shipped by Part A (#107) and fixed the next day (#111).** After the history drawer (or the phone navigation drawer) closed, its backdrop stayed in the page and blocked every click. All baseline commands had passed: no e2e test clicked the app after closing a drawer. It was found by capturing the same screens on the pre-upgrade commit (`0dfe14b`) and on `main` and comparing which states could be reached. Cause and fix: `provideAnimations()` routed PrimeNG 21's backdrop removal through Angular's animation renderer, which never flushed in a zoneless app; the provider and the `@angular/animations` package are removed, since neither the app nor PrimeNG 21 uses them. Three e2e tests now click the app after an overlay closes (2 of them failed in 3 engines before the fix). Lesson applied to Part B: every overlay slice gets an "app is usable after it closes" test, and each slice's screens are compared with the pre-upgrade set before its PR merges. Side effect: the initial bundle drops to 1,691,388 B raw / 437,719 B gzip, below the Phase 1.5 baseline. The C-016 test now waits for an overlay's fade-in to end before pressing Escape (PrimeNG 21 binds Escape after the fade); its assertions are unchanged. |
| 2026-10-07 | v1.1.3 | Slice 1 of Part B (P1.5.8) as executed. **Method:** computed styles of every PrimeNG button, input, checkbox and skeleton variant were measured in every state and both themes on a reference build of `main`, the replacements were measured the same way, and the two were diffed; then every screen was compared full-page. **Scope facts:** `chip`, `panel`, `toolbar`, `floatlabel`, `progressspinner` and `textarea` were imported but used in no template, so their "replacement" is deleting the import; PrimeNG entry points go from 26 to 18. **Icons inside buttons** moved to `<app-icon>` in this slice instead of slice 8, because a native button no longer has PrimeNG's `icon` input; 12 Material Symbols glyphs (weight 300, the package already used) were added and are drawn at 20/18 px in a 16/14 px slot to match PrimeIcons' visual size. **Intended differences:** the global `:focus-visible` ring replaces PrimeNG's 1 px ring (which was invisible on secondary buttons in the dark theme); no ripple; F47 colours. **Kept on purpose:** inputs that carried Tailwind's `font-mono` rendered in Inter under PrimeNG (its font rule won), so the class, which never applied, was removed rather than letting 13 inputs turn monospace. **Lint:** selectors may use the `ui` prefix as well as `app`. **Tests:** a shared `still()` wait replaces C-031's inline one and is used before clicking a composer tab right after a response (C-006 and C-016 clicked the tab's 1 px visible edge while the panes were still resizing; the race exists on `main` and became more frequent). **F47** found and fixed for buttons (#114). Initial bundle after the slice: 1,657,335 B raw / 429,456 B gzip. |
| 2026-10-07 | v1.1.4 | Slice 2 of Part B (P1.5.9) as executed. `pTooltip` (11 uses) and the history details `p-popover` become one directive, `uiTooltip`, on CDK Overlay: text gives a tooltip, a template gives a details card. The popover was only ever opened on hover and focus, so it is the same non-interactive pattern (`role="tooltip"`, `aria-describedby`, closes on pointer leave, blur and Escape, stays open while hovered). **Security, tighter:** the Trusted Types default policy no longer has `createHTML`; PrimeNG's Tooltip was its only user. No string becomes markup now, not even the empty one; C-016's e2e asserts that in 3 engines and its wording did not need to change. CDK Overlay triggers no Trusted Types violation. **Bundle, up for now:** CDK Overlay enters the initial bundle with this slice (1,700,212 B raw / 441,109 B gzip, +42,877 B raw over slice 1) while PrimeNG's own overlay code is still there for dialog, select and menu; the P1.5.17 comparison is made after slice 8. **z-index:** the CDK overlay container sits at 12000, above PrimeNG's dialogs, until slice 5. |
| 2026-10-07 | v1.1.5 | Maintainer decisions: slice 2 (#116) merged after an adversarial review pass, which changed one thing (a tooltip opens on focus only for keyboard focus); **F45 fixed now** in its own PR instead of being scheduled later; button icon size accepted as it is. F45: the worker URL is written inside `new Worker(...)`, so the bundler emits the JSON worker (917 B). Like the other workers it is cached by the service worker on first use, not precached. |
| 2026-10-07 | v1.1.6 | Slice 3 of Part B (P1.5.10) as executed. `p-tabs` (3 sets), `p-accordion` (2) and `p-selectButton` (1) become `ui-tabs`, `ui-accordion` and `ui-segmented` in `src/app/ui/`, with no CDK primitive: each is under 100 lines on roles, roving tabindex and key handlers. **Behaviour changes, all toward the WAI-ARIA patterns:** tabs activate as the arrow keys move (PrimeNG needed Enter); the Basic/JSON switch is a radio group in which one option is always selected (PrimeNG let the selected one be clicked off, which the app then ignored); a closed accordion section stays mounted but is `inert`. **Motion:** the accordion animates its row height in CSS, so the global reduced-motion rule covers it and `prefers-reduced-motion.ts`, which existed only to feed PrimeNG's timing input, is deleted. **Looks reproduced, not fixed:** the phone accordions and the switch keep the PrimeNG default colours they had (F48, #119). **knip:** `ignoreExportsUsedInFile`, since the components are imported through `UI_TABS` and `UI_ACCORDION`. **Tests:** 10 unit tests, 4 keyboard-only e2e tests in 3 engines; C-023 gets the `still()` wait. 13 PrimeNG entry points remain (11 distinct). Initial bundle 1,654,410 B raw / 432,042 B gzip. |
| 2026-10-07 | v1.1.7 | Slice 4 of Part B (P1.5.11) as executed. `p-select` (9 uses) becomes `ui-select`, a select-only combobox on CDK Overlay: focus stays on the trigger, the active option is tracked with `aria-activedescendant`, arrow keys, Home, End and type-ahead move, Enter and Space select, Escape closes the list without reaching a dialog around it. CDK Listbox was not used: it wants focus inside the list, and the select-only pattern keeps it on the combobox. `p-menu` and `p-contextMenu` become one `ui-menu` on CDK Menu and Overlay; the PrimeNG tree, which stays until slice 7, opens it through the same `show(event)` call it made on PrimeNG's context menu. `MenuItem` is replaced by `UiMenuItem`. **Kept as PrimeNG had it:** object options default to their `label` and `value` fields; the chevron and menu icon colours (dim in the dark theme, see F48). **Changed:** the menu repositions on scroll instead of closing, and it closes on the next press outside, not on the release of the click that opened it; unnamed selects get names ("HTTP method", "Environment", "Assert on", "Operator"). **Tests:** 13 unit tests, 4 keyboard-only e2e tests; C-035's two tests click the menu item by role instead of by coordinates (a PrimeNG workaround). **Bundle:** 1,443,160 B raw / 382,079 B gzip, which is 248,228 B raw below the number Part B has to beat. 10 PrimeNG entry points remain (8 distinct): api, config, confirmdialog, confirmpopup, dialog, drawer, splitter, tree. |
| 2026-10-07 | v1.1.8 | Slice 5 of Part B (P1.5.12) as executed. `p-dialog` (10), `p-drawer` (2), `p-confirmDialog` (2) and `p-confirmpopup` (1) become `ui-dialog`, `ui-drawer` and a typed `ConfirmService` (`confirm(options): Promise<boolean>`) on CDK Dialog, which supplies the focus trap, the return of focus, `aria-modal` and scroll blocking. Dialogs and drawers are controlled: Escape, the close button and (where allowed) the backdrop only ask the owner to set `visible` to false. An earlier draft also closed the panel itself; under load the keyboard e2e test showed it could end up shut while its owner said open, so that path was removed, test first. **Behaviour changes:** a drawer now takes focus and traps it (PrimeNG's did neither); Escape works as soon as a dialog is on screen; confirmations are `alertdialog`s that start on Cancel; a dialog opened from the phone navigation drawer is no longer clipped to the drawer; the history drawer's stale 3 px border is not reproduced. `fixConfirmDialogAriaLabelledBy` and every accessibility-scan exclusion for PrimeNG's dialogs are gone, and both confirmations are scanned whole (closes F47; two contrast failures found that way were fixed: the confirm message and the filled danger button). **F49** (#122), found by the same e2e run: the clipboard fallback dropped focus on the page body; fixed test first in its own commit. Tests: 10 unit and 4 keyboard-only e2e added (dialog, both drawers, both confirmations) in 3 engines. PrimeNG entry points left: `api`, `config`, `splitter`, `tree`. |
| 2026-10-07 | v1.1.9 | Slice 6 of Part B (P1.5.13) as executed. `p-splitter` becomes `ui-splitter` (`src/app/ui/splitter.component.ts`): two panes, an 8 px gutter with `role="separator"`, pointer events with capture, no CDK. The storage key (`wayfarer:composer-split`) and format (`[start, end]`, each pane's width as a percentage of the total) are PrimeNG's, so a stored split is read unchanged; a value that is not two usable numbers is ignored. **Behaviour changes:** the gutter is now a named, focusable separator that the arrow keys, Home and End move (PrimeNG's handle took focus but its keys did nothing in this app); a drag past a minimum size stops at the minimum instead of being dropped; `aria-orientation` is `vertical`, as the pattern asks for a separator between side-by-side panes. Measured before the swap: the component's own gutter and handle colour rules never applied (they sat behind view encapsulation), so the gutter keeps the colour it actually had and those dead rules are deleted. The accessibility scan's last PrimeNG exclusion is gone; only Monaco is excluded. C-031 now also checks that the stored ratio is applied after reload, and a new test holds the minimum sizes; both passed against PrimeNG first. Tests: 11 unit, 1 keyboard e2e and 1 drag e2e added. F48 part 1 (layout shift after a response) is untouched and still waits for the maintainer. PrimeNG entry points left: `api`, `config`, `tree`. |
| 2026-10-07 | v1.1.10 | Slice 7 of Part B (P1.5.14) as executed. `p-tree` becomes `ui-tree` (`src/app/ui/tree.component.ts`), a WAI-ARIA tree view over `UiTreeNode` (the sidebar's node builder now returns it): `role=tree`/`treeitem` with level, position, set size and expanded state, one row in the tab order, arrows, Home, End, Right/Left, Enter/Space, F2 to rename, Shift+F10 for the menu, HTML drag and drop with before/after indicators. Native HTML drag and drop was kept, so the Playwright drag tests drive it unchanged. **Measured before the swap (against PrimeNG, tests green first):** reordering siblings of one kind persists; a drop onto a folder never moved anything in this app (the `onNodeDrop` handler only reordered siblings), so the new tree refuses such drops and the new e2e test pins that; expansion keys did not work from the keyboard in the PrimeNG tree except through its own handlers. **Behaviour changes, toward the pattern:** Alt+ArrowUp/Down reorders without a mouse; F2 renames (the field takes focus with the name selected, Enter or Escape returns focus to the row; Escape no longer reaches a drawer); Shift+F10 opens the menu; a re-render keeps what the user expanded. `primeng-overrides.css` and the component's `:deep` rules are deleted. **F50** (#125), found by the new keyboard tests: `ui-menu` let Escape reach a drawer around it and could show the previous row's items; fixed with unit and e2e tests, in this PR's menu commit rather than its own (deviation: the fix and the tree that exposed it share tests). Tests: 8 tree unit, 5 sidebar unit, 2 keyboard e2e, 1 drag e2e (C-024 and one new, role locators, green on PrimeNG first). PrimeNG left: `api` (nothing imports it now), `config` in `app.config.ts`. |

## Appendix A — Measurements (filled during execution)

| Metric | Value | Recorded in task |
|---|---|---|
| Initial bundle baseline | raw 1,707,095 B (JS 1,370,209 / CSS 336,886); gzip (level 9) 443,272 B (JS 343,600 / CSS 99,672), measured at `b5aa772` (after P1.6). Budgets: `angular.json` initial error 1878kb / warning 1793kb (Angular kb = 1000 B); `bundle:report` gzip error 487,600 B | P1.12 |
| Phase 1.5 baseline (main `0dfe14b`, 2026-10-06, Angular 20.3.26, PrimeNG 20.4.0, Node 24.19.0 locally) | lint, knip, `check:claims` (41 claims), `check:csp`: pass. `test:scripts` 46/46, `bridge:test` 11/11, `test:ci` 216/216 in 25 files. Build passes. Initial bundle raw 1,707,620 B (JS 1,370,734 / CSS 336,886); gzip 443,535 B (JS 343,863 / CSS 99,672). e2e (`CI=1`, 3 engines): 231 tests, 226 passed, 4 skipped by design (deploy drill ×3, WebKit offline smoke), 1 failed: `@claim:C-031` in `claims-chromium`, which fails about 2 runs in 10 on Chromium at this commit (see section 16, v1.1.0) | Phase 1.5 preflight |
| After Part A (Angular 22.2.1, PrimeNG 21.1.10, TypeScript 6.0.3) — initial bundle | raw 1,755,210 B (JS 1,418,324 / CSS 336,886); gzip 456,595 B (JS 356,923 / CSS 99,672). That is +47,590 B raw and +13,060 B gzip over the Phase 1.5 baseline, all of it JavaScript: Angular 21 with PrimeNG 21 added 42,344 B raw, Angular 22 another 5,246 B. CSS is byte-identical. Budgets unchanged (1,878,000 raw / 487,600 gzip); they are re-based in P1.5.17, after PrimeNG is gone. e2e: 231 tests, 227 passed, 4 skipped by design, 0 failed. | P1.5.4 |
| After the F46 hotfix (no `@angular/animations`) — initial bundle | raw 1,691,388 B; gzip 437,719 B. This is the number Part B must beat (P1.5.17). e2e: 240 tests, 236 passed, 4 skipped by design. | F46 hotfix |
| `src/app/**` line coverage (v8, browser mode, nothing excluded) | 50.91% (2005/3938) when first measured; 70.71% (2787/3941) with the gate on, after 60 new tests (216 → 276). Threshold: lines ≥ 70%. Margin is 28 lines, so each Part B component ships with its tests. | P1.5.5 |
| After Part B (no PrimeNG) — initial bundle raw / gzip, new budgets | _pending_ | P1.5.17 |
| OpenSSF Scorecard | _pending_ | P1.14 |
| Script benchmark p95 / WASM cold load | _pending_ | P3.10 |
| Phase 0–2 actual/estimate ratio | _pending_ | Phase 2 checkpoint |
| Newman collections within matrix / total | _pending_ | P4.2 |

## Appendix B — Audit evidence (2026-09-27, production)

- Prod sandbox worker `worker-SEEDX3S5.js` served with `content-security-policy: … script-src 'self' …`. Posting a run message returned `error: "Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script"`.
- `GET https://httpbin.org/html` rendered `200 OK` with body `{"error": {}, "text": "<!DOCTYPE html>…"}`. `/image/png` rendered binary as text.
- A request to an unresolvable host rendered `504 Gateway Timeout` in about 20 ms.
- Page console on load: Cloudflare Insights beacon blocked by CSP; an inline Cloudflare challenge script blocked by CSP.
- The accessibility snapshot showed buttons named `bolt`, `upload` and `light_mode`.
