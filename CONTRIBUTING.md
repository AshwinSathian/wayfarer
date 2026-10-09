# Contributing to Wayfarer

Thanks for considering a contribution. Wayfarer is a local-first, no-account
API testing client (Angular + IndexedDB), and the goal is to keep it
fast, simple, and trustworthy. This guide covers everything you need to go
from `git clone` to an open pull request.

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/AshwinSathian/wayfarer.git
cd wayfarer

# 2. Install dependencies (use npm ci for a clean, reproducible install)
npm ci
# (or: npm install)

# 3. Run the dev server, then open http://localhost:4200
npm run start

# 4. Run the linter
npm run lint

# 5. Run the unit tests once, with the coverage gate (npm run test watches)
npm run test:ci

# 6. Production build
npm run build

# 7. Run the end-to-end tests against that build
npx playwright install   # once
CI=1 npx playwright test --project=chromium --project=claims-chromium
```

CI also runs the end-to-end tests in Firefox and WebKit. For a change to
CSS, layout or a template, drop the `--project` flags and run all three:
they differ in scrollbar width, focus and fonts.

Requires **Node 24** (see `.nvmrc`; 22.22.3 or later also works) and a modern browser.

## Branch & PR Flow

1. Fork the repo (or create a branch directly if you have write access).
2. Create a topic branch off `main`: `git checkout -b fix/short-description`.
3. Make focused changes: prefer several small, reviewable PRs over one large
   one. This matters especially for anything touching security-sensitive code
   (the script sandbox, the secrets vault) or mechanical/codemod-style diffs.
4. Make sure the app builds, tests pass, and lint is clean locally before
   opening a PR (see commands above).
5. Open a PR against `main` using the PR template. Fill in the summary, type
   of change, and test plan. Screenshots/recordings are appreciated for any
   UI change.
6. Keep the PR scope tight. For anything beyond a small fix or docs tweak,
   please open an issue first to discuss the approach before investing time in
   an implementation.
7. A maintainer will review, request changes if needed, and merge once CI is
   green and the PR is approved.

## Code Style & Architecture Expectations

This repo is intended to read as a clean, current Angular reference example.
When contributing:

- **Naming** follows the [Angular style guide](https://angular.dev/style-guide):
  - File names are hyphenated and carry no type suffix: `user-profile.ts`,
    `user-profile.html`, `user-profile.css`, `user-profile.spec.ts`. Not
    `user-profile.component.ts`, `x.service.ts`, `x.util.ts`, `x.models.ts`.
    Only `*.spec.ts` and `*.worker.ts` keep a dotted suffix (tooling reads
    them).
  - Class names carry no `Component`, `Directive` or `Service` suffix:
    `UserProfile`, `Tooltip`. Name a service for what it does or holds
    (`CollectionsStore`, `RequestExecutor`, `TransportRouter`), not `XService`.
  - `ng generate` already produces these names; `angular.json` no longer
    overrides them.
- **Standalone is the default**: never write `standalone: true`, and no
  `NgModule`s.
- **`OnPush` everywhere**; the app is zoneless. State a template reads must
  be a signal, or the view will not update.
- **Signals**: `input()`, `output()`, `model()`, `viewChild()`, `computed()`,
  `signal()`. No `@Input`, `@Output`, `@ViewChild`.
- **`inject()`**, not constructor parameters.
- **`host` metadata**, not `@HostListener` / `@HostBinding`.
- **`[class]` / `[class.x]` / `[style.x]`**, not `ngClass` / `ngStyle`. Note
  that `[class]="{ 'a b': cond }"` does not split a key with several classes
  the way `ngClass` did; use a ternary string for those.
- **Import the one directive or pipe a template uses** (`NgTemplateOutlet`,
  `DatePipe`), not `CommonModule`.
- **Control flow** is `@if` / `@for` / `@switch`.
- **Lifecycle hooks are not `async`.** Start the work with `void this.load()`.
- **No dropped promises**: await it, return it, or mark it `void` on purpose.
  Lint fails otherwise.
- **No silent failures**: no empty `catch`, no `.catch(() => {})`. Handle the
  error or record it with `Diagnostics.record` / `recordDiagnostic`.
- **No `any`**, and `tsconfig.json` stays at what `ng new --strict` writes.
- Keep files reasonably small and single-purpose. If you're adding
  significant logic to an already-large file (e.g. `idb.ts`), consider
  whether it belongs in a new, focused service instead. Files under
  `src/app/components/composer/` may not pass 400 lines (ESLint), and a
  composer template stays under 250.
- **Styling** is Tailwind CSS 4 utilities over the design system, with no
  Tailwind reset. See "Styling and layout" in [`CLAUDE.md`](CLAUDE.md) before
  touching `src/styles.css`, `--ctl-*` colours or a breakpoint. Nothing may
  be wider than the window from 360 px up; an e2e test checks it.
- **No guards for environments the app cannot run in** (`typeof window`,
  `typeof Worker`, a `structuredClone` fallback). It is a browser app on
  current browsers.
- Match the existing "Obsidian" design system (see `src/design-system/`) for
  any UI work. Use existing tokens rather than introducing new ad hoc
  colors/spacing.
- **Widgets are Angular Material components** (button, select, menu, dialog,
  tabs, tree, form field, checkbox, tooltip), themed from the design tokens
  in `src/design-system/material-theme.scss`. Do not build a widget
  Material already has, and do not add a Material palette colour or a second
  theme. `src/app/ui` holds only the wrappers the app needs (`ui-dialog`,
  `Confirm`, `ui-tree`) and what Material has no component for
  (`ui-splitter`, `uiHoverCard`). "Angular Material" in
  [`CLAUDE.md`](CLAUDE.md) has the markup for each widget and the places
  where Material's behaviour differs from what a test or a user expects;
  read the entry for a widget before using it.

## Tests

- Add or update tests for any behavior change, and especially for anything
  touching the script sandbox, assertion runner, or secrets vault. These are
  the most security-sensitive parts of the app and should never regress
  silently.
- Look at `*.spec.ts` files next to the code you're changing for the existing
  testing patterns (e.g. `secret-crypto.spec.ts` for a good example of
  a real, meaningful test rather than a stub).

## Reporting Bugs & Requesting Features

Please use the issue templates (`.github/ISSUE_TEMPLATE/`); they'll prompt
you for the information that's most useful for triage.

## Security Issues

Please **do not** file a public issue for a security vulnerability. See
[SECURITY.md](SECURITY.md) for the responsible-disclosure process.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you're expected to uphold it.
