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
npm run bridge:test     # packages/bridge (Node test runner)
npm -w packages/core test            # packages/core: Vitest in Node, lines >= 90%
npm -w packages/core run typecheck   # packages/core compiles without the DOM types
npm run test:scripts    # scripts/ and e2e/support
npm run check:claims    # every documented claim has a ledger row and a test
npm run check:csp       # index.html and _headers match security/csp.json
npm run check:compat    # docs/postman-compatibility.md is what the compatibility matrix gives
npm run check:readme    # README's feature list is docs/claims.md (npm run gen:readme writes it)
npm run check:links     # every doc link leads to a file; README links every doc
npm -w packages/core run mutation    # Stryker on the resolver, the redactor and the vault's crypto (3 minutes)
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
  `TransportRouter`, `SecretCrypto`. Repositories are `XRepository` in
  `x-repository.ts`.
- Selectors: `app-` for features, `ui-` for the widgets in `src/app/ui`.
- `PLAN-airtight-remediation.md` is the roadmap: read its section 0 first.
  Its open tasks use today's names. Its sections 13 and 16, the audit's
  problem statement and `CHANGELOG.md` are history and use the names from
  before the October 2026 rename (`main.service.ts` / `MainService` became
  `http-transport.ts` / `HttpTransport`, which P2.3 replaced with the
  transports in `packages/core`; otherwise drop the suffix). Do not
  rewrite history. A change to the plan needs a row in its section 16.
- Do not reorganise the top-level folders (`components`, `services`, `data`,
  `shared`, `ui`): Phase 2 of the plan moves code into `packages/core`.

## packages/core

- `@wayfarer/core` is the engine the web app and, later, the CLI share. The
  app imports it by that name (a `paths` entry in `tsconfig.json` and
  `tsconfig.spec.json`), never by a relative path.
- No Angular, no RxJS, no DOM and nothing only Node has. Its `tsconfig`
  has no DOM types, so `document` does not compile; ESLint refuses
  `@angular/*`, `rxjs`, `node:*`, `process` and `Buffer`.
- Code that moves there takes its tests with it. Core's gate is 90% of
  lines; `src/app` stays at 70%.
- Export what the app uses from `packages/core/src/index.ts`.
- Requests leave through a `Transport` (`packages/core/src/transport/`):
  `FetchTransport`, or `BridgeTransport` when the Local Bridge is on;
  `TransportRouter` picks. No `HttpClient` and no `@angular/common/http`
  anywhere. A user's request is sent with `cache: "no-store"`,
  `credentials: "omit"` and `referrerPolicy: "no-referrer"`; keep all three.
- An event stream (P5.6) is read by the same `FetchTransport.send`, when
  the caller gives `onEvent` and the response is `text/event-stream`:
  `readEventStream` gives each event as it comes and keeps the first
  megabyte as the body. The timeout ends at the headers (`arrived`), and an
  abort after them is a stop: a response, not a `TransportError`. The
  bridge cannot stream; its whole body is parsed with `parseEventStream`.
- What a server sent is never a template. `Last-Event-ID` on a reconnect is
  `TabState.lastEventId`, put in by `assemble` as it is: through the
  resolver a server could name `{{token}}` or a vault secret and be sent
  its value. The same holds for anything else of a response that goes into
  a later request.
- A WebSocket (P5.7) is `SocketClient` (`src/app/services/socket-client.ts`)
  over the browser's own `WebSocket`, for a tab whose address resolves to
  `ws:` or `wss:`; its state is `TabState.socket`, in memory only. It is
  not a `Transport`: there is no request to build. The vault is never read
  for it, and `containsSecretPlaceholder` refuses an address or a message
  with a secret's reference (C-007): keep that check in front of every
  `send` and every `new WebSocket`. `connect-src *` admits `ws:` and `wss:`
  in three engines (measured, and asserted in `e2e/websocket.spec.ts`).
- WebKit ends a WebSocket to a port it refuses with an `error` event alone:
  no `close`, and `readyState` still 0 when the event fires. `SocketClient`
  looks at the socket again 500 ms after an error. Do not rely on `close`.
