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
runs all of them, plus Firefox and WebKit. For a change to CSS, layout or a
template, run all three locally first (`npx playwright install` once, then
drop the `--project` flags): WebKit and Firefox differ in ways Chromium does
not show (scrollbar width, focus, fonts).

After switching to a branch whose `package.json` differs, run `npm ci`.
`node_modules` from another branch fails the build in ways that look like
code errors.

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

## Styling and layout

- Tailwind CSS 4. Its configuration is the `@theme` block in
  `src/styles.css`; there is no `tailwind.config.js`. Theme entries map
  Tailwind names onto the design tokens in `src/design-system/tokens.css`.
- Only `tailwindcss/theme.css` and `tailwindcss/utilities.css` are
  imported. **No preflight**: the design system is the base. The utilities
  are imported without a cascade layer on purpose, so source order decides
  between them and the design system. Do not move either into `@layer`.
- Because preflight is off, `src/styles.css` carries the one reset the
  utilities need: `box-sizing: border-box` on everything. Do not remove it.
- `border` draws a border (Tailwind 4 sets the style). Add it only where a
  line should show.
- Widget colours are the `--ctl-*` variables in
  `src/design-system/controls.css`. In both themes they must come from the
  design tokens (`--canvas-*`, `--label-*`, `--separator`), not literals.
- Nothing may be wider than the window at any width from 360 px up. The
  e2e test "nothing is wider than a N px window" checks eight widths; add a
  width there when a breakpoint changes. A flex child that holds wide
  content needs `min-w-0`.
- Below 1024 px the toolbar shows only what Settings does not also offer.
  A new toolbar action needs `max-lg:hidden` and a home in Settings.
- For any change that could move pixels (a CSS framework or dependency
  upgrade, tokens, a reset), compare before and after: a throwaway
  Playwright spec with `toHaveScreenshot` at 390, 820 and 1440 px in both
  themes, baseline taken on `main`'s build. Read the diff images. Do not
  commit the spec or its snapshots.
- Review what an upgrade tool writes line by line. The Tailwind tool turned
  preflight on, changed the cascade and rewrote words in test titles.

## Angular Material

- Widgets are Angular Material components (maintainer, 2026-10-09; this
  reverses the "custom on CDK" default of decision D14 in the plan). The
  migration runs one widget family per PR; until it ends, `src/app/ui` still
  holds the custom ones. What Material has no component for (the splitter,
  the hover card) stays there, built on the CDK.
- The theme is `src/design-system/material-theme.scss`, listed before
  `src/styles.css` in `angular.json`. It maps Material's `--mat-sys-*`
  variables onto the design tokens, so `[data-theme]` switches both. No
  second theme, no Material palette colour in the UI, no Roboto.
- Restyle a component with its `mat.<name>-overrides` mixin in that file.
  For what has no token, write a rule there with more specificity than
  Material's own: its component styles load after the global sheet.
- Import the one directive or component (`MatTooltip`), not its module.
- Buttons: `matButton="filled"`, `matButton="outlined"`, `matButton` (text)
  or `matIconButton`, with `btn-secondary` / `btn-danger` / `btn-success`
  for the tone, `btn-sm` for the size and `btn-square` for an icon alone in
  a filled or outlined button. Colours are the `--btn-*` variables in
  `controls.css`. Only `<button>` and `<a>` can be one: a file picker is a
  button that clicks a hidden `<input type="file">`.
- Segmented choice: `<mat-button-toggle-group class="segmented"
  hideSingleSelectionIndicator>`.
- Tabs: a `mat-tab-nav-bar` (class `tab-bar`) of `<button mat-tab-link>` and
  one `mat-tab-nav-panel` (class `tab-panes`) holding a `tab-pane` div per
  tab, each with `[hidden]`. Not `mat-tab-group`: it renders a tab's content
  only once selected, and an editor in a pane must stay mounted. Each link
  selects on `(click)` and on `(focus)`, so arrow keys switch panels as they
  move.
- Accordion: `<mat-accordion class="sections" displayMode="flat" hideToggle>`
  with the app's `section-chevron` icon in each header. To hold one panel
  open from a signal, bind `[expanded]` and handle `(opened)` and
  `(closed)`: `(closed)` fires for the panel another one replaced, after
  that one's `(opened)`.
- Select: `<mat-select class="select">` with `mat-option` children, used
  without a form field (`controls.css` draws the box). Name it with
  `aria-label`, or `aria-labelledby` pointing at a `<span>`: a `<label for>`
  cannot name it. An optional choice gets a first `<mat-option
  [value]="null">`; Material then shows the placeholder.
