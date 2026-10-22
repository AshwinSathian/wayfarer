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
U-058, under "Second pass" below.

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

**U-004. Cards in cards in cards.** Severity 3. H8. All.
The composer is a card; inside it the request tabs are a tinted card and
the response is another card; inside those the rows are bordered fields.
The page uses 11 different border radii (3 to 18 px, plus pills and
circles) and 4 shadow styles. Linear's 2026 refresh states the opposite
rule: "structure should be felt, not seen".
Evidence: computed-style survey of the response state (radii 10 px × 48,
7 px × 33, 18 px × 9, 14 px × 5, and seven others).
**Status:** Open, D4-d. The composer is still a card holding the request's
card and the response's; the response view now uses eight radii (0, 5, 6, 7,
9 and 12 px, pills and circles) and two shadows.

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
**Status:** Open, D4-d. At 390 px the page is still one column with the
response under the request's sections.

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
**Status:** Open, D4-d. For a GET the tabs are still Params, Headers, Auth,
Scripts and Settings, and Headers is chosen with a query in the address.

**U-018. Delete shows in red on an empty row.** Severity 4. H8.
The starter header row has a ticked box and a red ×; every row keeps
both visible. Red is for the one destructive action in view.
**Status:** Open, D4-d. A new tab's starter header row still has a ticked
box and a red ×.

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

### First run

**U-022. Empty states say "nothing here" and offer nothing.** Severity 2.
H10. OC, TP.
The sidebar's "No collections yet" has no button; the response's "Send a
request to see the response here" has a lightning bolt; the environments
have two dashed boxes. The first screen has no way in besides the
address field: no "paste a cURL command", no "import from Postman", no
example request.
Evidence: `baseline/1440-light-01b-first-run-full.png`.
**Status:** Open, D4-c.

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
**Status:** Open, D4-c (row 1.35), placed by
[`ia.md`](ia.md#u-032-shortcuts-shown-where-they-work): every control with a
shortcut shows it, and Settings, Shortcuts is read from the palette's
commands.

### Visual system

**U-020. Eight font weights and type below 12 px.** Severity 3. H4.
In one view: 400, 480, 500, 560, 580, 590, 600, 650. Sizes 10 and 11 px
are in use (the plan's D3.2 sets 12 px as the floor). Section labels are
uppercase and tracked ("COLLECTIONS", "PRE-REQUEST SCRIPT").
**Status:** Open, D4-f and D4-g. The weights are 400, 500 and 600 (#389) and
no drawn text is under 12 px (#397, `e2e/type-floor.spec.ts`). The sidebar's
"COLLECTIONS" and the environments list's "ENVIRONMENTS" are still uppercase
and tracked.

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

### Found in triage

**U-037. Two links in the composer draw the browser's button border.**
Severity 3. H4. All.
"Start a new request instead" (under a saved request's address) and "Send
anyway" (beside an unresolved variable's error) are bare `<button>`s with
`underline text-accent-text bg-transparent` and no `uiButton`. With no
preflight, the browser's own border shows round each, in both themes,
which the maintainer's rule of 2026-10-20 forbids (nothing looks native).
Evidence: `composer.html`, the two buttons at the top of the template.

**Status:** Open, D4-d. [`ia.md`](ia.md) removes the first (maintainer,
2026-10-22); the second becomes a `uiButton`.

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
**Status:** Open, D4-d.

### The environment editor with rows

**U-041. A variable cannot be switched off, and the rows have no
headings.** Severity 2. H4, H3. TP, QA.
A stored variable has `enabled`, and Postman's editor shows a checkbox per
row; Wayfarer's editor has none, so a variable is either there or deleted.
The two columns have no heading, and the lock that makes a variable secret is an icon with
no text beside every row.
Evidence: `baseline/design-chromium/environments-rows-1440-light.png`.
**Status:** Open, D4-g.

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
**Status:** Open, D4-d.

### The GraphQL explorer

**U-046. The schema is fetched and not shown.** Severity 3. H1, H6. SD.
After Refresh schema the status line says the schema is loaded, but the
explorer that lists its types comes after the query and variables editors,
below the fold at 1,440 × 900. Postman's GraphQL client shows the schema beside the query.
Evidence: `baseline/design-chromium/graphql-explorer-1440-light.png`.
**Status:** Open, D4-d.

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
**Status:** Open, D4-f (the palette becomes the shell's, [`ia.md`](ia.md#u-011-the-palette)).

**U-050. Copy as cURL says nothing.** Severity 3. H1. TP.
The command goes to the clipboard and the menu closes; nothing on the
screen says it was copied, or that a secret in it was masked.
Evidence: D0.2's task 6; `workspace-store.ts`, `copyAsCurl`.
**Status:** Open, D4-d.

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
session of row 1.35 applies it to that view's strings.

### Found on the other screens

**U-055. A request on its way shows grey bars and nothing else.**
Severity 3. H1. SD, OC.
While a request waits, the response pane is a loading skeleton: no
"Sending", no time so far, no word of where it went. Cancel is the only
sign, in Send's place. A request to a slow server looks the same at one
second and at fifty.
Evidence: `baseline/design-chromium/response-loading-1440-light.png`.
**Status:** Open, D4-e.

**U-056. Deleting from the tree asks "Delete item?" without naming it.**
Severity 3. H1, H5. All.
Delete on the request Health asks "Delete item? This action cannot be
undone. Continue?", with Proceed and Cancel. It does not say which item
will go.
Evidence: `baseline/design-chromium/confirm-dialog-1440-light.png`.
**Status:** Open, D4-f.

## Every screen of D0.1, and its findings

Each screen of [`baseline/index.md`](baseline/index.md), with the open or
fixed findings it shows. "No finding" means the second pass read its
Chromium captures at 1,440 px, in both themes, and at 390 px, and its
Firefox and WebKit captures by the comparison above, and found nothing a
finding does not already say.

| Screen | Findings |
|---|---|
| `first-run` | U-010, U-022, U-032 |
| `request-saved` | U-004, U-017, U-037 |
| `response-json` | U-003, U-031, U-038, U-052 |
| `response-headers` | U-031, U-058 |
| `response-tests` | No finding |
| `response-html` | U-028 (at 390 px the preview is below the composer) |
| `response-loading` | U-055 |
| `response-error` | U-051 |
| `composer-params` | U-004, U-017 |
| `composer-headers` | U-018, U-054 |
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
| `tree` | U-010, U-020 |
| `tree-menu` | U-016, U-054 |
| `collection-settings` | No finding |
| `new-collection` | U-054 |
| `palette` | U-011, U-049 |
| `import-review` | U-015 |
| `import-curl` | No finding |
| `script-review` | U-039, U-040 |
| `run` | U-014, U-053, U-057, U-058 |
| `environments-empty` | U-020, U-022 |
| `environments-rows` | U-041, U-042, U-043, U-044, U-054 |
| `history` | U-024 |
| `history-empty` | U-022 |
| `vault-create` | U-026 |
| `vault-unlock` | U-026 |
| `secrets-manager` | No finding |
| `confirm-dialog` | U-056 |
| `settings-general` | U-025, U-053 |
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

