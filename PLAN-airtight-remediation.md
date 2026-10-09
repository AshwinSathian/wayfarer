# RFC: Airtight Remediation — make every Wayfarer claim true, tested, and shipped

> Status: LOCKED (v1.0, 2026-09-28). Re-baselined against the repository in v1.2.0 (2026-10-09, `main` at `bcca26a`). Changes after lock need an entry in section 16 (Change log).
> Scale: Epic
> Target start: 2026-09-29
> Created: 2026-09-28
> Author: Ashwin Sathian
> Estimated effort at lock: 95 engineering days + 25% buffer. Since v1.2.0 the plan is sized in sessions (section 9, Milestones): Phases 0, 1 and 1.5 are done; 14 sessions remain.
> Supersedes: nothing (no prior plan in repo)
> Follow-on: re-run the Phase 2 competitive analysis after Phase 7 exit criteria pass

---

## 0. Where the plan stands (2026-10-09)

Read this section first. It is rewritten at every re-baseline; everything it says was checked against the repository, GitHub, npm and production on the date above.

| Phase | State | What is left |
|---|---|---|
| 0 — Stop the bleeding | Code done (PR #100) | Owner actions P0.12 (Cloudflare zone) and P0.13 (npm names). P0.11 (tag `v1.1.0`) was never done and is withdrawn. |
| 1 — Verification rails | Code done (PR #102) | Owner actions: P1.7 rollback drill, P1.8 monitor switched on, P1.14 branch protection and Scorecard score. |
| 1.5 — Angular 22, PrimeNG removed | Done, released as v1.3.0 (tag exists) | Nothing. |
| 1.6 — Unplanned work after v1.3.0 | Done, released as v1.4.0 (tag exists; PRs #134–#174) | Nothing. Summary in section 9. |
| 2 — Core, transport, variables, vault, data model | **Next.** Not started: no `packages/`, `DB_VERSION` is 4, the request path is still `HttpClient`. | Split into four sessions, 2A to 2D. |
| 3 to 7 | Not started | As planned, with the corrections in section 13 (items 31 onward). |

Facts the next session must not assume away:

- **Production is far behind `main`.** `https://wayfarer.ashwinsathian.com/` serves a build from before Phase 1 (it has a `polyfills-*.js` chunk and no `/sw.js`), and Cloudflare still injects its challenge script and sends `nel` and `report-to`. Nothing merged since has been deployed. See open question Q4.
- **`main` has no branch protection** and the two npm names are **not reserved** (`npm view wayfarer-bridge` and `npm view wayfarer-cli` return 404). Neither is Cloudflare work, so the v1.0.3 deferral does not cover them. See Q3.
- **The widget library changed twice.** Phase 1.5 built custom widgets on the CDK (D15); on 2026-10-09 the maintainer moved the app to Angular Material (D16). `CLAUDE.md` holds the binding rules for both the framework and Material; this file does not repeat them.
- **Files and classes were renamed** on 2026-10-09 (no `.component`, `.service`, `.util`, `.models`; no `Component` or `Service` suffix). Sections 0 to 12, 14, 15 and the open tasks use the current names. The audit's problem statement in section 1, and sections 13 and 16, are history and keep the names of their day (`MainService` is now `HttpTransport` in `src/app/services/http-transport.ts`, `ApiParamsComponent` is `ApiParams`, `RequestExecutionService` is `RequestExecutor`).
- **Baseline for Phase 2** (measured 2026-10-09 at `bcca26a`, Node 24.19.0): 339 unit tests in 44 files, lines 75.23% (gate 70%); 144 e2e tests per engine (432 across the six Playwright projects); 41 claims; `npm audit` 0. Initial bundle, re-measured at the v1.4.0 commit: 1,151,729 B raw and 287,418 B gzip (the changelog entry of PR #149 to #159 said 1,155,220 B; unused styles were removed after it). Budgets: `angular.json` 1210kb warning and 1267kb error, `bundle:report` gzip 316,200 B. After P2.0 the e2e total is 438 (146 per engine).

The full text of the finished tasks of Phases 0, 1 and 1.5 was removed from section 9 in v1.2.0. It is in git: `git show bcca26a:PLAN-airtight-remediation.md`.

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
2. Every finding F01–F54 (F43 was found during Phase 1, F44–F53 during Phase 1.5, F54 in the v1.2.0 review) is closed by a merged task whose AC is met, or is explicitly moved to section 15 (Follow-up Work) with a reason.
3. A Postman user can import a v2.1 collection (with environment), run it in-app and from `npx wayfarer-cli`, and get identical pass/fail results for scripts inside the published compatibility matrix.
4. The production site passes a synthetic smoke suite every 6 hours. A failure opens a GitHub issue automatically.

### Decisions already made (by the maintainer; 2026-09-28 unless dated)

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
| npm names | Unscoped `wayfarer-bridge` and `wayfarer-cli` (both unclaimed on 2026-09-28 and still on 2026-10-09). Reserving them is P0.13, an owner action that has not been done. Scoping can be revisited later. |
| Cloudflare zone | Turn Bot Fight Mode off for the whole `ashwinsathian.com` zone (it can't be scoped to a hostname, and it forces JavaScript Detections). Disable Web Analytics, Email Obfuscation and Rocket Loader for the Wayfarer hostname with a Configuration Rule. Disable NEL for the zone. See P0.12. |
| History bodies | Stored by default, capped at 1 MB each; a setting turns this off. |
| Request timeout | Default 0 (no timeout), matching Postman; configurable per request and globally. |
| Plan file | Stays at the repo root while in progress; moved to `docs/archive/` at P7.8. |
| Compatibility fixtures | Newman's own integration collections (Apache-2.0) with Newman as the reference runner, plus two real-world MIT collections: Adyen and Microsoft Graph. See P4.2. |
| Widget library (2026-10-09) | Angular Material, themed from the design tokens. Reverses the "custom on CDK" default of D15. See D16 and `CLAUDE.md`. |
| Names (2026-10-09) | Files and classes carry no type suffix (D17). |
| Delivery (2026-10-06, restated) | Every change is a PR from `main`, merged on green CI. PRs that change security posture, stored data or public claims wait for the maintainer unless they have said otherwise for the session. |
| Cloudflare work (2026-10-06) | Done in one owner pass (section 9, "Owner actions"). When that pass happens is open question Q4. |

## 2. Background

### Current state (verified in source, 2026-10-09, `main` at `bcca26a`)

The state at lock (Angular 20, PrimeNG, Tailwind 3, Google Fonts, the Angular service worker) is in git history. What Phase 2 starts from:

- **Stack:** Angular 22.2 (zoneless, signals, OnPush), Angular Material and CDK 22.2 themed from the design tokens, Tailwind 4 without preflight, Monaco 0.57 (JSON and TypeScript only), `idb` 8, TypeScript 6.0, Vitest 5 in headless Chromium, Playwright 1.64. Node 24.19 (`.nvmrc`). No router, no `@angular/animations`. Deployed as static assets on Cloudflare Workers (`wrangler.jsonc`).
- **Request path:** `ApiParams.sendRequest()` → `RequestExecutor.execute()` → `HttpTransport.sendRequest()` → `HttpClient` (`provideHttpClient(withXhr())` in `src/app/app.config.ts`), with `responseType: 'arraybuffer'` and `decodeResponseBody` (`src/app/shared/http/response-body.ts`). The Local Bridge route is a second `HttpClient` call inside `HttpTransport` (bridge protocol 1: `{method, url, headers, body}` in, `{status, statusText, headers, body, bodyEncoding}` out). There is no cancel, no timeout, and duration is measured from before the pre-request script.
- **Composer:** `src/app/components/api-params/api-params.ts` is 889 lines with a 628-line template and a 606-line spec. It holds every composer and response signal, which is why multi-tab is not possible. `RequestSave` (`src/app/services/request-save.ts`) already owns save and save-as.
- **Model:** `RequestDoc` has `headers: Record<string, string>`, `body?: unknown` (the composer only builds an object), `params?` and `vars?` (reserved), `auth?: HttpAuthPlaceholder` (`none | bearer | basic | api-key`), `preRequestScript`, `postRequestScript`, `tests`. `method` is the union `HTTP_METHODS` (7 verbs) and the collection importer rejects any other method. `EnvironmentDoc.vars` is `Record<string, string>`. Every document has both `id` and `meta.id`.
- **Variables:** `src/app/shared/environments/env-resolution.ts`: one pass, sources request > environment > global, `globals` is never supplied, own keys only (`Object.hasOwn`). `PLACEHOLDER_PATTERN` does not match `$`, so `{{$secret.<id>}}` passes through, and `containsSecretPlaceholder` in `request-executor.ts` blocks the send (claim C-007), also through percent-encoding and Basic base64.
- **Persistence:** IndexedDB `api-sandbox`, `DB_VERSION = 4` (`src/app/data/idb-schema.ts`). Stores: `history`, `collections`, `folders`, `requests`, `environments`, `secrets`, `meta`. A failed upgrade aborts its transaction and the database keeps its old version. `IdbCore` shares one connection, closes it when another tab deletes or upgrades the database (`blocking`), and exposes two signals the shell shows as banners: `closedByOtherTab` and `memoryOnly`. Reset is honest (P0.7). There is no `blocked` handling on the opening side, no data-change broadcast, and environment writes replace the whole `vars` object from an in-memory snapshot (lost updates across tabs).
- **Vault:** `SecretCrypto` (`src/app/shared/secrets/secret-crypto.ts`) keeps the imported passphrase as PBKDF2 key material and derives a separate AES-GCM key for every secret from that secret's own salt, at 600,000 iterations (raised in place by PR #143 while no stored secrets existed; envelopes written at 200,000 cannot be read). Envelope `{v: 1, alg, salt, iv, ct}`. No DEK, no verifier, no rotation: with zero secrets any passphrase unlocks. One decrypt costs one full key derivation, so resolving several secrets per send on this design would take seconds.
- **History:** `HistoryRepository` stores the resolved request (`url`, `headers` including `Authorization`, `body`) with status and duration; no response, no cap, no search. When IndexedDB cannot open it keeps entries in memory, and the shell says so.
- **Scripts:** disabled in every build (`SCRIPTS_ENABLED`), with a banner (C-006). `script-runner.worker.ts` is still the deny-list worker with `new Function`.
- **Exports:** collection export is a deterministic JSON file with no `$id` (format 1); cURL uses `--data-raw` and quotes a non-verb method; HAR 1.2 leaves out bodies over 256 KB or not JSON. Nothing is redacted (C-008, C-014 say so). Import files over 10 MB are refused before parsing.
- **Verification rails:** `ci.yml` (lint, `npm audit signatures`, knip, `check:csp`, `check:claims`, unit with the coverage gate, one build uploaded as the `dist` artifact, bridge tests, e2e in 3 engines on `e2e/support/prod-server.mjs`, claims projects with retries 0), `deploy.yml` (manual, artifact-once, smoke, rollback), `synthetic.yml` (idle until `SYNTHETIC_ENABLED`), `codeql.yml`, `scorecard.yml`. All actions are pinned to commit SHAs.
- **Headers:** `public/_headers` carries the generated CSP (with `require-trusted-types-for 'script'`, `frame-src 'none'`, `img-src 'self' data:`, `connect-src *`), HSTS for this host, `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`. The Trusted Types default policy allows same-origin script URLs only: no string may become HTML.
- **Local Bridge** (`local-bridge/`, `private: true`, not on npm): zero dependencies, binds to 127.0.0.1, refuses a non-loopback `Host`, needs an allowed `Origin` and a token of 16 characters or more (flag or `WAYFARER_BRIDGE_TOKEN`), caps bodies at 25 MB both ways, rejects unknown arguments. It still joins `Set-Cookie` with `, `, does not decompress, and decodes text as UTF-8.
- **Issues:** 54 issues carry the label `audit-2026-09` (F01 to F53 and the flake #118). P2.0 (c) closed the six that were open although their finding was closed or fixed (#96, #97, #118, #127, #130, #131); F54 is #172.

### Constraints

- Browser platform: Fetch forbids setting `Cookie`, `Host`, `Origin`, `Content-Length`, `Connection`, `Referer` (via `referrer` only), `Sec-*` and `Proxy-*` headers, and hides `Set-Cookie` plus any response header not in `Access-Control-Expose-Headers`. `redirect: 'manual'` returns an opaque redirect with no `Location`. A page served over HTTPS cannot call an `http://` target at all, except loopback in Chromium and Firefox (mixed content). `GET` and `HEAD` cannot carry a body, and `CONNECT`, `TRACE` and `TRACK` throw. None of this can be fixed in-page. The bridge is the only escape.
- CSP must never gain `'unsafe-eval'` or `'unsafe-inline'` for scripts. `'wasm-unsafe-eval'` is acceptable. `style-src 'unsafe-inline'` stays (Monaco; section 16, v1.1.12).
- Trusted Types are enforced and the default policy has no `createHTML`. So `innerHTML`, `iframe.srcdoc`, `document.write`, `DOMParser.parseFromString` and `Range.createContextualFragment` throw on any string. A feature that needs one of them needs a different design (D19), not a wider policy.
- `Cross-Origin-Opener-Policy: same-origin` means a popup that visits another origin has no `window.opener` when it returns (D20).
- The IndexedDB name `api-sandbox` is kept (see `docs/storage.md`).
- `CLAUDE.md` is binding on every task: naming, Angular and Material patterns, styling, Monaco imports, dependency and bundle rules, the security rules, and the PR rules. Where this file and `CLAUDE.md` disagree about how code is written, `CLAUDE.md` wins; where they disagree about what to build, this file wins and the difference is fixed in the same PR.
- One maintainer, working through agent sessions. Each phase must be independently shippable to production.

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
- Not in scope: rewriting the app away from Angular. (PrimeNG was also listed here at lock; D14 reversed that in v1.1.0, and Phase 1.5 removed it.)
- Not in scope: dropping `style-src 'unsafe-inline'` (it needs Monaco replaced), and widening the Trusted Types policy or COOP to make a feature fit (R15).
- Not in scope: marketing site, launch campaign, positioning. The Phase 2 re-run owns these.

## 4. Architecture

### 4.1 Target system diagram

```
┌──────────────────────────── Browser tab (app origin) ─────────────────────────────┐
│ Angular UI (apps shell, composer tabs, viewers, runner UI, diagnostics)            │
│   │ signals                                                                        │
│   ▼                                                                                │
│ WorkspaceStore (tabs + drafts) ── RepoLayer (IDB v5) ── BroadcastChannel sync      │
│   │                                  │  IDB transactions, no locks (D22)           │
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
│ Vault (DEK/KEK, auto-lock, cross-tab lock, rotation) ─ WebCrypto                   │
│ Custom service worker: same-origin precache ONLY, never intercepts cross-origin    │
└────────────────────────────────────────────────────────────────────────────────────┘
          │ direct fetch (CORS-bound)                 │ http://127.0.0.1:7717/relay
          ▼                                           ▼
     Target API                         wayfarer-bridge (npm, Node ≥ 22)
                                          raw headers, cookie jar feed, timings,
                                          decompression, redirect chain, proxy env

Node CLI: npx wayfarer-cli run <file> ── packages/core + Node fetch + QuickJS (node)
```

### 4.2 Component inventory

Built in Phases 0 to 1.6 and not listed again: the service worker (`src/sw.ts`, `scripts/build-sw.mjs`), the CSP source (`security/csp.json`, `scripts/gen-csp.mjs`), the prod-parity and echo servers (`e2e/support/`), the claims ledger (`docs/claims.md`, `scripts/check-claims.mjs`), inline SVG icons (`src/app/shared/icon/`), self-hosted fonts, the Material theme (`src/design-system/material-theme.scss`) and the wrappers in `src/app/ui/`.

| Component | Path | Phase | Notes |
|---|---|---|---|
| npm workspaces root | `package.json` (`"workspaces": ["packages/*"]`) | 2A | The app stays at the repo root. |
| Core engine | `packages/core/` (`@wayfarer/core`) | 2A onward | No Angular, RxJS, DOM-only or Node-only API. Its `tsconfig` has `lib: ["ES2022"]` and `types: ["node"]`, so `fetch`, `crypto`, `URL`, `TextEncoder`, `AbortController` and `Blob` exist and `document`, `window` and `indexedDB` do not compile; ESLint bans `@angular/*`, `rxjs`, `node:*` imports and the `process` and `Buffer` globals. The app imports it through a `tsconfig` path. Tested with Vitest in Node. |
| Request model and converters | `packages/core/src/model/` | 2A (types, v4 converters), 2B (stored) | The converters from the v4 shapes are written once: the composer uses them in 2A and the migration uses them in 2B. |
| Transport | `packages/core/src/transport/{fetch,bridge}.ts` | 2A | Replaces `HttpTransport`, which is deleted with `provideHttpClient`. `route-policy.ts` arrives in P6.4. |
| Composer | `src/app/components/composer/*` and `src/app/state/workspace-store.ts` | 2A | Split from `api-params`. One `Draft` for now; tabs in P5.1. |
| Data layer v5 | `src/app/data/idb-schema.ts`, `idb-migrations.ts` | 2B | New stores `files` and `backups`; `meta` gains the `globals` and `vault` records. Stores for later phases are created by the phase that uses them. |
| Variable resolver | `packages/core/src/variables/resolver.ts` | 2C | Replaces the resolution functions in `env-resolution.ts`; chip and token extraction moves too. |
| Vault v2 | `src/app/shared/secrets/vault.ts` (class `Vault`) | 2C | Replaces `SecretCrypto`'s session logic. Envelope v2. |
| Redactor | `packages/core/src/redaction/redactor.ts` | 2C | Used by history, HAR, cURL, exports, clipboard copy and, later, codegen and diagnostics. |
| Response viewers | `src/app/components/response-viewer/viewers/*` | 2D | json, text, xml, html (sandboxed `blob:` frame, D19), image, hex. |
| Script host | `packages/core/src/scripting/host.ts` and `src/app/shared/scripts/quickjs.worker.ts` | 3 | Deletes `script-runner.worker.ts`; rewrites `script-sandbox.ts`. |
| CLI | `packages/cli/` | 6 | Published as `wayfarer-cli`. |
| Bridge | `local-bridge/` → `packages/bridge/` | 6 | Published as `wayfarer-bridge`. |
| Diagnostics | `src/app/components/diagnostics/*`; `src/app/services/diagnostics.ts` exists as an in-memory ring buffer | 7 | Local only. |

### 4.3 Data flow: send a request (target state)

```
User hits Send on tab T
 → WorkspaceStore.draft(T) snapshot (template form, unresolved)
 → ScriptTrust.check(collection)          [untrusted → modal, no execution]
 → ScriptHost.run(pre, ctx)               [QuickJS worker; pm.request mutable]
 → persist variable mutations             [one IDB transaction per scope, D22]
 → VariableResolver.resolve(draft)        [scopes, dynamic vars, {{$secret.*}} via Vault]
      → returns ResolvedRequest + taint set (secret plaintexts)
      → unresolved {{x}} left? → block + inline error (override per send)
      → secret referenced while vault locked? → prompt unlock, never send placeholder
 → AuthProvider.apply(resolved)           [inherit chain; oauth2 refresh if expired]
 → BrowserLimits.lint(resolved)           [forbidden headers, preflight, mixed content]
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
type Row = { key: string; value: string; enabled: boolean };
type BodyMode = "none" | "raw" | "urlencoded" | "multipart" | "binary" | "graphql";
type RawLanguage = "json" | "text" | "xml" | "html" | "javascript";
interface RequestBody {
  mode: BodyMode;
  raw?: { language: RawLanguage; text: string };                 // template text, {{vars}} intact
  urlencoded?: Row[];
  multipart?: (({ kind: "text"; value: string } | { kind: "file"; fileId: string; fileName: string })
              & { key: string; enabled: boolean })[];
  binary?: { fileId: string; fileName: string; contentType?: string };
  graphql?: { query: string; variables: string; operationName?: string };   // editor in P5.5; importers may write it
}
type AuthConfig =
  | { type: "inherit" } | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" }
  | { type: "oauth2"; /* fields added by P4.7 */ }
  | { type: "awsv4"; /* fields added by P4.8 */ };
interface RequestDocV2 {
  id: UUID; meta: Meta;                        // both kept: every store's key path is meta.id
  collectionId: UUID; folderId?: UUID; name: string; order: number;
  method: string;                              // an HTTP token (RFC 9110), upper-cased, at most 32 characters
  url: string;                                 // text, never passed through URL
  params: (Row & { description?: string })[];
  headers: Row[];                              // ordered, duplicates allowed
  body: RequestBody; auth: AuthConfig;
  scripts: { pre: string; post: string };
  tests: TestAssertion[];
  settings: { timeoutMs?: number; followRedirects?: boolean; route?: "auto" | "direct" | "bridge" };
}
// Collection and Folder gain: variables: Row[]; auth: AuthConfig; scripts: { pre; post };
//   Collection only: scriptTrust: { trusted: boolean; hash: string } (a missing field means untrusted).
// EnvironmentDoc.vars becomes Row[].
// HistoryRecord v2: { id, createdAt, template: RequestSnapshot, sent: { method, url, headers: [name, value][], bodyPreview? },
//   response?: { status, statusText, headers: [name, value][], body?: { text?: string; base64?: string; truncated: boolean } },
//   durationMs?, route: "direct" | "bridge", error? }. `sent` and `response` are stored redacted (D5).
// meta store records: "state" (as today), "globals" ({ variables: Row[] }), "vault" ({ v: 2, kdf, wrappedDek }).
// New stores: files (id → Blob, at most 50 MB each), backups (pre-migration snapshots, keep the last 3).
```

`Meta.version` stays 1: it versions the `Meta` block. The storage shape is versioned by `DB_VERSION`, and files by their `$id`.

Migration v4 → v5 (`migrateV4toV5` in `src/app/data/idb-migrations.ts`, built from the pure converters in `packages/core/src/model/from-v4.ts`):

1. Copy `collections`, `folders`, `requests`, `environments`, `secrets` and `meta` into one `backups` record. History is not copied: it can be large, it is not authored work, and doubling it is the likeliest way to hit the quota.
2. Requests: header and param records become ordered rows; an object body becomes `{mode: "raw", raw: {language: "json", text: JSON.stringify(body, null, 2)}}`, no body becomes `{mode: "none"}`; `HttpAuthPlaceholder` maps to `AuthConfig` (`api-key` becomes `apikey`, `addTo` becomes `in`); `preRequestScript` and `postRequestScript` become `scripts`.
3. Request `vars` that are not empty move into the parent collection's `variables` when the key is absent there; on a collision the collection value is kept and the dropped value is listed in the migration report shown after the upgrade.
4. Every existing collection gets `scriptTrust.trusted = true` (the user wrote it, or imported it when imports ran scripts without asking). From v5 on, an import writes `trusted: false`.
5. Environments: `vars` becomes rows, order by key. `{{$secret.*}}` references move unchanged; the vault re-wraps its envelopes at the first unlock (P2.6).
6. History: each record becomes a v2 record with `template` built from what was stored and no `response`. Existing `Authorization`, `Cookie` and key-like header values are masked by header name (D5); this is the only place the migration discards data, and the release note says so.

The whole upgrade is one `versionchange` transaction, so it is atomic and it is exclusive: no Web Lock is needed (section 13, item 40). Failure modes, each with a test:

- **The transform throws or the quota is exceeded:** the transaction aborts and the database is still v4 (this already works). The app then shows a full-page "Upgrade failed, your data is unchanged" state with the error and a **Download my data** button that reads the v4 stores through a connection opened without a version and saves them as one JSON file. It does not fall back to memory-only mode, which would look like data loss.
- **Another tab holds the database open:** tabs running current code close their connection on `versionchange` and say "Wayfarer was updated in another tab — reload" (today the same signal says "Data was reset in another tab", which is wrong for an upgrade; `blocking` receives the new version, which is `null` only for a delete). Tabs running older code, including whatever production serves today, do not close; the upgrading tab then gets `blocked` and shows "Close other Wayfarer tabs to finish the update" until they are gone.
- **Old code opens a v5 database** (a rollback, or a stale service-worker cache): `openDB` fails with `VersionError`. Current code already turns that into the storage banner; from v5 the banner text for this case is "This tab is running an older Wayfarer — reload".

Export format 2 adds `"$id": "wayfarer/collection/2"` (and `wayfarer/environments/2`, `wayfarer/workspace/2`). A file with no `$id` is format 1 and is converted by the same converters as the migration. Claim C-026 (byte-identical round trip) is restated for format 2.

### 4.5 Interfaces

```ts
// Transport (packages/core). Both routes return the same envelope.
interface ResolvedRequest { method: string; url: string; headers: [string, string][]; body?: BodyInit }
interface ResponseEnvelope {
  status: number; statusText: string; headers: [string, string][];
  body: ArrayBuffer | Blob;                    // Blob above the 50 MB display cap
  redirected: boolean; finalUrl: string; route: "direct" | "bridge";
  sizes: { encoded?: number; decoded: number };
}
interface Transport { send(req: ResolvedRequest, opts: { signal: AbortSignal; timeoutMs: number }): Promise<ResponseEnvelope>; }
// A transport throws TransportError { kind: "network" | "timeout" | "aborted" | "bridge"; message }.
// An HTTP error status is a response, not an error.

// Resolver
resolve(template: Draft, scopes: ScopeStack, secrets: (id: string) => Promise<string | undefined>):
  Promise<{ request: ResolvedRequest; taint: Set<string>; unresolved: string[]; lockedSecrets: string[] }>;

// Script host (Phase 3)
runScript(kind: "pre" | "post", src: string, ctx: ScriptContext, limits: { timeoutMs: 5000; memoryBytes: 64 * 2**20; maxSendRequests: 10; maxLogBytes: 1 * 2**20 }): Promise<ScriptResult>;

// Bridge protocol 2 (P6.1; breaking, announced by /health → { version, protocol: 2, capabilities: [...] }).
// Until then BridgeTransport speaks protocol 1 exactly as HttpTransport does today.
POST /relay { method, url, headers: [name, value][], bodyB64?, followRedirects, timeoutMs, tls: { insecure?: boolean } }
 → 200 { status, statusText, headers: [name, value][] /* raw, Set-Cookie separate */, bodyB64, encodedSize, decodedSize,
         timings: { dns, tcp, tls, ttfb, download, total }, redirects: { status, location }[] }
```

### 4.6 Infrastructure changes

Done: the CSP is generated from `security/csp.json`; CI builds once and e2e and `deploy.yml` use that artifact; `deploy.yml` uploads a version, smokes its preview URL, promotes, smokes production and rolls back on failure; `synthetic.yml`, `codeql.yml` and `scorecard.yml` exist; every action is pinned to a commit SHA.

Still to do:

- CSP changes, each through `security/csp.json` and `npm run gen:csp`, each with its claim test: `img-src blob:` and `frame-src blob:` (P2.13), `'wasm-unsafe-eval'` in `script-src` (P3.1).
- CI: a `core` job (`npm -w packages/core test`, coverage gate 90% lines) in P2.1; the lint and knip jobs cover `packages/`; mutation testing on the resolver, the redactor and the vault (P2.8).
- `release.yml` (tag → GitHub Release with the `dist` tarball, a CycloneDX SBOM from `npm sbom`, checksums; npm publish of the CLI and the bridge with `--provenance`) in P6.6 and P7.7.
- Owner pass (section 9): Cloudflare zone, deploy secrets and the `production` environment, the rollback drill, the monitor, branch protection, npm names.

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
  - every tainted plaintext of length ≥ 6 is masked, along with its percent-encoded and JSON-escaped forms and its base64 and base64url forms at all three byte alignments (a secret inside a longer encoded string, such as `user:secret`, does not contain the base64 of the secret alone);
  - this applies to the request as sent and to the response that is stored, since servers echo credentials;
  - `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key` and headers matching `/token|secret|key|pass/i` are fully masked unless the user opts in per export.
  Rationale: provenance tracking alone misses derived values.
- **D6 — Scripts from imported collections are untrusted until approved.** Approval is stored as a SHA-256 hash of all scripts in the collection. Any change from a re-import re-prompts. Local edits update the hash automatically. Untrusted scripts do not run, and the request shows a banner. Rationale: `pm.sendRequest` plus secret access is an exfiltration channel, and shared collections are a supply-chain vector (F41).
- **D7 — Auto-routing never duplicates a non-idempotent request.** The bridge fallback happens only when:
  - (a) the browser request required a CORS preflight (the Fetch spec "non-simple" computation), so the real request was never sent; or
  - (b) the method is GET, HEAD or OPTIONS.
  Otherwise the user sees "The browser may have sent this request; retry via bridge?".
- **D8 — Vault v2 uses DEK/KEK (revised in v1.2.0).** A random AES-GCM-256 DEK encrypts secrets, with the secret's id as additional authenticated data. The KEK is PBKDF2-SHA256 (600,000 iterations, 16-byte salt) from the passphrase exactly as typed, and wraps the DEK with AES-GCM. A failed unwrap is the wrong-passphrase signal, so there is no separate verifier. Unlock is per tab and holds the DEK as a non-extractable key; rotation and export ask for the passphrase again and re-wrap the DEK only. Auto-lock after 15 minutes idle (configurable 1–240, or never). A lock in any tab locks all tabs via BroadcastChannel `wayfarer:vault`.
- **D9 — Shortcuts avoid browser-reserved chords.** Browser tabs cannot intercept Cmd/Ctrl+T, W, N, Tab. New/close tab use Alt+T / Alt+W (Option on macOS), listed in the palette. An installed PWA (standalone window) additionally maps Cmd/Ctrl+T/W where the browser allows it.
- **D10 — Material Symbols webfont replaced by inline SVG icons.** Rationale: removes a Google request, removes ligature text leaking into accessible names (F33), and ships only the 30 used glyphs. PrimeIcons stays only where PrimeNG requires it (until Phase 1.5 removes both; D15).
- **D11 — Semver release per phase.** As executed: v1.1.0 and v1.2.0 were never tagged, v1.3.0 covers Phases 0 to 1.5, and v1.4.0 (P2.0) covers the work merged after it. Then v2.0.0 (Phase 2: data model v5 and export format 2 are breaking) and v2.1–v2.5 for Phases 3–7.
- **D12 — Enterprise paperwork trimmed.** `docs/security-questionnaire.md` is merged into `docs/trust-center.md` as a "Procurement quick answers" section. The SOC 2 roadmap prose is replaced by one line: "No third-party audits or certifications exist."

- **D13 — Trusted Types enforced (spike P1.9, 2026-09-28).** `require-trusted-types-for 'script'` is in `security/csp.json`. With it enforced and no policy, Chromium, Firefox and WebKit reported exactly three sinks: `ServiceWorkerContainer.register('/sw.js')`, `new Worker(new URL('worker-*.js', import.meta.url))` (Monaco's editor/json/css/html/ts workers, the JSON worker, the script sandbox worker) and PrimeNG Tooltip's `innerHTML = ""`. Angular and Monaco use their own named policies and reported nothing. The fix is one `default` policy (`src/app/shared/security/trusted-types.ts`): script URLs only on the app's own origin over http(s), HTML only the empty string, no `createScript`. No `trusted-types` name allow-list: Monaco creates many version-specific policy names, and an allow-list would break editors on upgrade without adding sink protection. Claim C-016 tests it in 3 browsers.

- **D14 — Leave PrimeNG; move to Angular 22 first (maintainer, 2026-10-06).** Checked against the registry on 2026-10-06:
  - `primeng@22.1.2` ships a `LICENSE.md` titled "PrimeUI License" (commercial, licence key). `primeng@21.1.10` and `20.4.0` ship the MIT text.
  - `primeng@21` peers on `@angular/core ^21.0.7`; nothing MIT peers on Angular 22. `@primeng/themes` stops at 21.0.4.
  - So staying on PrimeNG caps the app at Angular 21, on a line that gets no further MIT releases.
  - The app is at its smallest now. Phases 2 and 5 add editors, viewers, tabs and a runner; building them on PrimeNG would mean migrating them later.
  - Trade-off: about 12 days with no new user-visible feature, and the project owns its widgets' accessibility. Mitigation: the 41 claim tests in 3 engines, plus a keyboard-only e2e per overlay and composite widget (P1.5.9–P1.5.14).
- **D15 — Replacement stack: Angular CDK primitives plus the project's own components.** *(Its default was reversed by D16 on 2026-10-09; kept as the record of what Phase 1.5 built.)* They live in `src/app/ui/`, are standalone, signal-based and OnPush, and are styled with the existing tokens (`src/design-system/`, Tailwind).
  - Default: custom components on CDK and Tailwind. Angular Material (MIT, same release train as Angular and the CDK) is allowed where a custom widget would cost more than it is worth (maintainer, 2026-10-06); the migration map (P1.5.7) names each such widget and the reason, and Material is themed from the project's tokens so nothing looks different. No other UI library, and no other new runtime dependency without the maintainer's approval.
  - Native elements where they are enough (`<button>`, `<input>`, `<textarea>`, `<input type="checkbox">`, `<details>`); CSS for skeleton, spinner, chip, panel, toolbar and float label; CDK Overlay, Dialog, FocusTrap, Listbox, Menu, Tree, Accordion and DragDrop for the rest.
  - Icons: the existing inline-SVG `<app-icon>` replaces every `pi pi-*` glyph. This completes D10; no icon font remains.
  - Theme: the Aura preset is replaced by the project's own CSS custom properties. Dark and light look the same as before.
  - API rule: each component exposes only what the app uses today. No speculative options.

- **D16 — Widgets are Angular Material (maintainer, 2026-10-09). This reverses D15's default.** D15 allowed Material only where a custom widget cost too much; after Phase 1.5 the maintainer made Material the default and the custom CDK widgets were replaced (PRs #149 to #159). `src/app/ui/` now holds only wrappers (`ui-dialog`, `Confirm`, `ui-tree`) and what Material lacks (`ui-splitter`, `uiHoverCard`, the confirmation under a button). Every later task that builds UI (composer panels, viewers, tabs, runner, cookie manager) uses the patterns in `CLAUDE.md` ("Angular Material"), for example `mat-tab-nav-bar` and never `mat-tab-group`. Cost accepted: the initial bundle grew from 722,840 B to 1,155,220 B.
- **D17 — Names follow the 2026 Angular style guide (maintainer, 2026-10-09).** No type suffix in file or class names. New files in this plan are named accordingly: `workspace-store.ts`, `vault.ts`, `quickjs.worker.ts`.
- **D18 — Phase 2 is delivered in four sessions, 2A to 2D, and released once as v2.0.0.** 2A changes no stored data. 2B changes the stored shape. 2C makes secrets usable and history safe. 2D adds the viewers and releases. `main` stays shippable after every PR, but nothing between v1.4.0 and v2.0.0 is deployed: 2B stores history that 2C redacts.
- **D19 — HTML preview is a sandboxed `blob:` frame, not `srcdoc`.** `iframe.srcdoc` is a Trusted Types HTML sink and the policy allows no HTML (D13). The preview builds a `Blob` of the response with a `<meta>` CSP (`default-src 'none'; style-src 'unsafe-inline'; img-src data:`) placed first, and shows it in `<iframe sandbox>` (no `allow-*` token) whose `src` is set from code. `frame-src` becomes `blob:` only, which also stops the frame from navigating anywhere else (a link, a `<meta http-equiv="refresh">`). XML is pretty-printed by a string indenter, not `DOMParser` (also a sink).
- **D20 — The OAuth popup reports back over `BroadcastChannel`, not `window.opener`.** With `Cross-Origin-Opener-Policy: same-origin` the popup loses its opener when it visits the identity provider. The callback is a static page (`public/oauth/callback.html` with its own script file; the app has no router) that posts `{state, code | error}` on `wayfarer:oauth` and closes; the app accepts only the `state` it generated. COOP is not relaxed.
- **D21 — Secret resolution, redaction and history v2 land in one PR.** Resolving a secret into a request while history still stores what was sent would write the plaintext to IndexedDB (section 13, item 1). The wire check for a literal `{{$secret.` stays after resolution as the last line of defence (claim C-007): a reference to a deleted secret, or "Send anyway", must still never transmit a placeholder.
- **D22 — No Web Locks.** IndexedDB already gives both guarantees the plan wanted locks for: an upgrade is one exclusive `versionchange` transaction, and a read-modify-write inside one `readwrite` transaction is serialised against every other tab's transactions on that store. The two-tab tests in P2.2 and P2.10 prove it.
- **D23 — User requests are sent with `referrerPolicy: "no-referrer"` and `credentials: "omit"`.** An API client should not add its own address to the user's request. `Origin` is still sent by the browser on cross-origin requests and is disclosed (P2.14). See Q2.

Trade-offs accepted:
- Scripts run slower than in Postman. Mitigation: host-native crypto shims, and a benchmark gate in P3.10.
- Chromium-only enhancements are limited to optional features.
- The bridge requires Node on the user's machine.
- About 14 sessions of work remain before the market re-analysis.

## 7. Risks

Retired: R7 (Trusted Types shipped, D13), R13 and R14 (Phase 1.5 done; PrimeNG 21 ran on Angular 22, and F46, F51 and F52 were the regressions R13 predicted, each found by comparison with the old build and fixed).

| # | Risk | L | I | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R1 | Scope too large; the plan stalls mid-way with half-shipped features | M | H | 6 | Every phase ships behind its own release. Checkpoint after Phase 2: if it took more than 6 sessions (planned: 4), move P5.5 to P5.7 (GraphQL, WebSocket, SSE) to Follow-up and re-baseline here. | Maintainer |
| R2 | IDB v4 → v5 migration corrupts or loses user data | M | H | 6 | One atomic `versionchange` transaction; pre-migration copy in `backups`; fixture databases from v1 to v4 migrated in unit tests; a property test that `migrate` preserves request count, URLs and header multisets; a failure screen that offers the untouched v4 data as a file (section 4.4). IDB cannot downgrade, so a bad data release is fixed forward. | Maintainer |
| R3 | QuickJS too slow for real Postman scripts (crypto-js HMAC, large JSON) | M | M | 4 | Benchmark gate P3.10. Hashes and HMACs run host-side (`@noble/hashes`). JSON parse and stringify of the response happen host-side. | Maintainer |
| R4 | The bridge is unreachable from the HTTPS site | H | H | 9 | **Measured (P1.10):** Chrome 153 needs the Local Network Access permission; WebKit blocks `http://127.0.0.1` as mixed content. So P6.2 must ship HTTPS on loopback with a locally generated certificate, and the UI explains the Chrome prompt before the first call. Until then the bridge works in Chromium and Firefox only, and `docs/browser-limits.md` says so. | Maintainer |
| R5 | Redaction misses a secret-derived value and it lands in history or exports | M | H | 6 | D5 output value-matching, including the three base64 alignments and the JSON-escaped form. Mutation score at least 85% on `redactor.ts`. Property tests with random secrets at random offsets inside base64, URL-encoded and concatenated text. The e2e sends a secret to an endpoint that echoes it and scans every store and every export. Secrets shorter than 6 characters cannot be value-matched; the vault warns when one is saved. | Maintainer |
| R6 | 3-browser e2e flake makes CI untrustworthy | H | M | 6 | Local fixtures only. `@claim` tests have retries 0. The register in `e2e/FLAKES.md` records cause and fix; 6 of its 15 entries turned out to be product bugs. P2.18 removes the largest source (movement after a response arrives). | Maintainer |
| R8 | OAuth token endpoints lack CORS, so the flows fail in-browser | H | M | 6 | Token requests go through the transport like any request. When the bridge is unavailable, the error names the missing `Access-Control-Allow-Origin` and links `docs/browser-limits.md#oauth`. The mock IdP fixture tests both paths. | Maintainer |
| R9 | Bundle size regresses the "lightweight" feel | M | M | 4 | All heavy modules load lazily (Monaco already does; QuickJS, GraphQL, the OpenAPI parser and YAML must). Budgets are CI-enforced at baseline × 1.10 and are reset only with a changelog line saying why. `packages/core` enters the initial bundle in Phase 2: record the delta in Appendix A per sub-phase. | Maintainer |
| R10 | Postman compatibility claims drift from reality | M | M | 4 | `docs/postman-compatibility.md` is generated from the conformance suite. Each row is a test. CI fails on mismatch. | Maintainer |
| R11 | npm names `wayfarer-cli` and `wayfarer-bridge` taken before first release | M | L | 2 | **Still unreserved on 2026-10-09** (both 404). The repository is public and names both. Reserve now (P0.13, Q3). Fallback: scope `@wayfarer-http/*`. | Maintainer |
| R12 | The service worker ships a broken update and pins users on an old version | L | H | 3 | Navigations are network-first. `scripts/sw-kill.js` is committed and its deploy is documented in `docs/runbook.md`. e2e covers offline and update. | Maintainer |
| R15 | A planned feature needs a browser capability the security headers forbid (found three times in the v1.2.0 review: `srcdoc`, `DOMParser`, `window.opener`) | M | M | 4 | Every task that adds a new browser API runs the Trusted Types and CSP violation listeners in its e2e and asserts 0 events in 3 engines. The headers are never widened to make a feature work without a decision in section 6. | Maintainer |
| R16 | The first production deploy after months carries every phase at once, including the data migration | H | H | 9 | Deploy v1.4.0 before 2B merges (Q4). If the owner pass stays at the end, P7.9 deploys in two steps at least a day apart: the last v1.x tag first, then the current release. The migration's `blocked` path is written for tabs running production's old code, which do not close on request. | Maintainer |
| R17 | A session runs out of context mid-task and leaves a half-finished branch | M | M | 4 | One PR per task; a session stops only at a PR boundary; the plan's tick boxes and section 16 are updated in each PR, so the next session starts from the file, not from memory. | Maintainer |
| R18 | `crypto-js` is discontinued upstream (4.2.0 is final) | H | L | 3 | It runs only inside the QuickJS VM, pinned, with hashes and HMACs replaced by host shims (P3.5). No app code imports it. If an advisory lands, the affected function is removed from the shim list and documented as unsupported. | Maintainer |

## 8. Dependencies

- **Upstream / libraries still to add** (versions seen on the registry on 2026-10-09; each is added by the task that first uses it, never earlier):
  - Dev, Phase 2: `fast-check` 4.10 (P2.17), `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` 10.0 (P2.8; the runner accepts Vitest 2 and later).
  - Runtime, Phase 3: `quickjs-emscripten` and `@jitl/quickjs-wasmfile-release-sync` 0.32; inside the VM only: `chai`, `crypto-js` 4.2.0 (discontinued upstream, R18), `lodash`, `uuid`, `moment`; host side: `@noble/hashes` 2.4. Dev: `newman` 6.2 (reference runner, P3.4 and P4.2).
  - Runtime, Phase 4: `yaml` (`maxAliasCount: 100`), an OpenAPI parser chosen by the P4.3 spike (`@scalar/openapi-parser` is still 0.x).
  - Runtime, Phase 5: `graphql`, `graphql-language-service` (lazy), `set-cookie-parser` 3.1.
  - Dev, Phase 7: `@lhci/cli`, the `lychee` action.
  - Dropped in v1.2.0: `jsonpath-plus` (P2.13 reuses the assertion runner's path evaluator); `undici` as a dependency of the CLI (Node 22's built-in `fetch`, unless `--insecure` or proxy support needs a dispatcher, decided in P6.5).
- **Already in place:** `@angular/material` and `@angular/cdk` 22.2, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono`, `knip`, Vitest 5 with v8 coverage, Playwright 1.64, `@axe-core/playwright`.
- **Upstream / platform:** Cloudflare Workers static assets (`_headers`, versions, rollback), GitHub Actions, npm registry (provenance), Playwright browsers (Chromium, Firefox, WebKit). Node 22 and 24 are the supported LTS lines; Node 20 is past end of life.
- **Downstream:** users' existing IndexedDB data (v1 to v4, written by the build production serves today), existing exported collection and environment files (format 1, no `$id`), the Phase 2 market re-analysis.
- **External / owner actions:** section 9, "Owner actions".
- **Blocked by:** nothing. Session 2A needs no owner action. Sessions 2B and 2C contain PRs that wait for the maintainer's OK.

## 9. Phases and milestones

Task format: `ID — task — AC`. Every AC is binary. "Tested" means a test exists in the named file and passes in CI.

### Phases 0, 1 and 1.5 — done

Their task lists were removed in v1.2.0 (see section 0 for where to read them). What each delivered, and what is still open:

| Phase | Delivered | PRs | Open |
|---|---|---|---|
| 0 — Stop the bleeding | Tripwire tests F01 to F08; scripts disabled with a banner; secret placeholders blocked; non-JSON and binary responses; Angular service worker removed; variables in auth and nested bodies; honest reset; self-hosted fonts and inline SVG icons; claims correction; 42 audit issues | #57, #100 | P0.12, P0.13 (owner). P0.11 withdrawn: `v1.1.0` and `v1.2.0` were never tagged, and `v1.3.0` covers them. |
| 1 — Verification rails | Prod-parity server; echo server on three origins; 3 engines plus retry-free claims projects; claims ledger C-001 to C-041 with a CI gate; CSP single source; custom same-origin service worker; artifact-once deploy workflow; synthetic workflow; Trusted Types (D13); bridge reachability spike; hygiene gates; bundle budgets; pinned actions, CodeQL, Scorecard, `npm audit signatures` | #102 | P1.7 drill, P1.8 switch-on, P1.14 branch protection and score (owner). |
| 1.5 — Platform reset | Angular 22, TypeScript 6, Vitest 5; coverage gate at 70% lines; PrimeNG, its theme and PrimeIcons removed; Trusted Types policy without HTML; `style-src` question answered (cannot be dropped: Monaco); v1.3.0 | #107 to #133 | Nothing. |

### Phase 1.6 — Unplanned work after v1.3.0 (done, unreleased)

37 PRs merged on 2026-10-09 without plan tasks. They are recorded here because later tasks depend on them or overlap them:

| Work | PRs | Effect on this plan |
|---|---|---|
| Angular Material replaces the custom CDK widgets | #149 to #159, #164, #167 | D16. All UI tasks follow `CLAUDE.md`. Budgets reset to 1,155,220 B × 1.10. |
| Style-guide naming and type-aware lint | #137, #141, #148 | D17. Paths in this file updated. |
| Tailwind 4 without preflight; `box-sizing` reset; nothing wider than the window from 360 px; sidebar becomes a drawer below 1200 px | #144, #146, #161, #162, #166 | Closes F53. Layout rules are in `CLAUDE.md`; a layout change runs all three engines locally. |
| Security hardening: cURL export quoting and `--data-raw`; import validation (methods, string values, 10 MB cap); reset clears every `wayfarer:` key; HSTS, COOP, CORP; deploy refuses a CI run not from a push to `main` | #134, #145 | Part of P4.6 is done. COOP forces D20. The method allow-list must change with P2.16. The 10 MB cap overrides P4.1's 50 MB. |
| Vault: 600,000 iterations in place; passphrase used as typed; lock state is a signal; lock clears revealed values | #140, #143 | P2.6 migrates from the 600,000-iteration v1 envelope only. |
| Local Bridge: loopback `Host` check, owner-only token file, token from the environment, 16-character minimum, strict arguments, 25 MB response cap | #147 | The first bullet of P6.2 is done. |
| Robustness: storage-unavailable banner; upgrade rollback; one `newId()`; prototype-safe records; UTF-8 Basic auth; params edit only the query | #136, #138, #139, #145 | The banner part of P2.9 is done. Records keyed by user text use `Object.hasOwn` and `Object.fromEntries` until v5 replaces them with rows. |
| Contrast at 4.5:1 in both themes, with `scripts/contrast.test.mjs` and a both-themes axe sweep | #163 | Part of P7.1 is done. |
| Monaco 0.57 with only JSON and TypeScript bundled; its stylesheet loads with the editor; `/3rdpartylicenses.txt` ships | #142 | P2.13 adds language definitions through `monaco-loader.ts` only. |

### Owner actions (not session work)

None of these can be done by an agent session: each needs the Cloudflare dashboard, an npm login with 2FA, or repository admin settings. Order is by what it protects.

- [ ] **P0.13** Reserve `wayfarer-bridge` and `wayfarer-cli` on npm (`docs/runbook.md#npm-name-reservation`). Not Cloudflare work, so not deferred by v1.0.3; unreserved on 2026-10-09.
  - AC: `npm view wayfarer-bridge maintainers` and `npm view wayfarer-cli maintainers` list the maintainer's account.
- [ ] **P1.14** Branch protection on `main` requiring the jobs Lint, Claims ledger, Unit tests, Build, Local Bridge, E2E (chromium, firefox, webkit) and, from P2.1, Core. Record the Scorecard score in Appendix A.
  - AC: `gh api repos/AshwinSathian/wayfarer/branches/main/protection` lists those checks; a PR cannot merge with a red required job.
- [ ] **P0.12** Cloudflare zone hardening (`docs/runbook.md#cloudflare-zone`; its change record is still empty), then set `ZONE_HARDENED=true`.
  - AC: `curl -s https://wayfarer.ashwinsathian.com/` contains neither `/cdn-cgi/challenge-platform` nor `cloudflareinsights`; `curl -sI` shows no `nel` or `report-to` header; `no-edge-injection` (C-012) passes in 3 engines.
- [ ] **P1.7** Deploy secrets and the `production` environment (`docs/deployment.md`, "One-time setup"), a first deploy through `deploy.yml`, and the rollback drill.
  - AC: a run with `drill_failing_smoke` leaves the previous version active in `wrangler deployments list`.
- [ ] **P1.8** Set `SYNTHETIC_ENABLED=true` once production runs a build shipped by `deploy.yml`.
  - AC: a manual run against a broken preview URL opens the `prod-down` issue; the next scheduled run is green.

When these happen is open question Q4. If they stay at the end, they are task P7.9.

### Phase 2 — Core engine, transport, variables, vault, data model → v2.0.0

**Goal:** one correct request pipeline shared by all later features. The vault and history are trustworthy.

**Deliverable:** `packages/core`, a composer built on a `Draft`, fetch transport, IDB v5, the full variable system, vault v2, redaction, history v2, durability features, all body modes and response viewers.

**Delivery (D18):** four sessions. Each task is one PR from `main`; the order inside a session is the order below, because each task builds on the one before it.

| Session | Tasks | Stored data changes | PRs that wait for the maintainer |
|---|---|---|---|
| 2A — Foundations | P2.0, P2.1, P2.17, P2.3 | No | None |
| 2B — Data model v5 | P2.2, P2.12, P2.16, P2.10 | Yes | P2.2, P2.12, P2.16 |
| 2C — Variables, vault, history | P2.4, P2.6, P2.5 with P2.8 and P2.9, P2.11 | Yes | P2.6, the P2.5 PR, P2.11 |
| 2D — Viewers and release | P2.13, P2.14, P2.18, P2.19 | No | P2.13 (CSP), P2.19 |

**Rules for this phase (binding on every task):**
- `CLAUDE.md` applies in full. A bug found on the way gets a failing test first, an F-number in section 12 and an issue.
- No test is deleted, skipped or loosened to make a change pass. A test whose claim changes is changed together with the ledger row and the docs sentence, in the same PR.
- Each PR that closes a finding says `Closes #N`, removes the matching bullet from README "Known limitations", ticks its task here, and adds its deviations to section 16.
- Code moved out of `src/app` into `packages/core` moves its tests with it. The `src/app` coverage gate stays at 70% and the core gate at 90% from core's first PR.
- A task that touches a new browser API asserts 0 CSP and Trusted Types violation events in its e2e, in 3 engines (R15).
- Each session ends by recording in Appendix A: unit and e2e counts, both coverage numbers, initial bundle raw and gzip.

**Claims this phase changes** (each in the PR of the task named):

| Claim | Today | Becomes | Task |
|---|---|---|---|
| C-007 | A request that references a vault secret is blocked | A secret is sent resolved when the vault is unlocked, prompts for unlock when locked, and a placeholder never reaches the network | P2.5 |
| C-008 | History keeps the headers that were sent, including `Authorization`, in plain text | History stores what was sent with credentials and secret values masked | P2.5 |
| C-014 | Collection exports include auth fields in plain text | Exports mask credentials unless the user opts in for that export | P2.5 |
| C-003, C-004, C-005 | Per-secret key derivation; envelope v1 | DEK wrapped by a passphrase key; envelope v2; auto-lock | P2.6 |
| C-009 | Text renders as text; binary is a download | Adds HTML preview, image preview, hex view | P2.13 |
| C-017 | Seven methods | Any HTTP method, with the seven suggested | P2.16 |
| C-026 | Export and re-import is byte-identical | The same for format 2; format 1 files still import | P2.2 |
| C-039 | Body tab only for POST, PUT and PATCH, with a Basic or JSON editor | Body modes none, raw, form, multipart, binary; no body for GET and HEAD | P2.12 |
| New | — | Cancel and timeout (P2.3); unresolved variables block the send (P2.5); passphrase rotation, vault export (P2.6); backup and restore (P2.11); what the browser changed (P2.14) | as named |

#### Session 2A — Foundations (no stored-data change)

- [x] **P2.0** Preflight. Four small PRs, in this order.
  - (a) Land this re-baseline: `PLAN-airtight-remediation.md` and the two lines of `CLAUDE.md` that describe it.
  - (b) F54: Playwright imports `e2e/support/*.test.mjs` (they match its default `testMatch`), so the Node test suites run inside every e2e collection. Set `testMatch: "**/*.spec.ts"` in `playwright.config.ts`. Open the F54 issue.
    - AC: before the change `CI=1 npx playwright test --list 2>&1 | grep -c '^✔'` is above 0 (Node's test reporter printing inside Playwright); after it is 0, the listed total is still 432 tests in 18 files, and `npm run test:scripts` still runs those suites.
  - (c) Issue tracker matches section 12: close #96 (F39), #97 (F40), #127 (F51), #130 (F52) and #118 (flake fixed), each with the PR that fixed it; close #131 (F53) after running "nothing is wider than a N px window" at 390 px; edit #119 (F48) to drop the part about PrimeNG colours.
    - AC: `gh issue list --label audit-2026-09 --state open --json number --jq 'map(.number)'` equals the set of rows in section 12 whose status is Open or In progress.
  - (d) Release v1.4.0: version in `package.json`, one `## [1.4.0]` changelog entry (the Unreleased section has two `### Changed` and two `### Fixed` headings to merge), the status line in `README.md`, tag `v1.4.0` on a commit whose CI run is green. Re-measure the bundle and correct section 0 and Appendix A if the numbers differ.
    - AC: tag `v1.4.0` exists on a green commit; `npm run bundle:report` passes; Appendix A has the measured row.
- [x] **P2.1** npm workspaces and `packages/core` (section 4.2): `package.json` with `"name": "@wayfarer/core"` and `"private": true`, its own `tsconfig.json` (`lib: ["ES2022"]`, `types: ["node"]`, `strict` as the root), `vitest.config.ts` (Node environment, v8 coverage, lines ≥ 90%), ESLint overrides, a `@wayfarer/core` path in the root `tsconfig.json`, `packages/**/*.ts` in `angular.json`'s `lintFilePatterns` and in `knip.json`, and a `Core` job in `ci.yml`. To prove the wiring with real code, move `newId` (`src/app/shared/id.ts`) and `safe-json` (`src/app/shared/json/safe-json.ts`) into core with their specs and import them from there.
  - AC: `npm -w packages/core test` passes with coverage at or above 90%; a file in core that imports `@angular/core`, or uses `document`, fails `npm run lint` or the core type-check (shown once in the PR body, not committed); `npm run lint`, `npx knip`, `npm run test:ci`, `npm run build` and the Chromium e2e pass; `npx npm@10 ci` installs the lockfile.
- [ ] **P2.17** Split `ApiParams` into `src/app/components/composer/*` panels over a `Draft`. Moved to the front of the phase (section 13, item 32): every later task adds composer UI, and it is added once, to small files.
  - `Draft` (in core) is `RequestDocV2` without the persistence fields, plus the tab's response reference. `packages/core/src/model/from-v4.ts` converts a v4 `RequestDoc` or `PastRequest` to a `Draft`, and `to-v4.ts` converts back; the composer edits the `Draft` and the stores still read and write v4 until P2.2.
  - `WorkspaceStore` (`src/app/state/workspace-store.ts`) holds the one `Draft` and the response state as signals. Panels: address row, params, headers, body, auth, scripts, tests. `ApiParams` is deleted; `app-composer` replaces it in the shell.
  - No behaviour change and no visual change. ESLint `max-lines` (400, comments and blank lines skipped) is switched on for `src/app/components/composer/**/*.ts`; no script.
  - AC: every test in `api-params.spec.ts` exists in a composer spec with its assertion unchanged (the PR body maps old test name to new file); `from-v4` followed by `to-v4` is the identity on 200 generated requests (fast-check, added as a dev dependency here); unit and e2e counts are not lower than the section 0 baseline; all three engines pass locally; before and after screenshots at 390, 820 and 1440 px in both themes show no difference (throwaway spec, not committed); no composer template is over 250 lines.
- [ ] **P2.3** Transport on `fetch` (D2, D23), replacing `HttpClient` in the request path.
  - `FetchTransport`: `cache: "no-store"`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `redirect: "follow"`; headers passed as an ordered list; the response read to an `ArrayBuffer` up to 50 MB and to a `Blob` beyond that (shown as a download, never decoded); `redirected` and the final URL captured.
  - `BridgeTransport`: the same relay call `HttpTransport` makes today, protocol 1, through `fetch`, returning the same envelope.
  - Cancel and timeout: one `AbortController` per send, combined with `AbortSignal.timeout` through `AbortSignal.any`. A Cancel button replaces Send while a request is in flight. Timeout is a setting, default 0 (none), in the `wayfarer:` settings in `localStorage` (reset clears it); a per-request value arrives with `settings` in P2.2.
  - Timings (was P2.15): duration is measured around the transport call only. The script-time breakdown moves to P3.9, when scripts run again.
  - `RequestExecutor` consumes `ResponseEnvelope` and `TransportError`; `HttpTransport`, `provideHttpClient` and every `@angular/common/http` import are deleted; the network-error guidance text stays (C-010).
  - AC, e2e against the echo server in 3 engines unless noted:
    - `/echo` shows `Accept` as the user's value, or `*/*` when none was set, and shows no `Referer`;
    - `/delay/10000` shows the cancelled state within 200 ms of pressing Cancel, and Send is available again;
    - a timeout of 1000 ms against `/delay/5000` shows "Timed out after 1000 ms";
    - `/redirect/2` shows "Redirected" with the final URL;
    - `/big/60` offers a download and the tab stays responsive (Chromium only; the other engines run it at `/big/5` for the envelope path);
    - the bridge unit tests in `http-transport.spec.ts` are ported to `BridgeTransport` with assertions unchanged;
    - `grep -rn "common/http" src` returns nothing; the tripwires F04, F05 and F06 pass unchanged; knip is clean.
  - Closes #67 (F10) and #68 (F11); updates #81 (F24: the injected `Accept` is gone).

**Exit criteria, 2A:** `packages/core` exists with its gate in CI; the composer is built on a `Draft`; requests go out through `fetch` with cancel and timeout; v1.4.0 is tagged; nothing stored changed (`DB_VERSION` is still 4).

#### Session 2B — Data model v5 (stored data changes)

- [ ] **P2.2** Request model v2 and the IDB v5 migration, exactly as section 4.4: types in core, `migrateV4toV5`, the `backups` copy, the three failure modes, format 2 exports with a format 1 importer, `docs/storage.md` and `docs/collections-schema.md` rewritten. The stores, `CollectionsStore`, `EnvironmentsStore` and `RequestSave` read and write v2; `to-v4.ts` is deleted.
  - Fixture databases are captured as JSON dumps of every store from builds at `v1.0.0`, `v1.3.0` and `main` before this PR, plus hand-built v1 to v3 shapes from `idb-migrations.ts`, and are seeded through raw IndexedDB at the old version.
  - AC: unit tests migrate each fixture with request count, URLs, header multisets and body JSON-equality preserved (property test over generated v4 data too); a transform that throws leaves `db.version === 4` and every store byte-equal; the failure screen's download contains every v4 record; e2e with two pages: page B holds v4 open with current code and shows the reload banner while page A finishes; e2e with a page whose connection ignores `versionchange` shows page A the "close other tabs" state, then completes when it closes; C-026 passes for format 2 and a format 1 file imports to the same model; a collection imported after this PR has `scriptTrust.trusted === false`.
  - Closes nothing alone; F37 moves to "In progress".
- [ ] **P2.12** Body modes: none, raw (json, text, xml, html, javascript; `Content-Type` set from the language unless the user set one), urlencoded, multipart (text and file parts; files in the `files` store, 50 MB each), binary. Monaco for raw, with the `xml` and `html` language definitions registered through `monaco-loader.ts` and their stub paths in `tsconfig.spec.json`. A user-set `Content-Type` on a multipart body is flagged (it drops the boundary). The Body tab is hidden only for `GET` and `HEAD`. See Q1 for the two editors this replaces.
  - AC: an echo-server e2e for each mode asserts the received content-type and bytes; multipart with a 1 MB file matches byte for byte; a root-level JSON array body is sent; deleting a request deletes its files (unit test scans `files`); budgets hold or are reset with a changelog line.
  - Closes #65 (F08).
- [ ] **P2.16** Methods: free text, upper-cased on input, validated as an RFC 9110 token of at most 32 characters, with the seven verbs suggested. `CONNECT`, `TRACE` and `TRACK` are blocked in direct mode with the reason. The importer's allow-list becomes the same token check, and `CLAUDE.md`'s security rule is reworded in this PR; the cURL export keeps quoting anything that is not a plain verb.
  - AC: `PURGE` reaches `/echo` with that method; `patch` typed in lower case is sent as `PATCH`; `TRACE` shows the reason and makes no request; importing a file whose method is `GET; rm -rf` is rejected; C-017 is reworded and passes.
- [ ] **P2.10** Multi-tab coherence: every repository write posts `{store, ids}` on `BroadcastChannel` `wayfarer:data` and listeners reload the affected signals; environment and globals writes are read-modify-write inside one `readwrite` transaction (D22). The mutation applier that scripts will use in Phase 3 is the same function.
  - AC: e2e with two pages: saving different keys of one environment from both within 100 ms keeps both keys; an edit in A appears in B within 1 s; a unit test of the applier shows no lost update with two interleaved calls.
  - Closes #94 (F37) together with P2.2.

**Exit criteria, 2B:** `DB_VERSION` is 5; data from v1 to v4 migrates without loss; all body modes and any method work in 3 engines; two tabs do not lose each other's writes.

#### Session 2C — Variables, vault, redaction, history (stored data changes)

- [ ] **P2.4** `VariableResolver` in core:
  - precedence local > data > environment > collection > global, own keys only;
  - recursive resolution to depth 10, with an error that names the cycle;
  - dynamic variables `$guid`, `$randomUUID`, `$timestamp`, `$isoTimestamp`, `$randomInt`, `$randomAlphaNumeric` (random values from `crypto.getRandomValues`);
  - `{{$secret.<id>}}` through the callback in section 4.5; a secret's plaintext is added to the taint set and is never scanned for further placeholders;
  - returns `unresolved` and `lockedSecrets`.
  - Globals (the `meta` record) and collection variables get editors; the variable chips read from the resolver. In this PR the app still passes no secret callback, so secret references stay blocked exactly as today.
  - AC: fast-check properties (idempotent on fully resolved text, cycle detected, the precedence table); 100% branch coverage on `resolver.ts`; a secret whose plaintext is `{{token}}` resolves to that literal text; e2e: a collection variable and a global reach `/echo`; C-025 passes.
  - Closes #87 (F30) except inheritance, which is P4.9.
- [ ] **P2.6** Vault v2 (D8):
  - the `meta` record `{v: 2, kdf: {alg: "PBKDF2-SHA256", iterations: 600000, salt}, wrappedDek}`; secrets as `{v: 2, iv, ct}` encrypted under the DEK with the secret's id as additional authenticated data;
  - unlock unwraps the DEK as a non-extractable key; a failed unwrap is the wrong-passphrase signal, also with zero secrets;
  - migration at the first unlock: every v1 envelope is decrypted and re-encrypted in memory first (one key derivation each, with a progress indicator), then all rows and the vault record are written in one transaction;
  - rotation (asks for the current passphrase, re-wraps the DEK only); auto-lock after 15 idle minutes (1 to 240, or never); a lock in one tab locks all (`BroadcastChannel` `wayfarer:vault`);
  - encrypted vault export and import (the file holds the KDF parameters, the wrapped DEK and the envelopes; import asks for the file's passphrase and re-encrypts under the local DEK);
  - a secret shorter than 6 characters gets a warning when saved (R5).
  - AC: unit tests: wrong passphrase with 0 secrets is refused; rotation (old fails, new works, secrets intact, no secret row rewritten); migration of 3 v1 secrets, and a migration interrupted before the write leaves all three readable as v1; swapping two secrets' ciphertexts makes both fail to decrypt; e2e: locking in tab A locks tab B within 1 s; with the idle setting at 1 minute and Playwright's clock advanced 61 s, the vault is locked. C-003, C-004 and C-005 are reworded and pass; `docs/secrets.md` is rewritten.
  - Closes #66 (F09).
- [ ] **P2.5 with P2.8 and P2.9** Secrets reach the wire, and nothing that is stored or exported holds them (D21). One PR.
  - **P2.8 `Redactor`** (D5) in core, applied to history, HAR, cURL, collection and environment export, and clipboard copy. Mutation testing (Stryker with the Vitest runner, on `resolver.ts`, `redactor.ts` and the vault's pure crypto functions) runs on PRs that touch those files and weekly.
  - **P2.9 History v2** (record shape in section 4.4): the template, the redacted request as sent, and the redacted response (status, headers, body up to 1 MB; a setting stores no bodies); a cap of 500 entries (configurable), enforced on write; search by URL, method and status, filtered in memory.
  - **P2.5 guards:** the resolver gets the vault callback. An unresolved `{{x}}` blocks the send with an inline error and a "Send anyway" action (D3; a setting turns the block off). A secret reference while the vault is locked opens the unlock dialog; cancelling sends nothing (D4). The wire check for `{{$secret.` stays after resolution and its message changes.
  - AC: mutation score ≥ 85% on `redactor.ts`; property tests place a random secret at a random offset inside base64, base64url, percent-encoded and JSON-escaped text and find 0 survivors; e2e: a protected variable in a header reaches `/echo` as plaintext, the response echoes it, and a scan of every IndexedDB store, `localStorage`, the HAR export, the cURL export and the collection export finds 0 occurrences of the plaintext or its encodings; a locked vault plus a secret reference opens the dialog and cancelling makes no request; "Send anyway" sends `{{x}}` literally but still refuses `{{$secret.x}}`; with the cap set to 5, 7 sends leave 5 entries (e2e) and the default cap of 500 is a unit test; search filters by each field. C-007, C-008 and C-014 are reworded and pass.
  - Closes #60 (F03), #71 (F14), #72 (F15); with P2.4, #64 (F07).
- [ ] **P2.11** Durability:
  - `navigator.storage.persist()` on the first save (a user gesture), with the result and `storage.estimate()` shown in Settings;
  - full workspace backup and restore as one JSON file (`wayfarer/workspace/2`), including the vault record and envelopes, excluding history by default;
  - a local reminder when the last backup is older than 14 days (dismissable; its timestamp is a `wayfarer:` key);
  - a notice in Safari about 7-day eviction for sites that are not installed, with install steps;
  - environment export with three choices: strip protected values (default), include references plus the encrypted vault bundle, or plain text after a typed confirmation.
  - AC: e2e round trip: backup, Reset all data, restore gives deep-equal stores except `meta.updatedAt`; the default environment export contains no `$secret` reference and no plaintext secret; the reminder appears with the clock advanced 15 days; the Safari notice renders only in the WebKit project; Settings → Backups lists the pre-migration copy from P2.2 and can download it.
  - Closes #73 (F16), #74 (F17).

**Exit criteria, 2C:** vault secrets reach the wire and are found nowhere in storage or exports (the scan test is green in 3 engines); the vault can be rotated, exported and locks itself; history is capped, searchable and redacted.

#### Session 2D — Viewers, disclosure, release

- [ ] **P2.13** Response viewers, chosen by content type with a manual override:
  - JSON (the existing Monaco view; over 5 MB it opens as plain text with a notice), raw text, XML (string indenter), HTML preview (D19), image (`blob:` URL, revoked when the response changes), hex dump with download for other binary;
  - search through Monaco's find; a path filter for JSON that reuses the assertion runner's dot-path evaluator and adds `[*]` (no new dependency, no `eval`);
  - a headers tab that lists duplicates separately and, for a direct cross-origin response, says once that the browser shows only CORS-safelisted headers and those in `Access-Control-Expose-Headers`;
  - `security/csp.json` gains `img-src blob:` and `frame-src blob:` (replacing `'none'`).
  - AC: e2e per viewer in 3 engines; the HTML preview of a page containing `<script>`, `<img src="https://…">`, `<link rel="stylesheet" href="https://…">`, `<meta http-equiv="refresh" content="0;url=https://…">` and a link that is then clicked executes nothing, makes 0 network requests and leaves the frame on its `blob:` URL; the CSP and Trusted Types listeners record 0 events across every viewer; `grep -rnE "innerHTML|srcdoc|bypassSecurityTrust|DOMParser" src/app --include=*.ts` shows no line added by this PR; a new claim covers the preview's isolation.
  - Closes #61 (F04), #62 (F05), and #76 (F19) except the redirect chain, which is P5.4.
- [ ] **P2.14** "What the browser did" panel, computed by a pure function in core that P6.4 reuses:
  - forbidden request headers the user set, shown as dropped;
  - whether the request needs a CORS preflight and why (the Fetch "non-simple" rules);
  - mixed content: an `http://` target from an HTTPS page will be blocked, loopback excepted;
  - what the browser adds (`Origin`, `Sec-Fetch-*`) and what Wayfarer suppresses (`Referer`, cookies);
  - `docs/browser-limits.md` explains each item and what the bridge changes.
  - AC: unit tests of the non-simple computation against 10 Fetch-spec cases; e2e: a `Cookie` header shows the dropped notice; an `http://example.invalid` URL on the HTTPS prod-parity origin shows the mixed-content notice before sending (unit test on the function; the e2e origin is `http://localhost`).
  - Closes #81 (F24).
- [ ] **P2.18** F48: content must not move after a response arrives. For about 340 ms the response tabs and the split gutter shift, and five tests clicked a moving target because of it. The first suspect is `animate-response-arrive` (a 300 ms `fade-up` with an overshooting curve, `src/design-system/animations.css`); confirm the cause with the test below before changing anything. Fix it so that nothing changes position (an opacity change is allowed), then delete the `still()` helper (`e2e/support/settled.ts`) and its 13 call sites.
  - AC: a new e2e samples the bounding boxes of the response tabs and the split gutter on every animation frame for 500 ms after the response and finds no change; `grep -rn "still(" e2e` returns nothing; the claims projects pass 20 repeats in 3 engines.
  - Closes #119.
- [ ] **P2.19** Release v2.0.0: `README.md` (features, "Known limitations"), `docs/trust-center.md`, `docs/storage.md`, `docs/collections-schema.md`, `docs/secrets.md`, `docs/claims.md`; a changelog entry with a migration note (what is converted, what is masked in old history, where the backup is); a "migration went wrong" section in `docs/runbook.md`; tick the tasks; section 12 statuses; Appendix A; the R1 checkpoint (sessions used against 4 planned).
  - AC: tag `v2.0.0` on a green commit; `check:claims` green; every finding listed against Phase 2 in section 12 is Closed or has a later task named; the checkpoint row is in Appendix A.

**Exit criteria, Phase 2:**
- Vault secrets reach the wire and never persist in plaintext outside the vault (scan test green).
- All body and response types work in 3 browsers.
- v1 to v4 data migrates without loss, and a failed migration leaves the data untouched and downloadable.
- v2.0.0 is tagged with a migration note.

**Checkpoint (R1):** Phase 2 was planned as 4 sessions. If it took more than 6, move P5.5 to P5.7 to section 15 and re-baseline section 9.

### Phase 3 — Scripting on QuickJS with Postman compatibility (2 sessions) → v2.1.0

**Goal:** scripts work in production under strict CSP, cannot escape, and run the common Postman surface.

**Deliverable:** the QuickJS worker, the `pm`/`postman` API per matrix, the trust model, the compatibility doc, and the conformance suite.

**Tasks:**

- [ ] **P3.1** `quickjs.worker.ts`:
  - lazy-loads `@jitl/quickjs-wasmfile-release-sync`;
  - one runtime per run with `setMemoryLimit(64 MB)`, `setMaxStackSize(1 MB)` and an interrupt handler at deadline;
  - the VM global contains only `pm`, `postman`, `console`, `require`, `atob`, `btoa`, `setTimeout` (host-scheduled, capped to the script deadline) and the legacy globals from P3.4;
  - `script-runner.worker.ts` deleted; `'wasm-unsafe-eval'` added via `security/csp.json`;
  - the `.wasm` file is emitted with a content hash, is absent from the initial chunk list, and is cached by the service worker on first use (a script must run offline after one run online).
  - AC: under prod CSP in 3 browsers, `pm.test('t', () => pm.expect(1).to.equal(1))` passes, and the CSP violation listener records 0 events.
- [ ] **P3.2** Host bindings in `packages/core/src/scripting/host.ts`. Only JSON-serializable values cross the boundary (dump and re-hydrate). Host functions validate argument types. Logs are capped at 1 MB and 1,000 lines, and pass through the `Redactor` with the request's taint set before they are shown or stored.
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
- [ ] **P3.5** `require` shim for `crypto-js`, `lodash`, `uuid`, `chai`, `moment`, `atob`, `btoa`. Sources are bundled to single-file scripts at build time by `scripts/build-vm-libs.mjs` (`chai` 5 and later is ESM-only) and loaded into the VM on first `require`. `crypto-js` is pinned at 4.2.0, its last release (R18). Host-native shims back crypto-js `SHA256`, `HmacSHA256`, `MD5`, `SHA1`, `HmacSHA1` and `enc.Base64/Hex/Utf8`. Any other module throws `WayfarerUnsupportedError: require('xml2js') is not supported — see docs/postman-compatibility.md#require`.
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
  - `scriptTrust` on collections exists since IDB v5 (P2.2): imports already write `trusted: false`, and a missing field means untrusted;
  - the first run shows a review modal listing every script with syntax highlighting and an "I trust these scripts" action (stores the hash);
  - untrusted requests show a banner, and scripts are skipped while assertions still run.
  - AC: e2e: import a collection with a script, send, and the script does not run while the modal appears; trust it and the script runs; re-import with a changed script and the modal appears again.
- [ ] **P3.9** Pre-request script mutations of `pm.request` apply before resolution. Post-request scripts see the resolved request (only trusted scripts run, per D6). Durations are reported separately, as "pre-script 12 ms / request 340 ms / post-script 8 ms" (moved here from P2.15).
  - AC: e2e: a pre-script adds header `X-Signed` that reaches `/echo`; a pre-script that waits 200 ms does not change the request duration shown.
- [ ] **P3.10** Benchmark gate (R3). On the CI `ubuntu-latest` Chromium runner, a script doing `CryptoJS.HmacSHA256` over a 1 KB string, parsing a 1 MB JSON response and running 50 `pm.test` assertions finishes in ≤ 300 ms p95 over 20 runs, excluding the WASM cold load, which is measured separately at ≤ 250 ms.
  - AC: `packages/core/bench/script.bench.ts` result stored in Appendix A; CI fails if p95 regresses more than 25%.
- [ ] **P3.11** `docs/postman-compatibility.md` generated from the conformance suite (`scripts/gen-compat-doc.mjs`), with "supported / partial (note) / unsupported (error name)" per API. Remove the P0.2 banner.
  - AC: CI regenerates it and fails on diff; the P0.2 banner code is deleted; claims C-006 and C-040 are reworded with their tests.
- [ ] **P3.12** (was P2.7) Script-set protected variables: `pm.environment.set` on a variable whose current value is a `$secret` reference re-encrypts into the same secret id. If the vault is locked, the mutation is rejected with a log line. It uses the mutation applier of P2.10.
  - AC: a unit test covers the locked and unlocked paths; the `environments` store never contains the plaintext (asserted by scanning all stores in the test).

**Exit criteria:**
- Scripts run in production in 3 browsers.
- The escape suite and conformance suite are green.
- The benchmark gate passes.

### Phase 4 — Interop and auth (3 sessions) → v2.2.0

**Goal:** a user of Postman, Insomnia, OpenAPI or cURL can bring their work in and take it out, with an honest report of anything lost.

**Deliverable:** 5 importers, 4 exporters plus codegen, OAuth2, AWS SigV4, auth and variable inheritance.

**Tasks:**

- [ ] **P4.1** Import pipeline:
  - runs in a worker;
  - bulk IDB transactions;
  - produces an `ImportReport` with counts, per-item warnings (unsupported auth type, body mode, script APIs found by static scan against the matrix, dropped fields);
  - a report UI shown before commit (Cancel/Import);
  - input caps: the existing 10 MB limit (`readImportText` and the shared validators; `CLAUDE.md` makes it a rule), YAML `maxAliasCount: 100`.
  - AC: a 5,000-request Postman fixture (under 10 MB) imports in ≤ 10 s in Chromium CI; a YAML alias-bomb fixture is rejected with a message in ≤ 1 s.
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
  - cURL (`--data-raw` and method quoting were done after v1.3.0; remaining: `HEAD` → `--head`, `-F` for multipart, `--data-urlencode`);
  - codegen for JS `fetch`, Python `requests` and HTTPie;
  - HAR 1.2 with redaction (D5) and a preview, for a single response, a multi-select of history entries, or a whole runner run.
  - AC: generated cURL executed against the echo-server in CI (bash) gives an identical `/echo` reflection to the in-app send, for 12 fixture requests covering every body mode.
- [ ] **P4.7** OAuth 2.0:
  - Authorization Code with PKCE (popup; the static callback page of D20 posts `{state, code}` on `BroadcastChannel` `wayfarer:oauth` and closes; the app accepts only a `state` it issued; `window.opener` is not used, because COOP removes it; no third-party scripts);
  - Client Credentials;
  - Password (labelled legacy);
  - refresh token rotation;
  - token stored in the vault (`tokenRef`) when unlocked, otherwise memory only;
  - auto refresh on expiry and optionally on 401 (one retry);
  - token requests go through the same transport as any request (the bridge when it is enabled; RoutePolicy from P6.4).
  - AC: e2e against the mock IdP in the echo-server, on the prod-parity server so that `Cross-Origin-Opener-Policy: same-origin` is in force, in 3 engines: all 3 grants obtain a token that reaches `/echo`; state mismatch is rejected; the expired token refreshes once; a token endpoint without CORS shows the documented error in direct mode and succeeds via the bridge (Phase 6 re-runs this test).
- [ ] **P4.8** AWS Signature V4 (WebCrypto HMAC; signs the resolved request after all mutations).
  - AC: signatures match the AWS SigV4 test suite vectors (vendored subset of 20 cases).
- [ ] **P4.9** Auth and variable inheritance: collection → folder → request, with `inherit` default for new requests in collections. Collection and folder auth and variables UI. Effective-auth preview in the composer.
  - AC: unit tests for the inheritance chain (8 cases); e2e: collection bearer auth reaches `/echo` for a request set to inherit.

**Exit criteria:**
- Postman, Insomnia, OpenAPI, cURL and HAR import with reports.
- Round-trip Postman export works.
- OAuth2 and SigV4 pass their tests.

### Phase 5 — Workspace UX: tabs, runner, cookies, protocols (2 sessions) → v2.3.0

**Goal:** daily-driver ergonomics on par with desktop clients for REST, GraphQL, SSE and WebSocket.

**Deliverable:** multi-tab composer, in-app runner with reports, cookie manager, GraphQL, SSE and WebSocket.

**Tasks:**

- [ ] **P5.1** `WorkspaceStore`:
  - tabs persisted in a `tabs` store created by this task's IDB upgrade (draft plus last response reference); the strip is a `mat-tab-nav-bar` with one panel, per `CLAUDE.md`;
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
- [ ] **P5.3** Cookie manager (a `cookies` store created by this task's IDB upgrade): shows jar entries (bridge-sourced `Set-Cookie`), edit and delete, applied to bridge-routed requests by domain, path and secure rules; the direct-mode notice explains the browser jar is not accessible.
  - AC: an e2e via the bridge: `/cookies/set` followed by `/echo` shows the `Cookie` header sent; deleting the cookie removes it from the next request.
- [ ] **P5.4** Redirect inspection: in bridge mode, the full redirect chain (status, Location) is shown when "follow redirects" is on; when off, the 3xx response is shown as-is. Direct mode shows "Redirected → final URL" only, with an explanation.
  - AC: e2e `/redirect/3` via the bridge lists 3 hops.
- [ ] **P5.5** GraphQL body mode: query editor with a variables pane; schema introspection (cached per URL, manual refresh) using `graphql`; autocomplete and validation in Monaco via `graphql-language-service` (lazy).
  - AC: e2e against the echo-server's GraphQL endpoint: introspection populates the schema explorer; an invalid field shows a validation marker; the query result renders.
- [ ] **P5.6** SSE: streamed via `fetch` reading `text/event-stream` (so custom headers work), with an event list (id, event, data, time), stop/reconnect, and `Last-Event-ID` support.
  - AC: e2e `/sse` emits 5 events, and all 5 are listed with correct fields in 3 browsers.
- [ ] **P5.7** WebSocket (direct). First check in 3 engines that `connect-src *` admits `ws:` and `wss:`; if it does not, add them through `security/csp.json` with a claim test. Then: connect with subprotocols, a message log (in/out, time, size), send text or JSON, close codes, and a notice that custom handshake headers need the bridge WebSocket proxy (follow-up).
  - AC: e2e `/ws` echo of 3 messages is logged in order in 3 browsers.

**Exit criteria:**
- Tabs, runner, cookies (via the bridge), GraphQL, SSE and WebSocket pass their e2e tests in 3 browsers (cookies and redirect chain in Chromium plus the bridge job).

### Phase 6 — Local Bridge first-class and the CLI (2 sessions) → v2.4.0

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
  - the `Host` header must be a loopback name (DNS-rebinding defence): done in PR #147, with the token rules; keep its tests;
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
- [ ] **P6.5** `packages/cli`: `wayfarer-cli run <collection|workspace-backup|postman.json> [-e env.json] [-d data.csv] [-n iterations] [--reporter cli,junit,json] [--bail] [--timeout ms] [--insecure]`. Uses the same `packages/core` (resolver, auth, QuickJS Node variant, runner), Node's built-in `fetch` (`undici` only if `--insecure` or proxy support needs a dispatcher), and the file-based vault via `--vault-file` plus the `WAYFARER_VAULT_PASSPHRASE` env var.
  - AC: the CLI run of the P5.2 fixture produces the same results JSON as the in-app runner (a CI diff test); exit code 1 on any failed test and 0 otherwise; runs on Node 22 and 24 in CI.
- [ ] **P6.6** Publish `wayfarer-bridge` and `wayfarer-cli` via `release.yml` with `npm publish --provenance`. `docs/cli.md` gets a GitHub Actions example.
  - AC: `npx wayfarer-bridge --help` and `npx wayfarer-cli --version` work from a clean machine; the npm page shows the provenance badge; `npm deprecate` is set on both `0.0.0-reserved` placeholders.

**Exit criteria:**
- `npx wayfarer-bridge` paired in under 60 s in the documented flow on 3 browsers (or the documented HTTPS alternative).
- The CLI matches in-app results.
- Both packages published with provenance.

### Phase 7 — Hardening and release gate (1 session) → v2.5.0

**Goal:** accessibility, performance, security and documentation are at a level where the claims can be defended publicly.

**Deliverable:** WCAG 2.2 AA pass, performance budgets, diagnostics, threat model, rewritten docs, SBOM and self-host tarball.

**Tasks:**

- [ ] **P7.1** Accessibility (text contrast at 4.5:1 in both themes and the both-themes axe sweep were done in PR #163; this task covers the rest):
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
- [ ] **P7.9** Owner pass, if it has not happened earlier (Q4): the five owner actions in section 9. Production is deployed in two steps at least a day apart, the last v1.x tag first and then the current release (R16). `docs/runbook.md` gains the step for rotating the Cloudflare API token.
  - AC: every owner action's AC holds; `SYNTHETIC_ENABLED` and `ZONE_HARDENED` are `true`; the first scheduled synthetic run is green.
- [ ] **P7.8** Close-out audit (then move this file to `docs/archive/PLAN-airtight-remediation.md`): re-run the Phase 1 audit procedure (live Playwright probes of the 8 original P0 behaviours on production, in 3 browsers) and update section 12 with final statuses.
  - AC: every F-ID row is `Closed` with a PR link, or `Deferred` with a follow-up issue; the probe script `scripts/audit-probes.spec.ts` is committed and passes on production; this file lives at `docs/archive/` and the root copy is gone.

**Exit criteria:**
- All section 1 success criteria hold.
- Section 12 has no `Open` rows.
- Trigger the Phase 2 market re-analysis.

### Milestones

Sized in sessions since v1.2.0. One session is one sitting of an agent with the maintainer available to approve the PRs that wait for them; Phase 1.5 (planned at 12 engineering days) was done on 2026-10-06 and 2026-10-07. The engineering-day estimates made at lock are in git history.

| Milestone | Deliverable | Acceptance criteria | Sessions | State |
|---|---|---|---|---|
| M0 Truthful | Phase 0 | Phase 0 exit criteria | — | Done except owner actions |
| M1 Verified | Phase 1 | Phase 1 exit criteria | — | Done except owner actions |
| M1.5 Platform reset | v1.3.0 | Phase 1.5 exit criteria | — | Done, 2026-10-07 |
| M1.6 Material and hardening | v1.4.0 | P2.0 (d) | part of 2A | Merged, unreleased |
| M2 Correct core | v2.0.0 | Phase 2 exit criteria, R1 checkpoint recorded | 4 (2A, 2B, 2C, 2D) | Next |
| M3 Scripts | v2.1.0 | Phase 3 exit criteria | 2 | |
| M4 Interop | v2.2.0 | Phase 4 exit criteria | 3 | |
| M5 Workspace | v2.3.0 | Phase 5 exit criteria | 2 | |
| M6 Bridge + CLI | v2.4.0 | Phase 6 exit criteria | 2 | |
| M7 Gate | v2.5.0 | Phase 7 exit criteria; owner pass done; Phase 2 re-analysis started | 1 | |

Before a phase starts, its session re-reads the phase against the repository and splits it into sessions the way Phase 2 is split here. Phases 3 to 7 have not had that pass beyond the corrections of v1.2.0.

## 10. Testing strategy

- **Unit (Vitest):**
  - `packages/core` in Node: resolver, redactor, importers, exporters, auth providers, runner engine, cURL parser, non-simple-request computation, inheritance.
  - App specs in Chromium browser mode: repositories and migrations with fixture DBs, vault v2, services, components.
  - Coverage gates: `src/app` lines ≥ 70% (live since P1.5.5), `packages/core` lines ≥ 90% (from P2.1). Mutation testing (Stryker, weekly scheduled plus on PRs touching the files) for `resolver.ts`, `redactor.ts` and the vault's pure crypto functions, with score ≥ 85%.
  - Tests that depend on time (idle lock, backup reminder, timeouts) use Playwright's clock or Vitest's fake timers, never a real wait.
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
- **Runbook:** `docs/runbook.md` has the Cloudflare zone steps, the npm name reservation and the service worker kill switch; `docs/deployment.md` has rollback. Still to write: a broken migration hotfix (P2.19), yanking an npm release (P6.6), rotating the Cloudflare API token (P7.9).
- **On-call implications:** solo maintainer; response target for `prod-down` issues is 48 h, stated in `SECURITY.md` and the Trust Center.

## 12. Traceability matrix (audit finding → tasks)

Status values: Open / In progress / Closed (PR #) / Deferred (issue #). Issue numbers were filled in by P0.10 (label `audit-2026-09`). A finding's issue is closed by the PR that closes the finding; P2.0 (c) closed the six that had drifted from this table (#96, #97, #118, #127, #130, #131), and the open issues with the label now equal the rows below that are Open or In progress. Task ids changed in v1.2.0: P2.7 is P3.12, and P2.15 is split between P2.3 and P3.9.

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
| F11 | Duration includes pre-script time | P2.3, P3.9 | #68 | Open |
| F12 | Phase timings empty cross-origin, presented as complete | P2.3 (C-023 already withholds the bars without `Timing-Allow-Origin`), P6.1 | #69 | In progress |
| F13 | "Encrypted at rest" overclaim | P0.9, P1.4, P7.6 | #70 | In progress (docs #100) |
| F14 | History stores resolved credentials in plaintext | P2.8, P2.9 | #71 | In progress (docs #100) |
| F15 | Collection export writes credentials in plaintext | P2.8, P4.6 | #72 | Open |
| F16 | No `storage.persist`; Safari eviction; "can't be locked out" overclaim | P0.9, P2.11 | #73 | In progress (docs #100) |
| F17 | No full backup; vault not exportable; env export has dangling secret refs | P2.6, P2.11 | #74 | Open |
| F18 | Google Fonts request; Cloudflare injection/NEL; "no subprocessors" overclaim | P0.8, P0.9, P0.12 | #75 | In progress (#100; P0.12 owner action pending) |
| F19 | Viewer lacks search/JSONPath/HTML/image; redirects invisible | P2.13, P2.3, P5.4 | #76 | Open |
| F20 | `pm.*` is a small subset while the name implies compatibility | P3.3, P3.4, P3.5, P3.11 | #77 | In progress (docs #100) |
| F21 | No Postman/Insomnia/OpenAPI/cURL/HAR import | P4.1–P4.5 | #78 | Open |
| F22 | Bridge: global toggle vs docs, not on npm, token handling, no PNA | P0.9, P6.2, P6.3, P6.4, P6.6 | #79 | In progress (docs #100; `Host` check and token handling #147) |
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
| F36 | 36 silent catches; silent memory fallback | P1.11, P2.9, P7.3 | #93 | In progress (silent catches #102; storage banner #145) |
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
| F48 | (1) For about 340 ms after a response arrives the panes keep resizing, so tabs and the gutter move under the pointer. (2) The phone accordions and the Basic/JSON switch show PrimeNG default colours, because the overrides targeted class names PrimeNG no longer uses | P2.18 for part 1. Part 2 no longer applies: the Material theme replaced those colours (#149 onward) and #163 fixed their contrast | #119 | Open (part 1) |
| F49 | Copying through the clipboard fallback (hidden textarea, used when the Clipboard API rejects) left keyboard focus on the page body | P1.5.12 (own commit) | #122 | Closed (slice 5 PR) |
| F50 | A context menu opened inside a drawer let Escape close the drawer instead, and its items could lag one render behind the clicked row | P1.5.14 | #125 | Closed (slice 7 PR) |
| F51 | The composer/response split grew without end once an editor tab was open and a response was shown (the page reached 9,860 px); masked in slices 6 and 7 by the previous library's theme styles | P1.5.15 (own commit) | #127 | Closed (slice 8 PR) |
| F52 | The environment JSON editor (and any Monaco host) could grow the page without end (32,728 px in the test); appeared when slice 8 removed PrimeNG's global theme styles | P1.5.17 (own commit) | #130 | Closed (release PR) |
| F53 | The phone header is wider than the screen (508 px at 390 px); the page scrolls sideways. Present before Phase 1.5 (506 px), not caused by it | Fixed after v1.3.0: below 1024 px the toolbar keeps lock, history and settings, and the `box-sizing` reset removed the overflow (#146); the eleven-width e2e holds it | #131 | Closed (#146) |
| F54 | Playwright imports `e2e/support/*.test.mjs` (they match its default `testMatch`), so Node's test runner executes the support suites inside every e2e collection (found in the v1.2.0 review) | P2.0 (b) | #172 | Closed (#173) |

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

Re-baseline review (v1.2.0, 2026-10-09), made against `main` at `bcca26a`, GitHub, npm and production:

31. **"Every phase ships to production."** None has since Phase 0. Production serves a build from before Phase 1, with Cloudflare's injected script and NEL still on; deferring all Cloudflare work to the end (v1.0.3) turned six releases into one deploy that also migrates stored data. Added R16 and Q4; the migration's `blocked` path is designed for production's old tabs, which never close on request.
32. **"Split the composer last (P2.17)."** Six Phase 2 tasks add composer UI. Adding it to an 889-line component with a 628-line template and splitting afterwards is the mistake D14 was made to avoid. P2.17 moves to session 2A, and the v4 converters it needs are the ones the migration reuses.
33. **"Resolve secrets in P2.4, redact in P2.8, fix history in P2.9."** Any order that merges resolution first writes plaintext secrets into history, the exact leak item 1 describes. They are one PR now (D21). Vault v2 moves ahead of it: today each decrypt is a 600,000-iteration key derivation, so five secrets in one request would add seconds to every send.
34. **"Remove the P0.3 block" (P2.5).** `CLAUDE.md` and claim C-007 require that a `{{$secret.*}}` placeholder never reaches the network in any encoding. After resolution the check still has work: a deleted secret, "Send anyway". It stays; only its message changes.
35. **"Mask the secret's base64 form" (D5).** A secret inside a longer base64 string (`user:secret`) does not contain the base64 of the secret: the encoding depends on the offset modulo 3. The redactor matches all three alignments, and the JSON-escaped form. The property test places the secret at a random offset.
36. **"Scan the stores after sending a secret" (P2.8).** History v2 stores response bodies, and servers echo credentials (token endpoints, `/echo`). The test now sends to an endpoint that reflects the secret, so the response path is covered.
37. **"HTML preview in `<iframe srcdoc>`", "XML pretty".** `srcdoc` and `DOMParser.parseFromString` are Trusted Types HTML sinks, and since P1.5.9 the policy allows no HTML. Both would throw in production and pass under `ng serve`. D19 replaces them; the AC bans the sinks by grep and by violation listener, and adds meta refresh, stylesheet and link-click cases the old AC did not have.
38. **"The OAuth popup posts the code to `window.opener`" (P4.7).** PR #145 added `Cross-Origin-Opener-Policy: same-origin`; a popup that visits the identity provider comes back with no opener. The app also has no router to own `/oauth/callback`. D20: a static callback page and `BroadcastChannel`.
39. **"A verifier validates unlock" (D8).** Unwrapping the DEK with AES-GCM already fails on a wrong passphrase, so the verifier is a second ciphertext with no job. Removed. Added instead: the secret's id as additional authenticated data (two rows' ciphertexts cannot be swapped), a non-extractable session DEK, and a migration that computes everything before its one write (an IndexedDB transaction does not survive an `await` on WebCrypto).
40. **"Web Locks for migrations and environment writes."** An upgrade is an exclusive `versionchange` transaction by specification, and overlapping `readwrite` transactions are serialised across tabs. The locks added a second mechanism to get wrong. Removed (D22); the two-tab tests stay.
41. **"Snapshot all v4 stores into `backups` before transforming."** That doubles history inside the upgrade transaction, the likeliest quota failure, and the plan did not say what the user sees when the upgrade fails: today the app would fall back to memory-only mode and look empty. History is not copied; a failure screen offers the untouched data; the banner for "another tab upgraded" stops saying "reset"; old code meeting a v5 database gets its own message (section 4.4).
42. **"Free-text method" (P2.16).** The hardening after v1.3.0 made the importer reject any method outside seven verbs, as a defence for the cURL export. The two now agree on one rule (an RFC 9110 token), the export keeps quoting, and lower-case `patch`, which `fetch` does not normalise, is upper-cased.
43. **"N headers hidden by CORS when detectable" (P2.13).** It is never detectable: `Access-Control-Expose-Headers` is itself not exposed. Replaced by a fixed note on direct cross-origin responses.
44. **Smaller cuts.** `jsonpath-plus` (the assertion runner already walks paths); a virtualised JSON view (plain text over 5 MB); `scripts/check-file-size.mjs` (ESLint `max-lines` on the composer folder); a 510-send e2e in three engines (a cap of 5 in e2e, 500 in a unit test); a real 60-second idle wait (Playwright's clock).
45. **"New stores: `tabs`, `globals`, `cookies`, `files`, `backups`, `diagnostics`, `vault`."** Three of them serve Phases 5 and 7 and would be empty schema for months. v5 creates `files` and `backups`; globals and the vault record are rows in `meta`; later phases add their own store in their own upgrade.
46. **Tasks in the wrong phase.** P2.7 (scripts setting protected variables) and the script half of P2.15 need scripts to run; they move to Phase 3 as P3.12 and P3.9. The rest of P2.15 is one line of P2.3.
47. **"Coverage ≥ 90% for core, once core exists."** Code moved from `src/app` to `packages/core` leaves the 70% gate's denominator; without a gate on core from its first PR, moving code is a way to lose coverage unnoticed. P2.1 ships the gate. The "no DOM globals" rule is enforced by core's `tsconfig` (`lib` without `DOM`), not by a list of banned names.
48. **"Runs on Node 20 and 22" (P6.5), "Node ≥ 20.19" (bridge).** Node 20 reached end of life in April 2026. Node 22 and 24.
49. **"Input caps: 50 MB file" (P4.1).** `readImportText` and the shared validators refuse files over 10 MB, and `CLAUDE.md` makes that a rule. 10 MB stays; the 5,000-request fixture must fit under it.
50. **`crypto-js` is discontinued; `chai` 5 and later is ESM-only.** R18 for the first; P3.5 bundles the VM libraries with a build script, since "pre-bundled as strings" does not happen by itself.
51. **Playwright runs the Node test suites.** `e2e/support/*.test.mjs` match Playwright's default `testMatch`, so every e2e collection imports them and Node's test runner executes inside it. Harmless so far, but it starts servers during collection. F54, fixed in P2.0.
52. **"Phase 2 is one phase."** Seventeen tasks, three of which change stored data and need the maintainer, do not fit one session. D18 splits it at the points where `main` is coherent.
53. **D15 is not what the app is built on.** The maintainer chose Material on 2026-10-09. D16 records it; UI tasks in Phases 2 and 5 cite `CLAUDE.md` patterns (`mat-tab-nav-bar`, `mat-select` without a form field) instead of CDK primitives. The body modes also retire two editors (Q1).
54. **`connect-src *` and WebSocket (P5.7).** Whether `*` admits `ws:` and `wss:` differs by reading of the CSP specification. Unverified; P5.7 checks it in 3 engines before building, and adds `ws: wss:` through `security/csp.json` if needed.
55. **`Referer` on the user's requests.** With `Referrer-Policy: strict-origin-when-cross-origin` every request Wayfarer sends names Wayfarer's origin. D23 turns it off for user requests (Q2).
56. **Mixed content was not in the constraints.** An `http://` API cannot be called from the HTTPS site at all, which is a first-day surprise for anyone testing a local network service. Added to Constraints and to P2.14.
57. **The tracker and the tags drifted.** Tags `v1.1.0` and `v1.2.0` do not exist; five issues are open for closed findings; the changelog's Unreleased section has duplicate headings. P2.0 fixes what can be fixed and P0.11 is withdrawn.
58. **"Owner actions are all Cloudflare work."** Branch protection and the npm names are not, cost minutes, and protect against a wrong merge and a lost name today. Q3.

## 14. Open questions

Each has a default. A session proceeds on the default and says so in its PR; the maintainer can overrule before merge.

| # | Question | Default | Owner | Needed by |
|---|---|---|---|---|
| Q1 | The body modes (P2.12) replace two editors: the Basic rows editor for a JSON body, and the JSON editor for headers (ordered rows with duplicates cannot be one JSON object). Keep either? | Drop both. Rows are for urlencoded and multipart; JSON is edited as text; headers get a "bulk edit" text box (`Name: value` per line). C-039 is reworded. | Maintainer | Session 2B |
| Q2 | D23: send user requests with no `Referer`? | Yes. | Maintainer | P2.3 (2A) |
| Q3 | Reserve the npm names and protect `main` now, instead of in the end-of-plan owner pass? | Yes, before session 2A's first merge. About ten minutes. | Maintainer | Now |
| Q4 | Production serves a build from before Phase 1. Do the owner pass (zone, secrets, first `deploy.yml` deploy, monitor) for v1.4.0, before the data migration merges, or keep it at the end? | Before session 2B. It makes v2.0.0 the first deploy with a migration instead of the first deploy at all (R16). | Maintainer | Before 2B |
| Q5 | May a session merge its own stored-data and claims PRs in 2B and 2C when CI is green, or does each wait? | Each waits, as `CLAUDE.md` says, unless the session's prompt grants it. | Maintainer | Session 2B |

## 15. Follow-up work (out of scope)

- Encrypted-workspace mode (collections, history and environments under the vault DEK).
- Bridge WebSocket proxy for custom handshake headers; gRPC via the bridge.
- File System Access workspace folders (Bruno-style files in Git) — Phase 2 wedge candidate.
- CORS debugger and encrypted repro links — Phase 2 wedge candidates, seeded by P2.14 and D5.
- mTLS client certificates in the bridge.
- Digest, NTLM, Hawk and OAuth 1.0 auth.
- Docker image for self-hosting.
- *(Moved into the plan in v1.1.0: the Angular upgrade and the P1.13 coverage gate for `src/app/**` are Phase 1.5, tasks P1.5.1–P1.5.5. `packages/core` ≥ 90% still starts with P2.1.)*
- A virtualised JSON view for very large responses; full JSONPath (filters, recursive descent) in the response filter.
- Dropping `style-src 'unsafe-inline'`: needs Monaco replaced or framed (section 16, v1.1.12).
- Per-document schema versions, if a later migration ever needs to run lazily instead of in the upgrade transaction.

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
| 2026-10-07 | v1.1.11 | Slice 8 of Part B (P1.5.15) as executed: PrimeNG is gone. Removed: `primeng`, `@primeng/themes`, `primeicons`, the temporary `overrides` block and its comment key, `providePrimeNG` and the Aura preset, `primeicons.css` in `angular.json`, the `primeng` keyword, the knip ignore for `primeicons`, the two Dependabot ignores (nothing left to ignore), every stale comment naming the library. The lockfile was regenerated with `npx npm@10 install` (102 lines out, nothing else changed). `@angular/router` was also removed: it was installed only as a PrimeNG peer, nothing imports it, and knip flagged it once PrimeNG was gone. `THIRD_PARTY_NOTICES.md` said 33 glyphs; the file has 40 since slice 1, now corrected (PrimeNG was never listed there). **F51 (#127), found by the claims C-006 and C-016 as soon as the library's theme styles were gone:** `ui-splitter` took its width from its panes and Monaco takes its width from its pane, so the page grew without end. Slices 6 and 7 passed because the old theme still loaded. Fixed test first in its own commit (`contain: inline-size`; the new test measured 9,860 px before). ACs run: both greps return nothing, the lockfile has 0 matches, `ng build` passes. **Bundle (P1.5.17, numbers):** initial raw 989,854 B (was 1,691,388 after the F46 hotfix and 1,707,095 at the Part A baseline), gzip 284,702 B (was 437,719 and 443,272). Budgets are now warning 1040kb and error 1089kb, and `bundle:report --max-initial-gzip=313200`, which is the new baseline × 1.05 and × 1.10 (the same ratios as before). Screenshots follow on the final PR. |
| 2026-10-07 | v1.1.12 | P1.5.16 as executed: **`style-src 'unsafe-inline'` cannot be dropped, and the directive is unchanged.** Method: `style-src 'self' 'report-sample'` through `security/csp.json` and `npm run gen:csp`, a production build, and a `securitypolicyviolation` listener across a session (load, Settings dialog, history drawer, method select, a send with the JSON response, the Scripts tab) in Chromium, Firefox and WebKit; the CSP files were then restored. All three engines reported the same sources. **Still needing inline styles:** (1) Monaco (`monaco-editor`, response body, scripts, environment JSON): dozens of `style-src-attr` violations per editor (`top:0px;height:19px;line-height:19px;`, `width:217px;`, `left:0px;width:3.9375px`, one per rendered line and layer) and a `style-src-elem` for its codicon sheet (`.codicon-add:before{content:'\ea60'…`); Monaco writes these as attribute strings, so there is no setting that avoids them. (2) Angular's component styles, injected as `<style>` elements: 8 components (`[_nghost-…]{display:block…`, `.address-bar[_ngcontent-…]`, `.usage-chip`, `.shortcut-kbd` and others). (3) 13 static `style="…"` attributes in templates (`app-shell` ×4, `response-viewer` ×3, `collections-sidebar` ×2, and one each in `api-params`, `settings`, `environments-manager`, `past-requests`), for example `transition: margin-left var(--dur-enter) var(--ease-standard)` and `font-variation-settings: 'FILL' 0, 'wght' 200…`. (4) The CDK's own overlay and dialog styles, injected as `<style>` elements (`.cdk-overlay-container, .cdk-global-over…`, `.cdk-dialog-container{display:block…`, `.cdk-visually-hidden`). (2) to (4) could be moved into global CSS, but (1) cannot, and a static site has no per-response nonce, so the directive stays; hashing would need Monaco's attributes hashed too (`unsafe-hashes` per attribute value, which is not workable for computed positions). **What did get tighter in this phase:** nothing in the CSP itself; the reason in `security/csp.json` was rewritten (it named PrimeNG), `createHTML` left the Trusted Types policy in slice 2, and no `innerHTML`, `bypassSecurityTrust*` or `eval` was added (grep below). No claim was added: there is no new guarantee to claim. A maintainer who wants this closed later can (a) move 2 to 4 into global CSS and (b) replace Monaco or sandbox it in a same-origin iframe with its own CSP; neither is part of this phase. |
| 2026-10-07 | v1.1.13 | Release of Phase 1.5 (P1.5.17, P1.5.18) as executed: version 1.3.0, CHANGELOG entry, `docs/ui-migration.md` and the screenshot harness deleted. **P1.5.17:** screenshots of every view and dialog, dark and light, at 1440 px and 390 px, before (the last build with PrimeNG) and after, as side-by-side sheets in commit `913688b` of the release PR (removed in the next commit so the repository does not keep them); the difference list is in that PR. **F52 (#130),** found by that comparison (two pages 3,352 and 5,200 px wide): Monaco hosts took their width from Monaco; fixed test first in its own commit with `contain: inline-size` on `app-json-editor` and `app-script-editor`. F51 and F52 were not visible while PrimeNG's global theme styles were present; I did not find which of its rules held them back, and did not need to, since the fix breaks the loop at its source. **F53 (#131),** also found by it: the phone header overflows by about 118 px, in the build before this phase as well; not fixed (a design decision), listed for the maintainer. **Deviations from the brief:** (1) tags `v1.1.0` (Phase 0) and `v1.2.0` (Phase 1) were never created, so `v1.3.0` is the first tag since `v1.0.0`, and the CHANGELOG has no `1.2.0` entry; Phase 1's changes are described in the plan, not retro-written; (2) F50's fix shares a PR with the tree that exposed it; (3) the screenshot pairs are pixel-compared only for states whose page size did not change, because the full-page screenshots of the old build were wider than the window (an overflow the new build does not have on desktop); every state was compared by eye instead. **Exit criteria:** Angular 22.2.1 and no PrimeNG package; every baseline command green in 3 engines with 41 claims at retries 0 (see Appendix A); coverage gate live (75.83% lines against 70%); Trusted Types policy has no HTML allowance and no `createHTML`; `style-src` answered with evidence (v1.1.12); initial bundle 989,854 B against 1,691,388 B after Part A, budgets tightened. |
| 2026-10-09 | v1.2.0 | **Re-baseline against the repository** (`main` at `bcca26a`, 37 PRs after v1.3.0 that the plan did not describe). Method: every statement about the code, the tracker, npm and production was re-checked; 28 objections are recorded in section 13 (items 31 to 58). **Added:** section 0 (where the plan stands); Phase 1.6 (the unplanned work); the owner-action list; D16 to D23; R15 to R18; Q1 to Q5; F54; tasks P2.0, P2.18, P2.19, P3.12, P7.9; a claims-impact table for Phase 2; a failure-mode design for the v5 migration. **Changed:** Phase 2 is four sessions (2A to 2D) with P2.17 first and P2.5, P2.8, P2.9 as one PR; the data model keeps `id` beside `meta`, stores only what Phase 2 uses, and turns environment variables into rows; vault v2 loses the verifier and gains authenticated ids; HTML preview and OAuth callback are redesigned around Trusted Types and COOP; paths and class names follow the 2026-10-09 rename; estimates are in sessions. **Removed:** the finished task lists of Phases 0, 1 and 1.5 (in git at `bcca26a`); Web Locks; `jsonpath-plus`; the file-size script; stores for later phases; P0.11; risks R7, R13 and R14. **Moved:** P2.7 to P3.12; P2.15 into P2.3 and P3.9. **Measured:** unit 339 in 44 files, lines 75.23%; e2e 432 tests in 18 files across six projects; production serving a pre-Phase 1 build with edge injection on; both npm names unreserved; `main` unprotected. |
| 2026-10-09 | v1.2.1 | **Session 2A as executed**, one entry per PR. **P2.0 (a)** (#171): the re-baseline landed unchanged, with one changelog line. **P2.0 (b)** (#173, F54, issue #172): `testMatch: "**/*.spec.ts"`. Measured: `CI=1 npx playwright test --list 2>&1 \| grep -c '^✔'` was 3 and is 0; the total is still 432 tests in 18 files; `npm run test:scripts` runs 53 tests (52 before, plus the one added here). Deviation: the AC is also kept as a test, `scripts/playwright-collection.test.mjs`, which lists the e2e collection and fails if a file other than `*.spec.ts` is collected or a Node test line is printed. It failed with the three `✔` lines before the change. It has to drop `NODE_TEST_CONTEXT` from the child's environment: under `node --test` a nested Node test run reports in a binary format, and the first draft of the test passed for that reason. **P2.0 (c)** (#174): #96 and #97 closed with #102, #127 with #128, #130 with #132, #118 with #121 (commit `0765665`), #131 with #146; #119 edited to part 1 only. Finding: 390 px, the width F53 was reported at, was not one of the eleven widths of "nothing is wider than a N px window", so the AC's run could not be made as written. Deviation: 390 is added to the list (twelve widths; `CLAUDE.md` says so), which also adds "the URL field has room to type in at 390 px"; both pass in 3 engines. The e2e total goes from 432 to 438 (146 per engine). **P2.0 (d)** (#175): version 1.4.0, one `## [1.4.0]` changelog entry (the two `### Changed` and two `### Fixed` blocks merged, nothing reworded), README status line, tag `v1.4.0`. The bundle was re-measured and differs from the baseline row: 1,151,729 B raw and 287,418 B gzip, not 1,155,220 B and about 288 kB; section 0 and Appendix A are corrected. Deviation: the budgets are reset to the new measurement (`CLAUDE.md`: baseline × 1.10), 1210kb / 1267kb raw and 316,200 B gzip; the task did not ask for it. Tag `v1.4.0` is on `556b976`, the merge commit of #175, after its CI run on `main` passed. **P2.1** (#176): workspaces and `packages/core` as specified, with `newId` and `safe-json` moved. Deviations: (1) `safe-json.spec.ts` had one test that calls the app's two importers, which core cannot import; it stays in `src/app` as `shared/json/import-limit.spec.ts`, assertions unchanged, and core's spec holds the other two plus two new ones (the rethrow in `stringifyJson`, `isOversizedImport`). (2) `knip.json` is rewritten around `workspaces` (knip asks for that once the root has workspaces) instead of gaining a `packages/**/*.ts` pattern. (3) The lockfile is written by the npm that ships with Node 24 (11.17), as the existing one was: npm 10 strips the `libc` fields of 24 optional packages. `npx npm@10 ci` installs it. (4) The Core job also runs `tsc --noEmit` for core, since the missing DOM types are half of what keeps the DOM out. (5) `index.ts` is excluded from core's coverage (re-exports only). |

## Appendix A — Measurements (filled during execution)

| Metric | Value | Recorded in task |
|---|---|---|
| Initial bundle baseline | raw 1,707,095 B (JS 1,370,209 / CSS 336,886); gzip (level 9) 443,272 B (JS 343,600 / CSS 99,672), measured at `b5aa772` (after P1.6). Budgets: `angular.json` initial error 1878kb / warning 1793kb (Angular kb = 1000 B); `bundle:report` gzip error 487,600 B | P1.12 |
| Phase 1.5 baseline (main `0dfe14b`, 2026-10-06, Angular 20.3.26, PrimeNG 20.4.0, Node 24.19.0 locally) | lint, knip, `check:claims` (41 claims), `check:csp`: pass. `test:scripts` 46/46, `bridge:test` 11/11, `test:ci` 216/216 in 25 files. Build passes. Initial bundle raw 1,707,620 B (JS 1,370,734 / CSS 336,886); gzip 443,535 B (JS 343,863 / CSS 99,672). e2e (`CI=1`, 3 engines): 231 tests, 226 passed, 4 skipped by design (deploy drill ×3, WebKit offline smoke), 1 failed: `@claim:C-031` in `claims-chromium`, which fails about 2 runs in 10 on Chromium at this commit (see section 16, v1.1.0) | Phase 1.5 preflight |
| After Part A (Angular 22.2.1, PrimeNG 21.1.10, TypeScript 6.0.3) — initial bundle | raw 1,755,210 B (JS 1,418,324 / CSS 336,886); gzip 456,595 B (JS 356,923 / CSS 99,672). That is +47,590 B raw and +13,060 B gzip over the Phase 1.5 baseline, all of it JavaScript: Angular 21 with PrimeNG 21 added 42,344 B raw, Angular 22 another 5,246 B. CSS is byte-identical. Budgets unchanged (1,878,000 raw / 487,600 gzip); they are re-based in P1.5.17, after PrimeNG is gone. e2e: 231 tests, 227 passed, 4 skipped by design, 0 failed. | P1.5.4 |
| After the F46 hotfix (no `@angular/animations`) — initial bundle | raw 1,691,388 B; gzip 437,719 B. This is the number Part B must beat (P1.5.17). e2e: 240 tests, 236 passed, 4 skipped by design. | F46 hotfix |
| After PrimeNG is removed (slice 8) — initial bundle | raw 989,854 B (JS 658,602 / CSS 331,252); gzip 284,702 B (JS 185,602 / CSS 99,100). Budgets: `angular.json` initial error 1089kb / warning 1040kb; `bundle:report` gzip limit 313,200 B. Final (release commit): e2e 314 passed, 4 skipped by design, 0 failed, in 3 engines; unit 349 (baseline 216), lines 75.83% (baseline 50.91%); `test:scripts` 46/46, `bridge:test` 11/11; 41 claims, retries 0. | P1.5.15, P1.5.17, P1.5.18 |
| `src/app/**` line coverage (v8, browser mode, nothing excluded) | 50.91% (2005/3938) when first measured; 70.71% (2787/3941) with the gate on, after 60 new tests (216 → 276). Threshold: lines ≥ 70%. Margin is 28 lines, so each Part B component ships with its tests. | P1.5.5 |
| OpenSSF Scorecard | _pending_ | P1.14 |
| Script benchmark p95 / WASM cold load | _pending_ | P3.10 |
| Phase 0–2 actual/estimate ratio | _pending_ | Phase 2 checkpoint |
| Newman collections within matrix / total | _pending_ | P4.2 |
| Phase 2 baseline (main `bcca26a`, 2026-10-09, Angular 22.2, Material 22.2, Node 24.19.0 locally) | `test:ci` 339/339 in 44 files, lines 75.23% (3154/4192), branches 66.92%. e2e: 432 tests in 18 files listed (144 per engine; not run for this row). 41 claims. Initial bundle 1,155,220 B raw, about 288 kB gzip, taken from the changelog entry for the Material work; P2.0 (d) re-measures. Budgets: `angular.json` warning 1213kb, error 1271kb; `bundle:report` gzip 316,700 B. | v1.2.0 re-baseline |
| v1.4.0 (release commit, 2026-10-09) | Initial bundle raw 1,151,729 B (JS 1,067,138 / CSS 84,591); gzip (level 9) 287,418 B (JS 272,186 / CSS 15,232). That is 3,491 B raw below the 1,155,220 B this table carried from the changelog. Budgets reset to the measurement × 1.05 and × 1.10: `angular.json` warning 1210kb, error 1267kb; `bundle:report` gzip 316,200 B. `test:ci` 339/339 in 44 files, lines 75.23%; e2e 438 tests in 18 files (146 per engine); `test:scripts` 53/53; 41 claims; `npm audit` 0. | P2.0 (d) |
| After session 2A / 2B / 2C / 2D: unit and e2e counts, `src/app` and core coverage, initial bundle | _pending_ | Phase 2 rules |
| Phase 2 sessions used / planned (4) | _pending_ | P2.19 |

## Appendix B — Audit evidence (2026-09-27, production)

- Prod sandbox worker `worker-SEEDX3S5.js` served with `content-security-policy: … script-src 'self' …`. Posting a run message returned `error: "Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script"`.
- `GET https://httpbin.org/html` rendered `200 OK` with body `{"error": {}, "text": "<!DOCTYPE html>…"}`. `/image/png` rendered binary as text.
- A request to an unresolvable host rendered `504 Gateway Timeout` in about 20 ms.
- Page console on load: Cloudflare Insights beacon blocked by CSP; an inline Cloudflare challenge script blocked by CSP.
- The accessibility snapshot showed buttons named `bolt`, `upload` and `light_mode`.
