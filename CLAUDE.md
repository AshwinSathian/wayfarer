# Wayfarer: rules for agents

Wayfarer is a local-first API client: Angular 22 (zoneless, signals,
standalone), IndexedDB, no backend. The rules below are the ones this
codebase is held to. `CONTRIBUTING.md` has the same code-style rules for
people; `PLAN-airtight-remediation.md` is the roadmap.

## Commands

```bash
npm run lint            # ESLint, type-aware
npm run test:ci         # Vitest in headless Chromium, with the coverage gate
npm run build           # production build + service worker
CI=1 npx playwright test --project=chromium --project=claims-chromium   # e2e against the built app (run the build first)
npm run bridge:test     # local-bridge (Node test runner)
npm run test:scripts    # scripts/ and e2e/support
npm run check:claims    # every documented claim has a ledger row and a test
npm run check:csp       # index.html and _headers match security/csp.json
npx knip                # no unused files, exports or dependencies
```

Run lint, unit tests, build and the Chromium e2e before opening a PR. CI
runs all of them, plus Firefox and WebKit.

## Naming and structure

- Files: hyphenated, no type suffix. `collections-sidebar.ts` with
  `.html`, `.css`, `.spec.ts` beside it. Never `.component.ts`,
  `.service.ts`, `.util.ts`, `.models.ts`. Only `.spec.ts` and `.worker.ts`
  keep a dotted suffix.
- Classes: no `Component`, `Directive` or `Service` suffix. A service is
  named for what it does or holds: `CollectionsStore`, `RequestExecutor`,
  `HttpTransport`, `SecretCrypto`. Repositories are `XRepository` in
  `x-repository.ts`.
- Selectors: `app-` for features, `ui-` for the widgets in `src/app/ui`.
- `PLAN-airtight-remediation.md` is locked and `CHANGELOG.md` is history:
  both use the names from before the October 2026 rename
  (`main.service.ts` / `MainService` is now `http-transport.ts` /
  `HttpTransport`; otherwise drop the suffix). Do not rewrite them.
- Do not reorganise the top-level folders (`components`, `services`, `data`,
  `shared`, `ui`): Phase 2 of the plan moves code into `packages/core`.

## Angular

- Zoneless and `OnPush`. Anything a template or effect reads must be a
  signal; a plain field will leave views stale.
- `input()`, `output()`, `model()`, `viewChild()`, `inject()`. No decorators
  for these, no constructor injection.
- `host: {}` metadata, not `@HostListener` / `@HostBinding`.
- `[class]`, `[class.x]`, `[style.x]`, not `ngClass` / `ngStyle`. A
  `[class]` object does not split a key holding several classes; use a
  ternary string.
- Import single directives and pipes, not `CommonModule`.
- Never write `standalone: true`. Use `styleUrl`, not `styleUrls`.
- Lifecycle hooks are synchronous: `void this.load()`, not `async ngOnInit`.

## TypeScript

- `tsconfig.json` matches `ng new --strict`. Do not loosen it.
- No `any`, no non-null assertion where a check can return the value.
- Every promise is awaited, returned or marked `void`.
- No empty `catch` and no `.catch(() => {})`: handle the error or record it
  with `recordDiagnostic`.
- Prefer deleting code. No scaffolding for later, no fallback for an
  environment the app cannot run in.

## Security

- Records keyed by user text (variables, headers, body keys) are read with
  `Object.hasOwn` and built with `Object.fromEntries`. `obj[key]` finds
  `constructor`; `obj["__proto__"] = x` sets a prototype.
- Text the user copies into a shell (cURL export) is quoted, and is never
  placed where the tool reads it as an option or a file (`--data-raw`, not
  `-d`).
- Imported files are untrusted: validate every field against the values the
  app itself writes (methods, string-valued variables).
- Ids come from `newId()` in `src/app/shared/id.ts`. No `Math.random`.
- The endpoint field is text, not a URL: it may hold `{{variables}}`. Do not
  round-trip it through `URL`; that lower-cases and encodes placeholders.
- A `{{$secret.*}}` placeholder must never reach the network, in any
  encoding (claim C-007). Extend `containsSecretPlaceholder` when adding a
  place a value can go on the wire.
- The CSP lives in `security/csp.json`; run `npm run gen:csp`. No
  `unsafe-eval`, no third-party origin.
- Vault crypto, the envelope format and stored data change only through the
  plan's Vault v2 (P2.6). Do not add an interim format.
- Reset all data must remove everything the app stored, including every
  `wayfarer:` key in `localStorage`.

## Tests

- A bug fix starts with a test that fails for the reason reported. Keep it.
- A change to a documented claim updates `docs/claims.md` and its
  `@claim:C-NNN` test in the same PR.
- Before replacing one Angular construct with another, check the behaviour
  with a throwaway test when the docs leave it open.

## Pull requests

- One fix or slice per PR, branched from `main`. No stacked branches, no
  pushes to `main`.
- Add an entry under `## [Unreleased]` in `CHANGELOG.md`, written for a
  user: what changed and what was wrong before.
- Before merging your own PR, read its diff as a reviewer looking for a
  reason to reject it: regressions on plain-http origins, on existing stored
  data, on imported files, in the three browsers.
- PRs that change security posture, stored data or public claims wait for
  the maintainer unless they have said otherwise for the session.
- Stage files by name. `git add -A` has committed test screenshots here.
