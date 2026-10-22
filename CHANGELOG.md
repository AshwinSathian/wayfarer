# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project intends to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The design docs have a voice guide.** A new page, Voice, says what
  the app calls each thing, how it words an error, a question and a limit,
  that every label is in sentence case ("Add header", not "Add Header"),
  and that a shortcut is shown in the keys of the reader's own system
  (⌘K on a Mac, Ctrl+K elsewhere) instead of both at once. It rewrites the
  twenty strings the app shows on the most screens as examples. The app's
  own words change view by view as the redesign reaches each.

- **The design docs say what the eight core tasks cost today.** A new
  page counts the clicks, keys and characters each takes on the app as it
  is, and how long the app takes to answer, from a first request to
  finding one sent last week, with how it was measured. A first request
  is 36 inputs, nearly all of them the address typed; adding a secret is
  135, 56 of them the vault's passphrase typed twice. The redesign is
  measured against these numbers; the same tasks in the other API clients
  are still to be timed.

- **The design audit covers Firefox, WebKit and the screens it had
  skipped.** Its second pass reads every screen of the design baseline and
  adds 20 findings, each with the part of the redesign that takes it: among
  them, a run of an imported collection sends without its scripts and
  offers no way to review them from the run; a failed request reads "0
  Unknown Error", whether the name did not resolve or the server sent no
  CORS header; Ctrl+K opens nothing below 1,200 px or from a field; Copy
  as cURL says nothing; and Firefox and WebKit draw their own arrows in
  number fields. The audit now lists each screen with its findings, or
  says it has none.

- **The design docs have a record of every screen as it looks today.** A
  new page, Design baseline, lists the 49 screens, dialogs and menus the
  redesign will be measured against, from the first run to each pane of
  Settings. Each is captured at four widths (360, 390, 820 and 1,440 px)
  in both themes, in Chromium, Firefox and WebKit, and CI compares
  Chromium's captures with the committed ones on every pull request so
  that a change to a screen shows up as a picture.

- **The design docs say what became of each problem the audit found, and
  where every action of the app is going.** Each of the audit's findings
  now has a status: fixed (15, each with the change that fixed it, checked
  on the screen), or open with the part of the redesign that takes it (21,
  two of them found while checking). A new page, Information architecture,
  maps where each of the app's 271 actions lives after the redesign, and a
  test keeps that list equal to the app's.

### Fixed

- **A ticked checkbox's tick is readable in the dark theme.** It is now
  dark on the light green box, 7:1; before, it was white, 2.6:1, below
  the 3:1 a control's mark needs. The light theme is unchanged.

### Changed

- **Reviewing a collection's scripts shows each one on its own.** The
  review lists every script under the name of its request, folder or
  collection, marks the ones you have not reviewed before (new, or changed
  since, as after a re-import), and says when a script calls something
  Wayfarer does not have, such as `pm.vault.get`. Before, every script was
  run together in one editor, each under a comment line, with no mark on
  any of them.

- **OAuth 2.0's redirect URI and Get token come first.** With the
  authorization code grant, the redirect URI to register with the identity
  provider and the token's state, with Get token, are right under the
  grant; before, they came after nine fields, below the fold. The fields
  read "Authorization address" and "Token address", the auth types and
  grants are in sentence case ("Bearer token", "Client credentials"), and
  the Type and Grant selects line up.

- **A fetched GraphQL schema is shown above the query.** After Fetch
  schema, its types are listed in a box of their own under the button, with
  the app's chevrons instead of the browser's triangles; before, the list
  came after the query and the variables, out of view.

- **A first request is the address and Enter.** When the app opens on an
  empty request, the caret is already in the address (except on a phone,
  where it would open the keyboard), so typing an address and pressing
  Enter sends it: 35 inputs, against 36 before. The empty response now
  offers to paste a cURL command or import a collection, the empty
  sidebar to make a collection or import one, and the empty environments
  list to make an environment; before, each said there was nothing there
  and offered nothing.

- **Send and Save have keys, and every shortcut is shown where it
  works.** ⌘↵ (Ctrl+Enter on Windows and Linux) sends the request and ⌘S
  (Ctrl+S) saves it, from anywhere in the page, inside the body or script
  editor too, as in Postman. Enter in the address sends as well; before,
  it did nothing, and Send had no key at all. Send's, Save's and the tabs'
  tooltips show their keys, the command palette shows each command's keys
  beside it, and Settings, Shortcuts lists the keys from the same list the
  palette uses, so it can no longer miss one. Keys are shown for your own
  system only, instead of "⌘K / Ctrl+K".

- **The top bar is the page's own header, and Angular Material is gone
  from the app, which loads 18 kB less (5.0 kB compressed).** The bar looks
  and behaves as before: the same height, colours, edge and controls, in
  the same order for Tab, and in high-contrast mode it keeps its outline.
  It was the last widget from the Material library; with it go the
  library's theme and the 169 colour and shape settings it read. The size
  budgets are reset to the new first download: initial 1,028,906 B raw
  and 283,709 B gzip; budgets 1081kb, 1132kb and 312,080 B.

- **Checkboxes are the browser's own, drawn by Wayfarer, and the app loads
  5.6 kB less.** They look and behave as before: the same box, tick and
  colours, the same focus ring, and Tab reaches each one in every browser,
  Safari included. Three details differ. Each box sits 1 px lower and
  1 px further right, in the middle of its space; before, it sat in the
  space's top left corner. A checkbox's text is set like the rest of the
  app's text, a little narrower; before, it kept the letter spacing of the
  old widget library. In high-contrast mode a checked box is filled with
  the system's highlight colour and its tick drawn in the highlight's text
  colour; before, it was outlined.

- **Text fields are the browser's own fields, drawn by Wayfarer, and the
  app loads 15 kB less.** They look and behave as before. Three details
  differ. A field of several lines (bulk headers, a WebSocket message)
  has its resize handle in its corner; before, it sat inside the padding.
  The address bar is 41 px tall in every browser; Firefox and Safari drew
  it half a pixel shorter. A field focused in a scrolled pane now comes
  fully into view; before, only its text did. In high-contrast mode a
  focused field is outlined in the system's highlight colour.

- **The code is formatted by Prettier, and CI holds it there.** Nothing
  in the app or the site changes: compared build against build, the
  templates' text and the site's pages render as they did. Before, the code
  had no formatter, and line lengths and wrapping varied from file to
  file. `npm run format` writes it; `npm run format:check` runs in CI.

- **The icon in a square button sits in its middle, and Send keeps its
  edge in high-contrast mode.** Before, the icon of the outlined square
  buttons (New request, Copy as cURL and Save beside the address, New
  collection, New environment) sat 4 px left of the button's centre, and
  with Windows' high contrast (forced colours) the Send button lost its
  fill and with it any sign of being a button. Now the icon is centred and
  Send has a border there. Every button is now the browser's own, drawn
  by the app, in place of Angular Material's, and looks and behaves as
  before otherwise. The app's first download is 44 kB smaller (5.7 kB
  compressed); the size budgets are reset to it: initial 1,156,487 B raw
  and 309,291 B gzip; budgets 1215kb, 1273kb and 340,221 B.

- **A busy spinner still looks busy when you ask your system for less
  motion.** Before, with reduced motion the spinner in a button (Save,
  Pair, Test connection, Run self-tests) and beside a live stream, a run or
  a sign-in shrank to a dot, which did not read as anything. Now it is a
  ring with a gap, in the colour of the text around it, that turns once
  every 1.2 seconds, and with reduced motion stands still as that ring.
  Angular Material's spinner is gone, and the app's first download is 8.3 kB smaller (1.4 kB
  compressed); the size budgets are reset to it: initial 1,200,527 B raw
  and 314,968 B gzip; budgets 1261kb, 1321kb and 346,465 B.

- **Tooltips are the app's own, everywhere, and reach the keyboard and a
  screen reader where they did not.** Before, more than half of the app's
  tooltips were the browser's own (the toolbar's buttons, the status bar,
  the environments' and collections' headers), shown after a wait
  in the system's look, and the explanations beside the response's
  Timings (Duration, Transfer, Encoded, Decoded, Waterfall, each phase)
  and on the "TLS verification off" pill showed only under the pointer:
  the Tab key never reached them. Now every tooltip is one kind, shown at
  once on hover and when a key moves focus to what it explains, and the
  Timings' info icons and the pill are tab stops whose text a screen
  reader reads. A tooltip stays while the pointer is on it, follows its
  button when the page scrolls, and closes on Escape, a press, or the
  pointer or focus leaving; Escape inside a dialog closes the dialog too,
  as before, and elsewhere is no longer swallowed by an open tooltip. A
  tap shows none. Its text is the app's footnote size (12 px on a 16 px
  line), and a past request's details card sits 8 px under its entry,
  inside the window's edge. The bars of the Timings no longer repeat in a
  tooltip the time printed beside them. Angular Material's tooltip is
  gone, and the app's first download is 25.8 kB smaller (7.3 kB
  compressed); the size budgets are reset to it: initial 1,208,803 B raw
  and 316,342 B gzip; budgets 1270kb, 1330kb and 347,977 B.

- **Dialogs and the side drawers are the browser's own modal dialogs, and
  while one is open the page behind it is out of reach.** Before, the page
  behind an open drawer was only marked as outside it: a script kept the
  keyboard in the drawer, and the page itself stayed in reach of a screen
  reader. Now the page behind any dialog or drawer is inert until it
  closes. Focus starts where it did, Tab and Shift+Tab (and Option+Tab in
  Safari) stay inside, Escape and a click outside close as before, and
  focus goes back to the button that opened it. Escape now also closes a
  dialog when nothing in it has focus, and the page takes the next key at
  once. A drawer still slides in, and now closes at once, as a dialog does.
  A dialog's title is set as the drawers' headings are (15 px, from 16 px).
  A collection's menu opened in the navigation drawer, the details card of
  a past request, and a copy that falls back to the browser's old copy
  command now work from inside a dialog or a drawer. Angular Material's
  dialog and drawer are gone, and the app's first download is 65.9 kB
  smaller (14.4 kB compressed); the size budgets are reset to it: initial
  1,234,615 B raw and 323,599 B gzip; budgets 1297kb, 1359kb and
  355,959 B.

- **A select's list ticks the chosen option, and shows the one the keys
  are on apart from it.** Before, the chosen option, the one under the
  pointer and the one the arrow keys had reached had the same faint
  background, so from the keyboard you could not tell where you were from
  what was chosen. Selects are now built on Angular Aria, with Angular
  Material's select gone. The keys are the same: on a closed select the
  arrows, Home, End and a letter choose an option; Enter, Space and
  Alt+ArrowDown open the list; there, Enter, Space, Tab and a click choose,
  and Escape closes it with nothing changed. The app's first download is
  40.6 kB smaller (11.2 kB compressed), and the size budgets are reset to
  it: initial 1,300,487 B raw and 338,011 B gzip; budgets 1366kb, 1431kb and
  371,813 B.

- **On a phone, the export of environments fits its choices in the
  dialog.** Before, in a 390 px window the "Protected variables" choice ran
  past the dialog's edge and "Plain text" was cut off; in WebKit the dialog
  scrolled sideways. Below 480 px each choice now fills its row. The theme,
  the route and the export's choices are now the app's own, drawn over the
  browser's radio buttons, with Angular Material's button toggles gone; they
  look as before, and the keys are the same: the arrows move and choose,
  wrapping at the ends, and Tab stops once on the chosen option. Behind
  this, the app's first download is 21.0 kB smaller (5.0 kB compressed),
  and the size budgets are reset to it: initial 1,341,010 B raw and
  349,207 B gzip; budgets 1409kb, 1476kb and 384,128 B.

- **On a phone, a section of the composer or a past request opens at its
  full height and fades in.** Before, it grew to its height over 0.2 s or
  more, and what was under it slid down with it; the app's other panels
  fade, and now these do too. The sections are built on Angular Aria; the
  keys are the same: Enter or Space opens and closes the focused section,
  and ArrowUp, ArrowDown, Home and End move between the headers. A section
  is now built the first time you open it, then kept. The app's first
  download is 11.8 kB smaller (1.7 kB compressed), and the size budgets are
  reset to it: initial 1,362,009 B raw and 354,216 B gzip; budgets 1430kb,
  1499kb and 389,638 B.

- **Tabs are built on Angular Aria, and Tab from a tab now stops on its
  pane.** This covers the open requests, a request's parts, the response, an
  environment's editor and a collection's settings. The keys are the same:
  arrows (they wrap), Home and End move between tabs, and the tab you land
  on opens. The pane under the tabs is now in the tab order between the tabs
  and what the pane holds, as WAI-ARIA's tabs pattern asks; the pane is
  named by its tab. Getting to the pane's first field takes one more Tab. A pane is now built the first time you open its tab, then
  kept. Behind this, the app's first download is 21 kB smaller (3.9 kB
  compressed), and the size budgets are reset to it: initial 1,373,853 B
  raw and 355,869 B gzip; budgets 1443kb, 1512kb and 391,456 B.

- **Menus are built on Angular Aria, and a click away from a collection's
  menu leaves focus where you clicked.** Before, closing a collection's
  right-click menu by clicking elsewhere sent focus back to the tree row,
  away from what you had just clicked. Its rows now have the same small
  gaps as the app's other menus; before, they sat flush. The keys are the
  same: arrows, Home, End, a letter to jump, Enter or Space to choose,
  Escape to close and Tab to move on.

- **A click on a collection or a folder in the tree now opens or closes
  it, and in a high-contrast theme the selected row is marked.** Before,
  only the small arrow beside its name did, and a click on the name
  selected the row and left it as it was. With Windows' contrast themes
  (forced colours), the selected row looked like every other row, since its
  background was its only mark; it now has a bar at its start. The tree
  is now built on Angular Aria instead of Angular Material, the first of
  the widgets to move; its keys are the same. A name too long for the
  sidebar now ends in "…" at its edge: before, it ran under the edge and was
  cut mid-letter, and in Safari a short name could be cut to two letters.

- **Reduced motion now stops all of the app's motion, and nothing pulses
  forever.** With your system set to reduce motion, hover colours on
  history rows and on other elements still faded over 0.12 s, and the
  address field still scrolled smoothly into view; neither does now. A missing variable's chip pulsed for
  as long as it was there; it pulses twice and then holds still. Switching
  the theme no longer fades every element of the page at once; it is
  instant. What moves, and for how long, is now written down in
  `docs/design/motion.md`.

- **What you type and what a server sends are in a monospace font.** The
  address, every param, header, form and multipart row, the variables, the
  auth fields, the tests, the bridge's address and token, the response's
  search, its header values and an event's id and name now read as code,
  so `l`, `1` and `I` or `O` and `0` are told apart. The address and the
  path filter asked for it before and did not get it: Material's own style
  for an input won. Names, descriptions, passphrases and numbers stay in
  the app's text font. A plain button, such as "Start a new request instead",
  was in the browser's own font, 11 px in Safari on a Mac; buttons and
  fields now take the font of the text around them.

- **No text in the app is smaller than 12 px.** The tree's method tags,
  section labels such as "Collections", the tab's method, chips, captions
  and hints were 10 or 11 px; they are 12 px now. The run view's title had a
  type style that did not exist and came out at the browser's own heading
  size; it is the app's title size now. The type scale is part of the design
  tokens, and a test fails if a stylesheet sets text under 12 px.

- **Selected text is readable in the light theme, and so are the editors'
  line numbers.** The light theme had no selection colours of its own and
  drew selected text white on a pale green, at 1.37:1; it is now dark text
  on a green tint, at 10.7:1 or more on every surface. The code editors' line
  numbers were 2.7:1 on white and 3.2:1 in the dark theme, and are now the
  same grey as other secondary text, at 4.5:1 or more. Behind this, the
  app's colours, radii, motion and fonts are now one set of design tokens
  (`packages/tokens`) from which the stylesheet and the editors' colours
  are both written, so the two can no longer drift apart.

- **The app has new colours: warm neutrals and one teal accent.** The
  indigo and violet gradients, the glow behind Send and the see-through,
  frosted toolbar and dialogs are gone: surfaces are solid, so a dialog no
  longer shows the page behind it. Method colours are the ones Postman uses.
  Text and placeholders now reach 4.5:1 on every surface in both themes
  (placeholders were about 2:1), and the code editors take the same colours.

- **A response's body starts higher.** The status, time, size and route are
  one line, with Export as an icon beside them, and the view, the search and
  the path filter share one row above the body. Before, they took up to
  five rows between them.

- **Settings, Diagnostics, says when an import has waited 5 seconds for
  its file to be read.** The import's report showed "Reading" with nothing
  to say why; the read happens in a worker of its own, and a read that has
  not come back in 5 seconds is now recorded there and in the browser's
  console.

### Fixed

- **The development server's vite is 8.3.4.** 8.3.0, which the Angular
  build pins, is in GHSA-698v-4r3x-3vcv (moderate: on Windows, opening a
  file in an editor from the dev server's error overlay did not escape
  `%`). It is not in the app you load; `npm audit` reports 0 again.