- Redirects (P5.4): a browser follows a direct request's unseen. Through
  the Local Bridge, which follows none, `BridgeTransport` makes each hop a
  relay of its own when the caller asks (`TransportOptions.redirects`, at
  most `MAX_REDIRECTS`) and lists them in `ResponseEnvelope.redirects`;
  `nextHop` (`packages/core/src/transport/redirect.ts`) is the rule for a
  hop. `exchange` sets `stayOnHost` for a request with anything in
  `BuiltRequest.secrets` (claim C-063): keep it for every send that is
  built with the vault. A `Location` is read as an address, as the server
  wrote it, and never goes through the resolver. Do not move the following
  into the bridge: the page decides where a request may go, and the page
  holds what the next hop needs (P5.3's cookies). The chain is the tab's
  (`TabState.responseRedirects`) and is not stored.
- Routes (P6.4): a request goes by `routeOf` (`@wayfarer/core`): its own
  `settings.route`, else its collection's `route`, else the device's
  (`BridgeSettings.config().route`, default `auto`). Absent is inherit.
  `WorkspaceStore` hands it to the executor with the question a send may
  ask (`askRoute`), and the executor hands `TransportRouter.send` a
  `RoutePolicy`, which says back where the request went (`took`). `auto`
  sends from the page and, after a `network` failure only (not a timeout,
  not a stop) and with a bridge token in the tab or the vault, asks
  `afterDirectSend` (D7): through the bridge at once when a preflight was
  needed or the method is GET, HEAD or OPTIONS, otherwise only on a yes. A
  response is never sent again (claim C-064). A script's request and a
  token request have no one to ask: give them no `ask`. Each response
  carries its route to the badge (`TabState.responseRoute`).
- Cookies (P5.3): the jar is `CookieJar` (`src/app/services/cookie-jar.ts`)
  over the rules of `packages/core/src/cookies/jar.ts` (RFC 6265, no public
  suffix list), kept in the `cookies` store. It is for the Local Bridge
  only: `BridgeTransport` asks it before each hop and tells it after
  (`TransportOptions.cookies`), reading `Set-Cookie` from the bridge's
  list of headers, one entry each. `CookieJar.store` has the
  cookies in the page before it returns: the next hop asks at once.
  `exchange` is the one that hands the jar to a transport: each
  value that went out is a credential to the redactor (`cookieValues`), a
  cookie that names a secret's reference is left out (C-007), and a cookie
  whose value holds a vault secret of the request is never written to the
  store. A cookie's value is never a template. `pm.cookies` stays
  unsupported (maintainer, 2026-10-13): a script is not given the jar.
- One road sends a request (P6.5): `exchange`
  (`packages/core/src/send/exchange.ts`) runs the scripts, stores what they
  set, has the request built, checks the wire (C-007), sends it by its
  route, runs the assertions and masks what history keeps; `buildRequest`
  (`send/build.ts`) replaces the variables, reads the vault, asks C-053's
  question, applies the auth and signs. Each takes what is not its own as
  ports. The app's are `RequestExecutor` and `WorkspaceStore`'s
  `buildRequestForExecution`; the CLI's are its own. A change to how a
  request is sent goes into core, so both get it: do not add a step to one
  adapter.
- A transport takes a signal and a timeout through `withDeadline`. Do not
  swap it for `AbortSignal.any([signal, AbortSignal.timeout(ms)])`: in
  WebKit that signal never aborted the fetch ("a request that outlasts the
  timeout" in `e2e/transport.spec.ts` fails with it).
- A spec that sends a request answers it with `FetchMock`
  (`src/testing/fetch-mock.ts`); a core spec passes a `fakeFetch` to the
  transport.

## Composer

- The request being composed is one `Draft` (`@wayfarer/core`) in
  `WorkspaceStore` (`src/app/state/workspace-store.ts`), with the response
  it last received. A saved request holds the same fields
  (`RequestContent`): `store.load()` takes one and `store.snapshot()` gives
  one back, to save or send.
- `src/app/components/composer/` holds one component per part of the
  request. `ComposerView` holds what they share that is not the request:
  the open tab, whether the password shows. A file there stays under 400 lines and a
  template under 250.
- The composer has tabs (P5.1). `Tabs` (`src/app/state/tabs.ts`) holds one
  `TabState` per tab and which is open. `WorkspaceStore`'s draft and
  response, `RequestSave.loadedCollectionRequest` and the scripts
  `ScriptTrust` holds back are the open tab's: each is `forwarded` to that
  tab's signal. What belongs to one request goes into `TabState` and is
  forwarded; a signal of a root service is shared by every tab. A forwarded
  signal is not bound two ways in a template (`[(x)]`): bind and listen.
- A send holds the tab it was started in (`WorkspaceStore.send`, session
  5B): the user may open another while it is on its way. Whatever a send
  calls, from its first step to its last, is given that `TabState` and
  reads and writes it: never `tabs.active()`, a forwarded signal,
  `scopes()` or `saved.ancestors()`, which are the open tab's and may be
  another's by then. `Tabs.close` aborts the tab's `inFlight`.
- A collection run (P5.2) is a tab whose `TabState.run` is a `RunState`
  (`src/app/state/run-state.ts`); the composer shows `<app-run-view>` for
  it. Such a tab is not stored (`TabsStorage.storable`), and nothing that
  loads a request may load one into it (`ComposerView.keepUnsaved`).
- A parent's folders and requests share one `order`, as a Postman file's
  items do: `childrenInOrder` (`@wayfarer/core`) is that list, and the
  tree, `requestsInOrder` and the Postman exporter all read it. A new
  folder or request takes `nextOrder` of both stores' indexes, and a move
  is one write of both kinds (`reorderChildren`). Do not number or sort the
  two kinds apart.
- The order of a run is `runRequests` in `packages/core/src/run/`, which
  sends nothing and is held to Newman by the golden files of
  `packages/core/test/fixtures/run` (`npm run golden`). A change to what
  `setNextRequest`, `skipRequest`, a data file or an iteration does starts
  with a probe of Newman and ends in those files. `CollectionRunner` hands
  it `WorkspaceStore.sendForRun`: one request from a `TabState` that is in
  no strip, through `exchange`, the same function a send goes through. Do
  not give a run a sender of its own: the trust gate, the vault, the wire
  check and C-053's question are in that one road.
- A run writes nothing to history; its HAR is the masked entries the
  executor already returns (`RunState.exchanges`). The reports and the data
  file parser are `@wayfarer/core/run-report` and `@wayfarer/core/data-file`,
  each fetched by a dynamic `import()` when first asked for.
- C-053 in a run compares each request with the variables as they were when
  the run started (`WorkspaceStore.startRun`), and a yes holds for that host
  until the run ends. It compares one run: do not word it as more.
- A second tab of a request is `TabState.copy()`: it keeps the binding and
  the held scripts, so its scripts are trusted as the original's are. Do
  not make a tab from a draft alone: unbound, its scripts would run.
- A tab's `bound` is a copy of its saved request. `TabsStorage.rebind`
  binds each tab again when the tree changes (a rename, a move, a delete, a
  save from another browser tab), by the request's id, as a reload does; a
  request that is gone leaves its tab unbound. It takes the digests of the
  scripts that may run before it changes the binding and holds the others:
  an unbound tab is "typed here", and without that a deleted request's
  unreviewed scripts would run. It never lifts a hold, and it does not
  touch the draft.
- `TabsStorage` (`src/app/state/tabs-storage.ts`) keeps the tabs in the
  `tabs` store: what a saved request holds, never a response, and with each
  tab the digests of its scripts that `ScriptTrust.check` allowed when it
  was written. Read back, a script whose digest is not there is held
  (`TabState.heldScripts`). Do not store "the scripts were allowed" as a
  flag, and do not let a tab read from the store run a script on the
  strength of being there: an unbound tab is otherwise "typed here".
- What is new in `TabState` and should survive a reload goes into
  `StoredTab` and `TabsStorage.record`. An effect follows only what its
  last run read: the one that notices a changed tab reads every tab every
  time (no `some` that stops early), or an edit in a later tab is never
  written.
- A test that reloads after an edit waits for the write first (`storedTabs`
  in `e2e/tabs.spec.ts`): a tab is written 250 ms after it last changed.
  After a reload the open request's name is on the page twice, in the tree
  and in its tab: find it in `getByRole("tree")`.
- Row editors bind `[(ngModel)]` to a row's own fields, so rows change in
  place. The panel then tells the store (`paramsEdited`, `headersEdited`,
  `edited`). What is computed from the draft, a tab's unsaved mark among
  it, needs the draft's signal to change: `headersEdited` replaces the
  list, `edited` the draft.
- A panel's host element carries the layout classes its root `<div>` would
  (`class="block space-y-6"`): a custom element is `display: inline`.

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
- A status or method colour used as text is its `-text` token
  (`--status-success-text`, `--method-get-text`): the plain token is for
  fills, borders and icons, and as small text on its own tint it is as low
  as 1.85:1. White text sits on `--ctl-primary-fill`, not `--ctl-primary`.
  `scripts/contrast.test.mjs` computes every such pair in both themes; the
  e2e sweep in `accessibility.spec.ts` scans every view in both themes.
- Widget colours are the `--ctl-*` variables in
  `src/design-system/controls.css`. In both themes they must come from the
  design tokens (`--canvas-*`, `--label-*`, `--separator`), not literals.
- Nothing may be wider than the window at any width from 360 px up. The
  e2e test "nothing is wider than a N px window" checks twelve widths; add a
  width there when a breakpoint changes. A flex child that holds wide
  content needs `min-w-0`.
- A window-width breakpoint (`sm:`, `md:`) does not know how wide a panel
  is: beside the pinned sidebar a 1200 px window leaves the composer 391 px.
  A row that must not crush a field wraps by its own room (`flex-wrap` and
  a `flex-basis`), as the address row does. "the URL field has room to type
  in at N px" checks it at the same widths.
- Two widths decide the layout, both in `App.updateViewportFlags`: below
  1200 px the sidebar is a drawer over the page (`sidebarOverlay`), and
  below 768 px the composer's sections stack (`isMobile`). They are
  separate on purpose: pinned, the sidebar takes 352 px. Beside it an
  820 px window left the composer and the response 150 px each, and a
  1024 px window cut off the composer's fourth tab.
- Both are read with `matchMedia`, not `innerWidth`: WebKit takes a classic
  scrollbar off the width a media query sees, so the two disagreed over
  15 px. An e2e test of a layout "from N px" therefore uses N + 20.
- Below 1024 px the toolbar shows only what Settings does not also offer.
  A new toolbar action needs `max-lg:hidden` and a home in Settings.
- Settings (`src/app/components/settings/`) is a dialog with a list of
  sections and one section's pane, drawn only while it is the open one
  (`@switch`). A new setting goes into the pane it belongs to, as a
  `settings-row` of a `settings-group`; a new section is an entry of
  `SECTIONS` and a `@case`. Below 768 px the list is the dialog and a pane
  opens in its place (`settings-pane-open`), with "All settings" to go back.
  The shell opens it at a section (`openSettings("bridge")`). An e2e reaches
  a control with `openSettings(page, "Vault")` (`e2e/support/app.ts`).
- Its stylesheet is not encapsulated, since a pane may be a component of
  its own (`BridgePane`): every rule starts at `.settings`.
- `public/theme.js`, a script of its own in `<head>`, sets `data-theme` before the page has a body (F85): set
  later, a light page was drawn dark first at every load. Its rule is `Theme`'s; change both together.
- The theme is `Theme.choice`: `system`, `light` or `dark`. With no choice
  stored the app follows the system, which differs between the test
  browsers (and Playwright's Firefox gives a page its emulated scheme only
  after a context's first load): a test that needs a theme stores the
  choice (`wayfarer:theme`) before the page loads, or calls
  `page.emulateMedia` after it.
- A list of rows that is made again from other data (the params from the
  address) is tracked by `$index`, not by the row: by the row, every edit
  destroyed and rebuilt all of them, and Angular says so in the dev
  console (NG0956). Two entries of one list never share an id (NG0955).
- For any change that could move pixels (a CSS framework or dependency
  upgrade, tokens, a reset), compare before and after: a throwaway
  Playwright spec with `toHaveScreenshot` at 390, 820 and 1440 px in both
  themes, baseline taken on `main`'s build. Read the diff images. Do not
  commit the spec or its snapshots.
- Review what an upgrade tool writes line by line. The Tailwind tool turned
  preflight on, changed the cascade and rewrote words in test titles.

## Angular Material

- Widgets are Angular Material components (maintainer, 2026-10-09; this
  reverses the "custom on CDK" default of decision D14 in the plan). A new
  widget is a Material component, themed as below. `src/app/ui` holds only:
  - wrappers that give a Material component what this app needs from it:
    `ui-dialog` (a dialog opened from a template), `Confirm`, `ui-tree`;
  - what Material has no component for, built on the CDK: `ui-splitter`,
    `uiHoverCard` (a tooltip that takes a template), and the confirmation
    placed under a button.
- Not Material, and why: loading skeletons (Material has none; a progress
  bar says something else), the variable and usage chips (two-line and
  icon-led action buttons; Material's chip is a one-line pill), status and
  method badges, and the banners.
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
- Dialog: `<ui-dialog>` (`src/app/ui/dialog.ts`) opens Material's dialog
  from a template and keeps it in step with `[visible]`; `Confirm` opens it
  from code. Both set `delayFocusTrap: false` and Material's enter and exit
  animation to 0 ms: Material moves focus in only when its entrance ends,
  and keeps the panel over the page until its exit does. The entrance is drawn in `animations.css`. Both
  pass `ariaModal: true`; Material's default is false.
- A `<ui-dialog>`'s content is projected, and Angular makes projected
  content with the page, open or not: a Monaco editor in a closed dialog
  loaded Monaco at every start (P7.2, 300 ms of the main thread). Put an
  editor, or anything heavy, inside `@if` of the dialog's open state; the
  footer (`uiDialogFooter`) stays outside it. A composer pane with an
  editor is `@defer (when …)` its tab is first chosen, and stays.
- The small confirmation under a button stays on the CDK's dialog:
  Material's is placed in the window, not against an element.
- Drawer: `<mat-sidenav class="drawer" mode="over" fixedInViewport
  [autoFocus]="false">` in the shell's `<mat-sidenav-container
  class="shell">`, with `role="dialog"`, `aria-modal` and an `aria-label`
  (Material sets none). The container and its content are `overflow:
  visible`: the window scrolls the page, so the toolbar stays stuck to it.
- The shell moves focus into a drawer when it starts to open and back when
  it starts to close (`focusDrawer`, `restoreDrawerFocus`). Material does
  both when the slide ends: until then Tab walked the page, Escape did
  nothing (a drawer reads it from its own element), and the late move took
  focus from a dialog opened from the drawer.
- The shell also closes a drawer itself (`disableClose`, with
  `(keydown.escape)` on the sidenav and `(backdropClick)` on the
  container). Do not set state from the sidenav's `openedChange`: it fires
  when the slide ends, a frame after `[opened]` can be told to open again,
  and the late "closed" shut a drawer the user had just reopened.
- A drawer's content is in the page from the start, hidden while closed. A
  dialog's is created when it opens.
- Tree: `<ui-tree>` (`src/app/ui/tree.ts`) is Material's `mat-tree` with
  flat `mat-tree-node` rows, plus what the collections list needs and
  Material has not: one selected node, reorder by drag and by Alt+Arrow,
  F2, and Shift+F10 sent on as a `contextmenu` event. Three things about
  `mat-tree` it works around, each with a test:
  - a row's `isExpanded` input is set while the tree renders, and a node
    opened then is marked open without its children drawn; expansion is
    applied after render, through `tree.expand()`;
  - with `trackBy`, a row keeps the node object it was first drawn with;
    the children accessor looks the node up by key;
  - the first row in the tab order is the first one Material hears of,
    which under an expanded node is a child; it is moved to the top row.
- Text input: `<mat-form-field class="field">` around `<input matInput>`.
  The outline appearance and `subscriptSizing: "dynamic"` are set app-wide
  (`app.config.ts`); the label is a `<label for>` outside the field. Width
  and flex utilities go on the form field, not on the input. A class a
  test or a rule finds the input by (`address-url`) stays on the input.
- Checkbox: `<mat-checkbox>`. Its input's id is the checkbox's id plus
  `-input`; that is what a `<label for>` outside it points at. One with no
  text inside takes an `aria-label`, bound as `[aria-label]`: that is
  Material's input and reaches the real checkbox. `[attr.aria-label]` names
  the wrapper and leaves the checkbox without a name.
- Icon button in a toolbar or a panel's header: `matIconButton
  class="btn-plain"` (34 px, grey until hovered; its icon keeps its own
  size class).
- Busy: `<mat-spinner diameter="18" aria-hidden="true" />` in place of a
  button's icon, or one with an `aria-label` on its own. It takes the
  colour of the text around it.
- The top bar is `<mat-toolbar class="ds-toolbar" role="banner">`.
- A token cannot be `inherit` (or `initial`, `unset`): as a custom
  property's value that word acts on the variable, and Material falls back
  to its default. Write a rule with `font: inherit` instead.
- A token whose value is a variable set on the component (`--btn-fg`) must
  be overridden on the component's class, not on `html`: a variable is
  resolved where it is declared.
- A Tailwind utility on a Material host loses to Material for any property
  Material sets there (height, padding, min-width, font, colour, border, and
  `display`, min-width on a form field, width on a select). Give the
  utility Tailwind's important modifier (`w-48!`, `max-lg:hidden!`), or
  change the property through a token. Margin utilities, and width on a
  button or a form field, are safe as they are. `max-lg:hidden` without
  the `!` put three hidden toolbar buttons back on a phone.
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
  `monaco-editor/languages/definitions/<x>/register`,
  `monaco-editor/features/register.all`). Never
  `monaco-editor/esm/...`, and never the root `monaco-editor`, which bundles
  every language.
- Only JSON and TypeScript/JavaScript are bundled with their language
  services, plus the XML and HTML grammars for raw bodies and responses.
  Every editor feature is registered, with `features/register.all`, before
  the first editor: a language service imports them all when it starts, and
  one registered after an editor exists throws for want of its own service
  (F71, `e2e/monaco.spec.ts`). Do not go back to single features. A new language needs its
  register import, a worker wrapper if it has a service, and a path mapping
  to the stub in `tsconfig.spec.json`.
- Its stylesheet is the separate `monaco.css` (see `styles` in
  `angular.json`), linked by the loader when the first editor mounts. Do not
  import it from `src/styles.css`: that puts 390 kB on first load.

## GraphQL

- A GraphQL body (P5.5) is `body.graphql`, a query and the text of its
  variables, sent as one JSON object by `graphqlPayload`
  (`@wayfarer/core`): the variables are replaced in both texts first and
  the JSON is made of the result. An export and a script see that JSON text
  (`exportBody`, `scriptRequestOf`); a script that hands the body back
  unchanged leaves it a GraphQL body (`withScriptRequest`).
- `graphql` and `graphql-language-service` are imported by
  `src/app/shared/graphql/graphql-tools.ts` alone, and that file only by
  the dynamic `import()` in `GraphqlSchemas`: neither is in the first
  bundle ("the page the server sends holds nothing of GraphQL's libraries"
  in `e2e/graphql.spec.ts`). No `monaco-graphql`: it brings `prettier` and
  a second Monaco. The grammar is Monaco's own
  (`languages/definitions/graphql/register`); completion and validation
  are the tools', in the page, not in a worker.
- A schema is asked for by `WorkspaceStore.introspect`: a copy of the open
  tab (`TabState.copy()`, so its scripts are trusted as the tab's are) with
  the introspection query as its body, through `exchange` like any send. It
  is not history. Schemas are kept by address in `GraphqlSchemas`, in
  memory only.
- The echo server's `/graphql` answers an introspection from
  `e2e/support/graphql-schema.json`, written once from its SDL; the server
  has no dependency.

## Scripts

- A user's script is run by QuickJS (WebAssembly), never by the browser:
  no `eval`, no `new Function`, no worker that evaluates text. The CSP has
  `'wasm-unsafe-eval'` for the engine and must gain nothing else for it.
- `runScript` (`packages/core/src/scripting/host.ts`) is the engine's one
  entry: it takes the QuickJS module as an argument, so it runs in Node.
  `src/app/shared/scripts/quickjs.worker.ts` loads the engine and passes
  messages; `ScriptSandbox` owns the worker.
- The sandbox is an allow-list. What a script sees is written in
  `vm-bootstrap.ts`, as JavaScript that runs inside the VM. A new global
  goes there and into the list in `host.spec.ts`, which compares the VM's
  global with the language's built-ins plus that list.
- `require` gives the libraries of `VM_LIBRARIES`
  (`packages/core/src/scripting/libraries.ts`) and nothing else. Each is
  built into text by `scripts/build-vm-libs.mjs` (run by `npm ci`; the
  output in `scripting/vm-libs/` is not committed) and evaluated inside the
  VM, so a library reaches what a script reaches. A new one needs the
  maintainer's approval, an entry in that script and in `LOADERS`
  (`library-loader.ts`), and its name in knip's `ignoreDependencies`; its
  licence then ships by itself. `library-loader.ts` is imported as
  `@wayfarer/core/library-loader` and only by what runs scripts: exported
  from the package's index, every library became a second file in the build.
- What a library needs of a browser is given to it as an argument of its
  wrapper function (`self`, `crypto`, `EventTarget`, `Event`), never put on
  the VM's global.
- Newman is the reference for Postman's legacy sandbox and is not a
  dependency: its tree fails `npm audit` (18 advisories, 2026-10-10;
  maintainer's decision). `npm run golden` fetches a pinned version with
  `npx` and writes `packages/core/test/fixtures/postman-legacy.golden.json`,
  which is committed; `legacy-golden.test.ts` holds Wayfarer to it. Run it
  when the fixture collection changes. Do not add `newman`,
  `postman-runtime` or `postman-sandbox` to a `package.json`.
- The host object is passed to the bootstrap function and never put on the
  VM's global. A host function takes and returns strings, numbers and
  booleans, and checks each argument's type itself (`text`, `number`): a
  script can replace `String` or `JSON` under the bootstrap. No handle of a
  script's object is read by the host; write it out as text in the VM.
- `pm.sendRequest` is not a network call of the script: the worker asks
  the page (`ScriptSandbox`), and `exchange`'s `sendForScript` sends it
  through `TransportRouter` like the user's own request, after the same
  `containsSecretPlaceholder` check (C-007). Nothing else may make a
  request for a script, and the escape suite counts them. Do not describe
  that check as keeping secrets from scripts: an approved pre-request
  script can change the user's own request (`pm.request`, or a variable),
  which is built with its secrets. `ScriptTrust` is the control (D6, Q6).
- A send with scripts goes in this order, in `exchange`:
  pre-request script, its variable changes stored, the request built (and
  only then the vault read), sent, post-response script. A pre-request
  script that ends in an error stops there (`PreRequestScriptError`):
  nothing is built or sent. A failed `pm.test` is not an error.
- "Pre-request script" is several (P4.9): the collection's, each folder's
  from the outside in, then the request's own, each a run of its own with
  the variables the one before left; the post-response scripts in the same
  order. `RequestExecutionSpec.inherited` holds them, and `send` gives
  `ScriptTrust.check` that same list: what is checked is what runs. C-053's
  question compares the request before the first with the request after the
  last.
- What a request inherits is `RequestSave.ancestors()` (`ancestorsOf` in
  `@wayfarer/core`): the collection, then its folders from the outside in.
  Auth is `effectiveAuth`; a request's own `none` is not `inherit`. A
  folder's variables are the `folder` scope of the resolver, which a script
  reads through `pm.variables` and cannot write.
- A pre-request script sees the request as composed. A post-response script
  sees it as sent (`sentScriptRequest`), every vault secret masked first: a
  script is not handed a secret's plaintext by the app, in a variable or in
  `pm.request`. Keep it so when adding to what a script is given.
- When a pre-request script left the request going to another host and the
  request uses a vault secret, `WorkspaceStore` asks before the vault is
  read (plan Q6, claim C-053); a no throws `SendDeclinedError`, and the
  executor then puts back what the script set. It compares one send and
  the docs say what that misses: do not word it as more.
- A script's `set` on a protected variable (its value is one
  `{{$secret.<id>}}` reference) is encrypted into that secret by
  `exchange`'s `intoVault` and is left out of the changes that are
  stored. A locked vault refuses with a console line; it does not prompt.
  A new way for a script to write a value goes through `applyChanges`,
  which marks every change `keepSecret`: `applyVariableChanges` then never
  replaces a stored reference with a script's text, whatever this tab's
  copy of the rows said. The editor's changes are not marked.
- A value a script sets that is not text is stored as its JSON, with
  `json: true` on the variable's row (F76). `value` stays text, and the
  resolver puts it in as it is. The host believes the mark only on a value
  that parses; an importer never writes it; an edit of the value drops it.
- A script is run as a program. Only one the engine refuses for a `return`
  at the top is run again as a function's body (F77): wrapping every script
  would make a `var` at the top local for all of them.
- A script's duration is the wall time of `ScriptSandbox.execute`. The
  request's duration never includes a script's (F11).
- What `pm` offers is a row of `packages/core/test/pm-compat/cases.ts`,
  with a script that proves it. A new or changed part of `pm` changes its
  row in the same PR; the rows run in Node and in the app's worker.
  `docs/postman-compatibility.md` is generated from the rows: run
  `npm run gen:compat` and commit it, never edit it. An error that links to
  a section there (`#pm-cookies`) needs that section: the anchor is `pm-`
  and the object's name in lower case, `require`, `legacy` or `globals`
  (`sectionOf` in `scripts/gen-compat-doc.mjs`, and a test checks it).
- A script's variable changes come back as `ScriptResult.changes`, per
  scope, and are stored with `changeEnvironment`, `changeGlobals` and
  `changeCollectionVariables`. `pm.request` comes back as text the host
  checks field by field (`scriptRequest` in `host.ts`).
- The time a script waits for `pm.sendRequest` is not counted against its
  deadline, in the engine or by the page's watchdog.
- The engine and its worker are lazy: nothing imports them but
  `ScriptSandbox`'s `new Worker(...)`. They must stay out of the initial
  bundle ("the page the server sends names neither the engine nor its
  worker" in `e2e/scripts.spec.ts`).
- A worker runs one script at a time (`ScriptSandbox.take`): two sends, or
  a send beside a collection run, each get their own, and one idle worker
  is kept for the next script. Do not hand two runs to one worker: ending
  it for one would end the other.
- After a run that hit a limit the engine may be unusable: the worker is
  ended and the next run starts a new one. Do not reuse a module after
  `result.limit` is set.
- The memory limit is the maximum of the `WebAssembly.Memory` the engine
  is loaded with (`scriptMemory()`, given to `newVariant` as `wasmMemory`).
  QuickJS's `setMemoryLimit` does not hold in WebAssembly: it counts 8 bytes
  for an allocation of any size (F66). Whatever loads the engine (the
  worker, a spec, the CLI later) must pass that memory.
- A test of a limit allocates in pieces and puts the deadline far away, so
  that the limit under test is the one that is met first on a slow machine.
- The stack limit (`SCRIPT_LIMITS.stackBytes`) is not what stops a deep
  recursion in Chromium and WebKit: the browser's own stack ends first, and
  `runScript` reports that as the same limit. Raising the number changes
  nothing.
- The worker imports the engine's `.wasm` file by its path under
  `node_modules`, not by the package's `./wasm` entry: `ng serve` and the
  unit-test server hand an import that names a package to Vite, which tries
  to run the file as a module. By package name the production build worked
  and scripts failed in development.
- `vitest.config.mts` serves that file to the worker and gives worker files
  the `import()` helper Vitest's browser mode expects, for the unit-test
  server only. The built app needs neither; do not "fix" the worker for
  them.
- An e2e that runs a script asserts 0 `securitypolicyviolation` events.
- Which scripts may run is `ScriptTrust` (`src/app/services/script-trust.ts`,
  plan D6): a collection's `scriptTrust.approved` lists the SHA-256 of each
  script reviewed or written here, and a script runs only if its digest is
  there. `send` asks `ScriptTrust.check()`; nothing else decides.
- Only three things call `approveScripts`: the review dialog, a save from
  the composer whose scripts were already allowed to run, and a save of a
  collection's or a folder's settings (`CollectionsStore.saveInherited`)
  when the scripts it held before were allowed to run. Anything else
  that writes requests (an importer, a restore, a sync) writes them
  unapproved, and a collection it creates or replaces gets
  `{ trusted: false }`. Do not approve in a repository's write path.
- A digest is computed before a transaction is opened, never inside it
  (WebCrypto is asynchronous, like reading a `Blob`).
- An e2e that seeds a request with scripts through `seedAndOpen` gets their
  digests seeded too; one that imports a file gets the review.

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
  `-d`; `--form-string`, not `-F`, for a multipart text part). The builders
  are `packages/core/src/export/`: `buildCurl`, and `generateCode`
  (`@wayfarer/core/codegen`, loaded by a dynamic `import()` when code is
  first asked for). Each takes an `ExportRequest` that went through
  `redactExport`, and names a file instead of reading it. A new target
  writes every value through `literal` or `shellQuote`; where a tool cannot
  be told "this is text" (HTTPie and a leading `@`), it writes no command.
- A HAR is built by `buildHar` (`packages/core/src/export/har.ts`), imported
  as `@wayfarer/core/har` by `harText` alone and fetched when a HAR is first
  asked for. It takes exchanges that are already masked: a response's
  through `redactExport` and `exportRedactor`, a history entry's as stored.
  It reads no `location` and no file, and reformats no body. A change to it
  keeps `parseHar(buildHar(x))` the same requests (`har.spec.ts`), and the
  list of fields HAR 1.2 requires in that spec.
- Imported files are untrusted: validate every field against the values the
  app itself writes (`validateRequestContent` and `validateRows` in
  `@wayfarer/core`). A method is any RFC 9110 token of at most 32
  characters, in upper case (`isHttpMethod`): not a list of verbs. A file must carry the format's `$id`
  (`wayfarer/collection`, `wayfarer/environments`, `wayfarer/workspace`); there is no
  converter for older files.
- The database's shape has one number, `DB_VERSION` (IndexedDB needs it).
  `runUpgrade` empties a database of any earlier number and makes this
  version's stores: nothing stored before is read, converted or kept
  (maintainer, 2026-10-14). A change of stored shape raises the number;
  say so in the changelog and in `docs/storage.md`. No step per version.
- Ids come from `newId()` in `@wayfarer/core` (`packages/core/src/id.ts`).
  No `Math.random`.
- A variable's name may hold any character but a brace (F74). A name that
  is not letters, digits, `_`, `.` and `-` is a variable only when one has
  that name; with no value it is text, and nothing asks for it.
- The endpoint field is text, not a URL: it may hold `{{variables}}`. Do not
  round-trip it through `URL`; that lower-cases and encodes placeholders.
- A file in a request body is read through `RequestFiles`
  (`src/app/services/request-files.ts`): in memory from the pick until the
  request is saved, then in the `files` store, written in the request's own
  transaction. `sweepFiles` deletes a file once no saved request names it;
  call it in any transaction that removes or rewrites requests. 50 MB a file.
  The store holds bytes and a type, not a `Blob`: WebKit did not save one.
  Read a `Blob` before opening the transaction, never inside it.
- A `{{$secret.*}}` placeholder must never reach the network, in any
  encoding (claim C-007). Extend `containsSecretPlaceholder` when adding a
  place a value can go on the wire.
- A vault secret's plaintext exists in the vault (encrypted), in memory and
  on the wire, and nowhere else. Whatever is stored, exported or copied
  goes through `Redactor` (`@wayfarer/core`) first: history, cURL, HAR, a
  collection file. A new place a request or a response is written to does
  the same, and is added to the scan in `e2e/secrets-wire.spec.ts`.
- `BuiltRequest.secrets` and `.credentials` are what the redactor looks
  for. A new way to put a credential into a request adds its value there.
- AWS Signature (`signV4`, `packages/core/src/auth/sigv4.ts`) is applied
  last, in `buildRequest`'s `sign`: it signs the address, the headers and the
  body's bytes as they will be sent. Nothing may change the request after
  it. It signs `Host`, its own headers, `Content-Type` and `x-amz-*` only:
  a browser adds headers the app does not write. A multipart form is
  refused, since `fetch` writes its boundary (claim C-061). Its hashes are
  WebCrypto's: with `@noble/hashes` the first bundle gained 11.5 kB, also
  when the signer was a lazy file, since the core's index reaches that
  package.
- OAuth 2.0 (P4.7): `OAuthTokens` (`src/app/services/oauth-tokens.ts`) gets,
  renews and keeps a token; what is pure is `packages/core/src/auth/oauth2.ts`.
  The token is not in `AuthConfig`. It is kept under `oauthTokenKey` of the
  auth, which is made with the variables replaced and the vault not read,
  so the name holds no secret: as a vault secret when the vault is
  unlocked, otherwise in that tab's memory. Nothing else stores one.
- A token is fetched by a send or by Get token, never by a copy or an
  export. It goes into the request after the variables are replaced (a
  token is not a template) and into `BuiltRequest.secrets`, not
  `credentials`: it is masked wherever a vault secret is, "with
  credentials" too, and a script is shown the mask.
- A token request goes out through `TransportRouter` after
  `containsSecretPlaceholder`, and is not history. A client's secret in a
  Basic header is form-encoded first (RFC 6749): that check reads Basic
  credentials percent-decoded as well.
- The sign-in window answers on the `BroadcastChannel` `wayfarer:oauth`
  from `public/oauth/callback.html` (plan D20); only an answer with the
  `state` made for that sign-in is taken. No `window.opener`, and COOP
  stays `same-origin`. The callback page is not the app: its script and
  style are files of its own (the CSP allows no inline one) and it imports
  nothing of the app.
- The redirect URI is `/oauth/callback`, without `.html`: Workers static
  assets serve the page there, and answer the name with its extension
  with a 307 whose query nobody promises to keep. `prod-server.mjs` serves
  it the same way; `ng serve` does not, so `e2e/oauth.spec.ts` needs `CI=1`.
- The service worker leaves every path under `/oauth/` to the network
  (F69): an HTML page that is not the app goes there, or gets the same
  rule. Any other HTML answer to a navigation is stored as the app's shell.
- `OAuthTokens.tokenFor` reads the vault itself and waits for it. Do not
  leave that to the effect that follows an unlock: a send that had just
  unlocked the vault asked for a new token instead.
- A new auth type goes into `AuthConfig`, `AUTH_TYPES`, `emptyAuth`, the
  validator, `resolveAuth`, `credentialsOf`, the redactor, the Auth editor,
  the Postman importer and exporter and the Insomnia and OpenAPI
  importers. `resolveAuth` is also what finds the vault secrets a request
  needs (F81): a field left out of it is never read from the vault.
- A change to `resolver.ts`, `redactor.ts` or `vault-crypto.ts` keeps the
  mutation score at 85% or more: `npm -w packages/core run mutation`.
- The CSP lives in `security/csp.json`; run `npm run gen:csp`. No
  `unsafe-eval`, no third-party origin.
- A response is shown, never run. HTML goes to `HtmlPreview`
  (`src/app/components/response-viewer/html-preview.ts`): a `blob:` of
  `previewDocument()` in `<iframe sandbox>` with no `allow-*` token, its
  `src` set from code. No `srcdoc`, `innerHTML` or `DOMParser` (Trusted
  Types sinks), and no `bypassSecurityTrust*`. A `blob:` made for the page
  to show gets a type from the fixed list in `responseViews`
  (`@wayfarer/core`) or `application/octet-stream`, never the server's:
  opened on its own, a `blob:` URL is a document of the app's origin.
  Revoke it when the response changes (`onCleanup` of the effect).
- `frame-ancestors` is `'self'`, not `'none'` (plan D25): a `blob:`
  document inherits the page's policy and WebKit applies that directive to
  the preview frame. `frame-src` is `blob:` only.
- The vault derives keys with PBKDF2-SHA-256 at 600,000 iterations (claim
  C-004) and uses the passphrase exactly as typed. The envelope format
  changes only through the plan's Vault v2 (P2.6); do not add an interim
  one. Raising the iteration count in place was a one-time decision made
  while no stored data existed; with users, it needs a migration.
- Response headers live in `public/_headers`: CSP (generated), HSTS for this
  host only (no `includeSubDomains`, no `preload`), COOP and CORP
  `same-origin`. The smoke e2e asserts them.
- The Local Bridge's token is never in `localStorage` (F83): `BridgeSettings` keeps it as the vault secret
  "Local Bridge token" while the vault is unlocked and in memory otherwise, and `TransportRouter` asks for it
  with `tokenForSend`, which may ask the user to unlock the vault. Vault work there goes one after another.
- Local Bridge (`packages/bridge/`): zero dependencies; binds to 127.0.0.1;
  refuses a non-loopback `Host`; needs an allowed `Origin` and the token for
  `/relay`; caps request and response bodies; rejects a wrong argument
  instead of defaulting. Keep every one of these when changing it. One
  path relays, `/relay`, with no number in it and no protocol or list of
  capabilities in `/health` (maintainer, 2026-10-14: one path for a
  feature, nothing kept for an older version). `readPayload` checks every
  field and refuses one it does not know; `parseEnvelope`
  (`BridgeTransport`) does the same for the answer: that is what keeps a
  page and a bridge of different versions from reading each other's
  messages as their own. Change both sides in one PR. `tls` is exactly
  `{ insecure: true }` or absent, from the request's own `settings.tlsInsecure`, and what was sent
  so says it (`ResponseEnvelope.tlsInsecure`, the red pill): keep the pill
  wherever such a response is shown. A script's request and a token request
  never switch verification off. The bridge's agents are its own
  (`agentsFor`): no connection is kept, so every relay has timings, and the
  proxy variables are Node's `proxyEnv`, not code of ours. A body is bytes both ways (`bodyB64`), never text. The limit of
  25 MB holds for a response as received and as decoded. The token's folder
  is `~/.wayfarer-bridge`.
  Pairing (P6.2): `POST /pair` from an allowed origin gives the token for
  the code printed at start, once; three wrong codes in a row lock it for
  60 s, the right one included. Keep the lock and the single use. With
  `--cert` and `--key` the bridge speaks HTTPS only, and makes no
  certificate and runs no other program for one (maintainer, v1.2.59).
- A file reaches the stores by one road, `ImportPipeline`
  (`src/app/services/import-pipeline.ts`, plan P4.1): `readImportText` (the
  10 MB cap), the import worker, the report in `<app-import-dialog>`, and
  only on Confirm the write, one transaction per collection. A new Import
  button calls `ImportPipeline.pick`; nothing else writes what a file held.
  The workspace restore is the one exception, and replaces everything.
- An importer is a function from text to the app's model in
  `packages/core/src/import/`, reached through `importText`. It validates
  with the shared validators before it returns, fetches nothing, and throws
  nothing but `ImportError`. `importText` is imported as
  `@wayfarer/core/import` and only by `import.worker.ts`: from the
  package's index the importers would be in the first bundle ("the worker
  and the importers are not in the page the server sends" in
  `e2e/import.spec.ts`).
- A cURL command is read by `parseCurl` (`packages/core/src/import/curl.ts`),
  never run. It expands nothing (`$HOME` is text) and opens no file: a
  body or a part that comes from a file is named, or left out with a
  warning. A new option goes into `VALUE_OPTIONS`, `FLAGS` or
  `SKIPPED_VALUE_OPTIONS` there: an option that takes a value and is in
  none of them would have its value read as the address. The page decides
  "is this a command" with `isCurlCommand` alone and gives the text to the
  worker (`ImportWorkerClient.curl`); it does not load the parser.
- `parse(buildCurl(request))` is the request (the fast-check property in
  `curl.spec.ts`). A change to `buildCurl` or to the parser keeps it.
- A file that is not JSON is read as YAML by `parseYaml`
  (`packages/core/src/import/yaml.ts`), up to 1 MB (`MAX_YAML_CHARS`): the
  reader keeps every token as an object, and a megabyte written to be dense
  took a gigabyte. Do not raise the limit without measuring. Its
  `uniqueKeys: false` and `prettyErrors: false` stay: both defaults are
  quadratic. `maxAliasCount` is 100 (claim C-059).
- The OpenAPI importer (`packages/core/src/import/openapi.ts`) uses no
  parser library (maintainer, 2026-10-11) and follows a `$ref` only when it
  points inside the file (`#/…`): it has no code that could fetch one, and
  must gain none (claim C-060, C-001). A sample written from a schema ends
  at a schema inside itself and at `SAMPLE_VALUES` values; keep both.
- The Insomnia importer writes Postman's shape and `postmanCollection`
  makes the model from it, and the OpenAPI importer does the same: one
  mapping to the model. A new format that is
  requests in folders can take the same road.
- The report's script warnings come from `SCRIPT_SCAN`
  (`packages/core/src/import/script-scan.ts`), which a test holds equal to
  the unsupported rows of the compatibility matrix. A new unsupported row
  goes there, or into `NOT_SCANNED` with its reason.
- A write tells the other tabs which stores it touched (`IdbCore.announce`,
  called by `commitOrRollback`; a write that does not go through it calls
  `announce` itself). A store that holds what it read listens with
  `IdbCore.onChangeElsewhere` and reads again. A service injects the
  repositories it uses (`CollectionsRepository`, `HistoryRepository`, …)
  and `IdbCore`; there is no facade over them.
- Variables are changed with `changeEnvironment` (a list of sets and
  removals, applied by `applyVariableChanges` inside one transaction), not
  by writing back a copy of the rows: the copy may be older than what
  another tab stored.
- When storage is unavailable or was reset elsewhere, say so in the shell's
  banners; never fall back silently.
- Reset all data must remove everything the app stored, including every
  `wayfarer:` key in `localStorage`.

## Tests

- A bug fix starts with a test that fails for the reason reported. Keep it.
- A change to a documented claim updates `docs/claims.md` and its
  `@claim:C-NNN` test in the same PR.
  Then `npm run gen:readme`: the README's feature list is the ledger,
  and a new doc under `docs/` is linked from the README (`check:links`).
- Before replacing one Angular construct with another, check the behaviour
  with a throwaway test when the docs leave it open.
- An e2e does not read, through the browser, the body of a response the
  server sent with `Cache-Control: no-store` (`response.json()` of a token
  endpoint's answer): on a CI runner Chromium had none to give, read late
  or read at once, and a laptop's always had it. Read the request that
  carries the value, or ask the server (`/oauth/issued` in the echo
  server).
- A claim test has no retry and 30 s. One that does as much as the two
  scans of `e2e/secrets-wire.spec.ts` (a vault, a send with a script,
  copies, downloads, a reload) calls `test.slow()`: the WebKit runner is
  several times slower than a laptop (#228).

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
