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
