# Contributing to API Sandbox

Thanks for considering a contribution. API Sandbox is a local-first, no-account
API testing client (Angular + PrimeNG + IndexedDB) — the goal is to keep it
fast, simple, and trustworthy. This guide covers everything you need to go
from `git clone` to an open pull request.

> **Note:** the project's build tooling (npm scripts, linter, test runner) is
> being actively modernized. If the commands below don't match what's in
> `package.json` by the time you read this, trust `package.json`'s `scripts`
> block over this document and feel free to send a docs PR to fix the drift.

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/AshwinSathian/apiSandbox.git
cd apiSandbox

# 2. Install dependencies (use npm ci for a clean, reproducible install)
npm ci
# (or: npm install)

# 3. Run the dev server
npm run start
# falls back to: ng serve --open
# then open http://localhost:4200

# 4. Production build
npm run build

# 5. Run tests
npm run test

# 6. Run the linter
npm run lint
```

If `npm run start`/`test`/`lint` aren't defined yet in your checkout, use
`ng serve`, `ng test`, and `ng lint` directly as a fallback — the underlying
Angular CLI commands are always available once `npm ci` finishes.

Requires **Node 20+** and a modern browser.

## Branch & PR Flow

1. Fork the repo (or create a branch directly if you have write access).
2. Create a topic branch off `master`: `git checkout -b fix/short-description`.
3. Make focused changes — prefer several small, reviewable PRs over one large
   one. This matters especially for anything touching security-sensitive code
   (the script sandbox, the secrets vault) or mechanical/codemod-style diffs.
4. Make sure the app builds, tests pass, and lint is clean locally before
   opening a PR (see commands above).
5. Open a PR against `master` using the PR template. Fill in the summary, type
   of change, and test plan — screenshots/recordings are appreciated for any
   UI change.
6. Keep the PR scope tight. For anything beyond a small fix or docs tweak,
   please open an issue first to discuss the approach before investing time in
   an implementation.
7. A maintainer will review, request changes if needed, and merge once CI is
   green and the PR is approved.

## Code Style & Architecture Expectations

This repo is intended to read as a clean, current Angular reference example.
When contributing:

- **Standalone components only** — no `NgModule`-based components.
- **Modern control flow** — use `@if` / `@for` / `@switch`, not `*ngIf` /
  `*ngFor` / `*ngSwitch`.
- **`inject()`** for dependency injection rather than constructor-parameter
  DI, in new and touched code.
- **Signals** — prefer `input()`/`output()`/`viewChild()` and `computed()`/
  `signal()` over the legacy decorator-based equivalents in new code.
- Follow the [Angular style guide](https://angular.dev/style-guide) for
  naming, file organization, and component structure.
- Keep files reasonably small and single-purpose. If you're adding
  significant logic to an already-large file (e.g. `idb.service.ts`,
  `api-params.component.ts`), consider whether it belongs in a new,
  focused service instead.
- Match the existing "Obsidian" design system (see `src/design-system/`) for
  any UI work — use existing tokens rather than introducing new ad hoc
  colors/spacing.

## Tests

- Add or update tests for any behavior change, and especially for anything
  touching the script sandbox, assertion runner, or secrets vault — these are
  the most security-sensitive parts of the app and should never regress
  silently.
- Look at `*.spec.ts` files next to the code you're changing for the existing
  testing patterns (e.g. `secret-crypto.service.spec.ts` for a good example of
  a real, meaningful test rather than a stub).

## Reporting Bugs & Requesting Features

Please use the issue templates (`.github/ISSUE_TEMPLATE/`) — they'll prompt
you for the information that's most useful for triage.

## Security Issues

Please **do not** file a public issue for a security vulnerability — see
[SECURITY.md](SECURITY.md) for the responsible-disclosure process.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you're expected to uphold it.
