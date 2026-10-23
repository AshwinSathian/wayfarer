# Design audit, October 2026

Phase D1.2 of [`PLAN-design.md`](../../PLAN-design.md), first pass. A hostile
review of the app on `main` at `9224a06`, run on 2026-10-19 in Chromium at
1,440, 820 and 390 px, light and dark. The screenshots it cites are in
`docs/design/baseline/`; the rest of the capture (110 images) was taken by
a throwaway script and is not committed.

Each finding has a severity (1 blocks a task, 2 slows or misleads, 3 costs
polish or trust, 4 cosmetic), the heuristic it breaks (Nielsen's ten, by
number: H1 visibility of status, H2 match with the real world, H3 control
and freedom, H4 consistency and standards, H5 error prevention, H6
recognition over recall, H7 flexibility and efficiency, H8 minimalist
design, H9 error recovery, H10 help), and the personas it hurts: SD solo
developer, PE privacy-bound engineer, QA tester, OC occasional user, TP a
team leaving Postman.

Not reviewed in this pass: the script review dialog, the environment editor
with rows, the Auth editor's OAuth flow, the GraphQL explorer, the
WebSocket view, Firefox and WebKit. The second pass (D4-b, 2026-10-22)
reviewed them, and every screen of D0.1's index
([`baseline/index.md`](baseline/index.md)); its findings are U-039 to
U-058, under "Second pass" below. The third pass, the hig-review of
2026-10-23 ([`hig-review-2026-10-23.md`](hig-review-2026-10-23.md)), added
U-060 to U-129, under "Third pass" below, and reopened U-036.

## Summary

The engine is careful and the interface shows it in the wrong way. The
screen explains itself in paragraphs, nests its parts in cards, and
scrolls as a web page, so the one thing a user came for, the response,
starts 700 px down a 900 px window. The look is a 2021 SaaS template
(indigo glow on the main button, dashed empty boxes, rounded cards in
cards, uppercase tracked labels) on top of Material widgets bent into
shape by 1,490 lines of overrides. Three patterns any Postman user tries
first fail: a click on a request in the tree does not open it, the tree
does not show methods, and the palette does not find requests.

The four findings that matter most: U-001 (the page scrolls, the response
is below the fold), U-002 (transport options above the request), U-008
(single click does not open), U-013 (the run report).

## Triage, 2026-10-22

D4-a (plan row 1.36) gave every finding a status, read against `main` at
`fe1ba6b`. Each status is one of three. Fixed names the PR, and was checked
on a production build of that commit in Chromium at 1,440 × 900 (light and
dark), 840 and 390 px. Open names the D4 session of row 1.35 that takes it.
Accepted gives the reason. None is accepted.

Fixed: U-001, U-002, U-005 to U-009, U-012, U-013, U-019, U-021, U-023,
U-030, U-033, U-036 (15). Open: the other 19 above, and U-037 and U-038,
found while checking. Row 1.35 counted U-003 and U-014 as fixed and
U-020 as believed fixed. On the screen, at 1,440 px the response is still
432 px wide (U-003), the run's diagnosis has no action (U-014), and two
headers are still uppercase (U-020): each is fixed in part and stays open
for the part that is left. Row 1.35 gave U-019 to D4-d; D3a had fixed it.

This meets D1's exit criterion for D1.2's first pass. The second pass
(Firefox, WebKit and the five screens named at the top) added U-039 to
U-058, each with its status: all 20 open, none accepted.

## Findings

### Shell and layout

**U-001. The app is a scrolling document, not a workspace.** Severity 1.
H8, H6. All personas.
The main area is a column the window scrolls. At 1,440 × 900 the
response's body starts at y = 700, so 200 px of it is visible; the
environments manager sits below the composer at y = 1,110 and is reached
only by scrolling past it. A run of 42 requests makes the page 3,771 px
tall and the sidebar, fixed at the window's height, ends half way down.
Every rival (Postman, Bruno, Yaak, Insomnia, Hoppscotch) is a fixed shell
of full-height panes, each scrolling inside itself.
Evidence: `baseline/1440-light-03b-response-full.png`,
`baseline/1440-light-p-17c-run-full.png`.
**Status:** Fixed in #371 (S3). On today's build at 1,440 × 900 the document
is 900 px tall: the sidebar, the composer and the response each scroll
inside themselves.

**U-002. Transport options and their explanations come before the
request.** Severity 2. H8, H7. SD, OC, TP.
Between the address and the request's tabs, every request shows the
route select, "Follow redirects", "Do not verify the server's
certificate", a sentence of explanation for each, and the accordion
"What the browser does to this request": 250 px of options most requests
never change. Postman and Insomnia keep these in a request's Settings tab.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Fixed in #369 (S2). The route, the redirects, the certificate
check and "What the browser does" are the request's Settings tab; the
address row is followed by the request's tabs.