- **The 6-hourly production check tests the release production runs.** It
  ran the newest release's tests, and a release is tagged before it is
  deployed: v2.6.0's tests, which look for the app at `/app/`, ran against
  v2.5.0 and opened a "production is failing" issue (#398) while production
  was fine. The deploy now names its release at `/version.json`, and the
  check reads it and runs that release's tests.
- **Every change merged to `main` keeps its own test run, so each one can be
  deployed.** A merge cancelled the run of the change merged just before it
  when that run was still going or waiting, and only a finished run of
  `main` can be deployed: the 2.6.0 release's run was cancelled twice this
  way. A pull request's new commit still cancels its older run.

- **`wayfarer-cli` 2.0.2: a request that gets no connection says why, as a
  command line can.** It said what the app says in a browser: that the host
  "may not allow cross-origin requests from this site (CORS)", that "the
  browser does not reveal which", and that the Local Bridge could relay the
  request. None of that applies outside a browser. It now gives Node's
  reason (`fetch failed (ECONNREFUSED)`, `(ENOTFOUND)`) and asks to check
  the address, that the host resolves and that it accepts connections. The
  app's message is unchanged.

## [2.6.0] - 2026-10-19

The website, and the app at `/app/`. `/` is now Wayfarer's site: a front
page, the docs with a search, comparisons with five other API clients, a
blog, the changelog, the roadmap and the claims ledger. The app is at
`/app/`, where the window is the workspace: the request and its response
side by side from 768 px, a status bar for the route and the vault, and a
request's route and redirects in its own Settings tab.

**Before you open this release, back up your workspace** (Settings, Data
and storage, in the version you have now). A browser that used Wayfarer
before starts empty: the data now lives in a database of a new name, and
the old one is not read. Restore the backup after.

### Changed

### Changed

- **Each page of the website has a picture and a summary for when it is
  shared or found.** A link posted in a chat or a social network shows the
  page's own title, description and image; the site has a sitemap and an
  `llms.txt`.

- **What a screen reader says matches what is on screen, in two places.**
  A request in the collections reads as it shows, method first ("GET
  List users"); it was read as its name alone. The button under the
  parameters says "Add parameter", as it is named; it showed "Add
  Param". Angular 22.2.3, Playwright 1.64.1, axe-core 4.14, Vitest 5.0.5
  and Wrangler 4.151; axe 4.14 checks this (WCAG 2.5.3) and found both.

- **Cancel and the request timeout are a claim with tests (C-042).** A
  request on its way can be cancelled, and Settings, Requests, sets a
  timeout, none by default. Both were there since 2.0 but not in the
  claims ledger or the README's list.

- **The docs say where Wayfarer will be listed and announced, and when**
  (`docs/design/reach.md`). Nothing has been posted yet.

- **The website has a blog, with an RSS feed.** The first posts are the
  2.5.0 release notes and how the claims ledger works.

- **The website compares Wayfarer with Postman, Bruno, Yaak, Hoppscotch and
  Insomnia, and has a guide to moving from Postman.** Each fact about
  another product links to the page it came from and says when it was
  read, and one list says where Wayfarer is behind.

- **Closing a dialog over another leaves focus in the one under it.** When
  the element a dialog had come from could not take focus back (an import's
  report over Settings, opened from a hidden file field; in Safari a click
  does not focus a button), focus fell to the page, and Escape and Tab no
  longer reached the dialog still open. It now goes to that dialog.

- **There is one version of Wayfarer, and the app no longer talks about
  others.** The banners about data an earlier version stored, a tab running
  an older Wayfarer, an update held up by another tab, and an update made
  in another tab are gone, with the code that checked for them. The data
  now lives in a database named `wayfarer`, made on a browser's first
  open. **What this release does to data:** a browser that used Wayfarer
  before starts empty; what it stored under the project's first name is
  not read. Back up the workspace (Settings, Data and storage) before
  opening this release, and restore it after. The service worker that
  removed the first builds' Angular worker is gone from the site's root.
  The "Update available" prompt for a new deploy stays.

- **A status bar says where a request goes and what holds its secrets.**
  The toolbar was six icons with no words, two of them the vault. It now
  holds the environment, Environments, History and Settings; from 768 px a
  bar under the panes shows the route ("Route: Auto"), whether the vault
  is locked, the secrets, where the data is kept, and the theme, each with
  the button it was. The name Wayfarer is on the screen once, and the page
  runs to the window's edges: an 8 px margin the browser adds was left
  around everything. On a phone the lock stays in the toolbar.

- **A JSON or XML response takes the height of its pane.** Beside the
  request, its body was a box of 300 px whatever the window; it now fills
  the response pane below the tabs and grows with the window. On a phone
  it keeps its height.

- **The window is the workspace.** From 768 px wide, the request and its
  response fill the window, side by side, and each scrolls inside itself;
  the page no longer scrolls, so the response is never below the fold. The
  environments are no longer at the bottom of the page: **Environments**,
  beside the environment in the toolbar, opens them, and so does a click
  on one of a request's environment variables, which shows that variable.
  The command palette has them too. On a phone the page scrolls as before.
  A dialog no longer blurs the page behind it, which only dims: with one
  dialog over another, two blurs of the whole window made the page stutter
  on a machine without a graphics card.

- **Focus stays in the Secrets dialog.** After the passphrase was changed,
  the vault exported or imported, or a secret deleted, the button that had
  focus was gone and focus fell to the page, so Escape no longer closed the
  dialog and a keyboard user lost their place. Focus now goes back to the
  button that opened the form, or to the next secret.

- **Settings, Diagnostics, says when saving a secret takes more than 5
  seconds**, and whether the encryption or the write to storage is the step
  still waiting.

- **A run's report says what happened before it lists it.** It counts what
  passed, what failed and what was skipped, shows how far a run has got,
  and can show the failed requests alone. An error that two or more
  requests ended with is said once above the table, with how many it was,
  and each of those rows says "Same error as above": a run against a host
  the page cannot reach repeated the same three lines on every row.

- **A request's route, redirects and certificate check are in its Settings
  tab.** They sat above every request with a sentence of explanation each,
  followed by a section on what the browser does, and pushed the request
  and its response down the page. They are now the request's Settings tab,
  beside Params, Headers, Auth and Scripts, with what the browser does to
  the request written out there. What will go wrong is still said above
  the request: an address the browser will block, a header it will not
  send, and a red "TLS verification off" while the certificate check is
  off.

- **One click opens a request, and the collections show each request's
  method.** A request in the sidebar opened only on a double click, which
  no other API client asks for, so a click seemed to do nothing. A click,
  or Enter on the focused row, now opens it. Each request's method
  (`GET`, `POST`, `DEL`) is shown before its name, in its colour.

- **The website has a new design and a light theme.** The front page now
  plays a request and lists every request that left the tab, shows the
  app, says what changed in Postman's free plan with its sources, and
  answers common questions. Site and app share one logo and one theme
  setting: switch to light or dark on either and the other follows. The
  site is built with Next.js and Tailwind; it still loads nothing from
  another site, and runs no script that is not one of its own files.

- **The trust center says what the website measures: nothing.** It has no
  analytics, no counter and no cookie, and loads nothing from another
  site; every script it runs is one of its own files.

- **The website has the changelog, a roadmap, and the claims' test results.**
  `/changelog/` is this file; `/roadmap/` lists the plan's phases and tasks,
  each done or not. The claims ledger shows, on each claim's row, the CI run
  whose tests the deployed site passed, with its date and commit.

- **The docs are pages of the website, with a search.** Each file of
  `docs/` is a page at `/docs/`, its links to other docs leading to their
  pages, and a search box finds a page by a word in it. The search runs in
  your browser from the site's own files and sends what you type nowhere.
  The front page's claim IDs now open the ledger on the site.

- **Wayfarer's website has a front page.** It says what Wayfarer is, shows
  the app with a request and its response, and links each thing it says
  the app does to the claim and test behind it in the claims ledger. Before,
  `/` had two sentences and a link.

- **The app moves to `/app/`, and `/` is the start of Wayfarer's website.**
  Before, the address opened the app and there was no page that said what
  Wayfarer is. The site's first page says it in two sentences and links to
  the app; a page that does not exist is now a 404 with that link, not the
  app. (What you stored before is not read: see "There is one version of
  Wayfarer" below.) **If you use OAuth 2.0 sign-ins, register the new
  redirect URI with your identity provider**:
  `https://<host>/app/oauth/callback` (the Auth tab shows it). The site
  runs only scripts of its own files and loads nothing from another
  address; its own Content-Security-Policy says so.

- **Wayfarer is deployed at v2.5.0, and the Local Bridge and the command
  line are on npm.** `npx wayfarer-bridge` and `npx wayfarer-cli` work, each
  published from this repository with a provenance attestation. The README
  no longer says they are not on npm.

- **The npm pages of `wayfarer-bridge` (3.0.1) and `wayfarer-cli` say what
  each package does today.** The bridge's still said it was not on npm and
  linked to files by paths that do not open from npmjs.com. Both now have
  real output from the published packages, a table of the bridge's error
  answers and what to do about each, how to call the bridge with `curl`, a
  table of Newman's flags and their `wayfarer-cli` equivalents, the reports'
  format, and a CI example. `wayfarer-bridge` 3.0.1 changes nothing else.

- **The vault's record and each encrypted secret no longer carry a
  version field (`v`):** there is one shape, and nothing checks for
  another. A vault file from this version has no `v` either; a file
  written before still opens, the field is ignored.

### Fixed

- **The release has its SBOM and checksums.** The first tag of 2.6.0 made
  no GitHub release: `npm sbom` refused the website's package, which had no
  version. It has one now, and CI builds the SBOM on every change, so a tag
  cannot be the first to find out.

- **Alt+T right after typing an address opens a tab whose address field is
  empty.** Pressed before the app had drawn the last keystroke, the new tab
  was selected but its address field went on showing the previous tab's
  address, though the new tab's request had none.

- **`wayfarer-cli` 2.0.1: `--out` with a folder that did not exist yet.**
  2.0.0 ran the whole collection, then failed to write its reports with
  `ENOENT` and exited `2`, the code that says nothing was run. The CI example
  in `docs/cli.md` writes to `--out reports`, so on a fresh checkout it
  failed this way. The folder is now made before the first request; if it
  cannot be made, the run stops there with exit code `2` and nothing sent.

- **A click on a menu item as the menu opened could be lost.** While a
  menu animated open it took no pointer events: a click pressed on an item
  and released a moment later, once the animation had begun, chose nothing
  and left the menu open. An opening menu now takes the click.

## [2.5.0] - 2026-10-15

Hardening and the release gate (Phase 7). The app is held to WCAG 2.2 AA
and to performance budgets in CI, can be used by keyboard alone, and shows
its own diagnostics. A threat model links every mitigation to a tested
claim, and each release attaches the build, an SBOM and checksums.

**What to know before you update:** files have one shape now, with no
number in their `$id`, and a file an earlier version exported is refused:
export again after you update. Data stored by 2.4.0 is kept; from now on,
an update that changes how data is stored removes what an earlier version
stored, once, with a notice. Local Bridge 3.0.0 relays at `/relay` and
keeps its token in `~/.wayfarer-bridge`: update it and pair again.

### Added

- Settings → Diagnostics: version and commit, browser, storage, database,
  service worker, Local Bridge; self-tests; the last 200 errors and the
  Content-Security-Policy violations. Copy report and Open GitHub issue
  hold nothing of a request you sent.
- A threat model (`docs/threat-model.md`): each trust boundary, its threats
  by STRIDE, and the tested claim behind each mitigation.
- "Break the sandbox": a public challenge in `SECURITY.md`, with a hall of
  fame in the Trust Center. No money.
- `docs/self-hosting.md`.
- Each release attaches the built folder, a CycloneDX SBOM and SHA-256
  checksums.
- CI holds the app to performance budgets (Lighthouse desktop 90 or more,
  LCP within 2 s, TBT within 200 ms; typing within 100 ms a key with five
  tabs open) and checks that Monaco, the script engine, GraphQL, the
  OpenAPI importer and the YAML parser stay out of the first load.
- CI checks that every doc link leads to a file and that the README links
  every doc, and that the README's feature list is the claims ledger.

### Changed

- Files have one `$id` each, with no number: `wayfarer/collection`,
  `wayfarer/environments`, `wayfarer/workspace`, `wayfarer/vault`,
  `wayfarer/run`.
- An update that changes how data is stored removes what an earlier version
  stored, once, with a notice. There is no conversion.
- Local Bridge 3.0.0 relays at `/relay`; `/health` answers
  `{ ok, name, version }`, with no protocol number or capabilities. Use the
  bridge of the same release as the page.
- `wayfarer-cli` 2.0.0 reads the files of this version.
- Every axe scan checks WCAG 2.2 A and AA at every impact; none is found.
- The README's feature list is the claims ledger. The security questionnaire
  is now the Trust Center's "Procurement answers".
- Size budgets reset to the new baseline: initial 1,386,465 B raw,
  358,979 B gzip (+7,128 and +1,605 over 2.4.0, for Diagnostics and the
  accessibility work); budgets 1456kb / 1525kb / 394,800 B.
- Internal: services use the repositories directly (the `Idb` facade is
  gone), and `meta.version`, `schemaVersion` and the ID alias types are
  gone.

### Fixed

- The app starts faster: the code editor loads with the first editor shown,
  not with every page.
- A dialog that asks for a name, a passphrase or a command opens with focus
  on that field; Enter in a new item's name creates it.
- Focus stays on Send through a send.
- Opening a drawer moves focus into it at once (#223).
- A code editor shows a focus ring.
- Two auth fields filled at once, as a password manager does, are both kept.
- Run pressed just after choosing a data file waits for the file.

### Security

- Publishing the Local Bridge or the CLI no longer runs their dependencies'
  code in the job that holds the npm token.

## [2.4.0] - 2026-10-14

The Local Bridge becomes a first-class route, and collections run from the
command line. A request, a collection or the device chooses its route:
Direct, Local Bridge, or Auto, which sends through the bridge when the page
gets no answer and asks first when the server may have received the
request. Local Bridge 2.2.0 speaks protocol 2: bodies as bytes, decompressed
responses, timings, a `Host` of your own, certificate verification off for
one request, a certificate authority and a proxy of your own, HTTPS on
loopback, and pairing with a code instead of copying a token.
`wayfarer-cli` runs a collection, a workspace backup or a Postman file in a
terminal or a CI job, with the app's own engine and the app's results.

**Nothing stored is removed by this version.** The database goes from
version 12 to 13: each folder's folders and requests are numbered again as
one list, so a run follows the order of the list and of a Postman file.

**What to know before you rely on it:**

- The page speaks the bridge's protocol 2 only: an older Local Bridge is
  refused with a message that says to update it.
- Auto may send a request twice when a server received it and answered
  without the CORS headers the browser needs: the browser reports both the
  same way (said in `docs/browser-limits.md`).
- The command line runs a file's scripts only with `--allow-scripts`, and
  sends every request directly. It is not on npm yet: the first publish is
  a separate step (`docs/runbook.md`); until then, build it from a clone.
- The first bundle is 1,379,337 B (357,374 B gzip), 1.2% more than 2.3.0:
  the route, the badge, the bridge's pane and the road a request takes,
  now in the shared engine. The size budgets are reset to this baseline
  (warning at 1,448 kB, error at 1,517 kB, 393,100 B gzip).

### Added (releases to npm)

- **The Local Bridge and the command line can be published to npm** from
  a tag (`bridge-v<version>`, `cli-v<version>`), with npm's provenance:
  the npm page then says which build of this repository made the package.
  Each release installs the package it is about to publish into an empty
  folder and runs it first. The first publish is the maintainer's
  (`docs/runbook.md`); until then, both run from a clone.
- `docs/cli.md` has a GitHub Actions job that runs a collection on every
  push and keeps the JUnit report.

### Added (command line)

- **`wayfarer-cli`, a command-line runner** (`packages/cli`; not on npm
  yet, see `docs/cli.md` to build it). `wayfarer-cli run <file>` runs a
  Wayfarer collection, a workspace backup or a Postman collection, with an
  environment (`-e`), a data file (`-d`) and a number of iterations (`-n`),
  and writes the reports the app's run view saves (`--reporter
  cli,json,junit`). It exits with 1 when a test fails or a request gets no
  response, so a CI job can run it. It sends with the app's own engine: the
  same scripts in the same order, the same variables, vault and checks,
  and a test holds its results to the app's for the same run.

- **A file's scripts run only with `--allow-scripts`.** In the app a
  collection from a file runs its scripts after you have reviewed them; a
  file carries no review, so without the flag a collection with scripts is
  not run, and nothing is sent.

- **The vault from the command line**: a workspace backup brings its vault,
  or `--vault-file` names an exported one; the passphrase is read from
  `WAYFARER_VAULT_PASSPHRASE`, never from an argument. Every request goes
  straight from Node: the Local Bridge adds nothing there.

### Changed (the road a request takes)

- **How a request is sent now lives in the shared engine**, so that the
  command-line runner, coming next, sends exactly as the app does: the
  scripts in their order, what they set, the vault, the check that no
  secret's placeholder reaches the network, the route, the assertions, and
  what history keeps. Nothing you see in the app changes; before, this was
  part of the app alone and a second runner would have had to copy it.

### Added (routes)

- **A route for every request: Direct, Local Bridge or Auto.** A request
  may name its own (the composer's **Route**), a collection may name one for
  its requests (its settings, **Route**), and otherwise the device's applies
  (Settings → Local Bridge → **Route**, which replaces the switch "Route
  requests through the bridge"). Before, the bridge was on for every request
  or for none, and a request the browser could not send just failed.

- **Auto is the default.** It sends from the page, and when the page gets no
  answer, through the Local Bridge: at once when the request cannot have
  reached the server (the browser's preflight failed first) or is a GET,
  HEAD or OPTIONS; otherwise it asks first, since the server may have
  received it. A response, whatever its status, is never sent again. With
  no bridge token in the tab or the vault, Auto is Direct.

- **Each response says where it came from**: Direct or Via bridge.
- A stored "bridge on" reads as the route Local Bridge; "off" reads as Auto.
  A collection's route is written to its file and checked on import; no
  stored data changes shape (the database stays at version 13).
- CONNECT, TRACE and TRACK need the route Local Bridge (the message says
  so); an OAuth token request that gets no answer says to send it through
  the bridge.

### Added (Local Bridge 2.2.0)

- **Pairing.** The bridge prints a pairing code when it starts; type it in
  Settings → Local Bridge and press Pair, and the bridge gives the page its
  token, which is saved as a typed one is (in the vault while it is
  unlocked). Nothing to copy. A code works once, and three wrong codes in a
  row lock pairing for a minute. Pasting the token still works.

- **HTTPS on loopback**: `--cert` and `--key` start the bridge over HTTPS
  with a certificate of yours. Safari does not reach `http://127.0.0.1`
  from the hosted app; the bridge's README shows how to make one with
  `mkcert` or `openssl`. The bridge makes none itself.

- **Settings → Local Bridge explains Chrome's question** about the local
  network before it is asked: allow it, the bridge is on this computer.
- The bridge answers a preflight that asks for the private network
  (`Access-Control-Allow-Private-Network: true`).

### Added (Local Bridge 2.1.0)

- **Timings through the Local Bridge.** The Timings tab shows the name
  lookup, the TCP connection, the TLS handshake, the wait for the first
  byte and the rest of the response, measured by the bridge on its own
  connection. Before, a request through the bridge had no breakdown at all
  ("CORS-limited timings").

- **Do not verify the server's certificate**, a setting of a request, in
  the composer beside Follow redirects. Through the Local Bridge such a
  request accepts any certificate (self-signed, expired, for another name);
  the request and its response carry a red "TLS verification off" pill.
  Sent directly it changes nothing: a browser always verifies. A request a
  script sends and an OAuth token request are always verified.

- **A `Host` header of your own is sent through the bridge.** Before, the
  bridge took it off and the composer said so.

- **`--ca <file>`** starts the bridge trusting your own certificate
  authority besides the public ones.

- **`HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`** are honoured by the bridge,
  through Node's own support: the bridge now needs Node 22.21, or 24.5 and
  later (before: 20.19).
- These are additions to protocol 2. Local Bridge 2.0.0 would refuse the
  new field and drop the `Host` header, so the app reads the bridge's
  `/health` first and, for a bridge that lists neither, sends nothing and
  says to update it. A request that needs neither works with 2.0.0 as
  before.
- The composer's note for the Local Bridge names the `Accept-Encoding` the
  bridge adds.

### Fixed

- **Deleting a folder deletes the folders inside it.** Before, they moved up
  one level with their requests, which was written when the list showed
  every folder side by side; since folders are drawn inside their folder, a
  deleted folder left its inner folders standing where it had been. The
  question before the deletion now says how many folders and requests go
  with it.

- **Duplicate on a folder copies the folders inside it**, at every depth,
  each with its requests and in its place. Before, the copy held the
  folder's own requests only.

### Changed (Local Bridge 2.0.0, protocol 2)

- **The Local Bridge relays bytes.** A file, a multipart form and a binary
  body can be sent through it; before, the app refused them ("cannot relay
  a file or multipart body yet"). A response comes back as the bytes the
  server sent: before, the bridge read every body as UTF-8 unless its type
  looked binary, so text in another charset and binary data under a text
  type were damaged.

- **A compressed response through the bridge is decoded** (gzip, deflate,
  Brotli) and shown with both sizes. Before, it was passed on compressed and
  read as text. The 25 MB limit holds for the decoded body too.

- **The request's timeout holds through the bridge.** Before, the bridge
  waited its own 30 seconds whatever the request said.

- **The page and the bridge must be of the same protocol, and say so when
  they are not.** This version of the app needs Local Bridge 2.0.0: with an
  older one a request fails with "does not speak protocol 2", and Settings →
  Local Bridge → Test connection names the bridge's version and says which
  of the two to update. Nothing is sent to a target in that case. Update the
  bridge with the app (`git pull`, then `npm run bridge`).
- The bridge's folder is `packages/bridge` and its package and command are
  `wayfarer-bridge` (before: `local-bridge`, `wayfarer-local-bridge`). Its
  token file stays where it was, `~/.wayfarer-local-bridge/token`.

### Changed

- **A collection runs in the order of its list, and the list is in the order
  of a Postman file.** A folder's folders and requests are now one list: a
  request can stand before a folder, between two folders or after them, and
  drag or Alt+Arrow moves a row among both kinds. Before, the list showed a
  folder's folders first and then its requests, a run sent them that way,
  and an imported Postman or Insomnia file whose requests stood before a
  folder lost that order (the import report said so). Newman sends such a
  file in the file's order, and so does a run now; an export for Postman
  writes the order back.

- **A folder inside a folder is shown inside it.** Only an imported file can
  hold one. Before, the list showed every folder of a collection side by
  side, at the top.
- A new folder, a new request and a copy go to the end of the collection's
  numbering, after every folder and request there is. A copy of a folder
  keeps its requests in the places they had.

- **Nothing stored is removed.** The database goes to version 13: each
  folder's folders and requests are numbered again as one list, folders
  first, so the list looks as it did. A collection file or a workspace
  backup written by an earlier version numbers the two kinds apart; imported
  now, the folders and requests of one parent may stand in another order.

## [2.3.0] - 2026-10-13

A workspace to work in all day. Several requests are open at once, in tabs
that are still there after a reload. A collection or a folder runs as a
whole, with iterations, a data file and reports. A response that is an event
stream is listed as it arrives, and a `ws://` address is a WebSocket to talk
to. A body can be a GraphQL query, checked against the server's schema and
completed from it. Through the optional Local Bridge, redirects are shown
hop by hop and cookies are kept as a browser keeps them.

**Nothing stored is removed by this version.** The database goes from
version 10 to 12: it gains the stores of the tabs and of the cookie jar.

**What to know before you rely on it:**

- A tab is stored as you type, before you save: a token typed into a
  request is text in this browser's storage. Cookies of the jar are too.
  Put what must not be there into the vault.
- The cookie jar and the list of redirects need the Local Bridge, and the
  jar needs Local Bridge 1.1.0, which comes with this version. A browser
  shows a page neither.
- A request that holds a vault secret is not followed by a redirect to
  another host; the redirect is the response.
- A collection run goes in the order of the list, a folder's folders before
  its requests. A Postman file may have them in another order.
- Two libraries are new, `graphql` and `graphql-language-service` (MIT).
  They are fetched with the first GraphQL schema, not with the page.
- The first bundle is 1,362,406 B (351,713 B gzip), 6.4% more than 2.2.0:
  the tabs, the run's view, the event list, the WebSocket view, the cookie
  jar and the GraphQL pane. The size budgets are reset to this baseline
  (warning at 1,430 kB, error at 1,498 kB, 386,800 B gzip).

### Added

- **GraphQL.** A body can be a GraphQL query with its variables: choose **GraphQL** in the Body tab. The query has its own editor, the variables a JSON one, and the request is sent as the one JSON object a GraphQL server reads; `{{variables}}` are replaced in both before that JSON is made. **Fetch schema** asks the request's address for its schema, with the request's own headers, auth and scripts, and without writing anything to history. With a schema the query is checked as you type (a field the schema does not have is underlined and named under the editor), the editor completes fields and arguments, and the schema is listed under the editor: each type with its fields, their arguments and what the schema says of them. A query that does not parse is said without any schema. A schema is kept for its address until the page reloads. A Postman collection's GraphQL body imports as one and exports as one; it used to become JSON text. Two libraries came with it, `graphql` and `graphql-language-service` (MIT, with three small MIT packages); they are fetched with the first schema and are not in the first bundle. See `docs/graphql.md`.
- **A cookie jar, for requests sent through the Local Bridge.** A response's `Set-Cookie` was shown and forgotten, so an API that signs you in with a cookie needed the header copied by hand. Through the bridge the app now keeps what responses set and sends it with later requests to the cookie's domain and path, by the rules browsers follow (host-only and `Domain` cookies, `Path`, `Secure`, `Max-Age` and `Expires`, the `__Secure-` and `__Host-` prefixes). On a redirect, a cookie one hop sets goes out with the next. **Settings, Cookies** lists the jar: change a value, delete a cookie, delete all. Your own `Cookie` header is sent as written and its names win. Sent directly, nothing changes: a page cannot read or fill the browser's jar, and the pane says so. Cookies are kept in this browser's storage as text, like a credential typed into a request; history and exports hold them masked, and a cookie whose value holds a vault secret is kept in the tab's memory only. There is no list of public suffixes: `Domain=com` is refused, `Domain=co.uk` is not. Scripts are not given the jar (`pm.cookies` stays unsupported). Needs Local Bridge 1.1.0, which comes with this version and lists a response's headers one by one; an older one joins `Set-Cookie` headers, and nothing of that is kept. See `docs/browser-limits.md`, "Cookies".
- **Through the Local Bridge, a response's headers are shown one by one.** Two `Set-Cookie` headers were one line joined by a comma.
- **A HAR lists cookies** when it holds the `Cookie` and `Set-Cookie` headers unmasked (an export with credentials). The lists were always empty.
- **Redirects, hop by hop, through the Local Bridge.** Through the bridge a redirect came back as a 3xx and you sent the next request yourself. The app now follows it, 20 redirects at most, each hop as a request of its own through the bridge, and the response lists each one: its status, the address that answered, and its `Location`. A request has a new setting, **Follow redirects**, on unless you switch it off; off, the first 3xx is the response. Sent directly, a request is followed by the browser as before, which shows a page only where it ended, and the setting says so. 301 and 302 turn a POST into a GET, 303 any method but GET and HEAD, 307 and 308 repeat the request; a hop to another origin goes without `Authorization` and `Cookie`. The Local Bridge itself is unchanged: any version relays a hop. See `docs/browser-limits.md`, "Redirects".
- **A request with a vault secret is not followed to another host.** When a redirect would take such a request to another name or port, or to the same host without TLS, the app stops there and the redirect is the response, with a line that says why. A redirect is the server's word, and the secret was written for the host you named. To send the request on, put the new address into it.
- **Collection runs.** **Run…** in the menu of a collection or of a folder opens a tab that runs its requests one after another, in the order of the list. Each request is sent as Send would send it: its scripts, its assertions, the review of imported scripts, the vault. Choose a number of iterations, a delay between requests, **Stop on the first failure**, and a **data file** (CSV with a header line, or a JSON list of objects; 10 MB at most): each iteration gets a row, which a script reads with `pm.iterationData` and a request with `{{name}}`. `pm.execution.setNextRequest` and `pm.execution.skipRequest` now move a run as they move Postman's; each point was checked against Newman 6.2.3. A table fills as the results arrive, with each failed test and its message; **Cancel run** stops within one request. When a run has ended it can be saved as JSON, as JUnit XML for a CI server, and as a HAR 1.2 file, masked as history is. A run is not written to history, its tab is not stored, and it goes on while you work in another tab.
- **Event streams (SSE).** A response of type `text/event-stream` used to appear only once the server ended it, as one text. It is now listed event by event as it arrives: id, event, data, and the time since the response began. The request is sent as any other, with its headers and auth (it is read with `fetch`, not `EventSource`). **Stop** ends a stream and keeps what arrived as the response; **Reconnect** sends the last id as `Last-Event-ID`. The request timeout applies until the first byte. The list holds the newest 500 events, and the Body tab the first megabyte. Through the Local Bridge a stream is shown when it has ended.
- **WebSocket.** An address that starts with `ws://` or `wss://` is connected to: the Send button becomes **Connect**, and the tab shows the connection. You can name subprotocols, send text (or text that must be JSON) with `{{variables}}` replaced, and read a log of every message sent and received with its time and size; when the connection ends, the log has the close code and what it means. A browser adds no header to a WebSocket's handshake, so the request's headers and auth do not go with it, and a vault secret cannot be sent in an address or a message: such a one is refused. Nothing of a connection is stored.
- **A run asks before a vault secret goes to a host a script changed.** A send has asked this of its own pre-request script since v2.1.0. A run compares each request with the variables as they were when the run started, so a script of one request that sets the host of the next is asked about too, once for each host; "Don't send" ends the run.
- **Tabs in the composer.** There was one request at a time: opening a saved request or a history entry replaced what you were working on, changes and response with it. Now a strip above the composer holds a tab per request, each with its own request and the response it last received. **New tab** (Alt+T, Option+T on a Mac), **Duplicate tab** and **Close tab** (Alt+W) are beside the strip and in the command palette; the browser keeps Ctrl/Cmd+T and W for its own tabs, so the app does not use them. A tab shows the method and the saved request's name, or else the address, and a dot when it holds changes that are not saved; closing such a tab asks first. A saved request that is already open goes to its tab, with your edits; a request opened while the open tab has unsaved changes gets a tab of its own. A tab of a saved request says where the request is kept (collection / folder / request). You can leave a tab while its request is on its way: open, switch to or send from another tab, and the response is in the tab that sent it when you come back. Closing a tab that is waiting for a response asks first, and cancels the request.
- **Tabs are kept over a reload.** Each tab is stored in this browser a moment after it changes: the request in it, whether it has unsaved changes, and the saved request it belongs to. After a reload the tabs are back in their order with the same one open, and a tab shows the response of its last send as history kept it. No response and no secret's value is stored with a tab; a variable is stored as its name. A file chosen for a body and never saved has to be chosen again. Two browser tabs of the app share the same tabs: one opened, closed or edited in one appears so in the other, and each browser tab keeps its own open tab. **Reset all data** removes them. The database is version 11; nothing stored before is changed or removed.
- **What you type into a tab is now stored before you save it.** A request being composed used to live in the page's memory until you saved it. A tab is stored as you type, so a token typed into the Auth tab or a header is plain text in this browser's storage from that moment until the tab is closed, as it always was in a saved request. A vault secret is not affected: a tab holds its reference, never its value. A cURL command pasted into the address field is in the open tab like any other request, credentials included; it is still not saved to a collection or to history (claim C-056 said "stores nothing", and now says this). The tabs are not part of a workspace backup (claim C-046 now names what is).
- **A script in a restored tab runs only if it was allowed when the tab was stored.** With each tab the app stores the SHA-256 of every script in it that was allowed to run. After a reload, a script whose digest is not in that list waits for a review, like a script of a history entry.

### Changed

- **The database is version 12.** It adds the store of the cookie jar and removes nothing: what a version 11 database holds is kept.
- **Scripts are ready for collection runs; the run itself comes next.** `pm.iterationData`, `pm.info.iteration`, `pm.info.iterationCount` and, in Postman's older sandbox, `iteration` and `data` now read what a run gives them: the row of its data file and the number of the iteration. A data file's value wins over an environment's in `pm.variables` and in `{{…}}`. In a single send nothing changes: there is no data, and the iteration is 0 of 1. The engine's global object therefore holds seventeen names of the app's, not sixteen: `data` is new, a plain object, empty outside a run. `docs/postman-compatibility.md` says how `pm.execution.setNextRequest` and `skipRequest` will move a run, each point checked against Newman 6.2.3.
- **Settings is a list of sections with one section's pane beside it.** It was one narrow column that scrolled: fifteen cards under each other in a 540 px dialog, with history size, the vault's idle lock and the unresolved-variable switch all filed under "Network". Now: General, Requests, History, Data and storage, Vault, Local Bridge, Shortcuts, About, and a Danger zone of its own at the foot of the list. The dialog keeps one size from pane to pane. On a phone the list is the dialog, a section opens in its place, and "All settings" goes back. Up, Down, Home and End walk the list.
  - **The Local Bridge is a pane of Settings**, not a second dialog that closed the first. The toolbar's bridge button opens Settings there. Nothing is stored until **Save**, which is offered only when something changed; **Discard** puts back what is stored; a bridge switched on with no address is refused with the reason; and a failed **Test connection** says what to check. The token has a show and hide button, and the pane says where the token is kept.
  - **Theme: System, Light or Dark.** System follows your device and changes when it does. **A browser that never chose a theme now follows the system; it was always dark.** A theme you chose before stays chosen.
  - Number settings say their unit (ms, requests, minutes). Storage is shown as a bar with sizes a person reads ("3.6 MB used of 10 GB"); it said "3.6 MB of 10243.6 MB".
  - New: **Clear history** in the History pane (it was only in the history drawer), and **About** links to the changelog, the trust center, the source and the licences.
  - **Fixed in Settings, found by scanning each pane:** the shortcut keys were 4.2:1 on their background and are the primary text colour now; the small grey text and the red button of the danger zone were under 4.5:1 on its red tint, which is a red border now.

### Security

- **The Local Bridge's token is no longer kept as plain text (F83, #266).** It was in this browser's `localStorage`, where anything that can read the app's storage could read it. It is a vault secret now, "Local Bridge token", when the vault is unlocked; with the vault locked or with no vault it is kept in the tab's memory and you enter it again after a reload. A send through the bridge asks for the vault's passphrase when the token is in the vault and the tab does not have it. **A token stored by an earlier version is removed, not moved: enter it once more in Settings, Local Bridge.**

### Fixed

- **A tab did not notice that its saved request was renamed, moved or deleted.** A tab held a copy of its saved request from when it was opened. Renamed in the list, the tab kept the old name; moved to another folder, it was still sent with the old folder's auth, variables and scripts; deleted, the tab still claimed to belong to it. All three lasted until a reload. A tab now follows its saved request at once, also when the change was made in another browser tab; a tab whose request was deleted keeps what it held, as a request that is not saved, and a script of it that waited for a review still waits.
- **A script that hit a limit could stop another tab's script.** Every script ran in one worker. When a script ran out of time or memory the worker was ended, and a script of another tab, or of a collection run, that was running at that moment ended with it: "Script execution was stopped." Each running script now has a worker of its own; one is kept for the next script, so scripts that follow each other start as fast as before.
- **Reset all data could leave one record behind.** A request that was still on its way when you confirmed the reset, or a tab edited a moment before, could write after the database was deleted and before the page reloaded: the write made the database again, with that history entry or that tab in it. After a reset that succeeded, the page now writes nothing until it has reloaded.
- **"Start a new request instead" could be unreadable in the dark theme.** The link above the composer of a saved request was drawn in the browser's own button colours; in Safari's engine on Linux that was dark text on a dark page. It, "Send anyway" and "Reveal" have the app's link colour now.
- **A secret with a `^` in it was not masked where a server sent back the path it was in.** History and exports look for each secret in every form it can take on the wire. For a value inside a URL's path they looked for `^` as it is; a browser of today writes it as `%5E`, and that form was not looked for. A response that repeated such a path (an echo, an error page) was stored with the secret readable, percent-encoded. Both forms are masked now.
- **The Timings tab shows the open tab's own request.** The phases and sizes of a request (DNS, connect, waiting, download) were kept once for the whole app: after a send in one tab, every other tab's Timings showed that request's numbers under its own response. Each tab keeps the timings of its own last send now, and a tab that has not sent shows none.
- **A line break or a tab in a variable's value is no longer dropped from the address.** With `{{note}}` in a query and a value of two lines, the server received the two lines run together: a browser takes tabs and line breaks out of an address before it sends. They are sent percent-encoded now (`%0A`, `%0D`, `%09`), as Postman sends them. In the part of the address that names the host such a character is refused ("Please enter a valid URL") where it used to vanish, so `api⏎.test` is no longer sent to `api.test`.
- **Offline, the editor opens again (F84, #269).** After one visit the app loaded with the network off, but 20 of its 28 lazily loaded files were never kept for offline use, the editor among them: the service worker recognised a file by an upper-case hash in its name, and the build gives most lazy files a mixed-case one. The body editor did not open offline. The worker keeps them now, including the ones a first visit loads before the worker has taken over the page. What is still not there offline is a part of the app this device never loaded; the Trust Center's known limitations say so.
- **The page no longer starts dark and then turns light (F85, #270).** The page was always first drawn in the dark theme, and changed to the theme in use when the app had started: with the light theme, every load began with a dark page that faded to light. Since the theme follows the system by default, that was every load on a device set to light. The theme is now set before anything is drawn.
- **Two warnings Angular wrote to the console in development are gone, with what caused them.** The Params rows were destroyed and rebuilt at every keystroke in the address, and the header rows whenever their list was replaced; both are updated in place now (NG0956). And the command palette held two actions with one id ("New Request", and "New Request in" a selected collection), which Angular warns about (NG0955): each has its own.

## [2.2.0] - 2026-10-12

Bring your work in, and take it out. Wayfarer reads Postman collections and
environments, Insomnia exports, OpenAPI and Swagger descriptions, cURL
commands and HAR files, each with a report of what it could not keep before
anything is stored, and writes cURL, code for three targets, Postman files
and HAR. A collection and a folder can hold auth, variables and scripts for
the requests in them. Two auth types are new: AWS Signature Version 4 and
OAuth 2.0.

**Collections saved by 2.0 or 2.1 are removed the first time this version
opens**, and the page says so: a stored collection, folder and request did
not hold what inheritance needs. Environments, secrets and history are
kept. Collection and backup files are format 3; older files are refused.
See "Changed" below. Nothing else stored changes shape.

The size limits of the page were reset to what it measures now: 1,279,928 B
(325,687 B gzip), 54,698 B more than 2.1.0, for the import and export
dialogs, inheritance, and the two auth types. The importers (157 kB, with
the YAML reader), the code generators, the Postman exporter and the HAR
builder are fetched only when they are used.

Not checked on a deployed site, since no 2.x release has been deployed
yet: the OAuth 2.0 callback page as Cloudflare serves it, and the sign-in
window in Safari itself. `docs/runbook.md` says what to look at after the
first deploy.

### Added

- **A collection and a folder can hold auth, variables and scripts for the requests in them (P4.9).** Right-click a collection or a folder and choose **Settings**. Before this, auth and scripts could only be set request by request, and only a collection had variables (under "Variables", which is now a tab of Settings).
  - **Auth.** The Auth tab of a request has a new type, "Inherit from parent": the request is sent with the auth of the nearest folder that sets one, and otherwise with its collection's. The tab says what will be sent and where it comes from. A request made in a collection starts with it. A request set to "None" sends none, whatever is above it, and one that inherits in no collection sends none.
  - **Variables.** A folder's variable wins over its collection's and loses to the active environment's; of two folders, the nearer one wins. A script reads it with `pm.variables.get`; no object of `pm` writes one (Postman has no folder variables).
  - **Scripts.** A send runs the collection's pre-request script, then each folder's from the outside in, then the request's own, each with the variables the one before left; the post-response scripts run in the same order. A pre-request script that ends in an error stops the send, whichever it is, and the Tests tab names it.
  - **The review covers them.** An imported collection's own script and its folders' wait for the review like its requests', and a request without a script of its own is held back by them. The review dialog lists all of them. The question before a vault secret goes to another host compares the request before the first of these scripts with the request after the last.
  - **Exports mask them.** A credential typed into a collection's or a folder's auth, or into a folder variable with a credential's name, is written as `***` unless the export is "with credentials".

- **Every import shows a report before anything is stored (P4.1).** Whichever Import button you press, the file takes one road: it is read and checked in a worker, so the page stays responsive on a large file; a dialog then says what the file is, how many collections, folders, requests and environments it will add, and what of it could not be kept; and only **Import** stores it. Cancel stores nothing. Before this there were three roads: the Collections panel and the Environments panel each had a dialog of their own, and **Settings imported environments at once, with no preview and no way back**.
  - The report warns about a script that uses a part of Postman's API the app does not have (`pm.cookies.jar`, `require('xml2js')` and the other rows `docs/postman-compatibility.md` lists as not supported), naming the request, folder or collection.
  - A file of no known format is refused with a message that names the formats that are read. A workspace backup picked here is pointed to Settings.
  - A collection file picked with the Environments panel's Import (or the other way round) is imported as what it is.
  - Measured in Chromium on a laptop: a 5 MB file of 5,000 requests in 100 folders shows its report after 0.3 s and is stored after 1.4 s.
  - See [`docs/import.md`](docs/import.md).

- **Copy as cURL carries the body in every mode, and the request can be copied as code (P4.6 a, [#88](https://github.com/AshwinSathian/wayfarer/issues/88)).**
  - **Fixed: a multipart form and a file body were left out of the copied cURL command without a word**, from the composer and from the response's Export menu. The command now has `--form-string` for a text part, `-F 'name=@"file"'` for a file part, `--data-binary '@file'` for a file body, and `--data-urlencode` per field for a form. A file is named, not embedded: run the command where the file is.
  - **Fixed: `HEAD` was copied as `-X HEAD`**, with which curl waits for a body that never comes. It is `--head`.
  - New in the same menu: **Copy as JavaScript (fetch)**, **Copy as Python (requests)**, **Copy as HTTPie**, with credentials masked. The generators are fetched the first time one is used.
  - A value that starts with `@` is never placed where curl or HTTPie would read it as a file. HTTPie cannot be told that such a value is text, so for such a request it copies a comment that says so instead of a command.
  - **Fixed before any release: the comment copied in place of a command could run code in zsh (F70, [#241](https://github.com/AshwinSathian/wayfarer/issues/241)).** For a request that curl or HTTPie cannot be given safely, a comment line is copied that names the form part or the header. The name was in double quotes. bash reads the line as a comment; zsh at a prompt, the default shell of macOS, runs `#` as a command and expands `$(…)` and backticks in its arguments first, so a part named `a=$(…)` in a request from someone else's file ran when the line was pasted. The name is now in single quotes, which no shell expands.
  - Tested by running it: the copied command, run by bash against a local server, sends what the app sends for twelve requests covering every body mode. See [`docs/export.md`](docs/export.md).

- **A cURL command becomes a request, and a HAR file imports (P4.5).**
  - **Paste a cURL command into the address field** and the composer becomes the request it describes: method, address, headers, body, and Basic auth from `-u`. Nothing is stored. Before this, the text was pasted into the address as it was.
  - **Import a cURL command** with the new terminal button in the Collections panel: the import dialog takes the command, shows its report, and stores a collection with the one request on Import.
  - **A HAR 1.2 file** picked with Import becomes a collection with one request per entry. The file picker now also offers `.har` files.
  - Read: `-X`, `-H`, `-d` and its `--data-*` forms, `--data-urlencode`, `-F`, `--form-string`, `-u`, `-b`, `-A`, `-e`, `-G`, `--url`, `-I`; bash quoting (with `$'…'`) and cmd quoting (with `^`); line continuations. `--compressed` is left out with a note and `-k` with a warning; any other option is left out and said.
  - **The command is read, never run, and no file it names is opened.** A body or a part that comes from a file is named for you to choose again.
  - A command copied with "Copy as cURL" pastes back as the same request.
  - See [`docs/import.md`](docs/import.md).

- **A collection and an environment export as Postman files (P4.6 b).**
  - **A collection:** right-click it and choose **Export for Postman…**. The file is a Postman Collection v2.1 file with the collection's folders, variables, auth and scripts at every level, and each request with its address, headers and body in every mode. A request set to "Inherit from parent" has no auth of its own in the file, which is how Postman says it.
  - **The dialog says first what Postman's format has no place for**: the assertions of the Tests tab (Postman has tests only as scripts), a folder's variables (written, but Postman's runner does not read them), and files, which are named and not included.
  - **Credentials are masked** as in the app's own collection file, unless you tick "Include credentials". A vault secret is never written.
  - **An environment:** in "Export environments", choose "File for: Postman" and the environment. A protected variable is of Postman's type `secret`, with no value unless you ask for plain text.
  - **Tested by running it:** a collection with every body mode, and auth and scripts at three levels, is exported and run by Newman, Postman's own runner; its 26 test results are the ones the app's engine gives for the collection.
  - The collection's menu has one more entry. The exporter is fetched the first time a Postman file is asked for. See [`docs/export.md`](docs/export.md).

- **Postman collections and environments import (P4.2).**
  - **A Postman Collection v2.0 or v2.1 file** picked with Import becomes a collection: its folders, variables, auth and scripts at every level, and each request's address, headers and body. A request with no auth of its own inherits, as in Postman.
  - **A Postman environment file** becomes an environment. **Postman's globals** become an environment named "Postman globals", and the report says so: an import does not write over your own globals.
  - **The report says what could not be kept**: an auth type the app does not have (it is left out and sends none; it does not start to inherit another level's credentials), path variables (`/users/:id` becomes the value the file gives, or `{{id}}`), a query parameter that is switched off, a GraphQL body (kept as its JSON text), files, saved responses, a request with no address, and scripts that use what the app does not have.
  - **Scripts are imported, not approved**: they wait for your review.
  - A Collection v1 file is refused with a message that says to export v2.1 from Postman. A file that starts with a byte order mark, or is in UTF-16, is read.
  - **Tested with files other people wrote:** Newman's own integration collections, six of Adyen's API collections and Microsoft Graph's (51 collections, 12 environments) all import; each collection, exported as a Postman file and imported again, is the same collection; and twelve of Newman's collections, run as imported, give exactly the test results Newman gives. The 33 others are listed with the reason each is not compared. Seven of those reasons are faults of the app's script engine that this comparison found ([#248](https://github.com/AshwinSathian/wayfarer/issues/248)); they are not fixed here.
  - A folder and a request can hold a description. It is kept from a file that had one and written back by an export; the app does not show it yet. Nothing stored changes shape.
  - See [`docs/import.md`](docs/import.md).

- **Insomnia exports import (P4.4).** An export in format 4 (JSON or YAML, which older versions of Insomnia write) or format 5 (YAML, `type: collection.insomnia.rest/5.0`) takes the road of every import: a report first, then Import.
  - Kept: folders in folders, requests with their method, address, query, headers and body (text, a form, a multipart form, a file, GraphQL as its JSON), descriptions, and Basic, Bearer and API key auth. A request with no auth of its own inherits its folder's, as Insomnia sends it.
  - `{{ _.name }}` and Insomnia's other ways to write a variable become `{{name}}`. The base environment becomes the collection's variables, each environment under it an environment, a folder's environment the folder's variables.
  - Not kept, and said in the report: Insomnia's scripts (they call its own `insomnia` object, which the app's engine does not have), template tags (`{% response … %}`) and filters, a folder's headers, auth types the app does not have, and gRPC, WebSocket and Socket.IO requests.
  - Tested with 64 files from Insomnia's own repository: the 58 that are exports import, each with the folders, requests and environments a count of the file gives.
  - **A YAML file is read**, with three limits a JSON file does not have: it may be 1 MB (a YAML reader needs far more memory per byte; a file written to be dense took a gigabyte per megabyte when measured), a file that repeats itself through aliases 100 times or more is refused (a "billion laughs"), and a tag makes nothing but text, numbers, lists and maps. The Import buttons now offer `.yaml` and `.yml` files.
  - The message for a file that is not JSON now says "neither JSON nor YAML that can be read", and the message that names the formats names Insomnia's.
  - The YAML reader (`yaml` 2.9.1, ISC) is in the import worker, which is fetched when a file is picked or a cURL command pasted: the worker is 144,444 B (46,734 B gzip), from 36,094 B. The page's first load is 45 B larger.
  - See [`docs/import.md`](docs/import.md).

- **OpenAPI and Swagger descriptions import (P4.3, [#78](https://github.com/AshwinSathian/wayfarer/issues/78)).** An OpenAPI 3.0 or 3.1 description, or a Swagger 2.0 one, in JSON or YAML, picked with any Import button becomes a collection with a request for each operation. Before this such a file was refused as "not a file Wayfarer can import". With it, every importer the plan names is there: Wayfarer's own files, Postman, Insomnia, OpenAPI, cURL and HAR.
  - **A request per operation, in a folder per tag.** The first server is the collection's variable `baseUrl`, and every address starts with `{{baseUrl}}`; a path parameter (`/pets/{petId}`) is the variable `{{petId}}`. Query and header parameters carry the value the file gives (an example, a default, the first of an enum).
  - **A body is written for you.** A JSON body is the file's example, or a value written from the schema: each property with its example or default, and under that a value of its type. A form and a multipart form get their fields from the schema, a file part where the schema says binary.
  - **Auth from the security schemes**: an API key in a header or the query, HTTP Bearer and Basic, on the collection for the file's own `security` and on a request for an operation's. The file holds no credential, so the value is a variable to fill in (`{{apiKey}}`, `{{bearerToken}}`). OAuth 2.0, OpenID Connect and the others the app does not have are left out and said.
  - **Nothing is fetched.** A `$ref` is followed only when it points inside the file. One to another file or to an address is never requested: the importer has no code that could. What it would have described is left out, and the report names each such reference. A schema that holds itself ends there.
  - **No parser library was added** (three were measured; the plan's section 16 has the numbers): the importer is 9,591 B of the app's own code in the import worker (154,248 B with it), fetched when a file is picked, and `npm audit` still reports 0.
  - A description in YAML may be 1 MB, like every YAML file; a larger one is refused with a message that says to convert it to JSON, which may be 10 MB. A Swagger 1.x file, and a description with no operation, are refused with a message.
  - Tested with files other people wrote, at pinned commits: the Petstore as Swagger 2.0 (20 operations), OpenAPI 3.0 (19) and OpenAPI 3.1 (6), and ten of the OpenAPI Specification's own examples. Each of the twelve with operations imports with exactly as many requests as a count of its paths and methods gives.
  - The README's limitation "No OpenAPI import yet" is gone. See [`docs/import.md`](docs/import.md).

- **AWS Signature Version 4 (P4.8).** The Auth tab, and the Settings of a collection or a folder, have a new type, **AWS Signature**: an access key, a secret key, a region, a service, and a session token for temporary credentials. Before this a request to an AWS API, or to anything else that checks Signature Version 4, could not be signed here.
  - **The request is signed as it is sent**, after variables are replaced, scripts have run and the body is made. The app adds `X-Amz-Date`, `Authorization`, `X-Amz-Security-Token` when there is a token, and for S3 the body's hash. It signs the address, `Host`, those headers, `Content-Type`, your `x-amz-` headers and the body's bytes, a file's included.
  - **A multipart form cannot be signed**: the browser writes its boundary as it sends. The send is refused with a message that says so, and nothing is sent.
  - The secret key and the session token are masked in history and in an exported collection like any credential. "Copy as cURL" and the request as code carry no signature: a copied one would be refused minutes later.
  - A Postman file's `awsv4` auth and an Insomnia export's AWS IAM auth are imported as this type (both were left out with a warning before), and the Postman export writes it.
  - Held to AWS's own test suite: twenty of its cases, at a pinned commit, give the suite's canonical request, string to sign and signature. In the built app, in three browsers, the signature that arrives at a local server is computed again by other code from the request that arrived.
  - See [`docs/auth.md`](docs/auth.md), which is new and also says what the other auth types send.

- **OAuth 2.0 (P4.7, half of [#85](https://github.com/AshwinSathian/wayfarer/issues/85)).** The Auth tab, and the Settings of a collection or a folder, have a new type, **OAuth 2.0**. The app gets an access token from your identity provider, sends it as `Authorization: Bearer`, and renews it. Before this you fetched a token elsewhere and pasted it into Bearer Token.
  - **Three grants.** Authorization Code with PKCE: **Get token** opens the provider's sign-in in a window, and the app exchanges the code that comes back. Client Credentials and Password (marked legacy): the token is asked for when the request is sent. The implicit grant is not offered.
  - **The sign-in window answers only to the tab that asked.** The app takes an answer only when it carries the `state` value it made for that sign-in, and says so when it ignored one. It cannot see the window close: **Cancel sign-in** ends the wait, and so do five minutes. For the code grant, register the redirect URI the Auth tab shows (`<the app's origin>/oauth/callback`) with your client.
  - **Where the token is kept.** With the vault unlocked: as a vault secret, encrypted, listed under Manage secrets. With it locked, or with no vault: in the tab's memory only. History and every export hold `Bearer ***`, "with credentials" included, and a script is shown the mask. **Forget token** removes it.
  - **Renewal.** An expired token is renewed when the request is sent, with its refresh token when it has one; a refresh token the provider replaces is replaced here. With "On a 401, get a new token and send once more" ticked, a refused token is renewed and the request sent one more time.
  - **Token endpoints and CORS.** A token request is sent like your own request: from the page, or through the Local Bridge when it is on. Many token endpoints do not allow a browser's origin; the app then says that the endpoint sent no `Access-Control-Allow-Origin` and that the bridge has no such limit. [`docs/browser-limits.md`](docs/browser-limits.md#oauth) has what you can do.
  - "Copy as cURL" and the request as code carry no token: it is fetched when a request is sent.
  - A Postman file's `oauth2` auth, an Insomnia export's OAuth 2 auth and an OpenAPI description's `oauth2` security scheme are imported as this type (all three were left out with a warning before), and the Postman export writes it back. A token held in a file is not imported. The implicit grant is still left out, and the report says so.
  - Not checked by hand in Safari itself: the tests run in Playwright's Chromium, Firefox and WebKit, against a local identity provider, on the production build with its headers.
  - See [`docs/auth.md`](docs/auth.md).

### Changed

- **The HAR export keeps every text body, shows the file first, and takes several history entries (P4.6 c).**
  - **Fixed: a response that was text and not JSON was left out of the HAR** with the comment "omitted (size or type)": XML, HTML, CSV and plain text are in it now, as received. A JSON body is no longer re-indented either: the file has the text the server sent. A body that is not text, or is longer than 256 KB, is still left out, and the comment says which.
  - **Fixed: the file lacked two fields HAR 1.2 requires** (`cookies` on the request and the response, `redirectURL` on the response), which a strict reader refuses. A test now lists every required field.
  - **Fixed: a form, a multipart form and a file body were left out of the HAR.** A form and a multipart form are written as fields; a file is named.
  - New in a response's Export menu: **Export as HAR…**, which shows the file, with "Include credentials" to choose, before you copy or save it.
  - New in History: a box on each entry, **Select all** for what the search shows, and **Export … as HAR…** for the ticked ones in one file, oldest first. History is stored masked, so that file has credentials as `***`.
  - A HAR written here imports again as the same requests.
  - The builder is fetched the first time a HAR is asked for, and is no longer in the first load.
  - See [`docs/export.md`](docs/export.md).


- The message for a file that is not JSON is now "The file is not valid JSON, so it is not a file Wayfarer can import." for every kind of file; the Environments panel said "File does not contain a valid JSON payload."
- **Collections saved by an earlier version are removed by this update, and collection and backup files are format 3.** A stored collection, folder and request did not hold what the settings above need, so the database goes to version 10 and empties those three stores and the body files only they named. Environments, global variables, secrets and history are kept, and the page says once that collections were removed. A collection file or a workspace backup written by 2.0 or 2.1 (`wayfarer/collection/2`, `wayfarer/workspace/2`) is refused with a message that names the format; nothing converts it. This was decided while the app has no users with data to keep (it is not deployed in any 2.x version). Export a collection again to get a format 3 file.
- A pre-request script's failure now reads "The pre-request script of folder "Admin" failed, so the request was not sent." when the script is a folder's or the collection's.

- **The plan for import, export and sign-in (Phase 4) is split into three sessions.** Nothing in the app changes. The first session lets a collection and a folder hold auth, variables and scripts that their requests inherit, builds the one road by which a file is imported (a report first, nothing stored until you agree), writes the cURL command with every kind of body, generates code, and reads a pasted cURL command and a HAR file. The second brings Postman, Insomnia and OpenAPI files in, and Postman files out. The third adds AWS signatures, OAuth 2.0 and a fuller HAR export. One finding on the way: once the app has a second page (the OAuth sign-in's return page), the offline copy of the app would be replaced by it ([#235](https://github.com/AshwinSathian/wayfarer/issues/235)); nothing is wrong today, and it is fixed before that page is added.

### Fixed

- **On a phone, a history entry with a long address shows that it opens ([#264](https://github.com/AshwinSathian/wayfarer/issues/264)).** Below 768 px a history entry is a row that opens, with an arrow at its end. The address was not cut short there, so a long one pushed the arrow far outside the window (to x = 1355 in a 390 px window), and the address ended without an ellipsis. It is cut short now and the arrow stays in the row.

- **The offline app can no longer be replaced by another page of the site ([#235](https://github.com/AshwinSathian/wayfarer/issues/235)).** The service worker stored the last HTML page a navigation loaded as "the app", to show when offline. The app had one HTML page, so that was right. OAuth 2.0 brings a second, the page the sign-in window comes back to, and after one sign-in the offline app would have been that page. The service worker now leaves that page alone. Found before the page existed; nothing released was affected.

- **A vault secret works in every field of the Auth tab ([#261](https://github.com/AshwinSathian/wayfarer/issues/261)).** **Fixed: a request whose Basic username, API key name, or AWS access key, region or service was a protected variable was not sent**, with the message that its vault secret "could not be read (it may have been deleted)". The secret was there: the app looked for secrets in the password, the token and the key's value only, and never read the vault for the other fields. Nothing was sent wrong; the request was refused. Since 2.0.0.

- **A value a script sets keeps its type ([#248](https://github.com/AshwinSathian/wayfarer/issues/248)).** **Fixed: `pm.environment.set("count", 0)` was read back as the text `"0"`**, by the same script, by the next one and in the next send, so `count + 1` gave `"01"` and a test that compared with `0` failed. A number, a boolean, `null`, an object and a list are now read back as what was set, from `pm.environment`, `pm.globals`, `pm.collectionVariables` and `pm.variables`, as in Postman.
  - The value is stored as its JSON with a mark that says so (`"json": true` on the variable's row, also in an exported file). The Variables editor shows that text; a value you edit there is text again.
  - Where a request holds `{{count}}` the value goes in as its text: `0`, `false`, `null`. An object goes in as its JSON, where Postman writes `[object Object]`.
  - `null` set by a script used to be stored as empty text; it is `null` now, and `{{name}}` of it is `null`, as in Postman.
  - `postman.setEnvironmentVariable` and `postman.setGlobalVariable` do as Postman's: a value becomes text unless it is falsy.
  - All of Newman's collections that use only what the app has now give Newman's results: 17 of 17. #248 is closed.

- **A variable's name may hold any character but a brace ([#248](https://github.com/AshwinSathian/wayfarer/issues/248)).** **Fixed: `{{api/key}}`, `{{first name}}` and any other name with more than letters, digits, `_`, `.` and `-` was not replaced**, though the Variables editor let you give it a value: the request went out with the braces in it. Postman takes any name, and a collection imported from Postman may use one. What stands between braces and is not such a plain name is a variable only when you defined one with that name: a body with another language's templates (`{{ user.name | upper }}`) is sent as written, and the composer does not ask about it.

- **Three faults of Postman's older script sandbox, found by running Newman's own collections ([#248](https://github.com/AshwinSathian/wayfarer/issues/248)).**
  - **Fixed: the older `environment` and `globals` objects did not show a value the same script had just set** with `postman.setEnvironmentVariable` or `postman.setGlobalVariable`, or had cleared. They do now, as in Postman. (`pm.environment.set` does not show in them, in Postman either.)
  - **Fixed: a script with `return` outside a function ended in "return not in a function".** Postman runs a script as the body of a function, so `return` ends it. It does here too.
  - **Fixed: two parts of the older sandbox that the app does not have were not said anywhere.** `postman.getResponseCookie` now ends in an error that names the compatibility page (a page is not shown a response's cookies), and an import warns of a script that uses it. The methods the older sandbox added to arrays, numbers and functions (`['a'].none('d')`, `(56).hex()`) are listed as not supported.
  - Two more of Newman's collections now give Newman's results in the app's engine: 14, from 12.

- **The environments list can be used with a screen reader and on a phone ([#251](https://github.com/AshwinSathian/wayfarer/issues/251)).**
  - **Fixed: a row of the list was a button that held three more buttons** (Use for requests, Duplicate, Delete). That is not valid HTML, and a screen reader is not reliably told of buttons inside a button. A row now holds one button that selects the environment and the three beside it; a click anywhere on the row still selects it, and it looks the same.
  - **Fixed: an environment with a long name pushed the view past the window on a phone.** Below 1024 px the list was as wide as its longest name, so at 390 px its buttons, Import, Export and Save were off screen with no way to scroll to them. The name is now cut with an ellipsis.

- **The editor threw an error into the console some seconds after it appeared (F71, [#242](https://github.com/AshwinSathian/wayfarer/issues/242)).** `[createInstance] … depends on UNKNOWN service ICodeLensCache`, and after it the same for `IInlayHintsCache`. Monaco's JSON and TypeScript services bring every editor feature with them when they start, which is after the first editor exists, and a feature that arrives then cannot find the service it registers for itself. The editor worked; the error was in the console in every browser, and in Safari on every load. Every feature is now registered before the first editor. Nothing more is downloaded: the features were in the editor's files already.
- **A Word, Excel or PowerPoint file in a response was shown as text (F72, [#244](https://github.com/AshwinSathian/wayfarer/issues/244)).** A response whose type had "xml" anywhere in its name was decoded as text, and `application/vnd.openxmlformats-officedocument…` (a .docx, .xlsx or .pptx, which is a zip) has it in "openxmlformats". Such a response now gets the hex view and the download of its exact bytes, like any other binary. XML itself (`text/xml`, `application/xml`, anything ending in `+xml`) is text as before.
- **"Import as duplicate" could lift a folder out of its parent (F73, [#249](https://github.com/AshwinSathian/wayfarer/issues/249)).** A folder inside another lost its place, and landed at the top of the copy, whenever it stood before its parent in the file's order: a folder at place 0 inside a folder at place 1. Every importer makes its collection the same way, so a Postman file did the same.

## [2.1.0] - 2026-10-10

Scripts are back. Pre-request and post-response scripts were switched off
in the hosted app since 1.1; they now run in every build, in a sandbox that
is a JavaScript engine of its own, with Postman's `pm` API, the older
`postman.*` globals and five libraries. What works is listed row by row in
[`docs/postman-compatibility.md`](docs/postman-compatibility.md), and each
row is a test.

Nothing stored changes shape in this version. A collection saved before it
has no list of approved scripts yet, so its scripts wait for one review.

The size limits of the page were reset to what it measures now: 1,225,230 B
(310,823 B gzip), 15,433 B more than 2.0.0, for what scripts need of the
page itself. The engine (503 kB) and the libraries are fetched only when a
script runs.

### Added

- **Scripts run again, in every build, the hosted app included.** Pre-request and post-response scripts were switched off in production since 1.1: the old sandbox evaluated them with `new Function`, which the site's Content-Security-Policy forbids, so they failed without a word ([#58](https://github.com/AshwinSathian/wayfarer/issues/58)). They now run in QuickJS, a JavaScript engine compiled to WebAssembly, in its own worker. The browser never evaluates a script's text. The API is the one that was documented: `pm.environment`, `pm.response`, `pm.test`, the small `pm.expect`, `console`; new are `atob`, `btoa` and `setTimeout`.
- **The sandbox is an allow-list.** The engine's global object holds the JavaScript language and those names. There is no `fetch`, no `XMLHttpRequest`, no `WebSocket` and no worker scope inside it to remove, and a new browser API cannot appear there.
- **Limits.** A script is stopped after 5 seconds, at 64 MB, and when it recurses too deep (about 700 to 1,500 calls, depending on the browser), each with its own message; the next script runs in a new engine. The 64 MB is the size the engine's own memory may reach: the engine's built-in limit turned out not to count what a script allocates, and under it a script could take 2 GB ([#220](https://github.com/AshwinSathian/wayfarer/issues/220), found and fixed before any release).
- The engine (about 500 kB) is fetched the first time a script runs, not with the page, and is kept for offline use after that.
- **Postman's `pm` API in scripts.** `pm.environment`, `pm.globals`, `pm.collectionVariables` and `pm.variables` (`get`, `set`, `unset`, `has`, `toObject`, `replaceIn`, `clear`); `pm.request`, which a pre-request script can change before it is sent (method, address, headers, a text or form body); `pm.response` with `pm.response.to.have.status(...)`, `.header`, `.body`, `.jsonBody` and `.to.be.ok`, `.success`, `.error`; `pm.info`; and `pm.expect`, which is now Chai's `expect`. What Postman has and Wayfarer does not (`pm.cookies`, `pm.visualizer`, `pm.vault`) says so by name when a script calls it.
- **Scripts written for Postman's older sandbox run as they are:** `postman.setEnvironmentVariable` and its siblings, `postman.getResponseHeader`, `tests["name"] = true`, `responseBody`, `responseCode`, `responseTime`, `responseHeaders`, `request`, `environment`, `globals`. A collection of ten such requests gives the same 30 test names and results in Wayfarer as in Newman, Postman's own runner, and a test holds it to that.
- **`pm.sendRequest`.** A script can make a request, for example to fetch a token before the request that needs it. The script engine still has no network: the script asks the app, which sends the request the way it sends yours (no cookies, no cache, no `Referer`, your timeout, the Local Bridge if it is on). At most 10 per run. `pm.sendRequest` never reads the vault: a request that holds a secret's reference is refused and nothing is sent. Each one is a line in the console.
- **What approving a script means is now written down** (`docs/scripts.md`, Trust Center): a pre-request script can change where your request goes (`pm.request`, or a variable the address is built from), and the request carries its secrets there. The sandbox keeps a script away from the browser, not away from the request you let it run beside. Read a script before you trust it.
- **`require` in scripts**, for the libraries Postman scripts use most: `chai`, `crypto-js` (4.2.0), `lodash`, `moment` and `uuid`, and `atob` and `btoa` by that road too. A library runs inside the engine like the script that asks for it, and can reach nothing more. Each is a file of its own (11 to 75 kB), fetched the first time a script names it and kept for offline use; the page itself did not grow. In `crypto-js`, MD5, SHA-1, SHA-256, the two HMACs and the UTF-8, hex and base64 encodings are computed by the app instead of the interpreter, with the same results. Any other module is refused by name: `WayfarerUnsupportedError: require('xml2js') is not supported`. The licences of the five are in `/3rdpartylicenses.txt`.

- **A post-response script sees the request as it was sent.** `pm.request` (and the older `request`) in a post-response script used to be the request as you composed it, `{{variables}}` and all. It is now what went out: variables replaced, the Auth tab's header among the headers, the address the request went to. A vault secret in it reads `***`.
- **A script can set a protected variable without unprotecting it.** `pm.environment.set` on a variable that is a vault secret used to replace the variable's reference with the new value as plain text, in the environment. The value is now encrypted into the same secret and the variable stays protected, so a script that refreshes a token can keep it in the vault. With the vault locked the change is refused and the console says so. A script's value is never stored in place of a protected variable's reference, also when another tab protected the variable a moment before.
- **A list of what works of Postman's script API:** [`docs/postman-compatibility.md`](docs/postman-compatibility.md), 123 rows (79 supported, 27 partial with a note that says what differs, 17 not supported). It is written from the tests themselves, one per row, and CI fails when the two differ, so it cannot say more than the app does. The README's "small `pm` subset" line and its known-limitation bullet ([#77](https://github.com/AshwinSathian/wayfarer/issues/77)) are gone. An error such as `pm.cookies.get() is not supported — see docs/postman-compatibility.md#pm-cookies` now points at a section that exists.
- **Scripts are fast enough, and a test keeps them so.** A script that signs a 1 KB text with `CryptoJS.HmacSHA256`, parses a 1 MB JSON response and runs 50 `pm.test` assertions takes about 40 ms (36 ms in Chrome, 43 ms in Firefox, 40 ms in Safari's engine, on a laptop); the first script of a session, with the engine and two libraries downloaded, about 80 to 140 ms. CI fails if that script ever needs more than 300 ms there.
- **How long each part of a send took**, on one line in the Tests tab when a script ran: `Pre-request script 12 ms · Request 340 ms · Post-response script 8 ms`. The request's own time was already measured without the scripts; now theirs is shown beside it.

### Security

- **The app asks before a script sends a secret to another host.** When the pre-request script of a send has moved the request to another host (by `pm.request.url`, or by a variable the address is built from) and the request uses a vault secret, a dialog names both hosts before the vault is read. "Don't send" sends nothing and puts back the variables that script set, and the old value of a vault secret it replaced, so sending again asks again. This compares one send: a host that an earlier script stored in a variable is not asked about, and `docs/scripts.md` says so. Reviewing a script before you trust it remains the control.
- **Scripts that came from somewhere else wait for you.** The scripts of an imported collection, of one restored from a backup, and of a history entry no longer run when the request is sent. The Scripts tab says so and offers a review: every script of the collection in one read-only view, and "I trust these scripts". The collection then keeps the SHA-256 of each script you approved, and a script runs only if its own digest is there, so a later import that changes one makes it wait again. Scripts you write and save in a collection you made run as before. Saving a script you have not reviewed does not approve it ([#98](https://github.com/AshwinSathian/wayfarer/issues/98)).
- **The sandbox is tested by trying to get out of it.** A suite of escape attempts runs from inside a script in Chromium, Firefox and WebKit, under the production headers: every road to the global object, every network API, dynamic `import()`, a forged result, and changes to built-in objects. The browser makes no request while a script runs ([#59](https://github.com/AshwinSathian/wayfarer/issues/59)).
- **What a script writes is masked like history is.** A vault secret or a credential of the request reads `***` in a script's console output, test names, messages and errors, also when the server sent it back and the script read it from the response. A variable a script sets after the response cannot take a vault secret out of the vault: the secret is masked in the value that is stored.
- A collection saved before this change has no list of approved scripts yet: its scripts wait for one review. Nothing stored was removed.
- The Content-Security-Policy gains one keyword: `script-src 'self' 'wasm-unsafe-eval'`, so that the engine can be compiled. `eval`, `new Function` and inline script stay forbidden, and a test asserts the directive is exactly that.

### Fixed

- A script that never ended inside a promise or an `async` function was stopped after 5 seconds without a word: no failed row, no message ([#225](https://github.com/AshwinSathian/wayfarer/issues/225)). It now says "Script timed out after 5000 ms" like any other.

- A script that failed left no trace: a syntax error, a name that does not exist or a timeout, and the request went out as if it had no script ([#213](https://github.com/AshwinSathian/wayfarer/issues/213)). The Tests tab now shows a failed row with the error.
- A script's `console` output went nowhere, though the docs said the Tests tab showed it. It does now, under "Console": up to 1,000 lines and 1 MB.

### Changed

- **A pre-request script that fails stops the send**, as in Postman. Until now the request went out anyway, without whatever the script was meant to add: a signature, a token. Now nothing is sent; the Tests tab opens with the tests that ran before the error, the error and the console. A `pm.test` that fails is not an error and does not stop the request.
- **Scripts written for the earlier `pm` subset may need three small changes**, all to match Postman: `pm.expect(x).to.be.ok()`, `.null()` and `.undefined()` are written without the call (`.to.be.ok`); `pm.environment.get` of a name that has no value gives `undefined`, not `null`; and `pm.response.json()` throws when the body is not JSON instead of giving `null`. `pm.environment.set(name, "")` now stores an empty value; use `unset` to remove a variable.

- **The plan for scripts (Phase 3) is split into two sessions.** Nothing in the app changes. The first session rebuilds the sandbox: scripts on a QuickJS engine under the site's strict policy, a review step before a collection's scripts may run, limits on time and memory, and a test suite of escape attempts. The second adds the Postman-compatible script API. One finding on the way: a script's console output and its error were never shown ([#213](https://github.com/AshwinSathian/wayfarer/issues/213)); it is hidden today because scripts are disabled, and is fixed with the new sandbox.

## [2.0.0] - 2026-10-10

The second major version: one request model stored in a new shape, secrets
that reach the wire and nowhere else, a vault with one data key, history
that masks credentials, every body type and response type, and a composer
that says what the browser will do.

**Data and files from 1.x are not carried over.** Wayfarer 2 does not
convert what an earlier version stored; it removes it the first time it
opens and says so once. This was decided while the app had no users with
data to keep. What each database version removed on the way to version 9:

| Database version | Removed by its upgrade |
|---|---|
| 5 | Everything an earlier version stored: collections, folders, requests, environments, secrets and history |
| 8 | Secrets (the vault now encrypts under one data key) |
| 9 | History (an older entry held `Authorization` as it was sent) |

Versions 6 and 7 removed nothing. A collection or environment file
exported by 1.x has no `$id` and is refused on import. Nothing is backed up
before the upgrade; if you have data in 1.x that you need, export it there
first and re-create it by hand.

### Breaking

- **Data saved by earlier versions is removed.** Wayfarer now stores
  requests, environments and collections in a new shape (database version
  5) and does not convert the old one: the first time this version opens,
  collections, folders, requests, environments, secrets and history from
  an earlier version are deleted, and the page says so once. Nothing is
  backed up. This was decided while the app has no users with data to keep.

- **History saved by earlier versions is removed.** History now keeps
  credentials masked (database version 9). An entry of before held the
  headers as they were sent, `Authorization` included, so the first time
  this version opens, history is deleted and the page says so once.

- **Exports and copies mask credentials.** **Copy as cURL**, **Copy as
  HAR** and a collection's **Export** now write `***` where a credential
  was. Each has a "with credentials" twin beside it for when you need
  the real values. A vault secret is masked in both.

- **A request with a `{{variable}}` that has no value is not sent** until
  you choose **Send anyway**. It was sent with the text `{{variable}}` in
  it. Settings can switch this back.

- **Secrets saved by earlier versions are removed.** The vault now
  encrypts every secret under one data key (database version 8) and
  cannot read secrets that each had a key of their own. The first time
  this version opens, stored secrets are deleted and the page says so
  once; collections, environments and history stay. A variable that used
  a removed secret keeps its reference and needs its value again.

- **Collection and environment files from earlier versions no longer
  import.** A file now starts with `"$id": "wayfarer/collection/2"` (or
  `wayfarer/environments/2`), and a file without it is refused with that
  reason. Export again from this version.

### Added

- **The response is shown by its type.** JSON is formatted as before; XML
  is indented; an HTML response opens as a preview of the page; an image
  is drawn; any other binary body is a hex dump (its first 64 KB) with the
  download beside it. A list above the body switches the view, so an HTML
  or XML body can always be read as the text that was sent. Before, HTML
  and XML were plain text and a binary body could only be downloaded.

- **The HTML preview cannot do anything.** It is drawn in a frame with no
  permissions: the page's scripts do not run, it loads nothing from the
  network (images, styles and fonts on other sites stay blank), and
  clicking a link or a button does nothing.

- **Filter a JSON response by path.** Type `data.items[*].id` above the
  body to see only that part; `[*]` takes every item of a list. Ctrl+F
  (Cmd+F on a Mac) inside the body opens the editor's find.

- **JSON over 5 MB opens as plain text**, with a note; choose JSON to
  format it anyway.

- **The Headers tab says when headers are missing.** A response from
  another origin shows only the headers a browser lets a page read; the
  tab now says so. A header sent twice is listed twice.

- **The composer says what the browser will do to your request.** A browser
  silently drops headers a page may not set (`Cookie`, `Host`, `Origin` and
  others), asks the server for leave before many requests (a CORS
  preflight), and blocks `http://` addresses from an HTTPS page. Under the
  address bar, **What the browser does to this request** now says which of
  these applies before you send, names each header that will not arrive,
  and lists what the browser adds and what Wayfarer leaves out (`Referer`,
  cookies). With the Local Bridge on it says what the bridge changes.
  `docs/browser-limits.md` explains each item. Before, a `Cookie` header
  you typed simply never arrived.

- **Workspace backup and restore.** Settings, **Back up**, writes every
  collection, request, environment, the global variables and the vault
  (still encrypted) to one file, with history if you tick it; **Restore**
  replaces what is stored with a file's content after checking all of it.
  Restored collections are untrusted until approved, like any import.
  Before, only single collections and the environments could be exported
  (#74).

- **A reminder to back up** when the last backup is more than 14 days
  old, with **Not now**.

- **Wayfarer asks the browser to keep your data** the first time you save
  something, and Settings says what the browser answered and how much
  space is used. In Safari, Settings also explains that Safari deletes a
  site's data after seven days without a visit and how installing the app
  prevents that (#73).

- **Environment export asks about protected variables.** They are left
  out by default: the file has no secret and no reference to one. It
  wrote the references before, which pointed at nothing on another
  machine. You can instead include the references with the encrypted
  vault beside them, or write plain text after typing a confirmation
  (#74).

- **Vault secrets work in requests.** A protected variable is sent as
  its value when the vault is unlocked. If the vault is locked, the
  passphrase is asked for first; close that dialog and nothing is sent.
  A secret's `{{$secret.…}}` reference is never sent. Before, a request
  that used a protected variable was always refused (#60).

- **Nothing stored or copied holds a secret.** Every vault secret and
  credential of a request is masked in history, in **Copy as cURL** and
  **Copy as HAR**, also where the server sent it back, and also when it
  arrives percent-encoded, JSON-escaped or inside base64 (as in Basic
  credentials). Before, history kept `Authorization` in plain text (#71)
  and a collection export wrote auth fields as typed (#72).

- **History keeps more, and less of it.** An entry now holds the request
  as you composed it (variables not resolved), what was sent, and the
  response: status, headers and a text body up to 1 MB. Opening an entry
  shows that response again. History keeps the newest 500 entries
  (Settings, **History size**), where it grew without limit, and
  **Keep response bodies in history** switches the bodies off.

- **Search history** by URL, method or status.

- **Change the vault passphrase.** Secrets, **Change passphrase**. The
  old passphrase stops working at once and no secret is re-encrypted.
  Before, the passphrase could not be changed at all (#66).

- **The vault locks itself** after 15 minutes without a key press or a
  click. Settings, **Lock the vault when idle**, takes 1 to 240 minutes,
  or 0 for never. **Locking in one tab locks every tab.**

- **Vault file.** Secrets, **Export vault** writes every secret, still
  encrypted, to a file that opens with the vault's passphrase; **Import
  vault** reads one into this vault. See
  [`docs/secrets.md`](docs/secrets.md).
- Protecting a value shorter than 6 characters warns that it is too short
  to be found and masked where a server sends it back.

- **Variables for a collection, and global variables.** A collection has
  its own variables (right-click it, **Variables**) and there are global
  ones (**Global variables** in the Environments panel). `{{name}}` takes
  the active environment's value, then the collection's, then the global
  one. Before, only the active environment had variables.

- **A variable's value may use other variables**, up to 10 deep: with
  `url` set to `https://{{host}}/v1`, `{{url}}` is the whole address.
  Variables that refer to each other in a circle are not sent, and the
  composer says which.

- **Dynamic variables**: `{{$guid}}`, `{{$randomUUID}}`, `{{$timestamp}}`,
  `{{$isoTimestamp}}`, `{{$randomInt}}` and `{{$randomAlphaNumeric}}` give
  a new value on every send. See [`docs/variables.md`](docs/variables.md).
- A collection file now holds the collection's `variables`, and a file
  without that field is refused. Stored collections keep their data: the
  database moves to version 7 and each collection gets an empty list.

- **Two tabs stay in step.** A collection, a request, an environment or a
  history entry saved in one tab appears in the other within a second;
  before, the other tab showed it only after a reload.

- **Any HTTP method.** The method is a field you can type in (`PURGE`,
  `PROPFIND`, `REPORT`, …), with the seven common ones in the menu beside
  it. What you type is sent in upper case. It was a list of seven.
  `CONNECT`, `TRACE` and `TRACK` are not sent from the browser, which
  refuses them, and the page says so; the Local Bridge can send them.
  A collection file may hold any such method.

- **Body types.** The Body tab now offers **None**, **Raw** (JSON, text,
  XML, HTML or JavaScript, sent exactly as typed), **Form (URL-encoded)**,
  **Multipart** (text fields and files) and **Binary file**. Before, a body
  could only be a JSON object. `Content-Type` follows the body type unless
  you set the header yourself. A file can be 50 MB at most; saved with a
  request, it is kept in this browser and deleted with the request.
- The Body tab is there for every method except `GET` and `HEAD` (it was
  there for `POST`, `PUT` and `PATCH` only), and the body is kept when you
  change the method.

- **Bulk edit** on the Headers tab: the headers as text, one `Name: value`
  per line, for pasting a block of them. A line that starts with `#` is
  kept without being sent.
- Each header row has a switch for whether it is sent.

- **Header rows are saved as rows.** A saved request keeps its headers in
  the order you wrote them and keeps a name that appears twice. Before,
  headers were saved as one value per name. Environment variables are
  saved the same way. A file may also mark a row as switched off: it is
  kept and not sent (the composer has no switch for it yet).

- **The body is saved as text**, as it is written, where it used to be
  saved as a parsed JSON value.
- When Wayfarer is updated while it is open in another tab, that tab says
  "Wayfarer was updated in another tab — reload" (it used to say the data
  had been reset). When an old tab is holding the data, the new one says
  "Close other Wayfarer tabs to finish the update" and carries on when they
  are closed. A tab running an older Wayfarer than the stored data says
  that, where it used to say the browser was blocking storage.
- An imported collection is marked as not yet trusted to run scripts.
  Scripts are still switched off in every build, so nothing changes yet.

- **Cancel.** While a request is in flight, **Send** becomes **Cancel**;
  pressing it stops the request at once. There was no way to stop one.

- **Request timeout**, under Settings, Network: the milliseconds after which
  a request is given up, with "Timed out after N ms" in place of a
  response. The default, 0, waits for as long as it takes, as before.
- A redirected request says so: "Redirected to" and the address the
  response came from, beside the status.

### Changed

- **Size budgets reset.** The first load is 1,209,797 B (306,352 B
  gzipped): 58,068 B more than 1.4.0 (1,151,729 B), for the vault,
  masking, history, backup, the response viewers, the HTML preview and
  the browser notes. The limits are that
  measurement times 1.05 and 1.10: 1270 kB (warning) and 1330 kB (error),
  and 336,900 B gzipped.

- **The Basic / JSON switch is gone.** A JSON body is edited as text (it
  was also editable as rows, which could only hold text values: a row
  holding `42` was sent as `"42"`). Headers are edited as rows or with Bulk
  edit (the JSON view could not hold a header twice, or their order).
- A new request no longer starts with a `Content-Type: application/json`
  header row, and a request sent with no body no longer sends `{}`.
- Variables in a raw body are filled in as text, wherever they stand:
  `{"n": {{count}}}` is now sent as `{"n": 3}`.
- History keeps a text body as the text that was sent. A file or a
  multipart body is not copied into history.
- A file or multipart body cannot go through the Local Bridge yet; the
  request says so and is not sent.
- The initial download is 1,122.70 kB (282.11 kB compressed), down from
  1,134.07 kB: the two editors that went were larger than the body types
  that came. The size budgets are reset to the new measurement.

- **Requests are sent with the browser's `fetch`**, and carry nothing of
  Wayfarer's own: no `Referer`, no cookies, no cached answer. `Accept` is
  what you set, or `*/*`; it used to be `application/json, text/plain, */*`
  whenever you set none.

- **The duration no longer includes a pre-request script's time.** It is
  measured around the request alone.
- A response body over 50 MB is offered as a download and not read into
  the page.
- The initial download is 1,134.07 kB (282.44 kB compressed), down from
  1,151.73 kB: Angular's HTTP client is no longer part of it. The size
  budgets are that measurement plus 10%.

- For contributors: the repository is an npm workspace, and the parts of
  Wayfarer that do not need a browser page start moving into
  `packages/core`, which a command-line runner will share later. Nothing
  changes in the app.
- For contributors: the request composer is ten small components over one
  draft of the request, where it was one 889-line component. Later work
  (body types, tabs) is added to those. Nothing changes on screen: 192
  screenshots at three widths, in both themes and three browsers, are
  identical to the previous build.

### Fixed

- **Nothing moves when a response arrives.** The status bar slid 10 px
  into place and overshot, the status badge grew and shrank, and the body
  slid up, for about a third of a second. A press on **Export** or on a
  tab in that moment could land beside it and do nothing. A response now
  fades in where it is; so does a tab's content when you switch tabs, and
  the composer's sections on a phone when the page loads
  ([#119](https://github.com/AshwinSathian/wayfarer/issues/119)).

- **The composer keeps its tab when the window is resized.** Making the
  window narrower than 768 px and wide again put the composer back on
  Headers, whatever tab was open, and on a phone-sized window the section
  that opened was Headers instead of the one you were in
  ([#177](https://github.com/AshwinSathian/wayfarer/issues/177)).
- A test on the response body could find things that are not in the body:
  `Body.constructor exists` passed for any JSON object. A path now reads
  only what the JSON holds
  ([#207](https://github.com/AshwinSathian/wayfarer/issues/207)).

- **A wrong vault passphrase is always refused.** With no secret stored
  yet, any passphrase "unlocked" the vault, and a secret saved then was
  encrypted under whatever had been typed. The passphrase you choose is
  now the vault's from the moment you choose it (#66).

- **Two tabs no longer overwrite each other's environment variables.**
  Saving an environment wrote all of its variables as the tab had them, so
  a variable another tab had added since was lost. A save now writes only
  what you changed (#94).

- A JSON body that is an array, a string or a number can be written and
  is sent as written (#65).
- With a multipart body, a `Content-Type` header of your own is flagged:
  it replaces the one that names the boundary between the parts.

- Exporting a collection wrote each request's assertions sorted by their
  internal id, so they came back in a different order. They keep the order
  you gave them (#182).
- Opening a saved request whose body is a JSON array turned the body into
  an object with the keys `0`, `1`, …, and saving wrote that back. A body
  that is not an object is now left as it is (#183).
- A header named `__proto__` is sent, and appears in **Copy as cURL**. It
  was silently left out of both.

- **Environments editor.** Editing a variable removed a row you had just
  added and not named yet. Opening an environment that came from a file
  switched its switched-off variables back on and dropped the first of two
  variables with the same name, and the next save stored that. Rows now
  change only where you change them; the JSON view shows the variables in
  use (#188).
- Deleting a folder that had folders inside it (from an imported file)
  left them attached to a folder that no longer existed, and an export
  wrote that. They now move up one level (#190).
- After two tabs saved the same environment at the same moment, one of
  them could go on showing its own copy without the other tab's variable
  until something else changed. It now shows what is stored (#195).
- A tab told that its data was reset in another tab no longer tries to
  read the stores when that other tab writes again; it logged an error
  each time (#192).

### Security

- The Content-Security-Policy now allows `blob:` images and `blob:`
  frames, for the image and HTML previews; a frame can show nothing else.
  `frame-ancestors` changed from `'none'` to `'self'`: Safari applies that
  rule to the preview's own frame, so `'none'` left the preview blank
  there. No other site can put Wayfarer in a frame, as before.

## [1.4.0] - 2026-10-09

Everything merged after 1.3.0: the interface moves to Angular Material, the
layout holds from 360 px up, and a round of security and robustness fixes.
No stored data changes.

### Changed

- **The interface is built on Angular Material**, themed from Wayfarer's
  own design tokens so the look stays the same in both themes: tooltips,
  buttons, tabs, accordions, the Basic / JSON switch, selects, menus,
  dialogs and confirmations, drawers, the collections tree, text fields,
  checkboxes, the toolbar and the busy spinners. A tooltip now sits about
  4 px further from its button. What Material has no component for stays
  the app's own: the resizable split, the history details card, loading
  skeletons, and the variable chips. The initial download grows to
  1,155.22 kB from 722.84 kB (288 kB from 199 kB compressed); the size budgets
  are reset to the new baseline.
- At this release the initial download measures 1,151.73 kB (287.42 kB
  compressed), 3.49 kB below the figure above, after unused styles were
  removed. The size budgets are that measurement plus 10%.
- The tick box beside each query parameter is drawn like the app's other
  checkboxes and has a name for screen readers. It was the browser's own,
  unnamed.
- In the collections tree a letter key jumps to the next row that starts
  with it, and `*` opens every folder beside the current row.
- The page behind an open drawer can still be scrolled with the wheel. It
  was held still.
- 160 lines of styles nothing used are gone (old panel, segmented-control
  and status-bar classes, five animations). The initial download is 3 kB
  smaller.
- Fifteen design tokens and five text-size classes nothing read are gone
  (spare shadows, glows, gradients and the largest heading sizes). Nothing
  on screen changes; the stylesheet is 1.7 kB smaller.

- **Selects follow the native one's keys.** Enter or Space opens the list.
  An arrow key or a letter on a closed select changes the value straight
  away; it used to open the list.
- The text in a select starts 12 px from its edge. It touched the border.
- **Folder (optional)** in Save to Collection is cleared by choosing
  **No folder** from the list. It had a small clear button.

- **Import** under Settings, Environments, is a real button: it can be
  reached and pressed with the keyboard. It was a label around a hidden
  file field.
- The roadmap (`PLAN-airtight-remediation.md`) describes the code as it is
  today: its first section says what is done, what is merged but not
  released, and what comes next. It still described the app as it was
  before 37 later changes.
- Tailwind CSS 3 to 4. Its configuration is now the `@theme` block in
  `src/styles.css`; `tailwind.config.js` and autoprefixer are gone. One thing
  looks different: cards and panels whose markup asked for a border
  (`border border-separator`) now have it. With Tailwind 3 and its reset
  switched off, those borders had a width but no style, so they never drew.
- `npm audit` reports no known vulnerabilities.
- **First load is about 27% smaller** (716 kB instead of 983 kB; 198 kB
  instead of 241 kB compressed). The Monaco editor's stylesheet was part of
  the first download; it now loads with the editor. The size budgets are
  tightened to match.
- Monaco editor 0.54 to 0.57. Only what the app uses is bundled: the JSON
  service and the TypeScript service. The CSS and HTML language services and
  their two workers (1.8 MB) are gone. Scripts now have JavaScript syntax
  colouring.
- `/3rdpartylicenses.txt`, the licence texts of every bundled package, is
  served with the app. The build wrote it one folder above what is deployed,
  so the notices the MIT and Apache licences require did not ship. It now
  also covers what Monaco bundles (DOMPurify, marked).
- Playwright 1.64, wrangler 4.149, knip 6.39, axe 4.13. `npm audit` is down
  from 16 findings to the 9 that come with Tailwind 3 at build time.
- Leftovers of the Angular 22 upgrade are gone: `standalone: true`,
  `styleUrls`, `withInterceptorsFromDi()` (there are no DI interceptors),
  `fullTemplateTypeCheck` and `useDefineForClassFields: false`. The app now
  registers `provideBrowserGlobalErrorListeners()`, as a new Angular 22 app
  does, so uncaught errors and unhandled rejections reach `ErrorHandler`.
- `tsconfig.json` matches what `ng new --strict` writes: `noImplicitOverride`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `isolatedModules`, `module: preserve` and
  `strictInputAccessModifiers`. Web workers compile against ES2022, like the
  app, instead of ES2018.
- `favicon.ico` lives in `public/`; the empty `src/assets` folder is removed.
- Code follows more of the Angular style guide: `host` metadata instead of
  `@HostListener`, `[class]` bindings instead of `ngClass`, single imports
  (`NgTemplateOutlet`, `DatePipe`, `JsonPipe`) instead of `CommonModule`, and
  lifecycle hooks that are not `async`.
- Lint is type-aware and fails on a dropped promise
  (`no-floating-promises`, `no-misused-promises`), a component that is not
  `OnPush`, `@HostListener`/`@HostBinding`, a signal used without calling it,
  and an `async` lifecycle hook.
- Files and classes are named as the Angular style guide now asks: no
  `.component`, `.directive`, `.service`, `.util` or `.models` in file names,
  and no `Component`, `Directive` or `Service` at the end of class names
  (`collections-sidebar.ts`, `CollectionsSidebar`). Services are named for
  what they do: `MainService` is `HttpTransport`, `CollectionsService` is
  `CollectionsStore`. `ng generate` produces these names without overrides.
  `CLAUDE.md` and `CONTRIBUTING.md` state the rules.
- Checks for environments the app cannot run in are gone (`typeof window`,
  `typeof Worker`, three copies of a `structuredClone` fallback). On a
  plain-http page the vault now says it needs https or localhost.
- `CLAUDE.md` and `CONTRIBUTING.md` carry the rules for styling and layout,
  Monaco, dependencies and the bundle, and the Local Bridge.
- A database upgrade that fails part-way is rolled back, so the database
  keeps its old version instead of a half-applied schema.
- Identifiers come from one `newId()` helper. Seven copies with a
  `Math.random()` fallback are gone; where `crypto.randomUUID` is missing
  (a copy served over plain http) it uses `crypto.getRandomValues`.

### Fixed

- For contributors: an end-to-end run no longer also runs the two support
  servers' own test suites. Playwright picked them up by file name and ran
  them inside every collection, outside its report.
- For contributors: the layout tests also run at 390 px, the phone width
  at which the header was once wider than the screen.

- **Text meets the 4.5:1 contrast minimum in both themes, on every view.**
  In the light theme the green of a 200 was 1.85:1 on its badge and the
  orange of a warning 1.83:1; method badges, the label on a primary button
  (2.98:1 in the dark theme) and small labels in the history drawer were
  also under it. Primary buttons are now the brand indigo.
- The list of response headers can be scrolled with the keyboard.

- **The URL field can be typed in on a small laptop or tablet.** Between
  768 and about 1000 px wide, with the sidebar open, the field shrank to a
  16 px sliver beside its buttons. The buttons now move to the next line
  when there is no room for both.

- **The app is usable on a tablet and in a narrow window.** From 768 to
  1199 px wide the collections sidebar stayed pinned open. At 820 px that
  left the request and the response about 150 px each: a header's name
  field was 20 px wide and a JSON response wrapped at every character. At
  1024 px the Scripts tab was cut off and a header read "Content-" and
  "applicatio". Below 1200 px the sidebar now opens over the page from the
  toolbar button, as it does on a phone, and starts closed.

- **Switching to the light theme no longer hides "No environment".** The
  text in the toolbar's environment box stayed white on the light toolbar
  for half a second after the switch.

- **"Update available" no longer appears on a first visit.** On a slow
  machine the service worker could take the page over before the app heard
  it had installed, and the app took that first install for a new version.

- **Clear all history** shows its tooltip. The button named one, but the
  toolbar never loaded the code that draws it.
- `{{constructor}}`, `{{toString}}` and other names that exist on every
  JavaScript object no longer resolve to engine internals; like any unset
  variable, they stay as typed.
- Basic auth credentials are encoded as UTF-8 (RFC 7617), as browsers and
  curl do. Characters outside Latin-1 (`€`, `日本`) used to fail the send, and
  accented Latin-1 characters (`é`) went out as Latin-1 bytes; plain ASCII
  credentials are unchanged.
- A protected-variable placeholder inside Basic auth credentials is now
  caught before the send. Base64 hid it from the check, so the literal
  placeholder (never the secret) went on the wire.
- A body or header key named `__proto__` is sent and exported as data.
- When the browser gives the app no storage (some private windows, storage
  blocked for the site), a banner says so. The app used to carry on in
  memory without a word: history vanished with the tab, and every save of a
  collection, environment or secret failed.
- The editor's icon font is part of the offline cache.
- **Nothing runs past the edge of the window any more.** On first load the
  request card was 49 px wider than its column, so the Send button was cut
  off until a response arrived; on a phone, and beside the pinned sidebar
  below 1024 px, the whole page scrolled sideways. The app had no
  `box-sizing: border-box` rule, which every width class assumes. Below
  1024 px the toolbar now keeps lock, history and settings; secrets, the
  bridge and the theme stay reachable from Settings.
- Dark theme: the request sections on a phone were a pale grey block with
  near-black text, and the arrows of selects and the icons in menus were
  almost invisible (1.2:1). They use the theme's own surface and label
  colours now.
- The request tabs wrap instead of sliding under the Basic/JSON switch when
  the pane is narrow.

- **Test connection** in the Local Bridge settings no longer writes the
  URL being tested into the saved settings while the check runs.
- The Local Bridge answers 502 when a target's response is over 25 MB,
  instead of holding all of it in memory.
- Importing environments rejects a variable whose value is not text.
- DOMPurify, which the Monaco editor bundles, is 3.4.16 (GHSA advisories
  against 3.4.15 and earlier).
- The `C`, `N` and `Delete` shortcuts act only while focus is in the
  collections panel, as Settings says. They fired from anywhere on the page
  outside a text field.
- Editing a row in the **Params** tab rewrites only the query of the URL
  field. It used to rebuild the whole URL, which lower-cased a `{{baseUrl}}`
  host and percent-encoded a `{{token}}` value (neither resolved afterwards),
  added `https://` and a trailing slash, and dropped the rows when the URL
  did not parse.
- A query parameter whose value is a `{{variable}}` is sent once, resolved.
  It went out twice: resolved, and again as the literal placeholder.
- The vault's lock state updates everywhere at once. Views other than the
  toolbar could keep showing the previous state after an unlock or a lock.
- Locking the vault clears every secret value revealed on screen.

### Security

- Local Bridge: a request whose `Host` is not a loopback name is refused
  (DNS rebinding); the token file and its folder are set back to owner-only
  at every start; the token can come from `WAYFARER_BRIDGE_TOKEN` instead
  of the command line, and must be 16 characters or more; a wrong argument
  is an error, not a silent default.
- Responses carry `Strict-Transport-Security` (one year, this host only),
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Resource-Policy: same-origin`.
- A collection or environment file over 10 MB is refused by size before it
  is read into memory.

- **The vault derives its key with 600,000 PBKDF2 iterations** (OWASP's 2023
  minimum for SHA-256), up from 200,000. Secrets saved by an earlier version
  cannot be read; there were none in use.
- The vault passphrase is used exactly as typed. Spaces at either end were
  removed without a word.

- **Copy as cURL** no longer lets an imported collection run commands or read
  files when its output is pasted into a shell: the method is quoted unless it
  is a plain verb, and the body goes out with `--data-raw` (a body starting
  with `@` was read from a local file by `-d`).
- Importing a collection now rejects a request whose method is not GET, POST,
  PUT, PATCH, DELETE, HEAD or OPTIONS.

- **Reset all data** now also clears the Local Bridge token and every other
  `wayfarer:` setting in the browser. It cleared two keys, one of them unused.
- The Local Bridge's default allowed origins name the hosted app
  (`wayfarer.ashwinsathian.com`) instead of its old domain.
- The deploy workflow refuses a CI run that did not come from a push to
  `main`, so a pull request from a fork branch named `main` cannot be shipped.

## [1.3.0] - 2026-10-07

The app moves to Angular 22 and drops PrimeNG. Every dialog, menu, select,
tab, tooltip, tree and the split are now Wayfarer's own components, built on
the Angular CDK. Nothing about the layout or the colours is meant to change;
the differences that remain are listed in the pull request that finished the
work, with before and after screenshots.

### Changed

- **Angular 20.3 to 22.2, TypeScript 6, Vitest 5** for unit tests, with a
  coverage gate (lines of `src/app` at 70% or more; 75.8% today).

- **PrimeNG, `@primeng/themes` and `primeicons` are removed.** The first
  load is about 42% smaller (initial JavaScript and CSS, 989,854 B instead of
  1,707,095 B; 284,702 B instead of 443,272 B compressed). The size budgets are
  tightened to match.
- The Trusted Types policy no longer allows any string to become HTML.
- Keyboard use is complete in every dialog, drawer, menu, select, tab list,
  tree and the split: focus moves in, stays in, and returns; Escape closes the
  top-most thing only. In the collections tree, arrows walk it, F2 renames,
  Shift+F10 opens the menu and Alt+Up or Alt+Down reorders.
- A dialog opened from the phone navigation drawer is no longer clipped to the
  drawer.
- The split between the composer and the response can be moved with the
  keyboard and stops at its minimum sizes.
- Deploys are manual from the CLI (`wrangler versions upload`, check the
  preview, `wrangler versions deploy`); see `docs/deployment.md`. The
  `deploy.yml` and `preview.yml` workflows are removed. They had failed on
  every run since 2026-07-30 for lack of Cloudflare secrets.

### Fixed

- The history and navigation drawers could leave an invisible layer that
  swallowed every click (#111).
- Large responses were parsed on the main thread because the JSON worker was
  never bundled (#109).
- Dark "secondary" buttons were unreadable (1.03:1) and some text on
  confirmations and danger buttons was below the contrast minimum (#114).
- Copying through the clipboard fallback left keyboard focus on the page body
  (#122).
- An Escape pressed while a context menu was opening could close the drawer
  around it and leave the menu open (#125); the menu could offer the previous
  row's actions for one frame.

### Security

- **The vault derives its key with 600,000 PBKDF2 iterations** (OWASP's 2023
  minimum for SHA-256), up from 200,000. Secrets saved by an earlier version
  cannot be read; there were none in use.
- The vault passphrase is used exactly as typed. Spaces at either end were
  removed without a word.
- The content security policy is unchanged. `style-src` still needs
  `'unsafe-inline'`: Monaco writes style attributes for every line it draws,
  and Angular, the CDK and 13 template lines add inline styles. The reasons
  are recorded in `security/csp.json` and the plan.
- No `innerHTML`, `bypassSecurityTrust*` or `eval` was added.

## [1.1.0] - 2026-09-28

A September 2026 audit found features that failed without telling you and
docs that claimed more than the code does. This release fixes what can be
fixed now, disables the rest with a visible explanation, and corrects the
docs. Every finding is an issue labelled `audit-2026-09`.

### Disabled

- **Scripts in production builds**, including the hosted app. The sandbox
  evaluates scripts with `new Function`, which the site's CSP forbids, so
  every script failed without an error. The Scripts tab shows a banner;
  Tests-tab assertions still run. Scripts return on a QuickJS sandbox (#58).

- **Sending requests that reference a vault secret.** The placeholder
  `{{$secret.<id>}}` went out literally. The request is now blocked with an
  inline error; vault resolution ships in v2.0 (#60).

- **Offline support.** The service worker faked `504 Gateway Timeout` on
  network failures, so it was replaced by Angular's safety worker, which
  unregisters itself (#63).

### Fixed

- Non-JSON responses (HTML, XML, text) show as text instead of
  `{"error":{},"text":…}`; binary responses offer a byte-exact download
  (#61, #62).
- Network failures show a network-error message with DNS/CORS guidance
  instead of a synthetic `504` or `0 Unknown Error` (#63).
- `{{vars}}` resolve in the Auth tab and at any depth of a JSON body; nested
  bodies are no longer sent as `"[object Object]"`, and numbers and booleans
  keep their types (#64, #65).
- Reset All Data reports failure when another tab blocks it, and other tabs
  show a reload banner. Each tab opened three database connections at
  startup and leaked two; it now opens one (#94).

### Changed

- Fonts are self-hosted and icons are inline SVG: no requests to Google.
  Icon-only buttons have real accessible names (#75, #90).
- README, Trust Center, security questionnaire, and the secrets, scripts,
  storage and Local Bridge docs now match the code, with Known limitations
  sections. Cloudflare is named as the static host (#70, #73, #75, #82).
- Settings shows the app version.
- CI e2e serves the build with production's headers (`e2e/support/prod-server.mjs`).

### Added

- `docs/runbook.md`: Cloudflare zone hardening, deploy secrets, npm name
  reservation.
- Tripwire e2e tests for each audit finding fixed here.

**Also in this release:** the work below landed after 1.0.0 but was never tagged.

### Added

- **Domain cutover + CI/CD**: deployed to Cloudflare (Workers with static
  assets, the currently-recommended path over the legacy Pages product,
  same CDN/edge) at `wayfarer.ashwinsathian.com`. `.github/workflows/deploy.yml`
  now auto-deploys to production on every push to `master` that CI passes
  (gated on the `CI` workflow's own conclusion, not a duplicate check).
  `.github/workflows/preview.yml` uploads a Cloudflare Workers Version for
  every PR, a real, working preview URL that never receives production
  traffic, and comments it on the PR. `api-sandbox.ashwinsathian.com` was
  never actually deployed (confirmed directly against the account before
  this change), so no redirect was needed from it.
- A Trust Center (`docs/trust-center.md`) and a pre-answered procurement
  security questionnaire (`docs/security-questionnaire.md`), so a security
  reviewer can find the data-residency, encryption, subprocessor, and
  compliance-status facts in one place instead of filing a ticket.
- `/.well-known/security.txt` (RFC 9116) for automated vulnerability-scanner
  discovery, linked from `SECURITY.md`.

- **Local Bridge** (`local-bridge/`): an optional, zero-dependency companion
  process that relays requests to CORS-restrictive or intranet-only APIs a
  browser tab structurally cannot reach. Binds to `127.0.0.1` only, gates
  every relay call on both an Origin allowlist and a persisted,
  constant-time-compared token. Run it with `npm run bridge`; enable it
  from the new router icon in the app toolbar. See `local-bridge/README.md`
  for the full security model and known limitations.
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
  empty URL), with no way to ever edit it again. `CollectionsService`/
  `CollectionsRepository`/`IdbService` gain a real `updateRequest()`, and the
  composer gets a **Save** action (icon button next to Send) that writes the
  full current state (method, URL, headers, body, auth, pre/post-request
  scripts, and tests) back to the bound request, plus a **Save to
  Collection** dialog (name + collection + optional folder picker) for a
  request that isn't bound to one yet. Closes the gap between this and the
  README's existing "saved to a Collection for later reuse" claim, which
  wasn't actually possible before this change.
- An explicit **New Request** action (icon button in the composer, and the
  previously-inert mobile sidebar button, which only closed the drawer and
  didn't touch the composer at all) that clears the form and drops any
  collection-request binding.
- Folder/collection icons in the collections tree. Previously a folder and
  a collection both rendered as plain, indistinguishable label text.
- Six more command palette (⌘K) actions: New Request, Send Request, Focus
  Address Bar, toggle theme, open History, lock/unlock secrets, open Local
  Bridge settings, Reset All Data, registered alongside the existing
  collection/folder commands. The palette previously had exactly one
  command ("New Collection").

- **A dedicated Secrets management view** (`SecretsManagerComponent`), a
  dialog matching the Local Bridge settings dialog's visual/interaction
  pattern, listing every secret across every environment in one place with
  lock-aware reveal, rename, delete, and a "locate" chip that jumps to
  wherever a secret is referenced. Previously secrets were only manageable
  as flagged rows buried inside the Environments editor, under-signposting
  the "vault" concept the first-use flow sets up. Reuses `SecretsService`/
  `SecretCryptoService`/`SecretsRepository` for all crypto and persistence;
  added the missing `listAll()`/`renameSecret()`/`deleteSecret()` aggregate
  methods to `SecretsRepository`. Registered in the command palette and a
  toolbar icon button.

- **A dedicated Settings surface** (`SettingsComponent`) consolidating the
  theme toggle, environments export/import, Reset All Data, Local Bridge
  settings, and a keyboard-shortcuts reference (a live list of every
  registered command-palette action), previously scattered across the
  toolbar and command palette with no single home. Registered in the
  command palette and a toolbar icon button.

- **A resizable split between the request composer and the response
  viewer** on desktop widths (PrimeNG `p-splitter`), replacing a
  fixed-width centered layout that left large amounts of dead canvas at
  1024–1440px+. The chosen split ratio persists across reloads.
- A `prefers-reduced-motion` convention (a CSS override plus a
  `prefersReducedMotion()` helper for the one Angular-animations-driven
  surface a media query can't reach), the app's first. Tab switches
  (composer, response viewer, environments editor, mobile accordion),
  response arrival, and dialog open/close now animate deliberately using
  the existing spring-easing design tokens, respecting that setting.

### Changed

- **Test runner migrated from Karma/Jasmine to Vitest**, running in real
  headless Chromium via Vitest's Playwright browser provider rather than
  jsdom. jsdom doesn't faithfully implement the Web Workers/IndexedDB/
  WebCrypto APIs that `script-sandbox.service.spec.ts` (the sandbox-escape
  regression suite) and several other specs genuinely exercise. All 21 spec
  files ported; `karma.conf.js` and the Karma/Jasmine dependencies removed.

- **Zoneless change detection adopted** (`provideZonelessChangeDetection()`).
  `zone.js` is now fully removed from the repo, dev and prod (confirmed
  by a 0-byte `polyfills` chunk in the production build). Zoneless CD
  flushes signal writes to the DOM asynchronously rather than
  synchronously-post-event, which surfaced one real race in an existing e2e
  test; fixed by asserting on an auto-retrying condition instead of
  chaining actions blindly, the correct pattern for zoneless UIs generally.
- Completed the signal-based Angular migration: `inject()` everywhere (0
  remaining constructor-parameter DI), and the two remaining
  `@ViewChild("editorHost")` setter-pattern queries (`json-editor`,
  `script-editor`) migrated to `viewChild()` + `effect()`.
- Split the six most oversized files in the codebase into cohesive
  services/components/utils behind their existing public APIs, so no
  consumer outside each split file needed to change. `api-params.component.ts`
  (1,174 → 868 lines: extracted `RequestSaveService`, `AuthEditorComponent`,
  and several `shared/http/*.util.ts` helpers), `collections-sidebar.component.ts`
  (732 → 572: extracted `CollectionImportService` and tree/context-menu
  utils), `response-viewer.component.ts` (649 → 432: extracted timing/export
  utils), `idb-core.service.ts` (555 → 280 + two new schema/migration
  files), `collections.repository.ts` (538 → 260 + two new per-aggregate
  repositories), `environments-manager.component.ts` (451 → 383: extracted
  `EnvironmentImportService`).
- Rebuilt the mobile composer as a strictly single-panel-at-a-time
  accordion (previously all tabs rendered simultaneously, stacked and
  unlabeled, at narrow widths) and fixed Monaco initializing inside
  zero-width containers by waiting for a resolved non-zero width before
  creating the editor instance.

### Fixed

- **Monaco's background language workers (JSON/CSS/HTML/TypeScript validation
  and completion) had never actually run in the deployed production build.**
  They were loaded via `import("monaco-editor/.../*.worker?worker")`, a
  Vite-specific dynamic-import convention that happened to work under
  `ng serve` only because Angular's dev server is Vite-based. Angular's
  production builder (`ng build`, esbuild but not Vite) doesn't implement
  that convention at all: it silently imported each worker file as an
  ordinary module with no exports, so every worker constructor resolved to
  `undefined`. Verified directly: a production build's worker imports were
  `undefined` 5/5 times, and the identical dev-mode code was a real
  constructor 5/5 times, confirmed structurally by the production bundle
  finally emitting genuine, separately-named `*-worker.js` chunks
  (`json-worker`, `css-worker`, `html-worker`, `typescript-worker`,
  `editor-worker`) after the fix, which it never had before. Found while
  chasing an unrelated CI e2e flake (below) that only reproduced against a
  cold/production environment, never a warm local dev server. Fixed by
  switching to Angular's own `new Worker(new URL(...))` syntax, the same
  builder-native mechanism `script-sandbox.service.ts`'s worker already
  uses, via five thin wrapper files under `src/app/shared/monaco/workers/`
  (one per worker; each just re-exports monaco-editor's own worker script
  so the builder has a literal, statically-analyzable entry point to
  bundle).
- A PrimeNG `ConfirmDialog` accessibility bug, live in production the whole
  time: its "headless" custom-content mode (used here for the design
  system's warning-icon styling) always auto-generates an `aria-labelledby`
  pointing at an internal header `<span>` that headless mode never actually
  renders, leaving every open confirm dialog (clear history, reset all
  data, delete secret, etc.) with a permanently dangling accessible-name
  reference for screen reader users. An existing attempted fix
  (`fixConfirmDialogAriaLabelledBy()`) was a silent no-op: its selector
  (`[data-pc-name="dialog"]`) didn't match what this PrimeNG version
  actually renders (`data-pc-name="t"`). Corrected the selector to
  `.p-confirmdialog[role="alertdialog"]` (the class axe itself reports as
  the violating node) and replaced a bare `setTimeout(fn)`, a Zone-era
  "run after this render" idiom, with `afterNextRender()`, the correct
  zoneless-safe equivalent.
- CI's e2e job now builds once and serves the static production output
  (via Python's stdlib `http.server`, no new dependency) instead of
  running `ng serve`, and three accessibility-spec timing assumptions that
  only held by coincidence under the slower dev server were hardened:
  waiting for a genuinely-open `pTooltip` to close (Playwright's `click()`
  leaves the cursor exactly where it clicked, and the toolbar's cURL button
  sits right next to Send) rather than scanning with one incidentally left
  open, and broadening a dormant-dialog-shell detector from one specific
  placeholder-comment string to the general shape (any element whose sole
  content is an HTML comment), since Secrets Manager's and Settings' own
  confirm dialogs share the same closed-shell pattern already documented
  for the pre-existing one. None of this was reproducible before switching
  off the dev server, which is exactly why it had never been caught.

- **A successful Send no longer wipes the entire composer.** `sendRequest()`
  called `resetForm()` unconditionally after every send: method, URL,
  headers, body, and auth all vanished the instant a response arrived, with
  no way to tweak a header and resend, the single most basic workflow every
  API client supports. The composer now stays exactly as composed; the new
  explicit "New Request" action is the only thing that clears it.
- Loading a saved collection request into the composer (double-click in the
  sidebar) silently dropped its auth config, pre/post-request scripts, and
  tests. The tree only ever emitted a lossy history-shaped object carrying
  method/url/headers/body. It now emits the full `RequestDoc` and the
  composer's new `loadCollectionRequest()` restores everything.
- The Send button's `styleClass="send-btn"` was silently a no-op: PrimeNG's
  `pButton` *attribute* directive (as opposed to the `<p-button>`
  *component*) never exposed a `styleClass` input, so the button had been
  falling back to the theme's default primary-button color the whole time
  instead of the intended gradient. Switched to a plain `class` binding,
  which Angular merges onto the host element regardless of directive
  support. This surfaced a real, previously-masked WCAG AA violation: the
  default primary color (`#a5b4fc`) only has a 1.99:1 contrast ratio against
  white button text (needs 4.5:1), masked in the existing accessibility
  e2e test because the send-then-clear bug above used to disable the button
  (and thus exempt it from the contrast check) immediately after every send.
  `--gradient-accent`'s start stop is now a darker `#405DD0` (was `#4C6EF5`,
  itself only 4.32:1) so the button clears AA at every point along the
  gradient.
- The disabled "Copy as cURL" button rendered as an indistinguishable empty
  box. Wrapped in a non-disabled span carrying a tooltip explaining why it's
  disabled and a real `not-allowed` cursor (disabled native `<button>`s
  ignore author `cursor` in most browsers). Surfaced a real pre-existing
  bug while wiring this up: `ApiParamsComponent` had no `styleUrls` at all,
  so `api-params.component.css` was dead code.
- A real `@defer (on viewport)` reliability gap: its `IntersectionObserver`
  trigger could be missed entirely under rapid viewport/tab churn,
  permanently stranding a Monaco JSON editor on "Loading editor…" even with
  a genuinely non-zero-width container. Reproduced concretely with an
  instrumented Playwright script, not guessed at; fixed with an
  `on timer(400ms)` fallback trigger (OR semantics) on both Monaco-hosting
  `@defer` blocks.
- A pre-existing accessibility-test timing flake: the a11y suite scanned
  for violations immediately after the response status badge's text
  appeared, which could catch the duration/size pills mid-`animate-fade-in`
  transition, where interpolated opacity temporarily dropped their
  effective text contrast below 4.5:1 even though the token itself is
  5.31:1 at rest. Fixed by waiting for the animation to settle before
  scanning, instead of a transitional frame.
- A tooltip color-contrast bug the new cURL-button tooltip surfaced
  (`--label-secondary` on `--canvas-overlay` measured 4.27:1); switched to
  `--label-secondary-on-fill`.

## [1.0.0] - 2026-07-21

**This project has been renamed from "API Sandbox" to "Wayfarer."** Same app,
same local-first storage model, same MIT license: only the name and visual
identity changed. We're saying this out loud rather than treating it as a
cosmetic footnote. The whole point of this project is that nothing about how
your data is stored or who can gate access to it should ever change without
you being told plainly.

### Changed

- Renamed the project "API Sandbox" → "Wayfarer" across the app UI, docs,
  package metadata, build/CI configuration, and the GitHub repository. The
  physical IndexedDB database name, and the collection/environment export
  schema `$id`s, are intentionally left unchanged (renaming them would force
  a lossy data migration or break already-exported files against a domain
  that isn't live yet); see `docs/storage.md` for the full reasoning.
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
  (`.github/workflows/ci.yml`: lint, unit test, production build with
  budget enforcement, plus the e2e job above), and `.github/dependabot.yml`
  (weekly npm + GitHub Actions updates).
- `docs/scripts.md` documenting the real, verified `pm.*` scripting API
  surface and the current script-sandbox isolation model (including its
  known limitation; see the Security section below).
- README badges (build status, license, coverage placeholder).

### Documentation

- Reconciled the product roadmap doc: removed the "destroy this file"
  instruction and marked the shipped scripts/assertions rows as done in its
  competitive gap table.
- Rewrote `README.md` for the Wayfarer identity: removed stale NDJSON export
  claims (the feature was never shipped), brought the feature list current
  (scripts, assertions, history drawer, secrets vault, command palette), and
  linked the new CONTRIBUTING/CODE_OF_CONDUCT/SECURITY docs.

### Security

- **The vault derives its key with 600,000 PBKDF2 iterations** (OWASP's 2023
  minimum for SHA-256), up from 200,000. Secrets saved by an earlier version
  cannot be read; there were none in use.
- The vault passphrase is used exactly as typed. Spaces at either end were
  removed without a word.
- Pre/post-request scripts now execute inside a dedicated Web Worker
  (`script-runner.worker.ts`) instead of via `new Function()` on the main
  thread, closing a sandbox-escape gap where a script could re-acquire
  `fetch`/`document`/etc. as a language primitive regardless of
  name-shadowing. The worker realm has no `window`, `document`, cookies,
  `localStorage`, or main-thread memory access by construction, and the
  worker additionally strips its own network/storage-capable globals before
  evaluating any script. A regression suite (`script-sandbox.service.spec.ts`)
  asserts the original escape (`Function("return typeof fetch")()`
  re-acquisition) is closed. See `docs/scripts.md` for the full, verified
  isolation model.

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

- NDJSON export, removed from the app. The README previously described
  it in three places after removal, which has since been corrected.

### Changed

- Method-verb color coding in the method selector.
