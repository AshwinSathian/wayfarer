# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project intends to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A Trust Center (`docs/trust-center.md`) and a pre-answered procurement
  security questionnaire (`docs/security-questionnaire.md`), so a security
  reviewer can find the data-residency, encryption, subprocessor, and
  compliance-status facts in one place instead of filing a ticket — per
  `docs/plans/plan-rebrand-enterprise-strategy.md` Part F / Phase R3.
- `/.well-known/security.txt` (RFC 9116) for automated vulnerability-scanner
  discovery, linked from `SECURITY.md`.
- **Local Bridge** (`local-bridge/`): an optional, zero-dependency companion
  process that relays requests to CORS-restrictive or intranet-only APIs a
  browser tab structurally cannot reach — per
  `docs/plans/plan-rebrand-enterprise-strategy.md` Part E2 / Phase R6. Binds
  to `127.0.0.1` only, gates every relay call on both an Origin allowlist
  and a persisted, constant-time-compared token. Run it with `npm run
  bridge`; enable it from the new router icon in the app toolbar. See
  `local-bridge/README.md` for the full security model and known
  limitations.
- `BridgeService` and a Local Bridge settings dialog in the app shell for
  configuring and testing the connection to a running bridge instance.
  `MainService.sendRequest()` now routes through the bridge when enabled,
  re-deriving the same success/error response shape a direct fetch would
  produce so the rest of the request pipeline (scripts, assertions,
  history) is unaffected either way.
- A `local-bridge` CI job running the companion's own `node --test` suite.
- **Save to Collection**: the request composer can now actually save its
  contents into a collection. Previously the only way to add a request to a
  collection was the sidebar's "New Request" prompt (name + method only,
  empty URL), and there was no way to ever edit it again — `CollectionsService`/
  `CollectionsRepository`/`IdbService` gain a real `updateRequest()`, and the
  composer gets a **Save** action (icon button next to Send) that writes the
  full current state — method, URL, headers, body, auth, pre/post-request
  scripts, and tests — back to the bound request, plus a **Save to
  Collection** dialog (name + collection + optional folder picker) for a
  request that isn't bound to one yet. Closes the gap between this and the
  README's existing "saved to a Collection for later reuse" claim, which
  wasn't actually possible before this change.
- An explicit **New Request** action (icon button in the composer, and the
  previously-inert mobile sidebar button, which only closed the drawer and
  didn't touch the composer at all) that clears the form and drops any
  collection-request binding.
- Folder/collection icons in the collections tree — previously a folder and
  a collection both rendered as plain, indistinguishable label text.
- Six more command palette (⌘K) actions — New Request, Send Request, Focus
  Address Bar, toggle theme, open History, lock/unlock secrets, open Local
  Bridge settings, Reset All Data — registered alongside the existing
  collection/folder commands. The palette previously had exactly one
  command ("New Collection").

### Fixed

- **A successful Send no longer wipes the entire composer.** `sendRequest()`
  called `resetForm()` unconditionally after every send — method, URL,
  headers, body, and auth all vanished the instant a response arrived, with
  no way to tweak a header and resend, the single most basic workflow every
  API client supports. The composer now stays exactly as composed; the new
  explicit "New Request" action is the only thing that clears it.
- Loading a saved collection request into the composer (double-click in the
  sidebar) silently dropped its auth config, pre/post-request scripts, and
  tests — the tree only ever emitted a lossy history-shaped object carrying
  method/url/headers/body. It now emits the full `RequestDoc` and the
  composer's new `loadCollectionRequest()` restores everything.
- The Send button's `styleClass="send-btn"` was silently a no-op — PrimeNG's
  `pButton` *attribute* directive (as opposed to the `<p-button>`
  *component*) never exposed a `styleClass` input, so the button had been
  falling back to the theme's default primary-button color the whole time
  instead of the intended gradient. Switched to a plain `class` binding,
  which Angular merges onto the host element regardless of directive
  support. This surfaced a real, previously-masked WCAG AA violation: the
  default primary color (`#a5b4fc`) only has a 1.99:1 contrast ratio against
  white button text (needs 4.5:1) — masked in the existing accessibility
  e2e test because the send-then-clear bug above used to disable the button
  (and thus exempt it from the contrast check) immediately after every send.
  `--gradient-accent`'s start stop is now a darker `#405DD0` (was `#4C6EF5`,
  itself only 4.32:1) so the button clears AA at every point along the
  gradient.

## [1.0.0] - 2026-07-21

**This project has been renamed from "API Sandbox" to "Wayfarer."** Same app,
same local-first storage model, same MIT license — only the name and visual
identity changed. We're saying this out loud rather than treating it as a
cosmetic footnote: the whole point of this project is that nothing about how
your data is stored or who can gate access to it should ever change without
you being told plainly. See `docs/plans/plan-rebrand-enterprise-strategy.md`
for the full reasoning behind the rename.

### Changed

