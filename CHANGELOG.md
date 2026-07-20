# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project intends to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once a first tagged release ships.

## [Unreleased]

### Added

- OSS repository hygiene: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
  (Contributor Covenant v2.1), `SECURITY.md`, GitHub issue forms
  (`.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml`),
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, a CI workflow
  (`.github/workflows/ci.yml` — lint, unit test, production build with
  budget enforcement), and `.github/dependabot.yml` (weekly npm + GitHub
  Actions updates).
- `docs/scripts.md` documenting the real, verified `pm.*` scripting API
  surface and the current script-sandbox isolation model (including its
  known limitation — see the Security section below).
- README badges (build status, license, coverage placeholder).

### Documentation

- Reconciled `docs/plans/plan-product-roadmap.md`: removed the "destroy
  this file" instruction, marked the shipped scripts/assertions rows as
  done in its competitive gap table, and pointed remaining backlog items at
  the Phase 4 section of `docs/plans/plan-specimen-modernization.md`.
- Rewrote `README.md`: removed stale NDJSON export claims (the feature was
  never shipped), brought the feature list current (scripts, assertions,
  history drawer, secrets vault, command palette), and linked the new
  CONTRIBUTING/CODE_OF_CONDUCT/SECURITY docs.

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