**U-003. The response gets a third of the width.** Severity 2. H8. SD, QA.
At 1,440 px with the sidebar pinned, the response pane is 425 px wide, the
editor 390 px; the explanatory sentences above it run 960 px. At 820 px
the response is 290 px and its fourth tab is cut ("Test").
Evidence: `baseline/1440-light-03b-response-full.png`,
`baseline/820-light-03-response.png`.
**Status:** Open, D4-e. S3 (#371, #377) gave the response the window's
height, and at 840 px all four of its tabs show. At 1,440 px with the
sidebar pinned it is still 432 px wide beside a 530 px composer, so the
finding as written stands.
2026-10-23 (hig-review, W-41f and W-13): confirmed at 1,440 and 2,560 px. At
2,560 px the address runs about 1,530 px and each of Params' fields about
415 px over an empty composer: the rows editor gets a measure, and the
splitter's default favours the response at wide widths. Below 1,200 px the
width is U-070's to balance. Evidence:
[`hig-review/2560-light-stress-width-composer.png`](hig-review/2560-light-stress-width-composer.png).
Still open, D4-e.

**U-004. Cards in cards in cards.** Severity 3. H8. All.
The composer is a card; inside it the request tabs are a tinted card and
the response is another card; inside those the rows are bordered fields.
The page uses 11 different border radii (3 to 18 px, plus pills and
circles) and 4 shadow styles. Linear's 2026 refresh states the opposite
rule: "structure should be felt, not seen".
Evidence: computed-style survey of the response state (radii 10 px × 48,
7 px × 33, 18 px × 9, 14 px × 5, and seven others).
**Status:** Fixed in #428 (D4-d). The composer, the request's parts, the
variables under the address and the response have no card of their own:
the regions are told apart by space and by the one line of the splitter
between the request and the response, and the tests and the auth notes
lost their boxes too. The response's inside (its radii) is D4-e's.
2026-10-23 (hig-review, W-39, DS-27): the fix holds for the composer. Cards
are back inside the overlays (palette, environments list, Settings ›
General, History's skeletons), and radii outside the scale remain: these
are U-093 and U-126, not a regression of this one.

**U-005. The name is on the screen twice.** Severity 4. H8.
With the sidebar pinned, "Wayfarer" and its mark show in the sidebar's
header and again in the toolbar, 360 px apart.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Fixed in #378 (S4). The name and mark are in the sidebar's
header only; the toolbar has neither.

**U-006. The toolbar is six unlabelled icons.** Severity 2. H6, H4. OC, TP.
Lock, key, a router, a moon, a clock, a gear. Two of them are the vault
(lock and key), the router is the Local Bridge, and their names are
only in a `title`. Below 1,024 px half of them move to Settings, so the
toolbar's meaning changes with the window.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Fixed in #378 (S4). The vault, the secrets, the Local Bridge and
the theme are in the status bar, each with its state in words ("Vault
locked", "Route: Auto"); the toolbar holds the sidebar's toggle, the
environment, Environments, History and Settings at every width from 768 px.
Environments' icon (`dns`, a server) is the one a newcomer cannot read;
[`ia.md`](ia.md) leaves it to D4-g.

**U-007. The pinned sidebar looks like a drawer.** Severity 3. H4.
It casts `rgba(0,0,0,0.5) 4px 0 32px`, the shadow of a panel over the
page, while it is beside the page. The toolbar starts 8 px in from it
with its own rounded corner, so the two do not meet.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Fixed in #378 (S4). The pinned sidebar has no shadow, and the
toolbar meets its edge.

**U-028. The phone layout is one 2,220 px column.** Severity 3 (phones
keep today's rule, plan section 1). H8. OC.
At 390 px the address field is 150 px wide, the response's tabs are cut,
and the environments are at the bottom of the page.
Evidence: `baseline/390-light-03b-response-full.png`.
**Status:** Fixed in #428 (D4-d). Below 768 px the request and the response
are two tabs under the address, and a send opens the response: at 390 px
the response's status is under 300 px below the address, not after every
section of the request.

### Collections and tabs

**U-008. A click on a request does not open it.** Severity 2. H4. TP, OC.
A single click selects a row; opening takes a double click
(`collections-sidebar.html`, `(dblclick)="handleNodeDoubleClick(node)"`).
Postman, Bruno, Insomnia, Yaak and Hoppscotch open on a single click. A
Postman user clicks, sees nothing change, and assumes the app is broken.
Evidence: `baseline/1440-light-p-13-request-open.png` (row selected, the
composer still on "New request").
**Status:** Fixed in #367 (S1). One click on a request opens it:
`seedAndOpen` in `e2e/support/app.ts` clicks once and waits for the address,
in every spec that uses it.

**U-009. The tree does not show methods.** Severity 2. H6. All.
Requests are names only, in 40 px rows. Every rival puts a coloured
method (`GET`, `POST`) before the name; it is how people find a request in
a long list.
Evidence: `baseline/1440-light-p-13-request-open.png`.
**Status:** Fixed in #367 (S1). Each request's row starts with its method in
the method's colour.

**U-010. The sidebar's icons do not say what they do.** Severity 3. H6. OC.
A lightning bolt opens the command palette, an upload arrow imports a
file, a terminal glyph imports a cURL command.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Open, D4-f, placed by
[`ia.md`](ia.md#u-010-the-sidebars-header): the header keeps two named menu
buttons, New and Import, and the palette moves to the toolbar.

**U-016. Three Export entries in one menu.** Severity 3. H8.
"Export", "Export with credentials" and "Export for Postman…" sit
together in the collection's menu of eleven items. One "Export…" with the
format and the credentials as choices says the same.
Evidence: `baseline/1440-light-p-15-context-menu.png`.
**Status:** Open, D4-f. The maintainer chose one "Export…" (2026-10-22),
placed by [`ia.md`](ia.md#u-016-one-export).
2026-10-23 (hig-review, W-38): extended. "Export with credentials" sits
under "Export" at the same weight and acts at once, and the composer's
"Copy as cURL with credentials" does the same to the clipboard: one slip
writes every token and password of the collection's auth into a file. The
one Export… dialog, and the copy menu, take credentials only through an
"Include credentials" box that starts unchecked. Evidence:
[`hig-review/1440-dark-27-tree-menu.png`](hig-review/1440-dark-27-tree-menu.png),
[`hig-review/1440-dark-24-copy-menu.png`](hig-review/1440-dark-24-copy-menu.png).
Still open, D4-f.

**U-027. The tab strip's actions are far from the tabs.** Severity 3. H4.
New, duplicate and close are at the strip's right end, up to 1,000 px
from the tab they act on; a tab has no close button of its own. The
unsaved dot uses the accent colour of the active tab's underline.
Evidence: `baseline/1440-light-03b-response-full.png`.
**Status:** Open, D4-f. The maintainer chose (2026-10-22) a close button on
each tab, New after the last tab and Duplicate in a tab's context menu,
placed by [`ia.md`](ia.md#u-027-the-tab-strip).

**U-035. A request is named by a dialog.** Severity 3. H7. SD.
A new tab is titled by its URL ("127.0.0.1:4300/echo?user=ada&p…"); a name
is given only through Save as. Rivals let the name be edited in place.
**Status:** Open, D4-f.

### The composer and the response

**U-017. The request's tabs change with the method.** Severity 3. H4.
For GET the tabs are Params, Headers, Auth, Scripts; Body appears for
other methods (`@if (hasBody)` in `composer.html`), so the row reflows
when the method changes. Postman shows Body for every method.
The first tab selected is Headers, also when the URL carries a query.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Fixed in #428 (D4-d). Body is a tab for every method, as
Postman's; a GET or HEAD request with a body says in the tab that it is sent
without one (claim C-039 reworded, maintainer, 2026-10-22). A new or opened
request starts on Params.

**U-018. Delete shows in red on an empty row.** Severity 4. H8.
The starter header row has a ticked box and a red ×; every row keeps
both visible. Red is for the one destructive action in view.
**Status:** Fixed in #428 (D4-d). The × of every row (headers, parameters,
form fields, parts, tests, a collection's variables) is grey until it is
hovered. The starter row keeps its ticked box: a header typed into it is
sent, as in Postman.

**U-019. The Send button is dated.** Severity 3. H8.
Indigo with a coloured glow (`rgba(76,110,245,0.5) 0 4px 18px`), lavender
when disabled. The glow is stronger in dark. It reads as a 2020 landing
page, not a tool used all day.
Evidence: `baseline/1440-dark-03-response.png`.
**Status:** Fixed in #389 (D3a). Send is a flat teal (`--accent-solid`) with
no shadow in both themes, and a paler teal when disabled. Row 1.35 gave it
to D4-d; there is nothing left for D4-d to do.

**U-030. Three rows of controls before the response body.** Severity 3. H8.
The view select, the search with its arrows, and the path filter take
170 px of a 425 px pane before the first line of the body.
Evidence: `baseline/1440-light-03b-response-full.png`.
**Status:** Fixed in #387. The view select, the search and the path filter
share one row that wraps by the pane's width: at 1,440 px the body starts
214 px below the response's top (`e2e/layout.spec.ts` holds it to 240).

**U-031. The status line has four chips and no size.** Severity 3. H1. SD.
"200", "OK", a time chip and a route chip ("Direct"), each a pill. The
response's size is not shown; every rival shows status, time and size.
**Status:** Open, D4-e. The four pills are gone (#387): the line reads "200
OK 16.2 ms · Direct". The size shows only when the server sent
`Content-Length`, so a chunked answer (the echo server's) shows none.

### Runner

**U-013. The run report is a wall of the same paragraph.** Severity 1. H1,
H9. QA, TP.
A run of 42 requests that all failed for one reason shows 42 rows, each
with the same three lines: "Network error, no response was received. The
host may not resolve (DNS)…". There is no count of passed and failed, no
progress bar, no filter to failures, and the page grows to 3,771 px.
Evidence: `baseline/1440-light-p-17c-run-full.png`.
**Status:** Fixed in #372 (S5). A run shows its counts ("0 passed, 3
failed"), progress while it runs, "Failed only", and one banner for a shared
cause with "Same error as above" on each row.

**U-014. The run does not diagnose what it found.** Severity 2. H9. QA.
When every request fails on the network, the cause is one (CORS or a
host the browser cannot reach) and so is the fix (the Local Bridge). The
report says it 42 times and offers no action.
**Status:** Open, D4-i. Since #372 the shared cause is said once and names
the Local Bridge, but the banner has no action: it offers no way to turn the
bridge on or open its settings.

### Command palette

**U-011. The palette is a dialog of buttons.** Severity 2. H7. SD, TP.
A titled modal with a close button, full-width bordered rows 46 px tall,
Title Case ("New Collection"), shortcuts in brackets in the label. It
finds commands only: not requests, collections, environments or history.
VS Code, Linear and Raycast set the pattern people expect from ⌘K: a
floating list without a title, grouped results, entities as well as
commands, shortcuts as keycaps at the right.
Evidence: `baseline/1440-light-p-22-palette.png`.
**Status:** Open, D4-f, placed by [`ia.md`](ia.md#u-011-the-palette): the
palette is the shell's, finds requests, collections, environments and
history as well as commands, and shows each shortcut as a keycap.

### Environments and the vault

**U-012. Environments have no place of their own.** Severity 2. H6. All.
The environment is picked in the toolbar and edited at the bottom of the
page, below the composer, in a list-and-detail pair with two dashed empty
boxes. Creating one opens a dialog asking for a name and a description,
then leaves the editor below the fold.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Fixed in #371 (S3). Environments is a dialog opened from the
toolbar and is no longer in the page's column. What the editor looks like is
D4-g's.

**U-026. The vault's passphrase fields have no labels.** Severity 2. H5,
WCAG 3.3.2. PE.
"Choose a passphrase" and "Confirm passphrase" are placeholders, gone once
typing starts. Nothing says a forgotten passphrase cannot be recovered,
which is the one thing to know before creating a vault.
Evidence: `baseline/1440-light-p-20-vault-create.png`.
**Status:** Open, D4-g.
2026-10-23 (hig-review): confirmed; Create vault still does not say that a
forgotten passphrase cannot be recovered. The wrong passphrase's message
is not announced: U-062 (D4.11, D4-e). Close this one before v3.0.0.

### History, settings, import

**U-024. History is cramped where it has room.** Severity 3. H8. SD.
The search field touches the drawer's edges; URLs are cut at about 20
characters in a 432 px drawer; each row's checkbox is always visible and
"Select all" is the first action.
Evidence: `baseline/1440-light-05-history.png`.
**Status:** Open, D4-f.

**U-025. Settings opens on one row.** Severity 3. H8.
The dialog is 920 × 720 px; General holds one control (the theme). A
faint white rectangle shows mid-pane after opening (a leftover of the
entrance).
Evidence: `baseline/1440-light-06-settings-General.png`.
**Status:** Open, D4-h. The faint rectangle is gone (#389 made dialogs
opaque); General still holds the theme alone.

**U-015. The import review renames what it shows.** Severity 2. H1, H4. TP.
The review lists "Request · Status And Body" for a request the file names
"Status and body", and stores it as "Status and body": the review does
not show what will be written. Each item is a 90 px card, so a collection
of 58 requests is a long scroll.
Evidence: `baseline/1440-light-p-10-import-review.png`.
**Status:** Open, D4-h.
2026-10-23 (hig-review, W-41e, W-28): confirmed. The counts that disagree
with their noun are U-098; "id" beside "ID" is part of U-083.

### First run

**U-022. Empty states say "nothing here" and offer nothing.** Severity 2.
H10. OC, TP.
The sidebar's "No collections yet" has no button; the response's "Send a
request to see the response here" has a lightning bolt; the environments
have two dashed boxes. The first screen has no way in besides the
address field: no "paste a cURL command", no "import from Postman", no
example request.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Fixed in #427 (D4-c), with one part accepted. The empty
response offers "Paste a cURL command" and "Import a collection…"; the
empty sidebar says what goes there and offers "New collection" and
"Import…"; the empty environments list says what an environment is for and
offers "New environment"; empty History says what will be listed. None
draws a dashed box around nothing ([`voice.md`](voice.md#empty-states)).
**Accepted:** no example request. It would send to a server the person did
not choose, and the app sends nothing anywhere by itself; the address,
focused at the start, is the way in, with a cURL command pasted into it as
the second.
2026-10-23 (hig-review, W-41a): the fix holds. The state it did not cover,
a saved request with an address open and nothing sent, is U-095.

**U-023. The first screen explains the Local Bridge.** Severity 2. H2, H8.
OC.
Before anything has been sent, the screen says "Auto sends from the page,
and through the Local Bridge when the browser could not. Inherit is the
collection's, else the device's (Settings, Local Bridge)." The words
"Inherit: Auto" and "Route" mean nothing to someone who has not met
them.
**Status:** Fixed in #369 (S2). The sentence about routes is in the
request's Settings tab, not on the first screen.

**U-032. Shortcuts are invisible.** Severity 3. H7. SD.
No control shows its shortcut (Send, new tab, palette); they are listed
only in Settings, Shortcuts. The palette shows two, in brackets.
**Status:** Fixed in #426 (D4-c), as
[`ia.md`](ia.md#u-032-shortcuts-shown-where-they-work) placed it. Send is
⌘↵ or Ctrl+Enter and Save ⌘S or Ctrl+S, and Enter in the address sends.
Send, Save, New tab, Close tab and the palette's button show their keys in
their tooltips, the palette shows each command's keys at its right, and
Settings, Shortcuts reads the commands' keys from the palette's list. The
keys are the reader's system's only ([`voice.md`](voice.md#shortcuts)). C
and N get their keycaps with the sidebar's New menu, which D4-f makes.
2026-10-23 (hig-review, W-25): the fix holds. ⌥T and ⌥W fire while typing
in a field: U-081.

### Visual system

**U-020. Eight font weights and type below 12 px.** Severity 3. H4.
In one view: 400, 480, 500, 560, 580, 590, 600, 650. Sizes 10 and 11 px
are in use (the plan's D3.2 sets 12 px as the floor). Section labels are
uppercase and tracked ("COLLECTIONS", "PRE-REQUEST SCRIPT").
**Status:** Open, D4-f and D4-g. The weights are 400, 500 and 600 (#389) and
no drawn text is under 12 px (#397, `e2e/type-floor.spec.ts`). The sidebar's
"COLLECTIONS" and the environments list's "ENVIRONMENTS" are still uppercase
and tracked.
2026-10-23 (hig-review): confirmed; both are still uppercase. The
hierarchy they stood for is U-119's.

**U-021. Three blues and a stray grey.** Severity 3. H4.
The Send fill, the link colour (`rgb(79,70,229)`) and the focus ring
(`rgb(76,110,245)`) are three different blues; `rgb(100,116,139)`
(Tailwind's slate-500) appears outside the tokens.
**Status:** Fixed in #389 (D3a). Send's fill, the links and the focus ring
are all the accent's tokens (`--accent-solid` and its states, `--accent` in
dark), and the slate grey is gone. Monaco's bracket colours are another
stray, recorded as U-038.

**U-033. The widget layer costs more than it gives.** Severity 3 (to the
user), 2 (to the project).
`controls.css` 1,079 lines and `material-theme.scss` 411 lines restyle 16
Material packages; templates carry 23 `!` utilities to beat Material's
own rules and 11 inline `style` attributes; the brand mark is an inline
SVG written twice in `app-shell.html`. This is the case D1.5 has to
decide.
**Status:** Fixed in #404 to #419 (D3.3, row 1.34). `@angular/material` is
not a dependency, `material-theme.scss` is deleted, `controls.css` is 114
lines with nothing of Material's, no template has a `!` utility, and the
mark is one file (`icons/logo.svg`). Ten `style` attributes are left in
templates; each view's D4 session removes its own.

**U-036. Dark mode is Apple's system greys on black.** Severity 4. H8.
Near-black canvas with `#1c1c1e`-style cards and a glowing button; depth
comes from borders, not from layered surfaces.
Evidence: `baseline/1440-dark-03-response.png`.
**Status:** Fixed in #389 (D3a). The dark canvas is a warm near-black
(`rgb(22, 21, 19)`), the greys are the tokens' warm neutrals, and Send has
no glow.
**Reopened 2026-10-23** (hig-review, DS-16): a remnant regression. The
status colours are still Apple's system values (`tokens.css:115, 118, 217,
220`), and the page's `theme-color` is #000000 and #F5F5F7 (that part is
U-088). Open, D3.6 (session D3-b): the status colours derived in OKLCH
from the product's palette.

### Found in triage

**U-037. Two links in the composer draw the browser's button border.**
Severity 3. H4. All.
"Start a new request instead" (under a saved request's address) and "Send
anyway" (beside an unresolved variable's error) are bare `<button>`s with
`underline text-accent-text bg-transparent` and no `uiButton`. With no
preflight, the browser's own border shows round each, in both themes,
which the maintainer's rule of 2026-10-20 forbids (nothing looks native).
Evidence: `composer.html`, the two buttons at the top of the template.

**Status:** Fixed in #428 (D4-d). "Start a new request instead" is removed
(maintainer, 2026-10-22, [`ia.md`](ia.md)); "Send anyway" is a small text
`uiButton`.

**U-038. Monaco's brackets are in Monaco's colours.** Severity 4. H4.
In the response's JSON the brackets are coloured by depth in Monaco's
default bracket-pair colours (`#0431fa`, `#319331`, `#7b3814` in light),
which are not tokens and sit beside the tokens' own syntax colours.
`monaco-loader.ts` sets no `editorBracketHighlight` colour.

**Status:** Open, D4-e.

## Second pass, 2026-10-22

D4-b's pass over what `e2e/design/screens.spec.ts` captures (D0.1): every
screen of its index at 360, 390, 820 and 1,440 px in both themes, in
Chromium, Firefox and WebKit on Linux (Playwright's Docker image), on
`main` at `204379e`. The five screens the first pass skipped are here, and
so is what Firefox and WebKit draw differently. The task scripts of D0.2
(`e2e/design/tasks.spec.ts`) found U-039, U-044 and U-049 to U-051 by
failing, or by succeeding without telling the user, where a person would
have been stuck. A capture is named `<screen>-<width>-<theme>.png`:
Chromium's are in `baseline/design-chromium/`; Firefox's and WebKit's are
the artifacts of CI's Design capture jobs, and the one WebKit image a
finding needs is in `baseline/second-pass/`.

### The script review dialog

**U-039. A run of an imported collection sends without its scripts, and
does not offer the review.** Severity 2. H1, H3. QA, TP.
Import a Postman collection with test scripts and run it: every request is
sent, the scripts are skipped, and the run says "Scripts of this collection
wait for a review, so requests were sent without them. Open a request and
choose Review scripts." The run has no button for the review, so a run of
an untrusted collection always costs a run that tests nothing, then four
clicks elsewhere (a request, its Scripts tab, Review scripts, I trust these
scripts), then the run again. Postman and Newman run the scripts.
Evidence: D0.2's task 2 (`docs/design/baseline.md`).
**Status:** Open, D4-i.

**U-040. The review is one editor of every script, run together.**
Severity 3. H6, H1. QA, TP.
The dialog shows all the collection's scripts as one Monaco text, each
headed by a comment line (`// ---- Shared request: pre-request script
----`). Nothing says which of them a re-import changed, a call the sandbox
does not support (`pm.vault.get`, which the import report flagged a step
before) is not marked, and at 390 px each header wraps to three lines in a
column of 230 px beside a gutter of 60.
Evidence: `baseline/design-chromium/script-review-1440-light.png`,
`baseline/design-chromium/script-review-390-dark.png`.
**Status:** Fixed in #429 (D4-d). Each script is shown on its own, in the
order it runs, under its holder's name and its kind (pre-request or
post-response). One whose digest the collection's last review did not
cover (new, or changed by a re-import) reads "Not reviewed yet"; the app
keeps digests, not the text reviewed, so it cannot show what changed in
it. A call the sandbox does not have is named above the script, from the
same scan as the import report. A character that draws nothing or
reorders the text is written as its code point. The scripts are text, not
Monaco: at 390 px each heading is one line.

### The environment editor with rows

**U-041. A variable cannot be switched off, and the rows have no
headings.** Severity 2. H4, H3. TP, QA.
A stored variable has `enabled`, and Postman's editor shows a checkbox per
row; Wayfarer's editor has none, so a variable is either there or deleted.
The two columns have no heading, and the lock that makes a variable secret is an icon with
no text beside every row.
Evidence: `baseline/design-chromium/environments-rows-1440-light.png`.
**Status:** Open, D4-g.
2026-10-23 (hig-review, W-19): extended. The variable's Key and Value inputs
are named only by their placeholders, "KEY" and "Value", and the columns
have no headings: each input gets a name ("Key", "Value of apiKey") and
the rows a visible header, as Params has (`params-panel.html:1-6`).
Evidence: [`hig-review/1440-dark-36-environments-rows.png`](hig-review/1440-dark-36-environments-rows.png).

**U-042. At 390 px a variable's name and value are 60 px wide.**
Severity 3 (phones). H8. OC.
On a phone the name and value fields sit side by side with the lock and the
remove button, so `baseUrl` reads `baseUr` and its value `http:/`. The list
of environments above takes the first half of the window.
Evidence: `baseline/design-chromium/environments-rows-390-light.png`.
**Status:** Open, D4-g.

**U-043. Which environment is in use reads three ways.** Severity 3. H4.
OC.
The environment in use has an "In use" pill, a grey tick and a tinted row;
the one not in use has a green tick. The green tick is the button that
switches to it, but it looks like the mark of the chosen one. Every row
also shows its delete in red at rest, as U-018 found for header rows.
Evidence: `baseline/design-chromium/environments-rows-1440-light.png`.
**Status:** Open, D4-g.

**U-044. Enter does not create a new environment.** Severity 3. H7. SD.
In the New environment dialog, Enter in the name field does nothing; Create
is a click. The same dialog for a collection takes Enter.
Evidence: D0.2's task 3.
**Status:** Open, D4-g.

### The Auth editor's OAuth flow

**U-045. Get token and the redirect URI are below nine fields.** Severity
3. H6. SD, TP.
With OAuth 2.0 and the authorization code grant at 1,440 × 900, the pane
shows Type, Grant, Auth URL, Token URL, Client ID, Client secret, Scope,
Client sent in and a checkbox; Get token, the token's state and "Register
this redirect URI with the identity provider" come after them, out of view.
The redirect URI is what a person needs first, to set up the provider.
The Grant select also starts 24 px to the right of the Type select above it.
Evidence: `baseline/design-chromium/composer-oauth-1440-light.png`.
**Status:** Fixed in #429 (D4-d). Under the grant come the redirect URI and
the token's state with Get token, then the fields. Every label of the Auth
tab is 96 px, so the Type and Grant selects start at the same place.

### The GraphQL explorer

**U-046. The schema is fetched and not shown.** Severity 3. H1, H6. SD.
After Refresh schema the status line says the schema is loaded, but the
explorer that lists its types comes after the query and variables editors,
below the fold at 1,440 × 900. Postman's GraphQL client shows the schema beside the query.
Evidence: `baseline/design-chromium/graphql-explorer-1440-light.png`.
**Status:** Fixed in #429 (D4-d). The schema's types are listed under Fetch
schema, above the query, in a box 240 px high that scrolls; each type opens
with the app's chevron, not the browser's triangle. Beside the query, as
Postman has it, does not fit: beside the pinned sidebar the composer is
530 px at 1,440 px.

### The WebSocket view

**U-047. A WebSocket keeps the controls of an HTTP request.** Severity 3.
H8, H2. SD.
With a `ws://` address the method select still says GET, and Copy as cURL
and Save stay beside Disconnect. A paragraph about handshake headers and
the Local Bridge sits above the message field on every connection.
Evidence: `baseline/design-chromium/websocket-1440-dark.png`.
**Status:** Open, D4-e.

**U-048. The log cannot be searched, filtered or read as JSON.** Severity
3. H7. SD, QA.
Each message is one line of the table, JSON or not, with no way to expand,
format, search or keep only the received ones. The connection's state is a
word at the right end of the subprotocols row, far from Disconnect.
Evidence: `baseline/design-chromium/websocket-1440-dark.png`.
**Status:** Open, D4-e.

### Found by the task scripts

**U-049. The palette's shortcut does nothing below 1,200 px, or from a
field.** Severity 2. H7, H4. SD, TP.
Ctrl+K (⌘K) is heard by the sidebar. Below 1,200 px the sidebar is a closed
drawer and the key opens nothing; at any width it is ignored while focus is
in a field, the address included, which is where a person's focus is.
Postman's and Insomnia's open from anywhere. Checked at 820 and 1,440 px.
Evidence: `collections-sidebar.ts`, `handleGlobalKeydown`.
**Status:** Open, D4-f (the palette becomes the shell's, [`ia.md`](ia.md#u-011-the-palette)), for
the drawer. The field is fixed in #427 (D4-c): the key opens the palette
from a field too, since the address has focus when the app opens.
2026-10-23 (hig-review): confirmed; it is a symptom of the modal drawer,
U-070, and closes with it or with the shell's palette.

**U-050. Copy as cURL says nothing.** Severity 3. H1. TP.
The command goes to the clipboard and the menu closes; nothing on the
screen says it was copied, or that a secret in it was masked.
Evidence: D0.2's task 6; `workspace-store.ts`, `copyAsCurl`.
**Status:** Fixed in #431 (D4-d). Each copy of the composer's menu and of the
response's export menu says for eight seconds, in a live region under the
address or beside the export button, what it copied ("Copied as cURL.").
`copyNote` (`@wayfarer/core`) builds the text again with less masked and
compares, so it says "Its credentials are replaced by ***." or "its vault
secrets" only when the redactor replaced some in this copy, and that a
vault secret's reference was copied as written. A copy the browser refused
says nothing was copied. The HAR dialog shows its file and what it masks
before Copy, and closes on a copy that worked; on one the browser refused
it stays open and says so.

**U-051. A failed request reads "0 Unknown Error", and CORS and DNS look
the same.** Severity 2. H9, H2. SD, OC.
A request to a host that does not exist and one to a server that sends no
CORS header both show "0 Unknown Error" and the same paragraph naming
three possible causes. The browser does hide which, but the app can tell
some apart (a `no-cors` probe reaches a server that has no CORS header; a
name that does not resolve fails it too). A 401 shows its status and
nothing about the request's auth.
Evidence: D0.2's task 5 (`docs/design/baseline.md`).
**Status:** Open, D4-e.
2026-10-23 (hig-review, W-7): confirmed for a refused connection, a name
that does not resolve, CORS and offline, and extended. When no response
arrives, core sets status `0` and `statusText` "Unknown Error", which is
Angular HttpClient's wording: no server sent it, yet the pane draws it as a
red status chip. The string travels to history ("Http failure response
for {url}: 0 Unknown Error"), the HAR's comment and the run table's Status
column. A 4xx or 5xx with an empty body gets "Http failure response for
{url}: 404 Not Found" written into the body, in the red monospace that
voice.md keeps for a server's words, and stored as the history entry's
error. The app writes its own words in the server's place
(`packages/core/src/send/exchange.ts:126-129, 653-654, 664, 705, 709`;
`response-viewer.html:39, 43, 284-289`; `runner/run-view.html:182-183`;
`shared/inspect/har-export.ts:42`). The fix is one change in core, which
history, HAR and the run then show: the status line, history and the run
say "No response"; an offline browser is said so (`navigator.onLine`);
the body is sans, not red mono, and an empty body reads "No body
returned." with nothing invented stored. Evidence:
[`hig-review/1440-dark-10-response-error.png`](hig-review/1440-dark-10-response-error.png),
[`hig-review/1440-light-stress-cors-error.png`](hig-review/1440-light-stress-cors-error.png),
[`hig-review/1440-light-stress-dns-error.png`](hig-review/1440-light-stress-dns-error.png),
[`hig-review/1440-light-stress-offline-error.png`](hig-review/1440-light-stress-offline-error.png).
Still open, D4-e.

### Across the three engines

Each of Firefox's and WebKit's 196 captures was compared with Chromium's
of the same screen, width and theme, pixel by pixel. The median share of
pixels that differ is 1.1% in Firefox and 1.4% in WebKit, most of it
text set a pixel wider or narrower. The 40 captures that differ most
(4.6% to 12.3%, all at 360 or 390 px, where a line of text wraps one word
sooner or later) were read side by side with Chromium's. What they show
beyond the wrapping is U-053 and U-057; U-052 and U-058 are in all three.

**U-052. The editors are not in the app's monospace.** Severity 3. H4. All.
Every value a user types or a server sends is in the app's own monospace
(D3.2), except inside Monaco: the response body, the scripts, a JSON body
and the review of scripts. `monaco-loader.ts` gives Monaco no font, so it
uses its own default list, which differs by system; on Linux, in all three
engines, the response's JSON is drawn in a proportional face beside a
monospace address.
Evidence: `baseline/design-chromium/response-json-1440-light.png`.
**Status:** Open, D4-e.
2026-10-23 (hig-review, W-41d): extended. Monaco draws its own focus mark,
a 1 px blue outline (`rgb(0, 144, 241)`), where the rest of the app draws
a 2 px teal ring: its `focusBorder` takes `--accent`, and the editor's host
draws the app's ring on `:focus-within`. The font was not measured again.

**U-053. In WebKit a dialog opened by a click shows a focus ring.**
Severity 4. H8. All.
At 390 px, with Settings opened and a section chosen by clicks, WebKit
draws the focus ring round "All settings"; Chromium and Firefox draw it
for the keyboard alone. `UiModal` puts focus on the first control, and WebKit treats focus
set by code as keyboard focus.
The same ring is on Run again after a click, in the run's view.
Evidence: `baseline/second-pass/webkit-settings-general-390-light.png`
against `baseline/design-chromium/settings-general-390-light.png`;
`baseline/second-pass/webkit-run-390-light.png`.
**Status:** Open, D4-h.

**U-057. Number fields show the browser's arrows in Firefox and WebKit.**
Severity 3. H4. All.
The run's Iterations and Delay, and Settings' timeout, history size and
idle minutes, are `<input type="number" uiInput>`. Firefox and WebKit draw
their own up and down arrows inside each, which the maintainer's rule of
2026-10-20 (nothing looks native) forbids; Chromium's show only on hover.
Evidence: `baseline/second-pass/firefox-run-390-light.png`,
`baseline/second-pass/webkit-run-390-light.png`, against
`baseline/design-chromium/run-390-light.png`.
**Status:** Open, D4-h (the field is `uiInput`'s, which the runner and
Settings share).

**U-058. On a phone, header names and values break inside words.**
Severity 3 (phones). H8. SD, QA.
At 360 and 390 px the response's Headers table gives each column about
110 px, so `access-control-allow-credentials` breaks after each hyphen and
a value such as `GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS` breaks
inside its words (`DELE TE`, and in WebKit `PO ST`). The same happens in
all three engines; the run's table does it to request names and statuses.
Evidence: `baseline/design-chromium/response-headers-360-light.png`,
`baseline/design-chromium/run-390-light.png`.
**Status:** Open, D4-e.

**U-054. Menus and buttons mix title case and sentence case.** Severity 4.
H4. All.
The tree's menu says "New Folder" and "New Request" above "Export with
credentials"; the editors say "Add Header" and "Add Variable" beside "Save
changes" and "Bulk edit".
Evidence: `baseline/design-chromium/tree-menu-1440-light.png`,
`baseline/design-chromium/environments-rows-1440-light.png`.
**Status:** Open. The voice guide ([`voice.md`](voice.md#case), D4-c)
decides it: sentence case for every label, proper names apart. Each view's
session of row 1.35 applies it to that view's strings. D4-d did the
composer's (#428, #429): "Add header", "Edit as text", "Save to
collection…", "Pre-request script", the auth types and grants, and the
placeholders. The tree's menu and the environment editor wait for D4-f
and D4-g.
2026-10-23 (hig-review, W-27): confirmed, and extended beyond that list: 28
labels in title case and two in capitals that are not methods. The
palette's commands, the New Collection and New Folder dialogs' titles, the
collection settings' "Pre-request Script", the assertion builder's
"Status Code", "Add Variable", the update banner, the "KEY" placeholder
and the "RUN" tab badge (`app-shell.ts:145-219`;
`collection-context-menu.ts:33-49`; `collections-sidebar.ts:214-257,
531-537`; `inherited-settings-dialog.html:51, 61`;
`test-assertion-ui.ts:6`; `environments-manager.html:157, 209`;
`tab-strip.html:10`). Each goes to its view's session: D4-f the palette,
tree, dialogs and tab badge, D4-g the environments, D4-i the assertion
builder.

### Found on the other screens

**U-055. A request on its way shows grey bars and nothing else.**
Severity 3. H1. SD, OC.
While a request waits, the response pane is a loading skeleton: no
"Sending", no time so far, no word of where it went. Cancel is the only
sign, in Send's place. A request to a slow server looks the same at one
second and at fifty.
Evidence: `baseline/design-chromium/response-loading-1440-light.png`.
**Status:** Open, D4-e.
2026-10-23 (hig-review, W-2, W-22): confirmed. What a screen reader hears of
the same moment (nothing) is U-061, and the skeleton and fades every send
shows, even for a 16 ms reply, are U-078. The three close together in
D4-e: no indicator under about a second, then "Sending" and the time so
far, said through the response's status region too.

**U-056. Deleting from the tree asks "Delete item?" without naming it.**
Severity 3. H1, H5. All.
Delete on the request Health asks "Delete item? This action cannot be
undone. Continue?", with Proceed and Cancel. It does not say which item
will go.
Evidence: `baseline/design-chromium/confirm-dialog-1440-light.png`.
**Status:** Open, D4-f.
2026-10-23 (hig-review, W-11): confirmed, and extended to every
destructive confirm. The shared `Confirm` falls back to "Proceed" and is a
template (a warning glyph in a tinted circle, centred text, two equal
buttons). Clear history asks "Are you sure?" with "Your entire history
will be cleared"; Delete secret and Reset all data accept with "Proceed".
Each names what goes and its button says the act: "Clear history? Every
entry is deleted; collections are not touched. This cannot be undone."
with **Clear history** and Cancel; "Delete the secret {name}?" with
**Delete**; "Reset all data? Every collection, request, environment,
secret, history entry and setting in this browser is deleted. This cannot
be undone." with **Reset all data**. The "Proceed" default and the glyph
go (`ui/confirm.ts:55-79`; `app-shell.ts:302, 308-312`;
`secrets-manager.ts:192-199`; `collections-sidebar.ts:487-490`).
Evidence: [`hig-review/1440-dark-43-confirm-dialog.png`](hig-review/1440-dark-43-confirm-dialog.png).
Open: the shared confirm and the tree's in D4-f, Delete secret in D4-g,
Reset all data in D4-h.

### Found later

**U-059. A file field copies the browser's own.** Severity 3. H4. All.
Found by the maintainer, 2026-10-22. The `<input type="file">` is hidden
in every place, but what stands for it is the browser's control redrawn:
an outlined "Choose file" button beside "No file chosen", Chrome's own
words and layout, in the request's binary body, a multipart part and the
vault's import. It takes no dropped file, and a chosen file cannot be
cleared without choosing another. The maintainer's rule of 2026-10-20
(nothing looks or feels like a native element) forbids it, and
`src/app/ui` has no widget for it, so each place drew its own.
Evidence: `body-panel.html`, `multipart-editor.html`, `vault-actions.html`.
**Status:** Fixed in #432 (D4-d, plan D3.5). `ui-file` in `src/app/ui`
names the file chosen, or says "Drop a file here, or" beside "Choose a
file…"; it takes a dropped file, and Remove empties it. The binary body, a
multipart part and the vault's import use it, and no "No file chosen" is
left in the app. It is in the catalogue, with axe in each state and a
keyboard e2e.

## Third pass: the hig-review, 2026-10-23

A UI and UX review of the whole app and its design system against Apple's
Human Interface Guidelines, WCAG 2.2 and the plan's own rules
([`hig-review-2026-10-23.md`](hig-review-2026-10-23.md)), on
`docs/hig-review-pass` at `6bb10cdb`, in Chromium 156 only, from the
running development build and the source. The screenshots it cites are in
[`hig-review/`](hig-review/). Firefox, WebKit and a screen reader were not
run; the findings that rest on source alone say so, and D1.8 of the plan
verifies them.

Its rows keep their own IDs (W-n for the app, DS-n for the design system),
and each finding below names its row. The review's Impact maps to this
audit's severity by the definitions at the top: a Blocker that stops a
person finishing a task is severity 1, and this pass reads "blocks a task"
to cover a loss of the person's work (U-060); any other Blocker (a WCAG
AA failure with a way round it) is 2; Major is 2 when it
misleads or slows a task and 3 when it costs polish or trust; Minor is 3;
Polish is 4.

Rows that confirm or extend an earlier finding have no ID of their own:
U-003, U-016, U-041, U-051, U-052, U-054 and U-056 are extended, each with
a dated note on its status line, and U-015, U-020, U-022, U-026, U-032,
U-049 and U-055 have a note. **U-036 is reopened**: its fix left the status colours
as Apple's system values (DS-16). U-004's remainder (cards in overlays,
radii outside the scale) is U-093 and U-126; U-004 stays fixed for the
composer.

All 70 below are open. The plan's row 1.42 moves the eight Blockers of
access and the one of data loss (U-060 to U-065, U-106 to U-108), with
U-075 and the save path's U-066 and U-068, into D4.11, the first work of
session D4-e.

### Data and the save path

**U-060. The Environments dialog throws away unsaved edits without
asking.** Severity 1. H3, H5. SD, PE, QA, TP.
The editor's draft lives in `app-environments-manager`, which the shell
makes inside `@if (environmentsVisible())`: × or Escape destroys it with
the edits. Choosing another environment in the list runs
`selectEnvironment`, which overwrites the draft from the stored document.
`hasEdits()` exists, but neither path calls it, though the editor needs an
explicit "Save changes". Confirmed in source; not yet seen at runtime.
Evidence: `app-shell.html:450-459`;
`environments/environments-manager.ts:103, 154-161, 354`;
[`hig-review/1440-dark-36-environments-rows.png`](hig-review/1440-dark-36-environments-rows.png).
**Status:** Open, D4-e (plan D4.11). Review row W-1.

**U-066. A save that fails says nothing.** Severity 2. H1, H9. All.
`RequestSave.save` and `confirmSaveAs` have `try/finally` and no `catch`:
an IndexedDB error goes to the console and Diagnostics only, and a result
of `null` (the request was deleted in another tab) does nothing. The only
sign is that the tab's unsaved dot stays. The draft survives, because the
tab stays dirty and closing it asks first.
Evidence: `services/request-save.ts:106-130, 151-172`; `composer.ts:141`.
**Status:** Open, D4-e (plan D4.11). Review row W-8.

**U-068. Saving from the keyboard drops focus to the page.** Severity 2.
H7. SD, and everyone on a keyboard.
Save is `[disabled]` while `savingRequest()` is true, so the focused
button is disabled under the caret and focus moves to `<body>`. The next
key goes nowhere.
Evidence: `composer/address-row.html:76-90`.
**Status:** Open, D4-e (plan D4.11). Review row W-10.

**U-067. ⌘S collapses the folder that holds the request.** Severity 2. H1,
H6. SD, QA.
`refreshCollectionEntry` rebuilds the tree's expansion and clears its
selection, so what was just saved disappears from the sidebar on every
save.
Evidence: `services/collections-store.ts:257-262`;
[`hig-review/1440-light-kb-ctrl-s-after.png`](hig-review/1440-light-kb-ctrl-s-after.png).
**Status:** Open, D4-f. Review row W-9.

**U-094. A click on the backdrop loses what was typed.** Severity 3. H5.
All.
Create vault passphrase and Save to collection have `dismissableMask`: a
stray click closes them, and both passphrases or the name are lost.
Evidence: `app-shell.html:390`; `save-as-dialog.html:6`;
[`hig-review/1440-dark-40-vault-create.png`](hig-review/1440-dark-40-vault-create.png).
**Status:** Open, D4-f (Save to collection) and D4-g (the vault). Review
row W-40.

**U-080. Nothing can be undone.** Severity 3. H3. All.
Deletes go through a confirm, a row's × removes it at once, and ⌘Z
restores neither.
Evidence: `collections-sidebar.ts:487-490`; the rows editor's ×.
**Status:** Open, D4-f, after the maintainer chooses the undo model (an
"Undo" in place for a few seconds, the confirm kept for Reset all data and
Replace all, is the review's proposal). Review row W-24.

### Announcements and names

**U-061. A send says nothing to a screen reader.** Severity 1. H1. All
who use a screen reader.
The skeleton is `aria-hidden` with no `aria-busy`; the status line ("200
OK 16.3 ms · Direct") is drawn in a new `div` with no live role, and focus
stays in the address. The core task cannot be confirmed without hunting
for the result. WCAG 4.1.3 (AA). Severity 1 because it is the core task,
on every send, for everyone who uses a screen reader: the way round it is
to go looking. Confirmed in source; no screen reader was run.
Evidence: `response-viewer/response-viewer.html:11-16, 25-62`.
**Status:** Open, D4-e (plan D4.11). Review row W-2; U-055 is the same
moment seen.

**U-062. Errors that appear after an action are not announced.**
Severity 2. H1, H9. All who use a screen reader.
The wrong-passphrase message of Unlock and Create vault is a plain `<p>`,
and the field gets no `aria-invalid` or `aria-describedby`. The address's
error is only an `aria-describedby`, which is not read again when it
appears after Send, and "Send anyway" appears silently. WCAG 4.1.3 (AA),
3.3.1 (A).
Evidence: `app-shell/app-shell.html:406-434`; `composer/composer.html:32-37`;
`composer/address-row.html:38-39`;
[`hig-review/1440-dark-41-vault-unlock.png`](hig-review/1440-dark-41-vault-unlock.png).
**Status:** Open, D4-e (plan D4.11). Review row W-3.

**U-075. Fourteen live regions are made with their message.** Severity 2.
H1. All who use a screen reader.
A `role="status"` or `role="alert"` created inside `@if` together with its
text is often skipped. That covers the update, backup, storage,
bridge-test, paste-note and dropped-header messages. `address-row.html:119`
already does it right: the region is there from the start and only its
text changes.
Evidence: `app-shell.html:237-305`; `bridge-pane.html:64, 104, 118, 131`;
`composer.html:40`; `request-warnings.ts:22, 31`; `body-panel.html:29, 35`;
`diagnostics-pane.html:31`.
**Status:** Open, D4-e (plan D4.11). Review row W-18.

**U-063. Two visible labels are not in the accessible name.** Severity 2.
H4. All who use voice control.
The backup reminder's "Not now" is named "Dismiss backup reminder"; the
secrets manager's usage chips show "Staging.apiKey" and are named "Locate
apiKey in environment Staging". Saying what is on the screen does not
reach them. WCAG 2.5.3 (A).
Evidence: `app-shell/app-shell.html:263-270`; `secrets/secrets-manager.html:77`.
**Status:** Open, D4-e (plan D4.11). Review row W-4.

**U-071. Rows are named by their number, not their content.** Severity 2.
H4. All who use a screen reader.
"Send parameter 1", "Send header row 2", "Send part 3"; every row's × is
"Remove parameter" or "Remove variable", and the lock is "Mark variable as
secret".
Evidence: `params-panel.html:13, 32`; `rows-editor.html:10`;
`multipart-editor.html:7`; `environments-manager.html:185-198`.
**Status:** Open, D4-g (the rows editors are shared; D4-g takes all of
them). Review row W-14.

**U-072. The status bar's words are not its controls.** Severity 2. H4,
H1. All.
"Route: Auto", "Vault locked" and "Secrets" are text beside 26 px icon
buttons named "Local Bridge settings", "Unlock secrets" and "Manage
secrets", and a lock or unlock is not announced. The status bar is the
one element of the app the review found its own, and the least operable
part of the shell.
Evidence: `app-shell.html:323-362`;
[`hig-review/1440-dark-03-response-json.png`](hig-review/1440-dark-03-response-json.png).
**Status:** Open, D4-e. Review row W-15.

### Pointer, reflow and text size

**U-064. The split between request and response needs a drag.**
Severity 2. H7. Everyone who uses one pointer without dragging.
The 8 px gutter is moved by dragging or by the arrow keys. There is no
single-pointer way. WCAG 2.5.7 (AA).
Evidence: `ui/splitter.ts:26-40, 70-112`.
**Status:** Open, D4-e (plan D4.11). Review row W-5.

**U-065. At 320 px the page scrolls sideways.** Severity 2. H4. Phones,
and 400% zoom on a 1,280 px window.
The toolbar's Settings button ends at x = 322 (`scrollWidth` 322), in
both themes. The plan's phone rule is 360 px; WCAG 1.4.10 (AA) names
320 CSS px.
Evidence: `header.ds-toolbar`;
[`hig-review/320-light-toolbar-overflow.png`](hig-review/320-light-toolbar-overflow.png).
**Status:** Open, D4-e (plan D4.11). Review row W-6.

**U-073. At 200% text the boxes grow and the text does not.** Severity 2.
H8. Everyone who sets a larger text size.
Type is set in px (tokens and literals) and boxes in rem: at 200% the
sidebar takes about 700 of 1,440 px, the response is squeezed to about
220 px with its tabs cut ("Timi…"), method badges outgrow the names, and
the status bar clips. Zoom still passes 1.4.4.
Evidence:
[`hig-review/1440-light-stress-font200-composer.png`](hig-review/1440-light-stress-font200-composer.png),
[`hig-review/1440-light-stress-font200-settings.png`](hig-review/1440-light-stress-font200-settings.png),
[`hig-review/390-light-stress-font200-composer.png`](hig-review/390-light-stress-font200-composer.png);
`tokens.css:36-67`; `button.css:29`; `input.css:16, 124`.
**Status:** Open, D3.6 (session D3-b). Review rows W-16 and DS-7.

**U-070. Below 1,200 px the tree is a closed drawer.** Severity 2. H6, H7.
SD, QA, TP.
The sidebar becomes a modal drawer, closed by default, that makes the
composer and response inert. At 820 px, or a laptop window split in half,
the saved requests cannot be seen beside the open one, and each switch
costs a toggle, a click and the drawer closing. U-049 is its symptom.
Evidence: `app/app.ts:97`; `app-shell.html:46-63`;
[`hig-review/820-light-26-tree.png`](hig-review/820-light-26-tree.png).
**Status:** Open, D4-f, with the threshold chosen together with U-003.
Review row W-13.

**U-097. At 390 px the toolbar is six controls, five of them icons.**
Severity 3. H6. OC.
Sidebar, environment, Environments, lock, History and Settings; the way to
collections is the corner farthest from the thumb.
Evidence: [`hig-review/390-light-26-tree.png`](hig-review/390-light-26-tree.png).
**Status:** Open, D4-f (Environments and History move into the drawer as
labelled rows). Review row W-41c.

**U-099. Values flip under a right-to-left page.** Severity 3. H4. None
today: no right-to-left locale is planned.
With `dir=rtl` the address reads "content/json?kind=pets/{{baseUrl}}",
the status line "ms 16.4", and the response editor drew empty. No mono
field sets `dir="ltr"`.
Evidence: [`hig-review/1440-light-stress-rtl-composer.png`](hig-review/1440-light-stress-rtl-composer.png);
`composer/address-row.html:29-40`.
**Status:** Open, D3.6 (`uiInput` and Monaco's host take `dir="ltr"`).
Review row W-41g.

### The response and the send

**U-078. The most frequent action carries the most motion.** Severity 3.
H1, H8. SD, QA.
Each send scales the button to 0.96 and flashes shimmer bars, even for a
16 to 38 ms local reply. The response then fades in over 300 ms, and every
tab switch fades over 240 ms, arrow keys included. The answer sits at part
opacity for eight times the network's time, and the skeleton is not the
response's shape. Wayfarer's speed is measured and then hidden.
Evidence: `animations.css:63-68`; `tabs.css:117-119`;
`response-viewer.html:12-23`; `button.css:67-71, 221-223`.
**Status:** Open, D3.7 (session D4-e). Review rows W-22 and DS-22.

**U-095. A request ready to send is offered cURL and Import.** Severity 3.
H6. OC, SD.
With a saved request open and an address in it, the empty response pane
offers "Paste a cURL command" and "Import a collection…": the next step is
Send.
Evidence: [`hig-review/1440-dark-26-tree.png`](hig-review/1440-dark-26-tree.png);
`response-viewer.html`.
**Status:** Open, D4-e. Review row W-41a; U-022's fix did not cover this
state.

**U-091. Send and Run turn into Cancel where they were.** Severity 3. H5.
SD, QA.
A double click sends and cancels. "Cancel run" is red and filled.
Evidence: `run-view.html:8-13`; `address-row.html:103-112`.
**Status:** Open, D4-e (Send) and D4-i (Run). Review row W-36.

**U-090. Tab panels that hold controls are Tab stops of their own.**
Severity 3. H7. Everyone on a keyboard.
Angular Aria gives every `ngTabPanel` `tabindex="0"`; the pattern asks for
it only when a panel has nothing focusable. Three empty stops on every
walk through the composer.
Evidence: `ui/tabs.ts`; `response-viewer.html:155-510`.
**Status:** Open, D4-e (once, in `uiTabList`). Review row W-35.

**U-103. "Must be JSON" reads as a rule, not a choice.** Severity 4. H2.
SD.
The WebSocket view's checkbox. "Check it is JSON before sending".
Evidence: `socket/socket-view.html:64`.
**Status:** Open, D4-e (with U-047). Review row W-42c.

**U-104. The timing tooltips hedge.** Severity 4. H2. SD.
"including headers if available" (the app knows), "TLS/SSL", an unspaced
em dash, and noun fragments that end in full stops.
Evidence: `shared/inspect/timing-bars.ts:12-59`.
**Status:** Open, D4-e. Review row W-42d.

**U-087. The theme button leaves System on its first press.** Severity 3.
H1. All.
The status bar's button flips light and dark; the first press leaves the
system's choice without saying so.
Evidence: `app-shell.html:370-379`; `theme.ts:51-53`.
**Status:** Open, D4-e (with U-072: a System, Light, Dark choice, or a
cycle that names its state). Review row W-32.

### Collections, tabs, history and the palette

**U-081. ⌥T and ⌥W fire while typing.** Severity 3. H5, H7. SD on a Mac,
Firefox users on Windows and Linux.
They are read on `window` with no check for a field: ⌥W types "∑" on a
Mac, so typing it in a field closes a tab. On Windows and Linux, Alt+T is
Firefox's Tools menu.
Evidence: `tab-strip.ts:88-99`; `shortcuts.ts:16-17`.
**Status:** Open, D4-f (needs a choice of keys). Review row W-25; U-032's
fix holds otherwise.

**U-086. Clear history is a red icon beside Close.** Severity 3. H5. All.
The icon-only, red-at-rest "Clear all history" sits 34 px from the
drawer's Close.
Evidence: `app-shell.html:84-103`;
[`hig-review/1440-dark-37-history.png`](hig-review/1440-dark-37-history.png).
**Status:** Open, D4-f. Review row W-31.

**U-102. New request is in the drawer only.** Severity 4. H4. All.
Below 1,200 px the drawer has a "New request" button; the pinned sidebar
has none.
Evidence: `app-shell.html:27-33`;
[`hig-review/820-light-26-tree.png`](hig-review/820-light-26-tree.png)
against [`hig-review/1440-dark-26-tree.png`](hig-review/1440-dark-26-tree.png).
**Status:** Open, D4-f (the New menu of ia.md at every width). Review row
W-42b.

**U-093. Cards are back inside overlays.** Severity 3. H8. All.
The palette's rows, the environments list, Settings › General's theme box
and History's skeletons are cards, which D4-d took out of the composer.
Evidence: [`hig-review/1440-dark-30-palette.png`](hig-review/1440-dark-30-palette.png),
[`hig-review/1440-dark-35-environments-empty.png`](hig-review/1440-dark-35-environments-empty.png),
[`hig-review/1440-dark-44-settings-general.png`](hig-review/1440-dark-44-settings-general.png);
`past-requests.html:5`.
**Status:** Open, D4-f (palette, history), D4-g (environments), D4-h
(settings). Review row W-39; the remainder of U-004.

### Environments, the vault and the runner

**U-085. Dialogs stack inside the Environments dialog.** Severity 3. H8.
All.
New environment, the variables dialog, export, Create vault and
`window.confirm`, up to three layers. Deleting an environment is the
browser's own `window.confirm`.
Evidence: `environments-manager.html:263, 311, 320`;
`environments-manager.ts:209`; `app-shell.html:386-447, 457`.
**Status:** Open, D4-g (New environment as an inline row, which closes
U-044; the vault as a panel; delete through `Confirm`). Review rows W-30
and DS-12.

**U-076. A run's results lead nowhere.** Severity 2. H3, H7. QA.
A failed row cannot open its request, its response or the failing test:
the tester finds the request in the tree and sends it again, which loses
the run's data.
Evidence: `runner/run-view.html:158-191`;
[`hig-review/1440-dark-34-run.png`](hig-review/1440-dark-34-run.png).
**Status:** Open, D4-i (each row opens its exchange; plan D4.12's rail
holds it). Review row W-20.

**U-096. A run's setup stays above its results.** Severity 3. H8. QA.
After a run the form (Iterations, Delay, Stop on first failure, Data
file) is still first; the counts and failures are below it.
Evidence: `runner/run-view.html:17-98`;
[`hig-review/1440-dark-34-run.png`](hig-review/1440-dark-34-run.png).
**Status:** Open, D4-i. Review row W-41b.

**U-069. "Send to a different host?" hides what Yes allows.** Severity 2.
H2, H5. PE, QA.
In a run, the question says "Yes holds for {host} until the run ends",
but the buttons are "Send" and "Don't send": one click allows every later
request of the run, and "Don't send" is a contraction.
Evidence: `state/workspace-store.ts:561, 829-832`.
**Status:** Open, D4-i (claim C-053's wording stays one run's). Review row
W-12.

### Words

**U-082. Strings use words voice.md does not.** Severity 3. H2, H4. All.
"…failed", "Unable to import", "Invalid JSON", "not valid JSON" twice,
"Vault open", "Incorrect passphrase. Please try again.", "the user's
password", "I trust these scripts", "Toggle sidebar", and an OAuth error
that ends "See docs/browser-limits.md#oauth.". The review's row gives the
rewrite of each.
Evidence: `app-shell.html:302, 351`; `app-shell.ts:194, 369, 373, 412`;
`oauth-tokens.ts:29-30, 217`; `socket-client.ts:107`; `script-sandbox.ts:113`;
`import-dialog.html:36`; `environments-manager.html:220`;
`workspace-backup.ts:59`; `secrets-vault.ts:223, 270`; `oauth-fields.html:22`;
`script-review-dialog.html:52`.
**Status:** Open: each view's session rewrites its own (D4-e the composer's
leftovers and the socket, D4-f the shell and palette, D4-g the vault and
environments, D4-h import and Settings). Review row W-26.

**U-083. One thing goes by several names.** Severity 3. H4. All.
Address is also "URL" and "Load … into composer"; secret is also
"Protected"; request is also "New Item" and "Delete item?"; the import
review mixes "id" and "ID"; history calls one act Remove, Delete history
entry and, on phones, "Delete request", has two names for Clear, and says
"Load".
Evidence: `past-requests.html:38, 122, 189, 195`; `past-requests.ts:185-186`;
`bridge-pane.html:19`; `collections-sidebar.ts:277, 537`;
`environment-export-dialog.html:28`; `secrets-manager.html:40`;
`import-dialog.html:84, 120`; `app-shell.html:89-90`; `settings.html:152`.
**Status:** Open: D4-f (history, tree), D4-g (secrets), D4-h (import,
bridge, Settings). Review row W-28.

**U-084. Empty places say what is missing, not what goes there.**
Severity 3. H6, H10. OC.
"No response headers available.", "No tests were run…", "The jar is
empty.", "None." twice, "No secrets yet … it'll show up here."
Evidence: `response-viewer.html:329, 344, 488, 525`; `cookies-pane.html:56`;
`diagnostics-pane.html:65, 77`; `secrets-manager.html:38-40`.
**Status:** Open: D4-e (the response's), D4-g (secrets), D4-h (cookies,
diagnostics). Review row W-29.

**U-092. Diagnostics says "Nothing leaves this machine" and fetches a
file.** Severity 3. H2. PE.
Its self-test asks the server the app came from for the app's own
manifest.
Evidence: `diagnostics-pane.html`; `diagnostics-pane.ts:158`.
**Status:** Open, D4-h. Review row W-37.

**U-098. Counts in the import review disagree with their noun.**
Severity 3. H4. TP.
"{n} environment(s) detected.", "{n} variable(s)", "1 folders".
Evidence: `import/import-dialog.html:74, 126, 133`.
**Status:** Open, D4-h (with U-015). Review row W-41e.

**U-100. The page says it is American English, and names are built by
concatenation.** Severity 3. H4. None today.
`<html lang="en">` on British copy; accessible names joined from parts
(`variable-chips.html:6`); plurals by ternary (`har-export-dialog.html:9`).
Evidence: `index.html:2`.
**Status:** Open, D4-h (plan D4.13: `lang="en-GB"`). The rest waits for a
plan that takes up translation; this one has none.
Review row W-41h.

**U-105. "Trust center" is the one American spelling on screen.**
Severity 4. H4. All.
Settings › About's link. The file's name can stay.
Evidence: `settings/settings.ts:177`.
**Status:** Open, D4-h. Review row W-42e.

### The installed app

**U-088. The installed app's chrome does not match it.** Severity 3. H4.
All who install it.
`theme-color` is #000000 and #F5F5F7, not the canvas colours, and follows
the system, not the app's theme. The manifest has no `theme_color`,
`background_color`, `id` or `description`.
Evidence: `index.html:8-9`; `public/manifest.webmanifest`.
**Status:** Open, D4-h (plan D4.13). Review row W-33.

**U-089. The page asks for the whole screen and pads none of it.**
Severity 3. H4. Phones.
`viewport-fit=cover` with no `env(safe-area-inset-*)`, and the phone shell
is `100vh`.
Evidence: `index.html:7`; `app-shell.html:121`.
**Status:** Open, D4-h (plan D4.13). Review row W-34.

**U-101. Every icon of the manifest is "maskable any".** Severity 4. H4.
All who install it.
Art cut for the maskable safe zone is also used where the full mark is
wanted.
Evidence: `public/manifest.webmanifest`.
**Status:** Open, D2.4 (the icons). Review row W-42a.

### The design system

**U-106. An unchecked checkbox can hardly be seen.** Severity 2. H1. All,
low vision most.
Its only mark is a `--separator` hairline: 1.20 to 1.26:1 in dark, 1.21
to 1.22:1 in light. In the Params, Headers, multipart and History rows it
has no visible label either. WCAG 1.4.11 (AA).
Evidence: `ui/checkbox.css:14-15`; `params-panel.html:10-16`;
`rows-editor.html:7-12`; `multipart-editor.html:4-10`;
`past-requests.html:71-77`.
**Status:** Open, D4-e (plan D4.11). Review row DS-1.

**U-107. The option the keys are on in a select barely shows.**
Severity 2. H1. Everyone on a keyboard.
`--fill-hover` alone: 1.19:1 in dark, 1.08:1 in light. The forced-colours
block already draws a 2 px `--accent` inset outline. WCAG 1.4.11 (AA).
Evidence: `select.css:101-105`; `select.ts:43, 90`.
**Status:** Open, D4-e (plan D4.11). Review row DS-2.

**U-108. Grey text on the warning fill is under 4.5:1.** Severity 2. H1.
All.
12 px `--label-tertiary` on `--status-warning-fill`: 4.48:1 in dark. The
contrast gate checks no label on a status fill.
Evidence: `environments-manager.html:170-172`; `tokens.css:86, 116`.
**Status:** Open, D4-e (plan D4.11). Review row DS-3.

**U-074. A field's focus is fainter than 3:1.** Severity 2. H1. Everyone
on a keyboard.
A 1.56 to 2.13:1 border and a 1.41 to 1.79:1 glow, with `outline: none`.
The method field shares the address bar's glow, so it is not clear which
half has focus.
Evidence: `input.css:49-54`; `select.css:30-36`; `components.css:308-311`;
[`hig-review/1440-light-focus-method.png`](hig-review/1440-light-focus-method.png).
**Status:** Open, D3.6 (session D3-b). Review rows DS-4 and W-17.

**U-109. Controls are drawn as faintly as decoration.** Severity 2. H1,
H6. All.
Interactive borders 1.14 to 1.43:1, field fills 1.05 to 1.13:1, hover
adds 0.1:1, the scrollbar thumb about 1.3:1. A control is found by
knowing where it is.
Evidence: `input.css`; `select.css`; `segmented.css`; `file.css`;
`components.css:565`; `styles.css:138-155`.
**Status:** Open, D3.6. Review row DS-5.

**U-110. There is no increased-contrast theme.** Severity 3. H1. Low
vision.
No `prefers-contrast` block; the setting has nothing to change.
Evidence: `tokens.css`; `packages/tokens`.
**Status:** Open, D3.6. Review row DS-6.

**U-111. 12 px is the working size.** Severity 3. H8. All.
190 of 275 uses of a type class are 12 px; the 14 px body appears five
times.
Evidence: the templates; `tokens.css:52-63`.
**Status:** Open: D4-e decides the working size with D3.2's compact
density (13 px for work, 12 for captions, is the review's proposal), and
D3.6 builds it. Review row DS-8.

**U-112. Secondary and danger buttons do not answer hover or press.**
Severity 3. H1. All.
`--fill-hover` equals `--fill-secondary`.
Evidence: `tokens.css:78-79, 180-181`; `button.css:122-140`.
**Status:** Open, D3.6. Review row DS-9.

**U-113. A disabled field looks enabled.** Severity 2. H1, H5. All.
`ui-select` has no disabled style, and a read-only field none of its own.
Evidence: `input.css:70-77`; `select.css`.
**Status:** Open, D3.6. Review row DS-10.

**U-114. An invalid field looks valid.** Severity 3. H9. All.
Nothing styles `[aria-invalid]`.
Evidence: `address-row.html:39`; `input.css`; `select.css`.
**Status:** Open, D3.6. Review row DS-11.

**U-115. Elevation flattens inside dialogs.** Severity 3. H8. All.
A popup inside a dialog is level with it in dark and lower than it in
light.
Evidence: `tokens.css:74, 91, 104-105, 176, 206-207`.
**Status:** Open, D3.6. Review row DS-13.

**U-116. Forced colours lose five marks.** Severity 2. H1. Windows High
Contrast users.
The select's focus, the unsaved dot, the timing bars, the storage meter
and the drop line have no forced-colours rule.
Evidence: `select.css:31-36`; `tabs.css:95-101`; `components.css:360-363`;
`settings.css:216-229`; `tree.css:47-53`;
[`hig-review/1440-light-stress-forced-colors-composer.png`](hig-review/1440-light-stress-forced-colors-composer.png).
**Status:** Open, D3.6. Review row DS-14.

**U-117. The selected row barely shows, and hover erases it.** Severity 2.
H1, H6. All.
The selected row's fill is 1.14 to 1.23:1; hovering it replaces the
selection's fill. In dark, the chosen segment is darker than its track.
Evidence: `tree.css:35-41`; `segmented.css:40-46`.
**Status:** Open, D3.6. Review row DS-15.

**U-118. Colours and shadows written as literals.** Severity 3. H4. None
directly.
`#fff`, a cool field shadow, a 40% black segmented shadow in light, the
scrims, the drawer's shadow.
Evidence: `button.css:9, 236`; `input.css:12`; `select.css:12`;
`segmented.css:42-44, 86-88`; `dialog.css:17, 131, 138, 142`.
**Status:** Open, D3.6. Review row DS-17.

**U-119. The label tiers have collapsed.** Severity 3. H8. All.
Secondary and tertiary are close, and in light tertiary is darker than
secondary.
Evidence: `tokens.css:84-87, 186-189`.
**Status:** Open, D3.6. Review row DS-19.

**U-120. Some token roles repeat or mislead.** Severity 3. H4. None
directly.
`text-method-*` draws the fill colour as text, at 2.65:1.
Evidence: `tokens.css`; `styles.css:65-101`.
**Status:** Open, D3.6. Review row DS-20.

**U-121. Chips spring up on hover.** Severity 3. H8. All.
A translate with a spring easing, against motion.md's tone.
Evidence: `components.css:329-337`; `secrets-manager.css:14-27`.
**Status:** Open, D3.7. Review row DS-21.

**U-122. A theme change fires about 90 transitions.** Severity 3. H8. All.
motion.md says a theme change is instant.
Evidence: `styles.css:182-195`; `button.css:39-45`.
**Status:** Open, D3.7. Review row DS-23.

**U-123. One `transition-all`.** Severity 3. H8. None directly.
The environment variable row.
Evidence: `environments-manager.html:151`.
**Status:** Open, D3.7 (the token test bans it). Review row DS-24.

**U-079. Showing the sidebar slides the page.** Severity 3. H8. All.
`margin-left` over 300 ms both ways re-lays out Monaco on every frame and
breaks two rules of motion.md.
Evidence: `app-shell.html:136`.
**Status:** Open, D3.7. Review row W-23.

**U-124. Controls have six heights and no scale.** Severity 3. H4. All.
40, 41, about 35, 34, 32 and 28 px.
Evidence: `button.css`; `input.css`; `select.css`; `components.css`.
**Status:** Open, D3.6. Review row DS-25.

**U-125. The focus ring rounds every corner it draws on.** Severity 3. H4.
All.
The global `:focus-visible` sets a 3 px radius.
Evidence: `styles.css:164-168`.
**Status:** Open, D3.6. Review row DS-26.

**U-126. Radii outside the scale.** Severity 3. H4. All.
6 px, `999px`, and a wrong `--radius-lg` fallback.
Evidence: `accordion.css:17-27`; `segmented.css:80`; `controls.css:93`;
`settings.css:106, 219`.
**Status:** Open, D3.6. Review row DS-27; the remainder of U-004.

**U-127. Material's metrics, and icons a weight lighter than the text.**
Severity 3. H4. All.
Checkbox, field, select and dialog sizes are Material's; Material Symbols
at weight 300.
Evidence: `checkbox.css`; `input.css`; `select.css`; `dialog.css`;
`components.css:531-534`.
**Status:** Open: D3.6 (the metrics) and D2.4 (the icon set). Review row
DS-28.

**U-128. GET is the colour of success.** Severity 3. H4. All.
Method and status colours share values.
Evidence: `tokens.css`.
**Status:** Open, D3.6. Review row DS-29.

**U-129. Stale file headers, and one choice painted twice.** Severity 4.
H8. None directly.
Evidence: `animations.css:1-4`; `components.css:1-4`; `segmented.css`.
**Status:** Open, D3.6. Review row DS-30.

**U-077. The app reads as any dark developer tool.** Severity 3. H8, H4.
TP, SD.
Twenty tells of a default-assembled interface across seven of nine
channels (type, colour, shape, motion, icons, layout, voice). Direction A
kept Linear's and Yaak's surface (warm near-black, one muted green,
hairlines, Inter, ⌘K keycaps) and lost Linear's mechanism: the label
tiers collapse (U-119), 12 px is the working size (U-111), and controls
are as faint as separators (U-106, U-109). With the logo off, the one
phrase that is Wayfarer's is "Saved in this browser only". Reviewer
judgement, set against the plan's direction.
Evidence: [`hig-review/1440-dark-03-response-json.png`](hig-review/1440-dark-03-response-json.png),
[`hig-review/1440-dark-01-first-run.png`](hig-review/1440-dark-01-first-run.png);
`tokens.css:70-101`; the review's section 4.
**Status:** Open: D2.5 (a signature element and moment, chosen by the
maintainer) and D3.6 (the hierarchy). Closed when D5.1's logo-off and
competitor-swap tests find the chosen element. Review rows W-21 and DS-18.

## Every screen of D0.1, and its findings

Each screen of [`baseline/index.md`](baseline/index.md), with the open or
fixed findings it shows; from U-060 on, those of the third pass that a
screen shows (Chromium only). "No finding" means the second pass read its
Chromium captures at 1,440 px, in both themes, and at 390 px, and its
Firefox and WebKit captures by the comparison above, and found nothing a
finding does not already say.

| Screen | Findings |
|---|---|
| `first-run` | U-010, U-022, U-032, U-077 |
| `request-saved` | U-004, U-017, U-037 |
| `response-json` | U-003, U-031, U-038, U-052, U-072, U-077 |
| `response-headers` | U-031, U-058 |
| `response-tests` | No finding |
| `response-html` | U-028 (at 390 px the preview is below the composer) |
| `response-loading` | U-055, U-061, U-078 |
| `response-error` | U-051 |
| `composer-params` | U-004, U-017, U-071, U-106 |
| `composer-headers` | U-018, U-054, U-071, U-106 |
| `composer-body` | U-017, U-052 |
| `composer-auth` | No finding |
| `composer-oauth` | U-045 |
| `composer-scripts` | U-052 |
| `composer-settings` | No finding |
| `method-menu` | No finding |
| `graphql-explorer` | U-046 |
| `websocket` | U-047, U-048 |
| `export-menu` | U-016 (the same pattern: each export twice, with credentials and without), U-050 |
| `export-har` | No finding |
| `save-request` | U-035 |
| `tree` | U-010, U-020, U-067, U-070, U-095, U-102 |
| `tree-menu` | U-016, U-054 |
| `collection-settings` | No finding |
| `new-collection` | U-054 |
| `palette` | U-011, U-049, U-093 |
| `import-review` | U-015 |
| `import-curl` | No finding |
| `script-review` | U-039, U-040 |
| `run` | U-014, U-053, U-057, U-058, U-076, U-096 |
| `environments-empty` | U-020, U-022, U-093 |
| `environments-rows` | U-041, U-042, U-043, U-044, U-054, U-060, U-071, U-085, U-108 |
| `history` | U-024, U-086, U-106 |
| `history-empty` | U-022 |
| `vault-create` | U-026, U-062, U-094 |
| `vault-unlock` | U-026, U-062 |
| `secrets-manager` | U-063, U-084 |
| `confirm-dialog` | U-056 |
| `settings-general` | U-025, U-053, U-093 |
| `settings-requests` | U-057 |
| `settings-history` | U-057 |
| `settings-data` | No finding |
| `settings-vault` | U-057 |
| `settings-bridge` | No finding |
| `settings-cookies` | No finding |
| `settings-shortcuts` | U-032, U-054 |
| `settings-diagnostics` | No finding |
| `settings-about` | No finding |
| `settings-danger` | No finding |