- Material's select behaves like the native one: Enter or Space opens the
  list, and an arrow key or a letter on the closed select changes the value.
- Menu: `<mat-menu>` of `<button mat-menu-item>`, opened with
  `[matMenuTriggerFor]`, or `[matContextMenuTriggerFor]` for one at the
  pointer. When the items depend on what was clicked, put them in
  `<ng-template matMenuContent>`: content outside it is rendered with the
  page, and shows the last target's items for a frame.
- A Material menu reads its keys from its own panel, so they work once the
  panel holds focus. An e2e test waits for the first item to be focused
  before it sends a key.
- An open menu or select sits over a transparent backdrop. A test that
  clicks its trigger a second time clicks the coordinates, not the element.
- A token whose value is a variable set on the component (`--btn-fg`) must
  be overridden on the component's class, not on `html`: a variable is
  resolved where it is declared.
- A Tailwind utility on a Material host loses to Material for any property
  Material sets there (height, padding, min-width, font, colour, border, and
  width on a select). Give the utility Tailwind's important modifier
  (`w-48!`), or change the property through a token. Margin utilities, and
  width on a button, are safe as they are.
- A Material tooltip is an overlay that takes Escape and stops it. A dialog
  or drawer therefore also reads Escape from its own element while a
  tooltip is showing; without that, a tooltip over a focused button keeps
  the panel open.
- Ripples are off (`MAT_RIPPLE_GLOBAL_OPTIONS` in `app.config.ts`).
- `matTooltip` takes text and watches focus on its host only. Put it on the
  focusable element, not on a wrapper.
- An e2e test that expects a tooltip from the keyboard first moves the
  pointer off the window's corner (`page.mouse.move`). A headless pointer
  rests at (0, 0), where the CDK first places an overlay, and Material hides
  a tooltip the pointer entered and left.

## Monaco

- Imported through `src/app/shared/monaco/monaco-loader.ts` only, from the
  package's entry points (`monaco-editor/editor`,
  `monaco-editor/languages/features/<x>/register`,
  `monaco-editor/languages/definitions/<x>/register`). Never
  `monaco-editor/esm/...`, and never the root `monaco-editor`, which bundles
  every language.
- Only JSON and TypeScript/JavaScript are bundled. A new language needs its
  register import, a worker wrapper if it has a service, and a path mapping
  to the stub in `tsconfig.spec.json`.
- Its stylesheet is the separate `monaco.css` (see `styles` in
  `angular.json`), linked by the loader when the first editor mounts. Do not
  import it from `src/styles.css`: that puts 390 kB on first load.

## Dependencies and the bundle

- `npm audit` reports 0 and must stay there. Fix the dependency (or its
  override); do not run `npm audit fix --force`.
- The size budgets (`angular.json`, `bundle:report` in `package.json`) are
  the measured baseline times 1.10. When a change moves the baseline, reset
  them in the same PR and say why in the changelog.
- `/3rdpartylicenses.txt` ships with the app (`scripts/build-sw.mjs`).
  Angular lists direct dependencies only; a package that bundles others
  (Monaco bundles DOMPurify and marked) is added to the list in that script.
- Close a Dependabot PR that a hand-made update supersedes, with the reason.

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
- The vault derives keys with PBKDF2-SHA-256 at 600,000 iterations (claim
  C-004) and uses the passphrase exactly as typed. The envelope format
  changes only through the plan's Vault v2 (P2.6); do not add an interim
  one. Raising the iteration count in place was a one-time decision made
  while no stored data existed; with users, it needs a migration.
- Response headers live in `public/_headers`: CSP (generated), HSTS for this
  host only (no `includeSubDomains`, no `preload`), COOP and CORP
  `same-origin`. The smoke e2e asserts them.
- Local Bridge (`local-bridge/`): zero dependencies; binds to 127.0.0.1;
  refuses a non-loopback `Host`; needs an allowed `Origin` and the token for
  `/relay`; caps request and response bodies; rejects a wrong argument
  instead of defaulting. Keep every one of these when changing it.
- Importers read a picked file with `readImportText` and validate with the
  shared validators, which enforce the 10 MB cap.
- When storage is unavailable or was reset elsewhere, say so in the shell's
  banners; never fall back silently.
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
- A claim in a changelog entry or PR body is checked before it is written:
  run the command (`npm audit`, the test, the build) and quote its result.
- When one PR in a series merges, merge `main` into the open ones and rerun
  the suites before merging them; `CHANGELOG.md` conflicts on every one.