- Renamed the project "API Sandbox" → "Wayfarer" across the app UI, docs,
  package metadata, build/CI configuration, and the GitHub repository. The
  physical IndexedDB database name, and the collection/environment export
  schema `$id`s, are intentionally left unchanged (renaming them would force
  a lossy data migration or break already-exported files against a domain
  that isn't live yet) — see `docs/storage.md` and the rebrand plan's
  migration checklist for the full reasoning.
- Replaced the iOS System Blue accent (`#0A84FF`/`#007AFF`) with an ownable
  "Wayfarer Indigo" hue across both the dark and light themes, including the
  brand gradient, focus rings, and the GET method color that previously
  matched the old accent 1:1.
- Replaced the app's mark with a route/waypoint glyph (a bending route line
  ending in a filled waypoint dot), regenerated across the favicon and the
  full PWA icon set, and added an `apple-touch-icon` link that was previously
  missing.
- HAR exports now report `Wayfarer` as the creator tool (only affects newly
  generated exports; previously exported files are unaffected).

### Added

- A Playwright `e2e` job in CI (`.github/workflows/ci.yml`), closing the gap
  the CI config's own `TODO` had tracked since Playwright specs landed in the
  `e2e/` directory but were never wired into the pipeline.
- OSS repository hygiene: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
  (Contributor Covenant v2.1), `SECURITY.md`, GitHub issue forms
  (`.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml`),
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, a CI workflow
  (`.github/workflows/ci.yml` — lint, unit test, production build with
  budget enforcement, plus the e2e job above), and `.github/dependabot.yml`
  (weekly npm + GitHub Actions updates).
- `docs/scripts.md` documenting the real, verified `pm.*` scripting API
  surface and the current script-sandbox isolation model (including its
  known limitation — see the Security section below).
- README badges (build status, license, coverage placeholder).

### Documentation

- Reconciled `docs/plans/plan-product-roadmap.md`: removed the "destroy
  this file" instruction, marked the shipped scripts/assertions rows as
  done in its competitive gap table, and pointed remaining backlog items at
  the Phase 4 section of `docs/plans/plan-specimen-modernization.md`.
- Rewrote `README.md` for the Wayfarer identity: removed stale NDJSON export
  claims (the feature was never shipped), brought the feature list current
  (scripts, assertions, history drawer, secrets vault, command palette), and
  linked the new CONTRIBUTING/CODE_OF_CONDUCT/SECURITY docs.

### Security

- Pre/post-request scripts now execute inside a dedicated Web Worker
  (`script-runner.worker.ts`) instead of via `new Function()` on the main
  thread — closing the sandbox-escape gap tracked in
  `docs/plans/plan-specimen-modernization.md` (Part B3 / Phase 0), where a
  script could re-acquire `fetch`/`document`/etc. as a language primitive
  regardless of name-shadowing. The worker realm has no `window`,
  `document`, cookies, `localStorage`, or main-thread memory access by
  construction, and the worker additionally strips its own
  network/storage-capable globals before evaluating any script. A regression
  suite (`script-sandbox.service.spec.ts`) asserts the original escape
  (`Function("return typeof fetch")()` re-acquisition) is closed. See
  `docs/scripts.md` for the full, verified isolation model.

## [0.1.0] - 2026-07-20

Reconstructed from the commit history up to this point; not a tagged
release yet.

### Added

- Pre/post-request scripts (Monaco-backed editor) and a visual test
  assertion builder, with a new **Tests** tab in the response viewer and a
  `pm.environment` / `pm.response` / `pm.test` / `pm.expect` scripting API.
- Secrets vault first-use passphrase setup flow.
- History drawer with date-grouped, relative timestamps.
- Collections tree "load into composer" with scroll-to-focus behavior.
- Copy as cURL, a dedicated Query Params editor, an Auth tab
  (Bearer / Basic / API Key), and PWA activation.
- Collections/folders/requests CRUD with drag-and-drop reorder, inline
  rename, and deterministic import/export.
- Environment manager with a dropdown switcher, `{{var}}` resolution
  chips, and per-variable focus from the request editor.
- Encrypted secrets at rest via PBKDF2 (200k iterations, SHA-256) +
  AES-GCM-256, with lock/unlock UI and ciphertext-only IndexedDB storage.
- "Reset All Data" action to clear IndexedDB and local settings in one
  guarded click.
- The "Obsidian" design system: design tokens, typography and color
  normalization, light/dark theme parity, a custom Monaco theme, and a
  dedicated motion/animation pass.
- Support for additional HTTP verbs and body type selectors in the
  request composer; a Monaco JSON editor mode.

### Fixed

- Invalid/unparseable URLs are now validated before sending, instead of
  silently resolving against the app's own origin.
- Response body/column rendering and layout fixes across the composer and
  response viewer.
- PrimeNG type-compliance fix (`contrastColor` replacing `inverseColor`)
  for theme integration.

### Removed

- NDJSON export — removed from the app; the README previously described
  it in three places after removal, which has since been corrected.

### Changed

- Method-verb color coding in the method selector.
