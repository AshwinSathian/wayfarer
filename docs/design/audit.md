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
U-060 to U-129, under "Third pass" below, and reopened U-036. The fourth pass,
the red-team review of 2026-10-26
([`hig-review-2026-10-26.md`](hig-review-2026-10-26.md)), added U-130 to
U-151, under "Fourth pass" below. Session D4-l (2026-10-27) found U-152
while measuring task 5, at the end of the fourth pass. Session D5-a (2026-11-04) found U-153 to
U-155 in D1.8's captures in three engines. The fifth pass (D5-b,
2026-11-04) walked five personas ([`personas.md`](personas.md)), retook
the screens in three engines and repeated both hig-reviews
([`hig-review-2026-11-04.md`](hig-review-2026-11-04.md)): U-156 to U-199,
under "Fifth pass" below. The sixth pass, the final design pass (D5-e,
2026-11-04), lists what four reviews proposed and where each landed, and
adds U-200 to U-206, under "Sixth pass" below.

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
**Status:** Fixed in #460 (D4-e). From 1,440 px the split starts at 45/55, so beside the pinned sidebar the response is about 598 px to the composer's 490; below 1,440 px the composer keeps 55%, so its six tabs fit. A rows editor measure at 2,560 px is not done (the composer is about 990 px there). Review rows W-41f, W-13.

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
**2026-11-03:** Environments' half fixed in #499 (D4-g): the toolbar's Environments is a button with its word beside the icon, from 768 px (on a phone it is a named row of the drawer, #489).

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
**2026-11-04:** D5-b's fifth pass: the measure holds in Chromium (294 px) and misses by 10 px in Firefox and WebKit (310 px); taken up by U-172. Open, D5-c.
**2026-11-04:** Accepted in D5-c, with U-172: a phone has no flows of its own (plan row 1.46); its layout is the desktop's sections stacked, in their order, nothing wider than the window. Firefox's and WebKit's 310 px against Chromium's 294 px is the engines' own scrollbar and font metrics.

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
**2026-11-02:** Fixed in #484 (D4-f): the header has the title and two named menus, New and Import; the palette is the toolbar's field.

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
**2026-11-02:** Fixed in #486 (D4-f): one Export… opens `export-dialog`, with the format and an Include credentials box unticked at each opening (`e2e/export-postman.spec.ts`, `e2e/claims.spec.ts`'s C-014, `e2e/secrets-wire.spec.ts`). The copy menu's credentialed cURL is after a line at the menu's end (decided under row 1.55).

**U-027. The tab strip's actions are far from the tabs.** Severity 3. H4.
New, duplicate and close are at the strip's right end, up to 1,000 px
from the tab they act on; a tab has no close button of its own. The
unsaved dot uses the accent colour of the active tab's underline.
Evidence: `baseline/1440-light-03b-response-full.png`.
**Status:** Open, D4-f. The maintainer chose (2026-10-22) a close button on
each tab, New after the last tab and Duplicate in a tab's context menu,
placed by [`ia.md`](ia.md#u-027-the-tab-strip).
**2026-11-02:** Fixed in #483 (D4-f): each tab has its ×, New follows the last tab, the tab's menu has Rename, Duplicate tab and Close tab, Delete closes a focused tab, and the unsaved dot is the secondary label (`e2e/tabs.spec.ts`).

**U-035. A request is named by a dialog.** Severity 3. H7. SD.
A new tab is titled by its URL ("127.0.0.1:4300/echo?user=ada&p…"); a name
is given only through Save as. Rivals let the name be edited in place.
**Status:** Open, D4-f.
**2026-11-02:** Fixed in #483 (D4-f): a saved request is renamed over its tab (a double click, F2 or the tab's menu) and the tree takes the name; an unsaved tab's Rename opens Save to collection, where a request is first named.

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
**Status:** Fixed in #450 (D4-e). The size is the body's own when there is no Content-Length, and reads in kB above 1,000 bytes.

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
**2026-11-03:** Fixed in #511 (D4-i): a shared error the page got no response for (the record's failure is `network`) has **Set up the Local Bridge…**, which opens Settings at the Local Bridge.

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
**2026-11-02:** Fixed in #484 (D4-f): `app-palette` is the shell's (⌘K anywhere, the toolbar's field), a combobox over a grouped listbox with no title or close button; it finds commands, requests by name, method and address, collections and folders (Enter selects the row in the sidebar), environments (Enter makes one active) and past requests, each command's shortcut as keycaps (`e2e/palette.spec.ts`).

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
**2026-11-03:** Fixed in #492 (D4-g, D4.5, DQ9): the environments are a tab of their own, a document like a request, opened from the toolbar, the palette or a variable's chip; decided under row 1.55 as one Environments tab (the list and the editor) rather than a tab per environment, which would need a second list in the sidebar.

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
**2026-11-03:** Environments' share fixed in #493 (D4-g): the passphrase fields made in a variable's row are labelled above them, and the row says a forgotten passphrase cannot be recovered. The shell's vault dialog is fixed in #494.
**2026-11-03:** Fixed in #494 (D4-g): the vault dialog's fields have labels above them, and creating a vault says a forgotten passphrase cannot be recovered, nor the secrets.

### History, settings, import

**U-024. History is cramped where it has room.** Severity 3. H8. SD.
The search field touches the drawer's edges; URLs are cut at about 20
characters in a 432 px drawer; each row's checkbox is always visible and
"Select all" is the first action.
Evidence: `baseline/1440-light-05-history.png`.
**Status:** Open, D4-f. Since D4-l (D4.12, 2026-10-27) each entry keeps its exchange record, and an entry loaded from History opens into it; the drawer's layout is D4-f's.
**2026-11-02:** Fixed in #485 (D4-f): each entry is a row with the method and the address across the drawer (at 1,440 px over 300 px of address where it was about 20 characters), its status, time and age under it; the search has the list's margins; boxes and the HAR export are a Select… mode (`e2e/history.spec.ts`).

**U-025. Settings opens on one row.** Severity 3. H8.
The dialog is 920 × 720 px; General holds one control (the theme). A
faint white rectangle shows mid-pane after opening (a leftover of the
entrance).
Evidence: `baseline/1440-light-06-settings-General.png`.
**Status:** Open, D4-h. The faint rectangle is gone (#389 made dialogs
opaque); General still holds the theme alone.
**2026-11-03:** Fixed in #505 (D4-h): General holds the theme and what was Requests (the timeout, holding back a request with an unset variable, and where requests leave from); the Requests section, and its capture, are gone.

**U-015. The import review renames what it shows.** Severity 2. H1, H4. TP.
The review lists "Request · Status And Body" for a request the file names
"Status and body", and stores it as "Status and body": the review does
not show what will be written. Each item is a 90 px card, so a collection
of 58 requests is a long scroll.
Evidence: `baseline/1440-light-p-10-import-review.png`.
**Status:** Open, D4-h.
2026-10-23 (hig-review, W-41e, W-28): confirmed. The counts that disagree
with their noun are U-098; "id" beside "ID" is part of U-083.
**2026-11-03:** Fixed in #503 (D4-h, D4.7): the review lists each item on one line, its kind, its name as it will be stored (the `capitalize` that wrote "Status And Body" is gone) and New or Replaces; "ID" is written one way.

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
**2026-11-04:** Reopened in D5-b's fifth pass: the Secrets dialog's empty list and the empty Timings and Tests tabs are dashed boxes (`secrets-manager.html:34-36`; `response-viewer.html:387-389`, `:570-572`). Open, D5-c, with U-198.
**2026-11-04:** Fixed again in D5-c: the Secrets dialog's empty list and the empty Timings and Tests tabs are a line of text with a glyph, no box; the token test fails on `border-dashed` in a template.

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
**2026-11-02:** The sidebar's title fixed in #484 (D4-f): "Collections" is a sentence-case heading in the secondary label. The environments list's is D4-g's.
**2026-11-03:** The environments list's title fixed in #493 (D4-g): "Environments", a sentence-case heading in the secondary label; `type-overline`, the uppercase style, is deleted (nothing reads it). Every finding of this row is fixed.
**2026-11-04:** Reopened in D5-b's fifth pass: `.ds-section-label` (`components.css:241-247`) and `.settings-subhead` (`settings.css:186-192`) are still uppercase and tracked: the import review, Settings' Data and Shortcuts panes, the Timings tab and the Console. Open, D5-c.
**2026-11-04:** Fixed again in D5-c: `.ds-section-label` and `.settings-subhead` are sentence case without tracking; the token test fails on an upper-case transform outside a method's rule.

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
**2026-11-02:** Fixed in #478 (D3-b): success, warning and error are the product's own OKLCH values (`packages/tokens`), none of Apple's; the token test refuses Apple's system colours. The `theme-color` half stays U-088's.

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

**Status:** Fixed in #451 (D4-e). Monaco has no focus line of its own and its brackets are plain.

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
**2026-11-03:** Fixed in #511 (D4-i): the run's note has **Review scripts…**, the same review dialog for the run's collection (`ScriptTrust.reviewOf`; approval still only through that dialog), and once it approves the note says "Scripts reviewed. Run again to run them."; the next run runs them. One run still goes without them: a run does not wait for a review it was not asked for.

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
**2026-11-03:** Fixed in #496 (D4-g): each variable of the environment editor has a box that switches it on or off, its value kept either way (`variableChanges` in `@wayfarer/core` says a row switched off as a set with `enabled: false`; it was a removal), and the columns are headed Name and Value where they sit side by side. The fields' names were fixed in #493 (U-071).

**U-042. At 390 px a variable's name and value are 60 px wide.**
Severity 3 (phones). H8. OC.
On a phone the name and value fields sit side by side with the lock and the
remove button, so `baseUrl` reads `baseUr` and its value `http:/`. The list
of environments above takes the first half of the window.
Evidence: `baseline/design-chromium/environments-rows-390-light.png`.
**Status:** Open, D4-g.
**2026-11-03:** Fixed in #493 (D4-g): the rows follow the editor's width, not the window's (a container query); where it is narrow the value has a line of its own under the name.

**U-043. Which environment is in use reads three ways.** Severity 3. H4.
OC.
The environment in use has an "In use" pill, a grey tick and a tinted row;
the one not in use has a green tick. The green tick is the button that
switches to it, but it looks like the mark of the chosen one. Every row
also shows its delete in red at rest, as U-018 found for header rows.
Evidence: `baseline/design-chromium/environments-rows-1440-light.png`.
**Status:** Open, D4-g.
**2026-11-03:** Fixed in #493 (D4-g): the environment in use is said once, by its "In use" tag; every other row has a Use button, and the selected row is marked by an ink bar, not a second colour.

**U-044. Enter does not create a new environment.** Severity 3. H7. SD.
In the New environment dialog, Enter in the name field does nothing; Create
is a click. The same dialog for a collection takes Enter.
Evidence: D0.2's task 3.
**Status:** Open, D4-g.
**2026-11-03:** Fixed in #493 (D4-g, DQ9): a new environment is a row of the list, named in place; Enter makes it and Escape puts the row away. The New environment dialog is gone.

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
**Status:** Fixed in #455 (D4-e). A WebSocket tab shows the ws scheme, no cURL copy, and its state beside Connect.

**U-048. The log cannot be searched, filtered or read as JSON.** Severity
3. H7. SD, QA.
Each message is one line of the table, JSON or not, with no way to expand,
format, search or keep only the received ones. The connection's state is a
word at the right end of the subprotocols row, far from Disconnect.
Evidence: `baseline/design-chromium/websocket-1440-dark.png`.
**Status:** Fixed in #455 (D4-e). The log can be filtered and searched, and a JSON message formatted.

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
**2026-11-04:** Fixed in #484 (D4-f, D4.4): the palette is the shell's (`app-shell.ts`), and Ctrl+K (⌘K) opens it at every width, the drawer closed included.

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
**Status:** Fixed in #444 (D4-e). No response is said in the app's words, with what the browser reported quoted as it reported it, no status code and no invented body, and Send through the Local Bridge offered in place. D4.12 (D4-l) builds the record on it: since D4-l (2026-10-27) what was reported and the action are in the exchange record, which a failure opens under the status line.

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
**Status:** Fixed in #451 (D4-e). Monaco is set in the app's monospace, with its features.

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
**2026-11-03:** Fixed in #506 (D4-h): a dialog a click or a touch opened carries `data-quiet-focus` until a key is pressed in it, and draws no ring inside it meanwhile (`UiModal`, the CDK's `InputModalityDetector`; `dialog.css`). `focus({ focusVisible: false })` was tried first: WebKit does not hold to it. Run again in the run's view is focus moved by the run, not a dialog, and is left for D4-i.
**2026-11-03:** Run again fixed in #510 (D4-i): with one button for Run and Cancel, focus stays on the button a click put it on, and nothing moves it by code.

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
**2026-11-03:** Fixed in #506 (D4-h): `uiInput` hides a number field's arrows in the three engines (`appearance: textfield`, the WebKit spin buttons); the arrow keys still step it.

**U-058. On a phone, header names and values break inside words.**
Severity 3 (phones). H8. SD, QA.
At 360 and 390 px the response's Headers table gives each column about
110 px, so `access-control-allow-credentials` breaks after each hyphen and
a value such as `GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS` breaks
inside its words (`DELE TE`, and in WebKit `PO ST`). The same happens in
all three engines; the run's table does it to request names and statuses.
Evidence: `baseline/design-chromium/response-headers-360-light.png`,
`baseline/design-chromium/run-390-light.png`.
**Status:** Fixed in #454 (D4-e). Below the pane's own width a header is its name over its value.

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
**2026-11-02:** The tree's menu, the create dialogs' titles and the palette's commands (#484) fixed in #486 (D4-f). The environments' (D4-g) and the assertion builder's (D4-i) remain.
**2026-11-03:** The environments' share checked in D4-g: the editor's and the list's labels are sentence case ("Add variable", "Key / Value", "New environment", "Global variables"), the "KEY" placeholder is "Name" (#493). The assertion builder's remains with D4-i.
**2026-11-03:** The assertion builder's "Status Code" is "Status code" in #512 (D4-i), its last label in title case; a scan of every template and every label, title, header and placeholder in code finds none but proper names (GitHub, Local Bridge, OAuth). Every label of this row is sentence case.
**2026-11-04:** Reopened in D5-b's fifth pass: a collection's or folder's Scripts tab heads its editors "Pre-request Script" and "Post-response Script" (`inherited-settings-dialog.html:51`, `:61`). Open, D5-c.
**2026-11-04:** Fixed in D5-c: a collection's and a folder's Scripts tab head their editors "Pre-request script" and "Post-response script".

### Found on the other screens

**U-055. A request on its way shows grey bars and nothing else.**
Severity 3. H1. SD, OC.
While a request waits, the response pane is a loading skeleton: no
"Sending", no time so far, no word of where it went. Cancel is the only
sign, in Send's place. A request to a slow server looks the same at one
second and at fifty.
Evidence: `baseline/design-chromium/response-loading-1440-light.png`.
**Status:** Fixed in #442 (D4-e, D3.7). Nothing shows for the first second; then "Sending… x.x s" counts up beside Cancel.

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
**2026-11-02:** History's confirms fixed in #485 (D4-f): Clear history asks "Clear history? Every entry is deleted; collections are not touched. This cannot be undone." with Clear history and Cancel; an entry's Delete names the entry. The shared confirm's default and the tree's confirm are the next D4-f PR's.
**2026-11-03:** The shared confirm and the tree's fixed in #487 (D4-f): `acceptLabel` is required (no "Proceed"), the glyph and the centred template are gone; the tree no longer asks (U-080); Reset all data and Delete the secret {name} say what goes and the act.
**2026-11-03:** Delete secret was fixed with the shared confirm in #487 (D4-f): "Delete the secret {name}?" with **Delete**; checked in D4-g. Reset all data remains with D4-h.
**2026-11-03:** Reset all data checked in D4-h: its confirm says what goes, "This cannot be undone", and its button is **Reset all data** (#487). Every confirm of this row names its act.

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

Of the 70 below, the statuses say which session D4-e closed. The plan's row 1.42 moves the eight Blockers of
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
**Status:** Fixed in #437 (D4-e, D4.11). The editor writes each field as
focus leaves it, a removed or marked row at once, the environment being
left when another is chosen, and what is left when the dialog closes (DQ9);
Save changes is gone. An e2e finds the edit stored after ×, Escape and
choosing another environment. Review row W-1.

**U-066. A save that fails says nothing.** Severity 2. H1, H9. All.
`RequestSave.save` and `confirmSaveAs` have `try/finally` and no `catch`:
an IndexedDB error goes to the console and Diagnostics only, and a result
of `null` (the request was deleted in another tab) does nothing. The only
sign is that the tab's unsaved dot stays. The draft survives, because the
tab stays dirty and closing it asks first.
Evidence: `services/request-save.ts:106-130, 151-172`; `composer.ts:141`.
**Status:** Fixed in #443 (D4-e, D4.11). A save that does not land says so in an alert by Save. Review row W-8.

**U-068. Saving from the keyboard drops focus to the page.** Severity 2.
H7. SD, and everyone on a keyboard.
Save is `[disabled]` while `savingRequest()` is true, so the focused
button is disabled under the caret and focus moves to `<body>`. The next
key goes nowhere.
Evidence: `composer/address-row.html:76-90`.
**Status:** Fixed in #443 (D4-e, D4.11). Save keeps focus while it saves (`aria-disabled`). Review row W-10.

**U-067. ⌘S collapses the folder that holds the request.** Severity 2. H1,
H6. SD, QA.
`refreshCollectionEntry` rebuilds the tree's expansion and clears its
selection, so what was just saved disappears from the sidebar on every
save.
Evidence: `services/collections-store.ts:257-262`;
[`hig-review/1440-light-kb-ctrl-s-after.png`](hig-review/1440-light-kb-ctrl-s-after.png).
**Status:** Open, D4-f. Review row W-9.
**2026-11-02:** Not reproducible on 2026-11-02 in three engines, before or after a reload: after ⌘S the folder stays open and the saved row is shown and selected. The save path changed in D4-e (#443); `e2e/collections.spec.ts` now holds it (#483).

**U-094. A click on the backdrop loses what was typed.** Severity 3. H5.
All.
Create vault passphrase and Save to collection have `dismissableMask`: a
stray click closes them, and both passphrases or the name are lost.
Evidence: `app-shell.html:390`; `save-as-dialog.html:6`;
[`hig-review/1440-dark-40-vault-create.png`](hig-review/1440-dark-40-vault-create.png).
**Status:** Open, D4-f (Save to collection) and D4-g (the vault). Review
row W-40.
**2026-11-02:** Fixed in #483 (D4-f, and the vault's half with it): Save to collection and the vault's passphrase dialog take no click on the backdrop; Escape and Cancel close them (`e2e/collections.spec.ts`).

**U-080. Nothing can be undone.** Severity 3. H3. All.
Deletes go through a confirm, a row's × removes it at once, and ⌘Z
restores neither.
Evidence: `collections-sidebar.ts:487-490`; the rows editor's ×.
**Status:** Open, D4-f, after the maintainer chooses the undo model (an
"Undo" in place for a few seconds, the confirm kept for Reset all data and
Replace all, is the review's proposal). Review row W-24.
**2026-11-03:** Fixed in #487 (D4-f), the review's model taken under row 1.55's instruction: a delete in the tree goes at once and is offered back for 10 s (kept while the pointer or focus is on the line, WCAG 2.2.1) by Undo or ⌘Z outside a field; it puts back, in one transaction, the records and the files the delete read in its own (`src/app/data/removed.ts`). The confirms stay for Clear history and Reset all data. Undo lasts the page: a reload ends it.
**2026-11-03:** Environments take the same road in #493 (D4-g): deleting one goes at once with "Removed {name}." and Undo, which puts it back, in use again if it was. The browser's own confirm() asked before.

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
**Status:** Fixed in #446 (D4-e, D4.11). The response's status line is said by a `role=status` region there from the first render. Review row W-2.

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
**Status:** Fixed in #446 (D4-e, D4.11). The address's error is an alert region there from the first render. Review row W-3.

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
**Status:** Fixed in #446 (D4-e, D4.11). The shell's banners are said by regions there from the first render; `scripts/live-regions.test.mjs` fails on a `role=status` or `alert` made inside `@if`. Review row W-18.

**U-063. Two visible labels are not in the accessible name.** Severity 2.
H4. All who use voice control.
The backup reminder's "Not now" is named "Dismiss backup reminder"; the
secrets manager's usage chips show "Staging.apiKey" and are named "Locate
apiKey in environment Staging". Saying what is on the screen does not
reach them. WCAG 2.5.3 (A).
Evidence: `app-shell/app-shell.html:263-270`; `secrets/secrets-manager.html:77`.
**Status:** Fixed in #440 (D4-e, D4.11). `e2e/label-in-name.spec.ts` holds every control of D0.1's screens to it. Review row W-4.

**U-071. Rows are named by their number, not their content.** Severity 2.
H4. All who use a screen reader.
"Send parameter 1", "Send header row 2", "Send part 3"; every row's × is
"Remove parameter" or "Remove variable", and the lock is "Mark variable as
secret".
Evidence: `params-panel.html:13, 32`; `rows-editor.html:10`;
`multipart-editor.html:7`; `environments-manager.html:185-198`.
**Status:** Open, D4-g (the rows editors are shared; D4-g takes all of
them). Review row W-14.
**2026-11-03:** The environment editor's rows fixed in #493 (D4-g): "Variable name, n of m", "Value of {name}", "Mark {name} as secret", "Remove {name}".
**2026-11-04:** Fixed in D5-a: Params, the rows editor (headers, a form body's fields, a collection's and the global variables) and the multipart editor name each row by its content the same way: "Send {name}", "Header name, n of m", "Value of {name}", "Type of {name}", "File for {name}", "Remove {name}", and "this header" (or parameter, field, variable, part) before the row has a name. `row-names.spec.ts` holds the three.

**U-072. The status bar's words are not its controls.** Severity 2. H4,
H1. All.
"Route: Auto", "Vault locked" and "Secrets" are text beside 26 px icon
buttons named "Local Bridge settings", "Unlock secrets" and "Manage
secrets", and a lock or unlock is not announced. The status bar is the
one element of the app the review found its own, and the least operable
part of the shell.
Evidence: `app-shell.html:323-362`;
[`hig-review/1440-dark-03-response-json.png`](hig-review/1440-dark-03-response-json.png).
**Status:** Fixed in #456 (D4-e). Each status bar item is one button named by its words, and a lock or unlock is said. Review row W-15.

### Pointer, reflow and text size

**U-064. The split between request and response needs a drag.**
Severity 2. H7. Everyone who uses one pointer without dragging.
The 8 px gutter is moved by dragging or by the arrow keys. There is no
single-pointer way. WCAG 2.5.7 (AA).
Evidence: `ui/splitter.ts:26-40, 70-112`.
**Status:** Fixed in #438 (D4-e, D4.11). A click on either side of the split's line moves it a tenth; a double click puts it back. Review row W-5.

**U-065. At 320 px the page scrolls sideways.** Severity 2. H4. Phones,
and 400% zoom on a 1,280 px window.
The toolbar's Settings button ends at x = 322 (`scrollWidth` 322), in
both themes. The plan's phone rule is 360 px; WCAG 1.4.10 (AA) names
320 CSS px.
Evidence: `header.ds-toolbar`;
[`hig-review/320-light-toolbar-overflow.png`](hig-review/320-light-toolbar-overflow.png).
**Status:** Fixed in #457 (D4-e, D4.11). 320 px joins the layout widths, and `e2e/reflow.spec.ts` opens every screen of D0.1's index at 320 px in three engines. Review row W-6.

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
**2026-11-02:** Fixed in #479 (D3-b): every type token is in rem and the token test fails on a font size in px in any stylesheet; icons are in rem too. `e2e/layout.spec.ts` sends a request at 200% text and 1,440 px and finds no response tab's label cut.

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
**2026-11-03:** Fixed in #489 (D4-f), decided under row 1.55: the drawer stays the default below 1,200 px (the widths that set it were measured, `CLAUDE.md`), and from 1,024 px the sidebar can be kept beside the page at 280 px, the choice kept in `wayfarer:sidebar-pinned`; below 1,024 px it is a drawer.

**U-097. At 390 px the toolbar is six controls, five of them icons.**
Severity 3. H6. OC.
Sidebar, environment, Environments, lock, History and Settings; the way to
collections is the corner farthest from the thumb.
Evidence: [`hig-review/390-light-26-tree.png`](hig-review/390-light-26-tree.png).
**Status:** Open, D4-f (Environments and History move into the drawer as
labelled rows). Review row W-41c.
**2026-11-03:** Fixed in #489 (D4-f): on a phone the toolbar is the sidebar, the environment, the lock and Settings; Environments, Request history and Search are named rows at the top of the drawer.

**U-099. Values flip under a right-to-left page.** Severity 3. H4. None
today: no right-to-left locale is planned.
With `dir=rtl` the address reads "content/json?kind=pets/{{baseUrl}}",
the status line "ms 16.4", and the response editor drew empty. No mono
field sets `dir="ltr"`.
Evidence: [`hig-review/1440-light-stress-rtl-composer.png`](hig-review/1440-light-stress-rtl-composer.png);
`composer/address-row.html:29-40`.
**Status:** Open, D3.6 (`uiInput` and Monaco's host take `dir="ltr"`).
Review row W-41g.
**2026-11-02:** Fixed in #482 (D3-b): every monospace value and Monaco's host are `direction: ltr` with `unicode-bidi: isolate`; `e2e/forced-colours.spec.ts` sets `dir="rtl"`, sends, and finds the address left to right and the editor's lines drawn.

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
**Status:** Fixed in #442 (D3.7, session D4-e). Send has no press scale; nothing shows for a reply under a second; the response, its status and a pane's switch appear at once; no theme transition. Review rows W-22 and DS-22.

**U-095. A request ready to send is offered cURL and Import.** Severity 3.
H6. OC, SD.
With a saved request open and an address in it, the empty response pane
offers "Paste a cURL command" and "Import a collection…": the next step is
Send.
Evidence: [`hig-review/1440-dark-26-tree.png`](hig-review/1440-dark-26-tree.png);
`response-viewer.html`.
**Status:** Fixed in #445 (D4-e). A ready request's empty response says Send and its key. Review row W-41a.

**U-091. Send and Run turn into Cancel where they were.** Severity 3. H5.
SD, QA.
A double click sends and cancels. "Cancel run" is red and filled.
Evidence: `run-view.html:8-13`; `address-row.html:103-112`.
**Status:** Send fixed in #452 (D4-e): the second click of a double click is not a Cancel. Run remains with D4-i. Review row W-36.
**2026-11-03:** Run fixed in #510 (D4-i): Run and Cancel run are one button, as Send is; the second click of a double click neither cancels nor, after a short run, starts another; Cancel run is the secondary fill, not red.

**U-090. Tab panels that hold controls are Tab stops of their own.**
Severity 3. H7. Everyone on a keyboard.
Angular Aria gives every `ngTabPanel` `tabindex="0"`; the pattern asks for
it only when a panel has nothing focusable. Three empty stops on every
walk through the composer.
Evidence: `ui/tabs.ts`; `response-viewer.html:155-510`.
**Status:** Fixed in #447 (D4-e). A pane is a Tab stop only while nothing in it can take focus. Review row W-35.

**U-103. "Must be JSON" reads as a rule, not a choice.** Severity 4. H2.
SD.
The WebSocket view's checkbox. "Check it is JSON before sending".
Evidence: `socket/socket-view.html:64`.
**Status:** Fixed in #455 (D4-e). A message that is not JSON is said before it is sent. Review row W-42c.

**U-104. The timing tooltips hedge.** Severity 4. H2. SD.
"including headers if available" (the app knows), "TLS/SSL", an unspaced
em dash, and noun fragments that end in full stops.
Evidence: `shared/inspect/timing-bars.ts:12-59`.
**Status:** Fixed in #449 (D4-e). Each phase of the Timings tab is explained in a sentence. Review row W-42d.

**U-087. The theme button leaves System on its first press.** Severity 3.
H1. All.
The status bar's button flips light and dark; the first press leaves the
system's choice without saying so.
Evidence: `app-shell.html:370-379`; `theme.ts:51-53`.
**Status:** Fixed in #456 (D4-e). The theme button goes system, light, dark, and says which comes next.

### Collections, tabs, history and the palette

**U-081. ⌥T and ⌥W fire while typing.** Severity 3. H5, H7. SD on a Mac,
Firefox users on Windows and Linux.
They are read on `window` with no check for a field: ⌥W types "∑" on a
Mac, so typing it in a field closes a tab. On Windows and Linux, Alt+T is
Firefox's Tools menu.
Evidence: `tab-strip.ts:88-99`; `shortcuts.ts:16-17`.
**Status:** Open, D4-f (needs a choice of keys). Review row W-25; U-032's
fix holds otherwise.
**2026-11-02:** Fixed in #483 (D4-f), with the keys kept (decided under row 1.55's instruction): Alt+T and Alt+W act in one-line fields, where focus usually is and a typed † or ∑ is not plausible, and not in a text area, Monaco or anything editable, where it is. Firefox's Alt+T menu was already prevented (`tabs.spec.ts`).

**U-086. Clear history is a red icon beside Close.** Severity 3. H5. All.
The icon-only, red-at-rest "Clear all history" sits 34 px from the
drawer's Close.
Evidence: `app-shell.html:84-103`;
[`hig-review/1440-dark-37-history.png`](hig-review/1440-dark-37-history.png).
**Status:** Open, D4-f. Review row W-31.
**2026-11-02:** Fixed in #485 (D4-f): Clear history… is a worded button above the list, away from Close, and its confirm names the act; each row's Delete is grey at rest.

**U-102. New request is in the drawer only.** Severity 4. H4. All.
Below 1,200 px the drawer has a "New request" button; the pinned sidebar
has none.
Evidence: `app-shell.html:27-33`;
[`hig-review/820-light-26-tree.png`](hig-review/820-light-26-tree.png)
against [`hig-review/1440-dark-26-tree.png`](hig-review/1440-dark-26-tree.png).
**Status:** Open, D4-f (the New menu of ia.md at every width). Review row
W-42b.
**2026-11-02:** Fixed in #484 (D4-f): the sidebar's New menu, at every width, has Request in the selected collection or folder.

**U-093. Cards are back inside overlays.** Severity 3. H8. All.
The palette's rows, the environments list, Settings › General's theme box
and History's skeletons are cards, which D4-d took out of the composer.
Evidence: [`hig-review/1440-dark-30-palette.png`](hig-review/1440-dark-30-palette.png),
[`hig-review/1440-dark-35-environments-empty.png`](hig-review/1440-dark-35-environments-empty.png),
[`hig-review/1440-dark-44-settings-general.png`](hig-review/1440-dark-44-settings-general.png);
`past-requests.html:5`.
**Status:** Open, D4-f (palette, history), D4-g (environments), D4-h
(settings). Review row W-39; the remainder of U-004.
**2026-11-02:** The palette's half fixed in #484 (D4-f): its rows are plain rows in one floating list, no boxes inside it.
**2026-11-02:** History's skeleton fixed in #485 (D4-f): rows to come are lines, not boxes.
**2026-11-03:** The environments' share fixed in #493 (D4-g): no card inside the tab; the list's rows have no border, and the editor is set off by a line where the two sit side by side.
**2026-11-03:** Settings' share fixed in #507 (D4-h): a group is rows between hairlines on the dialog's surface, no box and no fill; the danger zone's lines are the error colour. Every card of this row is gone.
**2026-11-04:** D5-b's fifth pass: the Secrets dialog keeps a banner card and a dashed box inside the dialog: U-198. Open, D5-c.
**2026-11-04:** The Secrets dialog's cards are gone (U-198).

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
**2026-11-03:** Fixed in #492 (D4-g): the environments are no longer a dialog, so the dialogs they open (new environment, export, globals, the vault) open over a page, not over another dialog.

**U-076. A run's results lead nowhere.** Severity 2. H3, H7. QA.
A failed row cannot open its request, its response or the failing test:
the tester finds the request in the tree and sends it again, which loses
the run's data.
Evidence: `runner/run-view.html:158-191`;
[`hig-review/1440-dark-34-run.png`](hig-review/1440-dark-34-run.png).
**Status:** Open, D4-i (each row opens its exchange; plan D4.12's rail
holds it). Since D4-l (D4.12, 2026-10-27) each row that was sent opens into its exchange record (Record, under the row); opening its request, its response and the failing test is D4-i's. Review row W-20.
**2026-11-03:** Fixed in #513 (D4-i): each row whose request is still saved has **Open**, which opens it in a tab of its own (a run's tab is never loaded into), and the run keeps its results; the row already lists its failed tests by name and opens into its exchange record, which holds the response the run got. A row leads to its request, its response and its failing test.

**U-096. A run's setup stays above its results.** Severity 3. H8. QA.
After a run the form (Iterations, Delay, Stop on first failure, Data
file) is still first; the counts and failures are below it.
Evidence: `runner/run-view.html:17-98`;
[`hig-review/1440-dark-34-run.png`](hig-review/1440-dark-34-run.png).
**Status:** Open, D4-i. Review row W-41b.
**2026-11-03:** Fixed in #510 (D4-i): once a run starts the setup folds to one line ("1 iteration, no delay, …" and Change), so after a run the counts and the results come first; Change opens the form.

**U-069. "Send to a different host?" hides what Yes allows.** Severity 2.
H2, H5. PE, QA.
In a run, the question says "Yes holds for {host} until the run ends",
but the buttons are "Send" and "Don't send": one click allows every later
request of the run, and "Don't send" is a contraction.
Evidence: `state/workspace-store.ts:561, 829-832`.
**Status:** Open, D4-i (claim C-053's wording stays one run's). Review row
W-12.
**2026-11-03:** Fixed in #509 (D4-i): in a run the act says what one click allows, **Send to {host} for this run**, and the message says every later request of the run may send there without asking; a single send's is **Send to {host}**. "Don't send" is **Do not send** in both questions, and in `docs/scripts.md` and the trust centre. C-053's wording stays one run's.
**2026-11-03:** Fixed in #509 (D4-i): in a run the button says what one click allows, "Send to {host} for this run", and the message says every later request of the run may send there without asking; a single send's is "Send to {host}"; "Don't send" is "Do not send", here and in the bridge's question. C-053 still compares one run.

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
**Status:** D4-e's share fixed in #458 (the composer's OAuth and script review strings, the socket's and the script worker's errors). The shell's, the vault's, the environments', import's and the backup's remain with D4-f, D4-g and D4-h. Review row W-26.
**2026-11-03:** The vault's share fixed in #494 (D4-g): "That is not the vault's passphrase." for "Incorrect passphrase", and "The file is not JSON." twice (the vault's import and the backup's restore). The shell's words were fixed in D4-f. Import's remain with D4-h.
**2026-11-03:** Import's share fixed in #503 (D4-h): "{file} was not imported:" for "Unable to import". The backup's and the shell's remain with D4-h's Settings PR.
**2026-11-03:** Checked in D4-h: the shell's strings were fixed with its D4-f changes ("Show sidebar" and "Hide sidebar", #489; the vault's words, #494), and the backup's "The file is not JSON." in #494. Every string of this row is fixed.

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
**2026-11-02:** History's names fixed in #485 (D4-f): one act, Delete from history; one Clear, Clear history; a row opens its entry. The secrets', import's, the bridge's and Settings' remain with D4-g and D4-h.
**2026-11-02:** The tree's names fixed in #486 (D4-f): a request is never "New Item".
**2026-11-03:** The secrets' name fixed in #494 (D4-g): the environment export's choice is "Secret variables", not "Protected variables".
**2026-11-03:** The bridge's and Settings' names fixed in #505 (D4-h): "Bridge address"; Settings' history row says Clear history (#485). Every name of this row is now one.

**U-084. Empty places say what is missing, not what goes there.**
Severity 3. H6, H10. OC.
"No response headers available.", "No tests were run…", "The jar is
empty.", "None." twice, "No secrets yet … it'll show up here."
Evidence: `response-viewer.html:329, 344, 488, 525`; `cookies-pane.html:56`;
`diagnostics-pane.html:65, 77`; `secrets-manager.html:38-40`.
**Status:** D4-e's share fixed in #458 (the response's Headers, Timings and Tests). Secrets (D4-g), cookies and diagnostics (D4-h) remain. Review row W-29.
**2026-11-03:** Secrets fixed in #494 (D4-g): the empty list says "Secrets you mark in Environments are kept here." and how a variable is marked. Cookies and diagnostics remain with D4-h.
**2026-11-03:** Cookies and diagnostics fixed in #505 (D4-h): "Cookies that responses set through the Local Bridge are kept here.", "No errors since this page loaded." and "No content was blocked since this page loaded." Every empty place of the audit now says what goes there.

**U-092. Diagnostics says "Nothing leaves this machine" and fetches a
file.** Severity 3. H2. PE.
Its self-test asks the server the app came from for the app's own
manifest.
Evidence: `diagnostics-pane.html`; `diagnostics-pane.ts:158`.
**Status:** Open, D4-h. Review row W-37.
**2026-11-03:** Fixed in #505 (D4-h): the self-test says what it does, "asks the server this app came from for one of its own files", and "Nothing goes anywhere else"; the section's line says what is listed leaves only if copied.

**U-098. Counts in the import review disagree with their noun.**
Severity 3. H4. TP.
"{n} environment(s) detected.", "{n} variable(s)", "1 folders".
Evidence: `import/import-dialog.html:74, 126, 133`.
**Status:** Open, D4-h (with U-015). Review row W-41e.
**2026-11-03:** Fixed in #503 (D4-h): every count agrees with its noun ("1 folder", "3 variables", "2 environments in the file").

**U-100. The page says it is American English, and names are built by
concatenation.** Severity 3. H4. None today.
`<html lang="en">` on British copy; accessible names joined from parts
(`variable-chips.html:6`); plurals by ternary (`har-export-dialog.html:9`).
Evidence: `index.html:2`.
**Status:** Open, D4-h (plan D4.13: `lang="en-GB"`). The rest waits for a
plan that takes up translation; this one has none.
Review row W-41h.
**2026-11-03:** `lang="en-GB"` in #501 (D4-h, D4.13). The names built by concatenation and the plurals by ternary wait for a plan that takes up translation, as above.
**2026-11-04:** The remainder is accepted (plan row 1.64): names joined from parts and plurals by ternary read correctly in English, the app's only language, and a fix without a translation plan would be scaffolding. It reopens with a plan that takes up translation.

**U-105. "Trust center" is the one American spelling on screen.**
Severity 4. H4. All.
Settings › About's link. The file's name can stay.
Evidence: `settings/settings.ts:177`.
**Status:** Open, D4-h. Review row W-42e.
**2026-11-03:** Fixed in #501 (D4-h): "Trust centre".

### The installed app

**U-088. The installed app's chrome does not match it.** Severity 3. H4.
All who install it.
`theme-color` is #000000 and #F5F5F7, not the canvas colours, and follows
the system, not the app's theme. The manifest has no `theme_color`,
`background_color`, `id` or `description`.
Evidence: `index.html:8-9`; `public/manifest.webmanifest`.
**Status:** Open, D4-h (plan D4.13). Review row W-33.
**2026-11-03:** Fixed in #501 (D4-h, D4.13): `theme-color` is each theme's `--canvas-app`, set to the theme drawn by `theme.js` before the first paint and by `Theme` on every change, whatever the system prefers; the manifest has `id`, `description`, `theme_color` and `background_color` (the light canvas: a manifest cannot follow a theme). `scripts/installed-app.test.mjs` reads them against the tokens; `e2e/status-bar.spec.ts` changes the theme. Seeing the installed app on macOS, Windows and iOS is the maintainer's step (D1.8).

**U-089. The page asks for the whole screen and pads none of it.**
Severity 3. H4. Phones.
`viewport-fit=cover` with no `env(safe-area-inset-*)`, and the phone shell
is `100vh`.
Evidence: `index.html:7`; `app-shell.html:121`.
**Status:** Open, D4-h (plan D4.13). Review row W-34.
**2026-11-03:** Fixed in #501 (D4-h, D4.13): the shell pads `env(safe-area-inset-*)` on every side (`.safe-area`, inside its own height), and the phone shell is `min-h-dvh`, not `100vh`. Not yet seen on a notched phone (D1.8).

**U-101. Every icon of the manifest is "maskable any".** Severity 4. H4.
All who install it.
Art cut for the maskable safe zone is also used where the full mark is
wanted.
Evidence: `public/manifest.webmanifest`.
**Status:** Open, D2.4 (the icons). Review row W-42a.
**2026-11-04:** Fixed in D2.4 (D2-b): the manifest lists the mark at 192 and 512 px as `any` and one 512 px `maskable` icon with the glyph inside the safe zone (`packages/tokens/brand/`, `scripts/installed-app.test.mjs`).

### The design system

**U-106. An unchecked checkbox can hardly be seen.** Severity 2. H1. All,
low vision most.
Its only mark is a `--separator` hairline: 1.20 to 1.26:1 in dark, 1.21
to 1.22:1 in light. In the Params, Headers, multipart and History rows it
has no visible label either. WCAG 1.4.11 (AA).
Evidence: `ui/checkbox.css:14-15`; `params-panel.html:10-16`;
`rows-editor.html:7-12`; `multipart-editor.html:4-10`;
`past-requests.html:71-77`.
**Status:** Fixed in #441 (D4-e, D4.11). Review row DS-1.

**U-107. The option the keys are on in a select barely shows.**
Severity 2. H1. Everyone on a keyboard.
`--fill-hover` alone: 1.19:1 in dark, 1.08:1 in light. The forced-colours
block already draws a 2 px `--accent` inset outline. WCAG 1.4.11 (AA).
Evidence: `select.css:101-105`; `select.ts:43, 90`.
**Status:** Fixed in #441 (D4-e, D4.11). Review row DS-2.

**U-108. Grey text on the warning fill is under 4.5:1.** Severity 2. H1.
All.
12 px `--label-tertiary` on `--status-warning-fill`: 4.48:1 in dark. The
contrast gate checks no label on a status fill.
Evidence: `environments-manager.html:170-172`; `tokens.css:86, 116`.
**Status:** Fixed in #441 (D4-e, D4.11). Review row DS-3.

**U-074. A field's focus is fainter than 3:1.** Severity 2. H1. Everyone
on a keyboard.
A 1.56 to 2.13:1 border and a 1.41 to 1.79:1 glow, with `outline: none`.
The method field shares the address bar's glow, so it is not clear which
half has focus.
Evidence: `input.css:49-54`; `select.css:30-36`; `components.css:308-311`;
[`hig-review/1440-light-focus-method.png`](hig-review/1440-light-focus-method.png).
**Status:** Open, D3.6 (session D3-b). Review rows DS-4 and W-17.
**2026-11-02:** Fixed in #478 (D3-b): a focused field, select or address half has a 2 px edge in ink (above 10:1 on every surface; `contrast.test.mjs`), and in the address bar only the half with focus is ringed.

**U-109. Controls are drawn as faintly as decoration.** Severity 2. H1,
H6. All.
Interactive borders 1.14 to 1.43:1, field fills 1.05 to 1.13:1, hover
adds 0.1:1, the scrollbar thumb about 1.3:1. A control is found by
knowing where it is.
Evidence: `input.css`; `select.css`; `segmented.css`; `file.css`;
`components.css:565`; `styles.css:138-155`.
**Status:** Open, D3.6. Review row DS-5.
**2026-11-02:** Fixed in #478 (D3-b): a control's edge is `--ctl-boundary`, solved to 3:1 on every surface, and hover takes it to the tertiary label; the gate fails if a field, select, segmented choice, checkbox or file field reads `--separator`.

**U-110. There is no increased-contrast theme.** Severity 3. H1. Low
vision.
No `prefers-contrast` block; the setting has nothing to change.
Evidence: `tokens.css`; `packages/tokens`.
**Status:** Open, D3.6. Review row DS-6.
**2026-11-02:** Fixed in #478 (D3-b): `tokens.css` has a `prefers-contrast: more` block per theme, the same inputs solved at higher targets (secondary 10:1, tertiary 7:1, boundary 4.5:1), checked by the gate at both levels.

**U-111. 12 px is the working size.** Severity 3. H8. All.
190 of 275 uses of a type class are 12 px; the 14 px body appears five
times.
Evidence: the templates; `tokens.css:52-63`.
**Status:** Decided in D4-e (plan row 1.53): the compact density sets working text (values, rows, tabs, the response) at 13 px and captions at 12; prose and dialogs stay at the 14 px body. D3.6 builds it, measured with the text face DQ11 settles. Review row DS-8.
**2026-11-02:** Built in #479 (D3-b): values, rows, tabs, fields, selects and buttons are 13 px (`type-callout`, `type-mono-body`), captions 12 px, prose and dialogs 14 px.

**U-112. Secondary and danger buttons do not answer hover or press.**
Severity 3. H1. All.
`--fill-hover` equals `--fill-secondary`.
Evidence: `tokens.css:78-79, 180-181`; `button.css:122-140`.
**Status:** Open, D3.6. Review row DS-9.
**2026-11-02:** Fixed in #478 (D3-b): hover, press and selection are distinct derived fills (each a step of contrast over the last, held by the gate); secondary and danger buttons change edge on hover and fill on press.

**U-113. A disabled field looks enabled.** Severity 2. H1, H5. All.
`ui-select` has no disabled style, and a read-only field none of its own.
Evidence: `input.css:70-77`; `select.css`.
**Status:** Open, D3.6. Review row DS-10.
**2026-11-02:** Fixed in #478 (D3-b): a disabled field has a quiet fill, the secondary label and `not-allowed`; a read-only one a dashed edge. `ui-select` has no disabled state because nothing disables one; a select that needs it takes the field's rule.

**U-114. An invalid field looks valid.** Severity 3. H9. All.
Nothing styles `[aria-invalid]`.
Evidence: `address-row.html:39`; `input.css`; `select.css`.
**Status:** Open, D3.6. Review row DS-11.
**2026-11-02:** Fixed in #478 (D3-b): `[aria-invalid="true"]` gives a field its edge in the error colour, also when focused.

**U-115. Elevation flattens inside dialogs.** Severity 3. H8. All.
A popup inside a dialog is level with it in dark and lower than it in
light.
Evidence: `tokens.css:74, 91, 104-105, 176, 206-207`.
**Status:** Open, D3.6. Review row DS-13.
**2026-11-02:** Fixed in #478 (D3-b): in dark a popup (`--surface-overlay`) is one step lighter than the dialog it opens in; in light both are white, the popup above it by its shadow.

**U-116. Forced colours lose five marks.** Severity 2. H1. Windows High
Contrast users.
The select's focus, the unsaved dot, the timing bars, the storage meter
and the drop line have no forced-colours rule.
Evidence: `select.css:31-36`; `tabs.css:95-101`; `components.css:360-363`;
`settings.css:216-229`; `tree.css:47-53`;
[`hig-review/1440-light-stress-forced-colors-composer.png`](hig-review/1440-light-stress-forced-colors-composer.png).
**Status:** Open, D3.6. Review row DS-14.
**2026-11-02:** Fixed in #482 (D3-b): each of the five has a forced-colours rule (an outline in `Highlight`, a fill in `CanvasText` with `forced-color-adjust: none`, a border for the drop line); `e2e/forced-colours.spec.ts` checks each.

**U-117. The selected row barely shows, and hover erases it.** Severity 2.
H1, H6. All.
The selected row's fill is 1.14 to 1.23:1; hovering it replaces the
selection's fill. In dark, the chosen segment is darker than its track.
Evidence: `tree.css:35-41`; `segmented.css:40-46`.
**Status:** Open, D3.6. Review row DS-15.
**2026-11-02:** Fixed in #478 (D3-b): the selected row has a derived fill and a 3 px ink mark at its start (3:1 on the row, hovered or not); hover makes it a step stronger and keeps the mark. The chosen segment is raised above its track and edged at 3:1.

**U-118. Colours and shadows written as literals.** Severity 3. H4. None
directly.
`#fff`, a cool field shadow, a 40% black segmented shadow in light, the
scrims, the drawer's shadow.
Evidence: `button.css:9, 236`; `input.css:12`; `select.css:12`;
`segmented.css:42-44, 86-88`; `dialog.css:17, 131, 138, 142`.
**Status:** Open, D3.6. Review row DS-17.
**2026-11-02:** Fixed in #478 (D3-b): the scrims are `--scrim`, the drawers take `--shadow-dialog`, the field and segment shadows are gone; the token test fails on a colour or shadow literal in `src/design-system` or `src/app/ui`.

**U-119. The label tiers have collapsed.** Severity 3. H8. All.
Secondary and tertiary are close, and in light tertiary is darker than
secondary.
Evidence: `tokens.css:84-87, 186-189`.
**Status:** Open, D3.6. Review row DS-19.
**2026-11-02:** Fixed in #478 (D3-b): the tiers are solved from targets (primary 15:1 on the canvas, secondary 7:1, tertiary 4.5:1 on every surface), and the gate fails unless each has less contrast than the one above on every surface. The maintainer's look at the tiers is row 1.55.

**U-120. Some token roles repeat or mislead.** Severity 3. H4. None
directly.
`text-method-*` draws the fill colour as text, at 2.65:1.
Evidence: `tokens.css`; `styles.css:65-101`.
**Status:** Open, D3.6. Review row DS-20.
**2026-11-02:** Fixed in #478 (D3-b): the `text-method-*` and `status-info` utilities, which drew a fill as text, are gone, as are `--label-placeholder` and `--label-secondary-on-fill` (the tiers now read on a fill).

**U-121. Chips spring up on hover.** Severity 3. H8. All.
A translate with a spring easing, against motion.md's tone.
Evidence: `components.css:329-337`; `secrets-manager.css:14-27`.
**Status:** Open, D3.7. Review row DS-21.
**2026-11-04:** Fixed in #442 (D3.7): a chip changes colour only on hover, no lift (`motion.md`'s table; `e2e/motion.spec.ts`).

**U-122. A theme change fires about 90 transitions.** Severity 3. H8. All.
motion.md says a theme change is instant.
Evidence: `styles.css:182-195`; `button.css:39-45`.
**Status:** Open, D3.7. Review row DS-23.
**2026-11-04:** Fixed in #442 (D3.7): a theme change is instant, and the controls' own fades are held off for that frame (`theme.ts`; `e2e/motion.spec.ts`).

**U-123. One `transition-all`.** Severity 3. H8. None directly.
The environment variable row.
Evidence: `environments-manager.html:151`.
**Status:** Open, D3.7 (the token test bans it). Review row DS-24.
**2026-11-04:** Fixed in #442 (D3.7): no `transition-all` is left, and the token test fails on one (`packages/tokens/tokens.test.mjs`, "every transition names the properties it moves").

**U-079. Showing the sidebar slides the page.** Severity 3. H8. All.
`margin-left` over 300 ms both ways re-lays out Monaco on every frame and
breaks two rules of motion.md.
Evidence: `app-shell.html:136`.
**Status:** Open, D3.7. Review row W-23.
**2026-11-04:** Fixed in #442 (D3.7): the pinned sidebar moves the page in one frame, with no `margin-left` slide (`motion.md`'s table; `e2e/motion.spec.ts`).

**U-124. Controls have six heights and no scale.** Severity 3. H4. All.
40, 41, about 35, 34, 32 and 28 px.
Evidence: `button.css`; `input.css`; `select.css`; `components.css`.
**Status:** Open, D3.6. Review row DS-25.
**2026-11-02:** Fixed in #478 (D3-b): `--ctl-height-sm`, `-md` and `-lg` (28, 32 and 36 px, in rem); the token test fails on a button, field or select height that is not one of them.

**U-125. The focus ring rounds every corner it draws on.** Severity 3. H4.
All.
The global `:focus-visible` sets a 3 px radius.
Evidence: `styles.css:164-168`.
**Status:** Open, D3.6. Review row DS-26.
**2026-11-02:** Fixed in #478 (D3-b): the global `:focus-visible` rule sets no radius; the ring follows each element's own corners.

**U-126. Radii outside the scale.** Severity 3. H4. All.
6 px, `999px`, and a wrong `--radius-lg` fallback.
Evidence: `accordion.css:17-27`; `segmented.css:80`; `controls.css:93`;
`settings.css:106, 219`.
**Status:** Open, D3.6. Review row DS-27; the remainder of U-004.
**2026-11-02:** Fixed in #478 (D3-b): three radii and a circle (`xs` 3, `sm` 5, `lg` 9, `full`); 7, 12 and 16 px and the off-scale values are gone, and the token test fails on a radius in px or a Tailwind `rounded-md`, `-xl` or `-2xl`.

**U-127. Material's metrics, and icons a weight lighter than the text.**
Severity 3. H4. All.
Checkbox, field, select and dialog sizes are Material's; Material Symbols
at weight 300.
Evidence: `checkbox.css`; `input.css`; `select.css`; `dialog.css`;
`components.css:531-534`.
**Status:** Open: D3.6 (the metrics) and D2.4 (the icon set). Review row
DS-28.
**2026-11-02:** The metrics half fixed in #479 (D3-b): fields, selects and buttons take the control-height tokens, and the Inter tuning (stylistic sets, negative tracking) is gone. The icon set stays D2.4's.
**2026-11-04:** The icon half fixed in D2.4 (D2-b): the set is Wayfarer's own (`packages/tokens/brand/icons`), stroked 2 of 24 units, 0.083 em, against the labels' stems of 0.084 to 0.094 em; every icon checked at 16, 20 and 24 px at 1x and 2x (`brand/icons-1x.png`, `icons-2x.png`).

**U-128. GET is the colour of success.** Severity 3. H4. All.
Method and status colours share values.
Evidence: `tokens.css`.
**Status:** Open, D3.6. Review row DS-29.
**2026-11-02:** Fixed in #478 (D3-b): success has its own colour; GET keeps the convention's green, and the token test fails if the two are the same value.

**U-129. Stale file headers, and one choice painted twice.** Severity 4.
H8. None directly.
Evidence: `animations.css:1-4`; `components.css:1-4`; `segmented.css`.
**Status:** Open, D3.6. Review row DS-30.
**2026-11-02:** Fixed in #478 (D3-b): the two file headers say what their files hold, and the chosen segment is painted once.

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
**2026-11-04:** Closed in D5-c with D2.5: the logo-off test on the primary screen at 1,440 px, both themes, quotes the exchange record ("Sends to …", "Direct to 127.0.0.1:4300", and opened, "Sent from this page to 127.0.0.1:4300.", "No vault secret was filled."), and the competitor swap finds that record on no rival's main screen ([`hig-review-2026-11-04.md`](hig-review-2026-11-04.md), section 5; [`benchmark.md`](benchmark.md)). Verdict: authored.

## Fourth pass: the red-team review, 2026-10-26

A second hig-review of the whole app
([`hig-review-2026-10-26.md`](hig-review-2026-10-26.md)), on
`docs/hig-review-red-team` from `main` at `5b8c7a79`, whose app code is
the tree the third pass read. It researched the category first (six
products), walked five flows from a fresh browser context with step
counts, attacked the third pass as a draft, and measured the typefaces in
three engines. Chromium 156 only for the app; a screen reader, Firefox
and WebKit captures and the Local Bridge were not run. The screenshots it
cites are in [`hig-review/`](hig-review/) as `1440-light-rt-NN-*.png`.

Its rows keep their own IDs (N-n red team, P8-n distinctiveness, T-n
type), and each finding below names its row. Severity follows the third
pass's mapping. Rows that confirm or extend an earlier finding have no ID
of their own: U-061 is now confirmed at runtime, and U-011, U-020, U-024,
U-026, U-044, U-051, U-054, U-082, U-085, U-086 and U-093 have a note in
the review's section 2. Its three reworks and its theming sketch are not
findings: they were the plan's DQ8 to DQ11 (rows 1.49 and 1.51), which
the maintainer answered yes on 2026-10-26 (row 1.52).

Of the 22 below, the statuses say which session D4-e closed. The plan's row 1.48 puts U-130, U-135 to U-137, U-141
and U-145 first, in D4.11. Rows are grouped by theme, not by number.

### Credentials, secrets and storage

**U-130. The app names the wrong source for the credential it sends.**
Severity 2. H1, H2. SD, PE, QA, TP.
"Inherit bearer" was sent with the vault secret `token` of environment
Local, which shadows the collection's `col-token`; the Auth tab says
"Bearer token is sent, from collection "Shop"", because `inheritedLine`
names where the auth is set and not where its value comes from. The
variable chips skip variables used in Auth, and the status line says only
"Direct". On success nothing says a vault secret went.
Evidence: `composer/auth-editor/auth-editor.ts:59-66`;
`composer/variable-chips.html`;
[`hig-review/1440-light-rt-19-auth-tab.png`](hig-review/1440-light-rt-19-auth-tab.png);
the request's headers in the network log.
**Status:** Fixed in #439 (D4-e, D4.11). The Auth tab names where a token's value comes from, and the auth's variables have chips. Review row N1.

**U-135. "Mark as secret" is dropped when it triggers vault creation.**
Severity 2. H1, H5. PE, SD.
With no vault, the lock opens Create vault; after it the row is still
plain text, because `protectVariable` emits `requestUnlock` and returns
with nothing pending, so Save changes stores the token as an ordinary
variable. A row with no name or value ignores the lock with only a
`console.debug`.
Evidence: `environments/environments-manager.ts:246-262`;
[`hig-review/1440-light-rt-14-env-secret.png`](hig-review/1440-light-rt-14-env-secret.png),
[`hig-review/1440-light-rt-15-env-after-vault.png`](hig-review/1440-light-rt-15-env-after-vault.png),
[`hig-review/1440-light-rt-16-secret-marked.png`](hig-review/1440-light-rt-16-secret-marked.png).
**Status:** Fixed in #437 (D4-e, D4.11). With no vault the row asks for
the passphrase in place and writes the variable as its reference once the
vault is made; a locked vault is unlocked and the row then marked; a row
with no name or value says why it cannot be marked. Review row N6.

**U-136. "Secret stored" appears before the environment is saved, and
Save changes says nothing.** Severity 2. H1, H5, H9. PE, SD.
`saveSecret` writes to the vault when the lock is clicked; the reference
lives only in the unsaved draft, so closing the dialog (U-060) leaves an
orphan secret. Save changes is always enabled, confirms nothing and has
no catch; rows with a value and no key are dropped.
Evidence: `environments-manager.ts:263-271, 331-351`;
`environments-manager.html:237`;
[`hig-review/1440-light-rt-17-env-saved.png`](hig-review/1440-light-rt-17-env-saved.png).
Not seen: a listing of the vault after closing.
**Status:** Fixed in #437 (D4-e, D4.11). The reference is written the
moment the secret is, so no secret is left without its variable; a row
with a value and no name says it is not kept; a refused write says so.
Review row N7.

**U-137. Data can disappear while the status bar says "Saved in this browser only".**
Severity 2. H1, H5. OC, SD.
`navigator.storage.persisted()` returned false after a save and an
import; the status bar's text never changes. The persistence state and
Safari's seven-day eviction are stated only in Settings › Data and
storage, and the backup reminder waits 14 days, so a Safari user who has
not installed the app can lose everything before the first reminder.
Evidence: `services/storage-persistence.ts:5-21`;
`services/workspace-backup.ts:22`; `settings.html:272-279`;
`app-shell.html:368`. Seen in Chromium only.
**Status:** Fixed in #459 (D4-e, D4.11). The status bar says what `navigator.storage.persisted()` answered, and while it is false the backup reminder comes at the first save and then every 5 days. Review row N8.

**U-145. Add variable does not focus the new row.** Severity 3. H7. All.
From the keyboard, focus stays on Add variable.
Evidence: `environments-manager.html` (Add variable).
**Status:** Fixed in #437 (D4-e, D4.11). Review row N16.

**U-143. The unlock prompt during a send does not say what wants the
vault.** Severity 3. H1, H2. PE.
"Enter your passphrase to unlock encrypted secrets for this session."
names no request or secret.
Evidence: [`hig-review/1440-light-rt-27-send-vault-locked.png`](hig-review/1440-light-rt-27-send-vault-locked.png).
**Status:** Open, D4-g (D4.5). Review row N14.
**2026-11-03:** Fixed in #497 (D4-g): the unlock dialog a send opens says what asked and for which secrets, by their names: "Sending "Get pet" needs token from the vault." (or "this request" for one not saved; "Getting the token" for Get token). The vault is not read for it: the names are stored in the clear.

### The send, the route and the bridge

**U-131. "Route: Auto" misstates the route on an unpaired device.**
Severity 2. H1. SD, PE.
The bridge README says Auto without a paired bridge behaves like Direct;
the status bar prints the configured route, not what the app will do,
and after a CORS failure the status line has no route word.
Evidence: `app-shell.html:337`; `packages/bridge/README.md:55`;
[`hig-review/1440-light-rt-05-cors-first-run.png`](hig-review/1440-light-rt-05-cors-first-run.png).
**Status:** Fixed in D4-l (D4.12, #470). The status bar says what the app will do: "Route: direct" for Auto with no bridge paired, and for a Local Bridge with no address; a failed send's record and status line say "Direct to {host}, no bridge paired". Review row N2.

**U-138. No in-app path to the Local Bridge from the failure it fixes.**
Severity 2. H9, H10. SD, PE, OC.
The failure body ends "for CORS, the Local Bridge can relay the request"
with no action; no template shows `npx wayfarer-bridge`; U-051's planned
button assumes a paired bridge.
Evidence: `settings/bridge-pane.html:148-162`;
`packages/core/src/send/exchange.ts:127`;
[`hig-review/1440-light-rt-06-bridge-settings.png`](hig-review/1440-light-rt-06-bridge-settings.png).
**Status:** Fixed in D4-l (D4.12, row 1.52, #470). A send that got no response with no bridge paired opens its record with `npx wayfarer-bridge` and Copy, the pairing code in place, and Send again once paired (`e2e/bridge-setup.spec.ts`, with the bridge's test double). Review row N9.

**U-134. The send refusal blames the address when a variable is
missing.** Severity 2. H9, H2. All.
With `{{base}}` unresolved, Send says "The address is not a URL a request
can go to. Write it as https://host/path."; three messages stack for one
cause; "URL" breaks voice.md's glossary.
Evidence: `state/workspace-store.ts:483-491`; `composer.html:57`;
[`hig-review/1440-light-rt-11-send-missing-base.png`](hig-review/1440-light-rt-11-send-missing-base.png).
**Status:** Fixed in #445 (D4-e, D4.3). A send held back by a variable with no value names it once. Review row N5.

**U-132. Variable chips do nothing for a missing, collection, secret or
dynamic variable.** Severity 2. H3, H6. All.
`handleVariableChipClick` acts only for environment variables and sets a
signal no template reads; the red "Missing" chip is dead. A development
build; may be unfinished.
Evidence: `composer/variable-chips.ts:17-23`;
[`hig-review/1440-light-rt-10-missing-chip-click.png`](hig-review/1440-light-rt-10-missing-chip-click.png).
**Status:** Open, D4-g (D4.5). Since D4-l (D4.12's preview, 2026-10-27) a missing chip adds the variable to the active environment and an environment's chip shows it there; a collection's, a folder's, a global's, a secret's and a dynamic chip still do nothing, and "Add {name} to" the collection is D4.5's. Review row N3.
**2026-11-03:** Fixed in #495 (D4-g, D4.5): each chip opens where its value is set. A collection's or a folder's opens that holder's settings at Variables (the folder that gives the value, nearest the request first); a global's opens the global variables; a secret's opens the vault's secrets; a missing one with no environment in use makes an environment with the variable as its first row. The settings dialog moved from the sidebar to the shell, since below 1200 px the sidebar's closed drawer could not show it. A dynamic variable has nothing to set, and its chip says "New value each send".
**2026-11-03:** D4.5's "Add {name} to" in #498 (D4-g): for a request in a collection, a missing variable's chip opens a menu at the chip, "Add {name} to environment "{name}"" (or "to a new environment") and "Add {name} to collection "{name}""; the second opens the collection's settings at Variables with a row of that name, its value to type. A request in no collection keeps the one action.

### Import

**U-133. The import review does not say that every request uses an
undefined variable.** Severity 2. H1, H5. TP, QA.
All six requests of `shop.postman_collection.json` use `{{base}}`, which
nothing imported defines; the first send fails.
Evidence: [`hig-review/1440-light-rt-07-import-review.png`](hig-review/1440-light-rt-07-import-review.png),
[`hig-review/1440-light-rt-09-imported-request.png`](hig-review/1440-light-rt-09-imported-request.png).
**Status:** Open, D4-h (D4.7). Review row N4.
**2026-11-03:** Fixed in #503 (D4-h, D4.7): `importText` adds one line per collection naming the variables its requests use that nothing in the file gives a value (the collection, a folder, an environment of the same file, a script's `set`), and how many requests use them; five by name, then a count.

**U-139. Disabled Postman query parameters are lost on save, and the
import note contradicts the app.** Severity 2. H4, H5. TP.
The note says "the composer has no switch for a parameter"; every param
row has a "Send parameter N" checkbox bound to `param.enabled`.
Evidence: `packages/core/src/import/postman.ts:234`;
`composer/params-panel.html:11-14`.
**Status:** Open, D4-h (D4.7). Review row N10.
**2026-11-03:** Fixed in #502 (D4-h, D4.7): reading the address again (opening a request, an edit of the address, a run) keeps the switched-off parameters it was given, in their places (`parseParamsFromUrl`); the import says nothing of them any more, since nothing is lost, and `docs/import.md` loses the line.

**U-141. The import review's buttons are named "Confirm import" and
"Cancel import".** Severity 3. H4. All.
The visible "Import" and "Cancel" are not at the start of the names
(passes 2.5.3 by containment; D4.11's planned e2e fails on it); focus
opens on × Close.
Evidence: the import dialog's footer;
[`hig-review/1440-light-rt-07-import-review.png`](hig-review/1440-light-rt-07-import-review.png).
**Status:** Fixed in #440 (D4-e, D4.11's e2e). Review row N12.

### Tabs and history

**U-140. Closing a scratch tab asks to discard changes history already
keeps.** Severity 3. H3, H8. SD, QA.
Every ad-hoc send leaves an unsaved dot, so the dot stops meaning
anything.
Evidence: [`hig-review/1440-light-rt-24-close-scratch-tab.png`](hig-review/1440-light-rt-24-close-scratch-tab.png).
**Status:** Open, D4-f (D4.4). Review row N11.
**2026-11-04:** Fixed in D5-a: a send that history keeps leaves a tab that is not saved clean (`WorkspaceStore.send`): no unsaved dot, and closing it asks nothing. An edit after the send marks it again; a saved request's tab is unchanged, since history does not write back to the collection. `composer.spec.ts` holds it.

**U-142. The fifth tab is cut under the tab actions at 1,440 px with no
overflow cue.** Severity 3. H1. SD, QA.
Evidence: [`hig-review/1440-light-rt-23-after-history-load.png`](hig-review/1440-light-rt-23-after-history-load.png).
**Status:** Open, D4-f (D4.4). Review row N13.
**2026-11-04:** Fixed in D5-a: a tab bar that scrolls fades 3 rem on the side that holds tabs out of view (`uiTabList` marks the sides; `tabs.css`), the composer's request tabs and every other bar. `tabs.spec.ts` and `e2e/tabs.spec.ts` hold it in three engines.

**U-144. Opening a request from history replaces the current clean tab
with no cue, and the tree keeps the old selection.** Severity 3. H1, H3.
SD, QA.
Evidence: [`hig-review/1440-light-rt-23-after-history-load.png`](hig-review/1440-light-rt-23-after-history-load.png).
**Status:** Open, D4-f (D4.4). Review row N15.
**2026-11-04:** Fixed in D5-a: a request opened from history goes into a tab of its own; only an empty new tab is taken for it (`ComposerView.loadPastRequest`, `TabState.empty`). The tree's selected row is the open tab's request, and none for a tab that is not a saved request (`CollectionsSidebar`, `Tree.choose`). Task 8 measured again: 9 inputs, 0.52 s (`baseline.md`).

### Visual system and type

**U-147. The accent has five jobs and sits beside GET and success
green.** Severity 3. H4. All.
ΔE_ok 0.063 from GET and success in dark; on the primary screen three
near-greens mean Send, GET and 200 OK.
Evidence: `src/design-system/tokens.css:95-101`, `:108`, `:125`, `:126`,
`:139`. Extends U-128.
**Status:** Open, D3-b (D3.6), with DQ11. Review row P8-1.
**2026-11-02:** Fixed in #478 (D3-b, DQ11): there is no accent; Send, the focus ring, the selected row's mark and a checked box are ink, and the token test fails on chroma above 0.015 in any token outside method and status.

**U-148. Wayfarer's own placeholder words are drawn in the wire face.**
Severity 3. H4. All.
Placeholders inherit `font-mono` from their fields (`ui/input.css:40-43`
sets no family), breaking the provenance rule on the first-run screen.
Evidence: `address-row.html:33,41`; `params-panel.html:18-22,29`;
`rows-editor.html:28`. Extends U-051.
**Status:** Fixed in #448 (D4-e, D4.3). A placeholder is in the app's face; an example value's stays monospace. Review row P8-2.

**U-149. Colour is written in OKLCH but not derived.** Severity 3. H4.
All.
73 (dark) and 74 (light) hand-set literals; light tertiary is darker
than secondary; an increased-contrast theme would be a third list.
Corrects the third pass's "parametric OKLCH theme kept". Extends U-110
and U-119.
Evidence: `packages/tokens/{dark,light}.tokens.json`; `tokens.mjs:111-122`.
**Status:** Open, D3-b (D3.6). Review row P8-3.
**2026-11-02:** Fixed in #478 (D3-b): the labels, the boundary, the state fills, the separators and the ink's states carry a `com.wayfarer.derive` extension and are solved by `tokens.mjs` from the theme's hue and chroma against `base.tokens.json`'s targets; the increased-contrast theme is the `more` targets.

**U-150. In Inter, capital I and lowercase l render identically at 12
and 13 px.** Severity 3. H4, H6. All.
Measured with the hig-review's `type-eval.js` in Chromium and Firefox
(pixel distance 0, no device pixel differs; WebKit at 13 px, 2 pixels).
Request, collection, folder and variable names are set in Inter. Inter's
character variants (`cv05`, `cv08`) have no effect in the
`@fontsource-variable/inter` build the app ships.
Evidence: `tokens.css:32`; `src/styles.css:3-4`; the review's section 6.
**Status:** Open, D3-b (D3.6), with DQ11. Review row T-1.
**2026-11-02:** Fixed in #479 (D3-b, DQ11): the text role is Atkinson Hyperlegible Next with Inter as the per-glyph fallback; `type-eval.js` in three engines finds no identical pair at 12 or 13 px (`docs/design/type-eval.md`).

**U-151. JetBrains Mono's zero and capital O differ by one device pixel
at 12 px on a 1× display.** Severity 4. H4. SD, QA.
`slashed-zero` and `zero` change nothing in this build. Wire values at
13 px differ by 4 to 6 pixels.
Evidence: `tokens.css:33, 64`; the review's section 6.
**Status:** Open, D3-b (D3.6). Review row T-2.
**2026-11-02:** Fixed in #479 (D3-b): no mono role is under 13 px (where 0 and O are 4 to 6 device pixels apart); the method field moved from 12 to 13 px, and the token test fails on an element that is monospace and a 12 px type class.
**2026-11-04:** D5-b's fifth pass: a table's column heads are mono at 12 px (`components.css:436-437`): U-181. Open, D5-c.
**2026-11-04:** Holds again: U-181's fix put every mono role at 13 px or more, and the token test fails on a rule that sets the mono face at the footnote size.

**U-152. The Local Bridge's own error status is drawn as the server's.**
Severity 3. H1. SD, OC.
When the bridge cannot reach the server (a name that does not resolve),
it answers the page with its own 502 and message; the status line draws
"502" as a status badge and the Body tab shows the bridge's message in
the server's slot, though no server sent either. The exchange record says
"No response came" and quotes the bridge's words, so the two disagree.
Evidence: task 5b of `docs/design/baseline.md` (D4-l);
`packages/core/src/send/exchange.ts` (`shapeFailure`, `statusCode` of a
`bridge` failure).
**Status:** Open, D4-h (D4.7, the Local Bridge), found in D4-l.
**2026-11-03:** Fixed in #504 (D4-h, D4.7): a failure of the Local Bridge itself is no response, as a network failure is (`shapeFailure`): no status code and no body, its words the error text. The status line says "No response", as the record does; the bridge's 502, and its 401 for a token, are no longer drawn as a server's.

**U-146. The Environments list's "+" sticks out of its card border.**
Severity 4. H8. All.
**Status:** Open, D4-g (D4.5). Review row N17.
**2026-11-03:** Fixed in #493 (D4-g): New environment is a plain icon in the header's line, beside Global variables, Import and Export.

## D1.8's captures in three engines, 2026-11-04

Session D5-a took the stress states the third pass ran in Chromium alone
(320 px, 200% text, RTL, forced colours, the error states) in Chromium,
Firefox and WebKit, and measured the 2.5.8 targets without their
ancestors: [`hig-review/d18.md`](hig-review/d18.md) has the captures and
the counts. They found U-153 to U-155.

**U-153. At a larger default text size the wide layout stays.** Severity 2.
H4, H7. Everyone who sets a larger text size in the browser.
The boxes and the type are in rem since #479 (U-073), so they grow with the
browser's default text size, but every breakpoint was in px: the three of
`App.updateViewportFlags`, the composer's split and five stylesheets. In
Firefox with its default size at 32 px, a 1,440 px window kept the tree
pinned beside the page at 704 px; the address showed "tp://127.0.0.1:4300",
the response pane's search field "Se", the toolbar "Sear…" and "N…", and the
status bar's words were cut in half. Text-only zoom, which sets the root's
font size, does not reach a media query either, which is why #479's test at
200% did not see it. Zoom passes 1.4.4; a larger default size did not.
Evidence: Firefox 157 (Playwright 1.64.1) with `font.size.variable.x-western`
at 32, 1,440 × 900, `main` at `470fc07`; `app.ts:122-126`.
**Status:** Fixed in D5-a: every breakpoint is in em, the same as before at
16 px. At 32 px a 1,440 px window is laid out as a 720 px one: the tree a
drawer, the composer's sections stacked. The token test fails on a
breakpoint in px; `e2e/text-size.spec.ts` sets Firefox's default size.

**U-155. Params is laid out by the window's width, and crushes its fields.**
Severity 2. H4, H7. Everyone who sets a larger text size; anyone with a
narrow composer.
Params was a grid from 768 px of window (`md:grid`), not by its own room,
against the rule every other row editor keeps. At 200% text (the root's
font size, as text-only zoom sets it) and 1,440 px, the composer beside the
tree left a parameter's name and value 47 px each in all three engines:
"k:" and "p(" of "kind" and "pets". Below 768 px the row took four lines,
the remove button alone on the last.
Evidence: [`hig-review/d18/font200-composer-1440-firefox.png`](hig-review/d18/font200-composer-1440-firefox.png),
[`hig-review/d18/font200-composer-1440-webkit.png`](hig-review/d18/font200-composer-1440-webkit.png);
`params-panel.html`.
**Status:** Fixed in D5-a: Params is the rows editor Headers and a form body
use, which wraps a row by its own room. At 390 px a row is two lines; the
"Key" and "Value" column heads go, as Headers has none. `e2e/layout.spec.ts`
holds a parameter's fields at 160 px or more at 200% text and 1,440 px.

**U-154. The Params row's checkbox misses 2.5.8's spacing at 390 px.**
Severity 3. H4. Everyone on a touch screen.
Stacked under the Params section's header, the 16 px box's centre was
11 px from the header's edge: a 24 px circle on it meets the header, so the
spacing exception does not hold, by 1 px. On `first-run`, `method-menu`
and `composer-params` at 390 px; no other control of the 49 screens fails,
at 390 or 1,440 px.
Evidence: [`hig-review/d18.md`](hig-review/d18.md), "2.5.8 targets".
**Status:** Open, D5-c: measured again there, since U-155's fix moves the
box beside the parameter's name.
**2026-11-04:** Fixed by U-155 (#543): Params' box is beside the name now. Measured again in D5-c on `first-run`, `method-menu`, `composer-params`, `composer-headers`, `composer-body` and `environments-rows` at 390 px: no control under 24 px without its spacing.

## Fifth pass, 2026-11-04

Session D5-b of the plan (row 1.64), on `main` at `62d85ef`, the build
v3.0.0 is cut from. Its first part is D1.3's cognitive walkthrough of the
five personas ([`personas.md`](personas.md)): 69 steps walked, 48 passed,
18 failed and 3 not checked, from 12 causes, U-156 to U-167. None repeats
a finding outright. Three sit beside one: U-157 is what U-039's fix (#511)
left (the sentence before the run says the scripts will run); U-159 is
beside U-138 (what the path to the bridge leaves out); U-165 is beside
U-137 (Safari's seven days). Their evidence paths are relative to
`docs/design/`.

### The persona walkthroughs (D1.3)

**U-156. A collection run is reached only from the tree's context menu.**
 Severity 2. H6, H7. QA, TP, SD.
Run… is an item of a collection's and a folder's context menu, opened by
a right-click or Shift+F10 on the row, and nowhere else. No row shows a
button for it, the toolbar has none, and the palette has none: its
commands for a selected row are New, Duplicate, Export and Delete. A
tester who came for the runner, or a Postman user looking for its Runner
button, does not find it by looking; on a touch screen there may be no
way to open the menu at all (not checked).
Evidence: `baseline/design-chromium/tree-1440-light.png`,
`baseline/design-chromium/tree-menu-1440-light.png`;
`src/app/shared/collections/collection-context-menu.ts:25`, `:39`;
`src/app/components/collections/collections-sidebar.ts:188-260`;
`src/app/components/app-shell/app-shell.ts:250-345`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: the palette offers "Run {collection}…" for every collection, and "Run {folder}…" for the selected folder; typing "run" finds them. `e2e/palette.spec.ts` holds it.

**U-157. Before a run, the view says the scripts will run; held ones do
not.** Severity 2. H1, H5. QA, TP.
Before the first run of an imported collection the run view says "Each
request is sent as Send would send it, with its scripts." The collection's
scripts are held until reviewed, so the run sends without them and only
then says "Scripts of this collection wait for a review, so requests were
sent without them." with Review scripts…. The first run tests nothing,
after a sentence that said it would; a tester who saves its report saves
results with no tests. U-039's fix offers the review after the run and
accepted that one run goes without the scripts; it did not change what the
view promises before it.
Evidence: `src/app/components/runner/run-view.html:130`, `:100-113`;
`src/app/services/collection-runner.ts:44`; task 2 of
`e2e/design/tasks.spec.ts` ("A run does not offer the review: it sends
without the scripts").
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: before the run, when the collection holds scripts that wait for a review (read as stored, `scriptsApproved`), the view says "Scripts of this collection wait for a review, so requests are sent without them." with Review scripts…, and no longer promises "with its scripts". `e2e/runner.spec.ts` holds it.

**U-158. A send whose scripts are held says so only in the response's
Tests tab.** Severity 2. H1. TP, QA.
Send an imported request whose pre-request script sets a token, before
its scripts are reviewed: the script does not run, the server answers 401,
and the response opens on Body. The status line, the exchange record and
the Body tab say nothing of the scripts. The note "This request's scripts
did not run: they have not been reviewed." is inside the response's Tests
tab, which carries no count or mark when no test ran, and the composer's
Scripts tab has no mark either. The person blames the import or the
server.
Evidence: `src/app/components/response-viewer/response-viewer.html:163-164`,
`:563-568`; `src/app/components/composer/composer.html:128`;
`src/app/components/composer/scripts-panel.html:3-16`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: the note "This request's scripts did not run: they have not been reviewed. Open the Scripts tab to review them." is above the response's tabs, under its status line, whichever tab is open. `e2e/script-trust.spec.ts` holds it on Body.

**U-159. The failure's bridge set-up leaves out what the bridge needs.**
 Severity 2. H10, H9. OC, SD, PE.
A send that got no response opens its record with "Start it, then type the
code it prints.", `npx wayfarer-bridge`, Copy and a pairing code. It does
not say the command is for a terminal and needs Node.js 22.21 or later;
that Safari reaches the bridge from the hosted app only over HTTPS, with
`--cert` and `--key`; or that Chrome and Edge ask about the local network
the first time and a refusal blocks the bridge. The last two are said in
Settings, Local Bridge, and the record has no link to it or to the
bridge's README. A person without Node stops at the command; a Safari user
follows every step and Pair fails.
Evidence: `baseline/design-chromium/response-error-1440-light.png`;
`src/app/components/exchange-record/bridge-setup.html:1-7`;
`src/app/components/settings/bridge-pane.html:148-154`;
`packages/bridge/README.md` ("It needs Node.js 22.21 or later").
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: the record's set-up says to start the bridge "in a terminal (it needs Node.js 22.21 or later)", and under the command that Chrome and Edge may ask about the local network the first time, and that from the hosted app Safari reaches the bridge only over HTTPS, with `--cert` and `--key`. `bridge-setup.spec.ts` holds the words.

**U-160. A Wayfarer file's import says "Replaces" for items that do not
exist.** Severity 3. H1, H2. TP.
Import a collection file written by Wayfarer into an app that has never
seen it: each row of the review reads "Replaces", in the warning colour,
and "Import as duplicate" says it "Keeps the original" when there is no
original. The importer marks every item of a Wayfarer file "overwrite"
unless duplicate is chosen, without looking at what is stored. A teammate
receiving a first file is told it will replace their work, and may import
it as a duplicate to be safe.
Evidence: `baseline/design-chromium/import-review-1440-light.png` (the
tree is empty; both rows read "Replaces");
`packages/core/src/import/wayfarer-collection.ts:154-155`;
`src/app/components/import/import-dialog.html:83-84`, `:99-110`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c with U-161: an item nothing stored has says New.

**U-161. A re-import replaces each item without saying what changed, and
cannot be undone.** Severity 2. H3, H5. TP.
A teammate's changed copy of a shared collection, imported over one's
own, lists every item as "Replaces" whether it differs or not. Nothing
says which requests changed or that one's own edits since the last
exchange will go, and an import has no undo (deletes in the tree do, U-080).
Files are the only way to share in v3.0.0, so this is how a team shares.
Section 1 of the plan puts "see what the other changed before taking it"
in phase T (T1); until then the review could at least mark the items whose
stored copy differs.
Evidence: `src/app/components/import/import-dialog.html:99-110`;
`packages/core/src/import/wayfarer-collection.ts:154-155`;
`PLAN-design.md`, section 1 ("What success looks like").
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: each item of the review says New (nothing stored has its id), Same (the stored copy holds what the file holds) or Changes, and only Changes is marked; after the import, Undo for 10 seconds puts back what it replaced, as it was, approvals included, and takes out what it added (an import that also merges environments offers none). `e2e/import.spec.ts` holds both. An item whose id another collection holds says "Moves here", and the Undo puts it back there (the security review of #562). What the other changed, field by field, stays phase T's (T1).

**U-162. A run's report is gone after a reload, and nothing says so.**
 Severity 3. H1, H5. QA.
A run is a tab that is not stored, and a run writes nothing to history:
reload the page or close the browser and the report of a long run is gone.
That is by design, but the run view never says it. Save the report (JSON,
JUnit XML, HAR) is offered under the results without a word that it is
the only way to keep them.
Evidence: `src/app/state/tabs-storage.ts:124-126`;
`src/app/state/tab-state.ts:139-141`;
`src/app/components/runner/run-view.html` (no such note);
`baseline/design-chromium/run-1440-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-163. The first save cannot make the collection it needs.**
Severity 3. H7, H3. SD, OC.
Ctrl+S on a new request with no collection yet opens Save to collection,
which says "A request is saved into a collection, and there is none yet.
Make one with New collection in the sidebar." and offers Cancel and a
disabled Save. The person closes it, opens the sidebar (a closed drawer
below 1,200 px), makes a collection, and saves again. The dialog could
name a new collection itself.
Evidence: `src/app/components/composer/save-as-dialog.html:9-12`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-164. With no vault, the app says the vault is locked.**
Severity 3. H1, H2. PE, OC.
Before any vault is made, the status bar reads "Vault locked", the Secrets
dialog says "Vault is locked. Unlock it to reveal secret values below."
beside Unlock, Change passphrase and Export vault, and Settings, Vault says
"The vault is locked." A careful user asks whose vault it is and what its
passphrase was. Unlock then opens "Create vault passphrase", so a click
recovers, but every word before it was wrong.
Evidence: `baseline/design-chromium/first-run-1440-light.png`,
`baseline/design-chromium/secrets-manager-1440-light.png`,
`baseline/design-chromium/settings-vault-1440-light.png`;
`src/app/components/app-shell/app-shell.html:367-368`;
`src/app/components/secrets/secrets-manager.html:14-15`.
**Status:** Open, D5-c.
**2026-11-04:** Raised to severity 2 in D5-b's fifth pass: the repeated hig-review found the same words in the status bar, the Secrets dialog ("Vault is locked…", with Change passphrase and Export vault) and Settings, under a record that says "No vault secret was filled": it misleads, as severity 2 says.
**2026-11-04:** Fixed in D5-c: until a passphrase is chosen the status bar says "No vault" (its tooltip and the palette "Make a vault"), the Secrets dialog "No vault yet. Marking a variable as secret makes one, with a passphrase you choose." with Create vault and without Change passphrase or Export vault, and Settings › Vault "No vault has been made in this browser yet." (`SecretsVault.made`). `e2e/vault.spec.ts` holds it.

**U-165. In Safari, the seven-day deletion is said only in Settings.**
Severity 2. H1, H2. OC, SD.
Safari deletes a site's data after seven days without a visit unless the
app is installed. The status bar says "Saved in this browser, which may
delete it", and the backup banner "which has not promised to keep it"; the
seven days and the cure (File → Add to Dock) are said only in Settings,
Data and storage, which an occasional user does not open. They come back
after two weeks to an empty app with no word of why. The banner and the
status bar could say it in Safari, as Settings does.
Evidence: `src/app/components/app-shell/app-shell.ts:191`, `:573`;
`src/app/components/settings/settings.html:262-273`;
`README.md`, "Known limitations". Read from source; not captured in Safari.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: in Safari not installed (`StoragePersistence.safariNotInstalled`), the status bar says "Kept by Safari for 7 days without a visit" and the backup reminder "Safari deletes this workspace after seven days without a visit. Back up, or add Wayfarer to the Dock, to keep it." `e2e/storage-kept.spec.ts` holds it in WebKit, which reports Apple's vendor; not checked in Safari itself.

**U-166. The app links to no documentation.** Severity 3. H10. OC, TP.
The site has docs for variables, auth, scripts, import and the bridge, but
no screen of the app links to them. Settings, About links the changelog,
the trust centre, the source and the licences; the one other link is the
bridge's README in Settings, Local Bridge. A user stuck on a held script,
a variable's scope or an import note has nowhere in the app to read more.
Evidence: `baseline/design-chromium/settings-about-1440-light.png`;
`src/app/components/settings/bridge-pane.html:156-164`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-167. Settings writes ⌘K on every platform.** Severity 4. H4. SD.
Data and storage says a collection is exported "from the command palette
(⌘K, "Export …")". On Windows and Linux the toolbar on the same screen
says Ctrl+K: the key is written by hand in this one sentence, not from the
shortcut table.
Evidence: `baseline/design-chromium/settings-data-1440-light.png`;
`src/app/components/settings/settings.html:244`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: Settings names the palette without a key ("from the command palette (\"Export …\")"); the key is the palette's own, shown where it works.

### The screens in three engines, and the hig-reviews repeated (D1.2, D5.1)

The second part retook D1.2's pass over D0.1's 49 screens in Chromium,
Firefox and WebKit at 360, 390, 820 and 1,440 px, light and dark, from
`main` at `62d85ef` (the design captures of `e2e.yml` run 41752362186),
and repeated both hig-reviews with the logo-off and competitor-swap tests
([`hig-review-2026-11-04.md`](hig-review-2026-11-04.md)). They found 32
new findings, U-168 to U-199, and four regressions: U-020, U-022 and U-054
are reopened below, and U-028's measure misses in Firefox and WebKit.
Two more fold into numbers already given: the vault called locked before
one exists is U-164 (raised to severity 2), and U-151's 13 px floor and
U-093's no-cards rule fail where U-181 and U-198 say. U-168 and U-169 are
rated 1, not the review's 2: an edit lost without a question is U-060's
case, which this audit rated 1. Evidence paths are relative to
`docs/design/`; a capture named for Firefox or WebKit is in the run's
artifacts, not committed.

**U-168. New request empties the open tab, and its unsaved edits go
without a word.** Severity 1. H3, H5. SD, OC, TP.
The drawer's first button, New request (every width below 1,200 px), and
the palette's "New request" call `handleNewRequest`, which resets the open
tab in place: the draft is replaced, the tab unbound and marked clean, with
no question and no Undo. Only a run's or the Environments tab is kept. A
person who typed a request, opened the drawer to look at the tree and
pressed the biggest button in it loses the request. The palette also lists
"New tab" (Alt+T) beside it, which does open a new tab: two commands with
the same name's promise and different results. `ia.md` decided both
(D4-f): "The palette's "New request" and "New tab" become one command,
since both now open a tab. The drawer's "New request" button, which also
empties the open tab today, opens a new one." Neither was built.
Evidence: `baseline/design-chromium/tree-390-light.png`,
`baseline/design-chromium/tree-820-light.png` (the drawer's New request),
`baseline/design-chromium/palette-1440-light.png` (New request and New
tab, one under the other); `src/app/components/app-shell/app-shell.html:48`;
`src/app/components/app-shell/app-shell.ts:252-262`, `:534-540`;
`src/app/components/composer/composer-view.ts:120-127`;
`docs/design/ia.md:232-234`, `:531-532`.
Severity 1, not the review's 2: an edit lost without a question is U-060's case, which the audit rated 1.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: New request, the drawer's button and the palette's one command (merged with New tab, as `ia.md` planned), opens a tab of its own; the open tab keeps what was typed. `e2e/tabs.spec.ts` holds it.

**U-169. A collection's or folder's settings close on Escape or × and drop
every edit.** Severity 1. H3, H5. TP, QA, SD.
The settings dialog (Auth, Variables, Scripts, Route) keeps its edits
until Save settings. Escape, × and Cancel all close it through the same
`closed` output, with no check for changes and no question: a collection's
pre-request script typed into it, or six variables, are gone on one
Escape. This is U-060's pattern, rated severity 1 for the environments
and fixed there; the dialog that holds a collection's scripts kept it.
Evidence: `baseline/design-chromium/collection-settings-1440-light.png`
(Cancel and Save settings, and ×);
`src/app/components/collections/inherited-settings-dialog.html:1`
(`(visibleChange)="closed.emit()"`);
`src/app/components/collections/inherited-settings-dialog.ts:71-73`, `:173`.
Severity 1, not the review's 2: an edit lost without a question is U-060's case, which the audit rated 1.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: Escape, × or Cancel with changes asks "Discard the changes to {name}?", Keep editing being the button that has focus; with none, the dialog closes at once. `e2e/inheritance.spec.ts` holds it in three engines.

**U-170. The request's tabs do not say which of them hold anything.**
Severity 3. H1, H6. TP, QA.
Params, Headers, Body, Auth, Scripts and Settings are bare words, and the
phone's sections are the same words, closed. A request with a header, a
JSON body and a post-response script looks the same from its Params tab as
an empty one. Postman marks each tab with its count ("Headers (9)") or a
dot; the response's Tests tab here has its count, the request's tabs have
none. U-158 is the Scripts tab's part of this, for held scripts.
Evidence: `baseline/design-chromium/composer-params-1440-light.png`
(Headers holds Accept, Scripts holds a test: nothing says so),
`baseline/design-chromium/composer-headers-390-light.png`;
`src/app/components/composer/composer.html:124-129`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-171. Three lines restate the tree and the tab above every saved
request.** Severity 3. H8. SD, TP.
Under the address a saved request carries "Editing Pet store / Pets /
List pets — Save writes back to this request.", then "Sends to
http://…", then a chip of each variable with its value. At 1,440 px the
request's tabs start 300 px from the top; at 390 px the breadcrumb wraps,
its second line starting with a dash, and Request and Response start at
y = 370 of 844. The breadcrumb repeats the tree's selected row and the
tab's name, and "Save writes back to this request" says what Save always
does.
Evidence: `baseline/design-chromium/request-saved-1440-light.png`,
`baseline/design-{chromium,firefox,webkit}/request-saved-390-light.png`;
`src/app/components/composer/composer.html:31-39`.
**Status:** Open, D5-c.
**2026-11-04:** Accepted in D5-c: "Sends to …" and its chips are the exchange record's preview, D2.5's signature that the logo-off test quotes; the breadcrumb says where Save writes. Trimming them is a design change for after 3.0, not a defect.

**U-172. On a phone the response's body starts below six rows of the
request and its controls.** Severity 3. H8. OC, SD.
After a send at 390 px the Response pane shows, in order: the breadcrumb,
"Sends to", the variable chip (all three stay above Request and Response),
the status, a row of time, size and route, a row holding only the export
icon, the response's tabs, the JSON select, Search, and Path. The body
starts at y = 735 in Chromium and y = 750 in Firefox and WebKit, where
"Sends to" wraps two characters onto a line of their own: five lines of
JSON are visible. U-028's measure (the status under 300 px below the
address) holds in Chromium (294 px) and misses in Firefox and WebKit
(310 px).
Evidence: `baseline/design-{chromium,firefox,webkit}/response-json-390-light.png`,
`baseline/design-{chromium,firefox,webkit}/response-record-390-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Accepted in D5-c, with U-028: a phone has no flows of its own (row 1.46); the response is under the request it answers.

**U-173. The Headers tab's CORS paragraph shows on every cross-origin
response, also one that exposes every header.** Severity 3. H8, H2. SD, OC.
Each direct response from another origin opens Headers with four to six
lines on CORS-safelisted headers ending "The server may have sent more."
The rule is the origin alone (`headersLimited` in `exchange.ts`); the
response in the capture sends `access-control-expose-headers: *`, which
lets the page read every header but `Set-Cookie`, and its list is complete.
The note costs the list a third of its height at 390 px each time.
Evidence: `baseline/design-chromium/response-headers-1440-light.png`
(`access-control-expose-headers` `*` in the list under the note),
`baseline/design-chromium/response-headers-390-light.png`;
`packages/core/src/send/exchange.ts:794-797`;
`src/app/components/response-viewer/response-viewer.html:343-351`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-174. The HTML preview is 300 px tall, whatever room the pane has.**
Severity 3. H8. SD, QA.
At 1,440 × 900 the preview is a white box of 300 px with 450 px of empty
pane under it; a page longer than the box scrolls inside it. The height is
written into the element.
Evidence: `baseline/design-{chromium,firefox,webkit}/response-html-1440-dark.png`;
`src/app/components/response-viewer/html-preview.ts:20` (`h-[300px]`).
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-175. A failed request explains itself twice and keeps four tabs of
nothing.** Severity 3. H8. OC, SD.
The record opens with "No vault secret was filled.", "Nothing was
masked." and "History kept the request. No response came." before what
was reported; under it the bridge's set-up; under that Body, Headers,
Timings and Tests, of which Body repeats the record's diagnosis ("The
request got no response. The browser does not say why … Send it through
the Local Bridge to see which.") and the other three hold empty states for
a response that never came. The first three lines answer questions the
person did not ask about a request that failed. U-159 is what the set-up
leaves out; this is what the screen says that is not needed.
Evidence: `baseline/design-chromium/response-error-1440-light.png`,
`baseline/design-{chromium,firefox,webkit}/response-error-390-light.png`;
`packages/core/src/send/record.ts:134`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-176. The OAuth redirect URI has no Copy, and breaks inside its
scheme.** Severity 3. H7. SD, TP.
"Register this redirect URI with the identity provider:" is followed by
the address as text, with no Copy button, though every other value the app
asks a person to paste elsewhere (cURL, `npx wayfarer-bridge`) has one.
`break-all` breaks it anywhere: "htt / p://localhost:4200/…" at 390 px in
Chromium and Firefox, "localhost: / 4200" at 1,440 px, so selecting it by
hand across the break is the only way.
Evidence: `baseline/design-chromium/composer-oauth-1440-light.png`,
`baseline/design-{chromium,firefox,webkit}/composer-oauth-390-light.png`;
`src/app/components/composer/auth-editor/oauth-fields.html:16-19`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-177. Save to collection starts with an empty name, and Save
disabled.** Severity 3. H7. SD, TP.
The request's tab already names it ("127.0.0.1:4300/content/json"), but
the dialog's Name field opens empty with the placeholder "Request name",
and Save stays grey until something is typed. Postman fills the name from
the address; here a first save is always a typed name.
Evidence: `baseline/design-{chromium,firefox,webkit}/save-request-390-light.png`,
`baseline/design-chromium/save-request-1440-light.png`;
`src/app/components/composer/save-as-dialog.html:15-25`, `:60`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-178. F2, Alt+Arrow and Shift+F10 work in the tree and are written
nowhere.** Severity 3. H6, H10. SD, QA.
U-032's fix says every shortcut is shown where it works. The tree renames
on F2, reorders on Alt+Arrow and opens its menu on Shift+F10, and a tab
renames on F2; none is in Settings, Shortcuts (which lists C, N and
Delete), and the tree's menu shows no key beside Rename or Delete,
though `UiMenuItem` has `keys` and the sidebar's New menu uses it.
Evidence: `baseline/design-chromium/tree-menu-1440-light.png`,
`baseline/design-chromium/settings-shortcuts-1440-light.png`;
`src/app/shared/collections/collection-context-menu.ts:24-55`;
`src/app/ui/menu-item.ts:6`; `F2` appears in no template
(`grep -rn F2 src/app` finds `tree.ts` and `tab-strip.ts` only).
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-179. The cURL box is a bare text area: its placeholder is each
engine's grey, 2.2:1 in WebKit.** Severity 3. H4. OC, TP.
Import's "A cURL command" is a `<textarea>` without `uiInput`, so its
placeholder takes the browser's colour: about 4.2:1 on the field in
Chromium, 3.5:1 in Firefox and 2.2:1 in WebKit (darkest pixel of the
glyphs against the fill, 390 px light), and Chromium and Firefox draw
their own resize grip, which WebKit does not. Nothing may look native
(maintainer, 2026-10-20).
Evidence: `baseline/design-{chromium,firefox,webkit}/import-curl-390-light.png`;
`src/app/components/import/import-dialog.html:14-22`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-180. The script review draws `=>` as an arrow glyph.** Severity 3. H5,
H4. PE, TP.
The review is text in JetBrains Mono with its ligatures on: `() => x`
reads `() ⇒ x`, and `!=`, `>=` and `===` are drawn joined too. The same
script in the Scripts tab (Monaco, ligatures off) reads `=>`. In the one
dialog whose job is to show a person exactly what will run, a ligature
hides which characters are there (U-040 writes invisible characters as
code points for that reason). No stylesheet sets `font-variant-ligatures`.
Evidence: `baseline/design-chromium/script-review-1440-light.png` (third
script; the composer under it shows `=>`),
`baseline/design-{chromium,firefox,webkit}/script-review-360-dark.png`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.
**2026-11-05:** Fixed in #625 (D6-a): every rule that sets the mono face, in the app, its generated type classes and the site, turns ligatures off, and a token test holds it.

**U-181. Table column heads are 12 px JetBrains Mono.** Severity 3. H4. All.
`.ds-table th` sets the mono face at the footnote size (0.75 rem): the run
report's "Iteration", "Request", "Status", "Time", "Tests", the WebSocket
log's and the response headers' and events' heads. They are Wayfarer's
words, which U-148 put in the text face, and 12 px mono is the size U-151
retired ("JetBrains Mono, never under 13 px"); the token test checks type
classes, not this rule.
Evidence: `baseline/design-chromium/run-1440-light.png`,
`baseline/design-chromium/websocket-1440-light.png`;
`src/design-system/components.css:434-442`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: a table's column heads are the text face; the method badges of History and the palette and the WebSocket's scheme, also mono at 12 px, are at the mono size (13 px). The token test fails on a rule that sets the mono face at the footnote size.

**U-182. On a phone the run's table hides its Tests column.**
Severity 3. H8. QA.
At 390 px the results table is wider than its box: "Tests" and each row's
"2 of 2 passed" are cut at the right edge in the three engines, while "#"
and "Iteration" (one iteration, every row "1") take 120 px. The column a
tester reads first is the one that does not show.
Evidence: `baseline/design-{chromium,firefox,webkit}/run-390-light.png`;
`src/app/components/runner/run-view.html:182-190`.
**Status:** Open, D5-c.
**2026-11-04:** Accepted in D5-c: the results are a data table, which WCAG 1.4.10 lets scroll in two dimensions; it scrolls in its own region ("Run results", a Tab stop), and nothing of the page is wider than the window.

**U-183. At 390 px the vault prompt opens with its passphrase at the
window's bottom edge in Chromium and WebKit.** Severity 3. H1. PE, OC.
Marking a variable secret with no vault opens the passphrase form inside
the row list. Firefox scrolls the focused field into view with the form
under it; Chromium and WebKit scroll only as far as the field's edge, so
the field sits half under the bottom of the window and Confirm and
Create vault are below it. The person sees a page that did not change.
Evidence: `baseline/design-{chromium,firefox,webkit}/vault-create-390-light.png`,
`baseline/design-{chromium,firefox,webkit}/vault-create-360-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-184. The Environments list's header is four bare icons, and globals
are "{}".** Severity 3. H6. TP, OC.
Global variables, Import, Export and New environment are icons with
tooltips; Import and Export are an up and a down arrow that read either
way, and globals, which a Postman user looks for by name, are a pair of
braces. U-010 fixed the same pattern in the sidebar with named menus.
Evidence: `baseline/design-chromium/environments-empty-1440-light.png`,
`baseline/design-chromium/environments-rows-390-light.png`;
`src/app/components/environments/environments-manager.html:10-47`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-185. Reset all data says to back up first, and its question offers no
backup.** Severity 3. H5. OC, SD.
The Danger zone's row ends "Cannot be undone: back up first."; the
confirm that follows says "This cannot be undone." with Cancel and Reset
all data. Backing up is in another section (Data and storage), so the
advice costs a Cancel, a section change and a return.
Evidence: `baseline/design-chromium/confirm-dialog-1440-light.png`,
`baseline/design-chromium/settings-danger-1440-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-186. Monaco draws an empty overview ruler and scrolls past the last
line.** Severity 4. H8. All.
The body and response editors keep Monaco's overview ruler (a 14 px
column with a cursor tick at its top) and `scrollBeyondLastLine`, so a
six-line response shows a scrollbar as tall as the pane. The script editor
turns the second off; neither turns the ruler off.
Evidence: `baseline/design-chromium/request-saved-1440-light.png` (the
tick at the editor's top right), `baseline/design-chromium/response-record-1440-light.png`,
`baseline/design-chromium/response-json-820-light.png` (both scrollbars);
`src/app/components/json-editor/json-editor.ts:209-217`;
`src/app/components/script-editor/script-editor.ts:163`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-187. A method is drawn four ways, and the method menu marks none.**
Severity 4. H4, H1. SD.
Coloured mono text in the tree, a filled pill in History, grey mono in a
tab, plain sans in the method menu; the menu does not mark the method in
use.
Evidence: `baseline/design-chromium/history-1440-light.png`,
`baseline/design-chromium/method-menu-1440-light.png`,
`baseline/design-chromium/request-saved-1440-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Accepted in D5-c: each place draws a method at its own density (a tree row, a History pill, a tab, a menu), all in the method's colour or the label's; U-181 put every mono one at 13 px.

**U-188. The response's download icon opens four copies and one export.**
Severity 4. H4. SD.
Evidence: `baseline/design-chromium/export-menu-1440-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Accepted in D5-c: one menu holds what can be done with one response, the copies and the export, as U-016 and D4.12 decided.

**U-189. The pre-request script's heading has a play triangle.** Severity 4.
H4. OC.
A ▷ beside "Pre-request script" reads as Run or as a closed disclosure;
it is neither.
Evidence: `baseline/design-chromium/composer-scripts-1440-light.png`;
`src/app/components/composer/scripts-panel.html:20`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-190. "0 failed" is red, with the error icon.** Severity 4. H8. QA.
Evidence: `baseline/design-chromium/response-tests-1440-light.png`;
`src/app/components/response-viewer/response-viewer.html:618-621`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: the failed count is the secondary label without a glyph until a test fails. `e2e/response-tests.spec.ts` holds it.

**U-191. The run report says its counts twice.** Severity 4. H8. QA.
"4 results in 1 iteration; 1 failed; 4 of 5 tests passed." over "3 passed
1 failed 4/5 tests".
Evidence: `baseline/design-chromium/run-1440-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.

**U-192. The environment editor's tab says "Key / Value" over columns
headed Name and Value.** Severity 4. H4. TP.
Evidence: `baseline/design-chromium/environments-rows-1440-light.png`;
`src/app/components/environments/environments-manager.html:173`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: the tab says "Name / Value", as its columns do.

**U-193. Body's select is labelled "Body", inside the Body tab.**
Severity 4. H8. OC.
It chooses the body's kind (Raw, GraphQL, …).
Evidence: `baseline/design-chromium/composer-body-1440-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: the select is named "Body type".

**U-194. With no environment, the editor's pane says "Choose an
environment".** Severity 4. H8. OC.
There is none to choose; the list beside it already says what to do.
Evidence: `baseline/design-chromium/environments-empty-1440-light.png`;
`src/app/components/environments/environments-manager.html:353`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: with no environment the pane says "Make an environment with New environment, and its variables are edited here."

**U-195. History is "History" in the palette and its drawer, and "Request
history" in the toolbar and the phone's drawer.** Severity 4. H4. OC.
Evidence: `baseline/design-chromium/history-1440-light.png`,
`baseline/design-chromium/palette-1440-light.png`,
`baseline/design-chromium/tree-390-light.png`;
`src/app/components/app-shell/app-shell.html:61`, `:248`;
`src/app/components/app-shell/app-shell.ts:308`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: the palette's command is "Request history", as the toolbar's button and the drawer are; Settings' section stays "History", the settings of history.

**U-196. In WebKit the sidebar button keeps a focus ring after the drawer
closes.** Severity 4. H4. SD.
Opening Environments from the phone's drawer hands focus back to the
sidebar button; WebKit draws the ring, Chromium and Firefox do not (the
pointer opened it). U-053's family, on the drawer.
Evidence: `baseline/design-webkit/environments-rows-390-light.png`,
`baseline/design-webkit/environments-empty-360-dark.png` (against the
same files in `design-chromium`).
**Status:** Open, D5-c.
**2026-11-04:** Accepted in D5-c: WebKit draws its own focus-visible ring on a button that focus is handed back to by code; Chromium and Firefox do not. No rule of the app's sets it.

**U-197. Green is spent on device state.** Severity 3. H4. Everyone.
DQ11 made colour mean a method or a status and nothing else. The
environment list's "In use" tag is drawn in `--status-success-fill` and
`--status-success-border` (`components.css:399-409`). The status bar's
route word turns `text-status-success` when the route is the bridge, and
the vault word when it is unlocked (`app-shell.html:352, 362`). On the
primary screen green already means GET and 200; a third green for "this
environment is chosen" or "the vault is open" is the colour-with-no-
consistent-meaning tell, and it uses the success token, so the token test
that holds chroma to method and status tokens passes it.
Evidence: `baseline/design-chromium/environments-rows-1440-dark.png` ("In use"); the bridge and
unlocked states are not captured and rest on source.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c: "In use" is an outlined tag in the primary label, and the status bar's route and vault words keep the label's colour; the token test fails on a status colour on the shell's device state.

**U-198. The Secrets dialog keeps cards inside the dialog.** Severity 3.
H8. Everyone.
U-093 took cards out of overlays and Settings. The Secrets dialog still
puts a bordered, filled banner ("Vault is locked…") and, under it, a
dashed rounded box with a centred icon and two lines of text inside the
dialog's own surface: three grouping cues at one level
(`secrets-manager.html:11` and `34-36`). The audit's first pass named
"dashed empty boxes" as part of the template look it removed.
Evidence: `baseline/design-chromium/secrets-manager-1440-dark.png`.
**Status:** Open, D5-c.
**2026-11-04:** Fixed in D5-c with U-022: the vault's state is a line of the dialog, not a filled, bordered card, and the empty list has no box.

**U-199. On a phone the editing line breaks before its dash.** Severity 4.
H8. Everyone on a phone.
At 360 and 390 px "Editing Pet store / Pets / List pets — Save writes
back to this request." wraps so that the second line starts with "—".
Evidence: `baseline/design-chromium/response-json-390-light.png`, `response-json-360-light.png`.
**Status:** Open, D5-c.
**2026-11-04:** Given to phase D6 (after 3.0) in D5-c: severity 3 or 4, not a release blocker by row 1.64; the plan's D6.1 lists it.
**2026-11-05:** Fixed in D5-e by #585 (C49): the editing line has no dash, so nothing breaks before one.

### Every screen of D0.1, in three engines

Open old findings by number; new ones by short title; "No finding" means
nothing beyond findings already fixed. Engine differences that are capture
artifacts (WebKit's ⌘ keys, its classic scrollbars) are listed once in the
header and not repeated unless they change a layout.

| Screen | Findings | Engines |
|---|---|---|
| `first-run` | U-164 (status bar "Vault locked") | WebKit writes ⌘K (Mac UA). Otherwise alike. |
| `request-saved` | Three lines restate the tree; Monaco's empty ruler; method drawn four ways | At 390 px the breadcrumb wraps the same in all three. |
| `response-json` | Phone: body below six rows; Monaco's ruler | Firefox and WebKit wrap "Sends to … pe/ts", 16 px lower; U-028's 300 px holds in Chromium only. |
| `response-headers` | CORS paragraph on every cross-origin response; phone: body below six rows | WebKit draws a scrollbar in the headers list (nested scroll at 390 px). |
| `response-tests` | "0 failed" in red; request tabs without counts | Firefox shows the address scrolled to its end at 390 px. |
| `response-html` | Preview 300 px tall | The preview's unstyled page is serif in Chromium, sans in Firefox and WebKit (the engines' defaults). Firefox shows the address's end. |
| `response-loading` | No finding | Firefox shows the address's end. |
| `response-error` | Explains itself twice, four empty tabs; U-159 | "What was reported" is each engine's text ("Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"); Firefox's wraps to two lines. |
| `response-record` | Monaco scrolls past the last line; phone: body below six rows | Alike but the "Sends to" wrap. |
| `composer-params` | Request tabs without counts; three lines restate the tree; U-154 | Alike. |
| `composer-headers` | Request tabs without counts | Alike. |
| `composer-body` | Body's select labelled "Body"; Monaco's ruler | Alike. |
| `composer-auth` | No finding | Alike. |
| `composer-oauth` | Redirect URI has no Copy and breaks in its scheme | The break falls at "htt/p" in Chromium and Firefox, "ht/tp" in WebKit. |
| `composer-scripts` | Play triangle on the pre-request heading; U-158 | Alike. |
| `composer-settings` | No finding | WebKit wraps one more line (scrollbar width). |
| `method-menu` | Method drawn four ways, none marked | Alike. |
| `graphql-explorer` | Monaco's ruler | WebKit draws a scrollbar in the schema box. |
| `websocket` | Table heads in 12 px mono | WebKit keeps a ring-like edge on Send message under the pointer. |
| `export-menu` | Download icon opens copies | Firefox shows the address's end. |
| `export-har` | No finding | WebKit draws the dialog's scrollbar. |
| `save-request` | Empty name, Save disabled | Firefox shows the address's end. |
| `tree` | New request empties the open tab; History named two ways | Alike. |
| `tree-menu` | F2, Alt+Arrow, Shift+F10 written nowhere; U-156 | WebKit highlights Run… on open; Chromium and Firefox show no item. |
| `collection-settings` | Escape or × drops every edit; U-054 regressed (Scripts tab) | Alike. |
| `new-collection` | No finding | Alike. |
| `palette` | New request and New tab differ; History named two ways | WebKit writes ⌥T, ⌘↵ (Mac UA). |
| `import-review` | U-020 regressed (uppercase labels); U-160, U-161 | Alike. |
| `import-curl` | Bare text area, placeholder 2.2:1 in WebKit | Placeholder grey differs by engine; no resize grip in WebKit. |
| `script-review` | `=>` drawn as ⇒ | WebKit draws a horizontal scrollbar under each script at 360 px. |
| `run` | Tests column cut on a phone; table heads 12 px mono; counts said twice; U-162 | Alike. |
| `environments-empty` | Header of bare icons; "Choose an environment" with none | WebKit rings the sidebar button at 360 and 390 px. |
| `environments-rows` | "Key / Value" over Name and Value; header of bare icons | WebKit rings the sidebar button at 360 and 390 px. |
| `history` | Method drawn four ways; History named two ways | Truncation of the third address differs by a few characters. |
| `history-empty` | No finding | Alike. |
| `vault-create` | Passphrase at the window's edge in Chromium and WebKit | Firefox scrolls the form into view; Chromium and WebKit leave it at the bottom edge. |
| `vault-unlock` | U-164 | Chromium and WebKit show the backup banner over the page; Firefox does not. |
| `secrets-manager` | U-022 regressed (dashed box); U-164 | Alike. |
| `confirm-dialog` | Reset's confirm offers no backup (index line out of date) | Alike. |
| `settings-general` | No finding | Alike. |
| `settings-history` | No finding | Alike. |
| `settings-data` | U-020 regressed ("STORAGE IN THIS BROWSER"); U-167 | Alike. |
| `settings-vault` | U-164 | Alike. |
| `settings-bridge` | No finding | WebKit wraps one more line of the Route text. |
| `settings-cookies` | No finding | Alike. |
| `settings-shortcuts` | F2, Alt+Arrow, Shift+F10 missing; U-020 regressed | WebKit writes ⌘K (Mac UA). |
| `settings-diagnostics` | No finding | User agent per engine (capture). |
| `settings-about` | U-166 | Alike. |
| `settings-danger` | Reset says back up first, offers no backup | Alike. |

Open findings from before this pass that the screens still show: U-154
(`composer-params`, 390 px) and U-077 (every screen; closed only by D5.1's
logo-off and competitor-swap tests, which this pass does not run).

## Sixth pass: the final design pass (D5-e), 2026-11-04

Session D5-e of the plan (row 1.68), on `main` from `3f055f2`, at the
maintainer's request for a pass that "goes beyond the basics". Four
reviews ran with the design, UI and writing skills: a HIG review of the app
(loupe: ten changes, L-1 to L-20), a review of its visual craft and words
(design-taste-frontend with ux-copy: V1 to V22 and C1 to C68), one of the
site's landing (cro and copywriting: a top 15), and one of the site's
search and comparison pages (seo-audit, ai-seo, schema and competitors: a
top 15). The reports were working notes and are not committed; each item
is listed here by its ID with what became of it. The findings the pass
itself made are U-200 to U-206 below.

| Review | Items | Where |
|---|---|---|
| HIG review of the app | L-1 to L-4 (settings in a tab, the environment editor's rows, secrets there) | #577 |
| | L-5, L-12 (one status, one duration) | #580, #581 |
| | L-6, L-7 (the response under the request when narrow) | #574 |
| | L-8 to L-10 (the wire's face at its floor) | #570 |
| | L-11 (the review at the import's end) | #573 |
| | L-13 (history names the saved request) | #571 |
| | L-14, L-15 (the body's height; one search or path field) | #579 |
| | L-16 to L-18 (the first screen offers each thing once) | #584 |
| | L-19 (a new environment in use) | #579, #586 |
| | L-20 (one "Settings"; Network; Collection settings…) | #579 |
| Visual craft | V1 (sending keeps the response; Stop) | #580 |
| | V2 (the first screen's empty states) | #584 |
| | V3 (Environments' two empty states) | #583 |
| | V4 to V17, V19, V20 | #581 |
| | V18 (the tree's density, with U-154's targets measured) | #587 |
| | V21 (the phone's send row and status line) | #589 |
| | V22 (the divider to the status bar) | #588 |
| Words | C3, C32, C43 | #580, #581 |
| | C22, C23 | #584 |
| | C29 | #583 |
| | C1, C2, C4 to C21, C25 to C28, C30, C31, C33 to C41, C44 to C47, C49 to C51, C53 to C68, the terms | #585 |
| | C24, C52 (words done; the buttons they propose are U-202) | #585 |
| | C42 (already right: the menu's items name what they make) | none |
| | C48 (one Import for a cURL command) | U-201 |
| The site's landing | items 1 to 5, 10, 12 to 15 | #576 |
| | items 8, 9 (the changelog and the roadmap pages) | #572 |
| | item 6 (the compare pages' table, benchmark and closing link) | W5-c (W5.4) |
| | item 7 (the docs index grouped: #575; `getting-started.md` and whether `reach.md` is public: not yet) | W5-b (W5.3) |
| | item 11 (crops of the real app for each block) | W5-b (W5.2, W5.3) |
| Search and comparison | items 1 to 4, 7, 9 to 12, 14, 15 | #575 |
| | items 5, 6, 8, 13 (the pages rebuilt with the benchmark, recordings under `media-src 'self'`, AI and the secret off disk on each rival page, a Scalar page) | W5-c (W5.4) |
| | item 15's Search Console and Bing verification (a DNS record: the maintainer's) | outside the repository |
| The brand mark | C, the Switchback W, and the name in Bold | #578 |

**U-200. A request body's form starts with a checked empty row.**
Severity 4. H4. Everyone.
#584 made the empty row of Params and Headers unchecked until it has a
name (L-17). The form editor of a body (`x-www-form-urlencoded` and
multipart) shares neither component and still starts with a checked,
empty row.
Evidence: #584's body ("Not done").
**Status:** Open, D5-e.
**2026-11-05:** Given to phase D6 (after 3.0): severity 4; the plan's D6.1 lists it.

**U-201. A pasted cURL command takes two buttons to import.** Severity 3.
H8. SD, TP.
The Import dialog's cURL field has "Read the command" and then Import:
two presses for one act. A file goes straight to the review on one.
Evidence: `baseline/design-chromium/import-curl-1440-light.png`; C48 of
the visual-craft review.
**Status:** Open, D5-e.
**2026-11-05:** Given to phase D6 (after 3.0): it changes the import's
steps (ImportPipeline), not only words; the plan's D6.1 lists it.

**U-202. The Tests tab's empty line and the held-scripts line name a tab,
not a button.** Severity 4. H7. TP, QA.
"Add one in the Scripts tab" and "Open the Scripts tab to review them"
send a reader to another tab by name; C24 and C52 proposed a button there.
#585 changed the words only.
Evidence: `baseline/design-chromium/response-tests-1440-light.png`.
**Status:** Open, D5-e.
**2026-11-05:** Given to phase D6 (after 3.0): severity 4; the plan's D6.1 lists it.

**U-203. Task 4 still counts two select steps that #579 made needless.**
Severity 4. H7. Everyone.
Since a new environment is put in use when none is (#579, L-19), task 3
dropped two steps of the toolbar's select. Task 4 (a secret that never
touches disk) begins the same way and still counts them, so its number is
two actions too high.
Evidence: `e2e/design/tasks.spec.ts` task 4; `docs/design/benchmark.md`.
**Status:** Fixed in W5-c (the benchmark counted again).
**2026-11-05:** Given to W5-c, which puts the benchmark on the comparison
pages (W5.4) and counts the tasks again.
**2026-11-05:** Fixed in W5-c: task 4 no longer opens the select, and the
eight tasks were run again in Docker (`docs/design/benchmark.md`): task 4
is 18, task 2 is 7 (D5-e's count of 8 had a File… step an empty sidebar
does not ask for), task 3 is 8.

**U-204. No environment could not be chosen once an environment existed.**
Severity 3. H3. SD, QA.
The toolbar's list offered environments only, and a choice of none did
not last: the next refresh or a reload put the first back in use.
Evidence: #586's e2e ("No environment, chosen in the toolbar, stays chosen
after an edit and a reload"), which found the missing option.
**Status:** Fixed in D5-e by #586 (stored data's meaning, approved by the
maintainer on 2026-11-05): the list has No environment at the top, and
the choice lasts.

**U-205. A response tab chosen while a request was on its way was undone.**
Severity 3. H3. QA.
Since #580 the last response stays while the next is sent, and its tabs
can be clicked; the new response reset the tab to Body. C-051's claim test
failed about half its runs on it.
**Status:** Fixed in D5-e by #582: a send opens at Body when it is
pressed, and keeps a tab chosen after.

**U-206. Three PRs left specs red that were not in their lists.**
Severity 4. H5. Maintainers.
#581 (a script's heading in the review), #584 (the empty response's paste
on a phone) and #585 (the words of C-064's question, Import…, an ellipsis
in label-in-name) changed what specs outside their lists read. A full
Chromium run found them before `e2e.yml` did.
**Status:** Fixed in D5-e by #590, #591 and #592. A PR that changes words
or a first screen across the app runs the full Chromium suite, not only
its list.

## Every screen of D0.1, and its findings

Each screen of [`baseline/index.md`](baseline/index.md), with the open or
fixed findings it shows; from U-060 on, those of the third pass that a
screen shows (Chromium only). "No finding" means the second pass read its
Chromium captures at 1,440 px, in both themes, and at 390 px, and its
Firefox and WebKit captures by the comparison above, and found nothing a
finding does not already say.
The fourth pass's rows (U-130 to U-151) are not mapped here: it walked
flows rather than D0.1's screens, and each of its rows names its own
screenshot.

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
| `settings-general` | U-025, U-053, U-057, U-093 |
| `settings-history` | U-057 |
| `settings-data` | No finding |
| `settings-vault` | U-057 |
| `settings-bridge` | No finding |
| `settings-cookies` | No finding |
| `settings-shortcuts` | U-032, U-054 |
| `settings-diagnostics` | No finding |
| `settings-about` | No finding |
| `settings-danger` | No finding |
