# hig-review, 2026-10-23

A UI and UX review of the whole app and its design system, run on
2026-10-23 on `docs/hig-review-pass` at `6bb10cdb` (the same tree as
`main`), in Chromium, against the profile the maintainer confirmed that
day (`.hig-review.md`). It is the audit's third pass: each row below is a
finding of [`audit.md`](audit.md) from U-060 on, or a note on an earlier
finding; the table at the end says which. What the plan does with them is
[`PLAN-design.md`](../../PLAN-design.md), rows 1.41 to 1.46 of its
section 14.

The review's own IDs are kept: W-n for the app, DS-n for the design
system. Its Impact column maps to the audit's severity as section "Third
pass" of the audit says. The text is the review's, with its evidence paths
pointed at the screenshots kept in [`hig-review/`](hig-review/).

## 1. Summary

Reviewed: the whole Wayfarer web app (`/app/`, Angular 22, branch `docs/hig-review-pass` at `6bb10cdb`) plus its design system (`packages/tokens`, `src/design-system`, `src/app/ui`), from the running dev build and the source, against the confirmed profile ``.hig-review.md`` (web only, `register: utilitarian`, `release_stage: development`, direction A Workbench + C's rail).

Verdict: **default-assembled.** Voice and motion are authored on paper and both leak; 20 catalogue tells across 7 of 9 channels force the verdict. Without the threshold it would be "partly authored": the status bar's "Saved in this browser only" is the one thing that survives the logo-off test.

The findings that matter most: the Environments dialog throws away unsaved variable edits without asking (W-1, data loss), and a send gives a screen-reader user no word of its result (W-2). Close behind them: the app writes its own text into the slot where the server's words go ("0 Unknown Error", an invented error body, W-7). For a product whose promised feeling is "sure what was sent and what came back", that is the wrong place to make things up.

**Assumptions.** None beyond the confirmed profile. `register: utilitarian` and `density: dense` come from the profile. `humor: none` is the profile's reading of voice.md, which the maintainer did not contradict.

**Run notes**
- Tools: Playwright MCP (Chromium 156, DPR 1) against `http://localhost:4300/app/` with seeded "Pet store" data and the echo server on 4320. Source read-only. Token contrast computed with the review's `contrast.py` over flattened rgba pairs (each rgba token laid over the opaque surface it sits on).
- Evidence: the review took 453 screenshots (49 screens at 390, 820 and 1,440 px in light and dark, plus stress states at 320 and 2,560 px, 200% text, RTL, forced colours, pseudo-localisation and a catalogue set), six measurement files and notes of its Tab walks and timings. The 29 screenshots a finding cites are kept in [`hig-review/`](hig-review/); the rest, the measurements and the notes stayed with the review and are not committed, as the first pass's throwaway captures were not.
- **Runner fallback.** The app's Trusted Types CSP refused `page.addScriptTag` ("This document requires TrustedScript assignment"). The measuring script was used unchanged except that line, which became `page.evaluate(<script text>)`: the same code, evaluated over CDP. One call per screen state.
- **Fade-in artefacts discounted.**
  - Every text-contrast fail in the `no-preference` runs (1.06–2.95:1) lands on elements caught mid-way through the 300 ms `fade-in` (response pane, status line) or the 240 ms tab-pane fade.
  - The `reduce` runs show 0 failing text pairs on enabled elements, and the token audit confirms the colours pass. The only text fails left are disabled controls, which WCAG exempts.
  - The `transitionAll` count (333–425 under `reduce`) is a false positive: the reduced-motion block sets duration on `*` and leaves `transition-property: all`. The one real `transition-all` is DS-24.
- Targets: every toolbar, status-bar and icon button is 24 px or more. The three `spacingOk: false` rows come from the measuring script counting the enclosing focusable `tabpanel` as a neighbour (see Unverified).
- Browser coverage: Chromium only. Screen-reader output was not run, so W-2, W-3 and W-18 rest on source.
- Inputs merged: six pass notes (catalogue tells, structure and platform, interaction, copy, accessibility, design system) and the audit's status as of `6bb10cdb` (U-001 to U-059: 27 fixed, 30 open).

## 2. Findings (whole app)

Sorted by Impact, then the Apple column. "Prior" keeps every overlapping audit ID (U-) and design-system row (DS-). Confirmations of existing audit items are in a separate table after this one.

| # | Finding | Where | Impact | Apple | Fix | Prior |
|---|---|---|---|---|---|---|
| W-1 | The Environments dialog throws away unsaved variable edits without asking. The draft is a signal local to `app-environments-manager`, and the component is made inside `@if (environmentsVisible())`, so × or Esc destroys it along with the edits. Choosing another environment in the list runs `selectEnvironment`, which overwrites `draft` from the stored document. `hasEdits()` exists, but neither path calls it, though the editor needs an explicit "Save changes". Source-confirmed data loss. | Environments dialog: `app-shell.html:450-459`; `environments/environments-manager.ts:103, 154-161, 354` | Blocker | SHOULD | Guard both paths when `hasEdits(draft)` is true: "Save the changes to Staging?" with **Save**, **Discard** and **Cancel** (focus on Cancel). Or write each row on blur through `changeEnvironment` and remove the Save button, which removes the question. | U-041–U-044 (rows, not loss) |
| W-2 | A screen-reader user who presses Enter or Send hears nothing: not that it is sending, and not the result. The skeleton is `aria-hidden` with no `aria-busy`. The status line ("200 OK 16.3 ms · Direct") is drawn in a new `div` with no live role, and focus stays in the address. The core task cannot be confirmed without hunting. WCAG 4.1.3 (AA), source-confirmed. | Response pane: `response-viewer/response-viewer.html:11-16, 25-62` | Blocker | Web | One `role="status"` element that is always in the response pane: "Sending…" on send, then "200 OK, 16 ms, Direct" (or the failure's first line) on arrival. | U-055 (visual side) |
| W-3 | Errors that appear after an action are not announced. (a) Unlock and Create vault: the wrong-passphrase message is a plain `<p>`, the field gets no `aria-invalid` or `aria-describedby`, and focus stays in the field. (b) Address: `#address-error` is only an `aria-describedby`, which is not read again when it appears after Send, and "Send anyway" appears silently. WCAG 4.1.3 (AA); 3.3.1 (A) for (a). | `app-shell/app-shell.html:406-434`; `composer/composer.html:32-37`; `composer/address-row.html:38-39` | Blocker | Web | Put both messages in a `role="alert"` container that is rendered empty from the start. Set `aria-invalid="true"` and `aria-describedby` on the passphrase field. | U-026 |
| W-4 | Two visible labels are not in the accessible name, so Voice Control cannot reach them. The backup reminder's "Not now" is named "Dismiss backup reminder". The secrets manager's usage chips show "Staging.apiKey" but are named "Locate apiKey in environment Staging". WCAG 2.5.3 (A), source-confirmed. D rated the chips Major; the Rules make a source-confirmed level-A failure a Blocker. | `app-shell/app-shell.html:263-270`; `secrets/secrets-manager.html:77` | Blocker | Web | Banner: drop the `aria-label`, since the text names the button. Chips: start the name with the visible string, "Staging.apiKey, locate in environment". | — |
| W-5 | The composer/response split can be resized only by dragging the 8 px gutter, or with the arrow keys. There is no single-pointer path. WCAG 2.5.7 (AA), source-confirmed. | `ui/splitter.ts:26-40, 70-112` | Blocker | Web | Add click-to-step plus double-click to reset, or a gutter menu ("Wider request", "Wider response", "Reset split"). Keep the drag. | — |
| W-6 | At 320 px the page scrolls sideways: the toolbar's Settings button ends at x=322 (scrollWidth 322). The profile only promises 360 px, but WCAG 1.4.10 (AA) names 320 CSS px. Measured in both themes. | `header.ds-toolbar` right group; `hig-review/320-light-toolbar-overflow.png` | Blocker | Web | Set `min-width: 0` on the right group and `flex: 1 1 auto; min-width: 0` on the environment select, or move History and Settings into an overflow menu under 340 px. Add 320 to the layout spec's widths. | — |
| W-7 | **The app writes its own words where the server's go.** When no response arrives, core sets `statusText: "Unknown Error"` and status `0`. That is Angular HttpClient's wording; no server sent it. The pane shows a red "0" chip and "Unknown Error" as if they were an HTTP status, and one guidance paragraph for offline, a name that does not resolve, a refused connection and CORS alike. `navigator.onLine` is never read. The string travels to history ("Http failure response for {url}: 0 Unknown Error"), the HAR comment and the run table's Status column. When an error status arrives with an empty body, core substitutes "Http failure response for {url}: 404 Not Found" and draws it in the red monospace body `pre`, the treatment voice.md keeps for a server's words. It also stores that text as the history entry's error. Both misreport the evidence the person debugs from. See the honesty note in section 3. | `packages/core/src/send/exchange.ts:126-129, 653-654, 664, 705, 709`; `response-viewer.html:39, 43, 284-289`; `runner/run-view.html:182-183`; `shared/inspect/har-export.ts:42`; shots `hig-review/1440-dark-10-response-error.png`, `hig-review/1440-light-stress-{cors,dns,offline}-error.png` | Major | SHOULD | The status line, history and run rows say **"No response"**, and the body is set in sans, not red mono. When offline: "This browser is offline, so the request got no response. Connect, then send it again." Otherwise: "The request got no response. The browser does not say why: the name may not resolve, the server may have refused the connection, or it does not allow requests from this site (CORS)." Add a **Send through the Local Bridge** button. An empty error body reads "No body returned." and history stores nothing invented. | U-051 (extended); slop T20 |
| W-8 | A save that fails says nothing. `RequestSave.save` and `confirmSaveAs` have `try/finally` and no `catch`, so an IndexedDB error goes only to the console and Diagnostics. An `updated === null` result (the request was deleted in another tab) does nothing at all. The only sign is that the tab's unsaved dot stays. Not a Blocker: the draft survives, because the tab stays dirty, `TabsStorage` keeps dirty tabs and closing one asks first. Loss needs a second step. | `services/request-save.ts:106-130, 151-172`; `composer.ts:141` | Major | SHOULD | Catch the error and say it under the address row: "Not saved: this browser refused the write. Export the request" or "Not saved: the request was deleted in another tab. Save to collection…". On a null result, open Save as. | — |
| W-9 | ⌘S (or the Save button) collapses the folder that holds the open request and clears the tree's selection. What was just saved disappears from the sidebar on every save. | `services/collections-store.ts:257-262`; `hig-review/1440-light-kb-ctrl-s-after.png` | Major | SHOULD | Keep expansion and selection across `refreshCollectionEntry`, keyed by node id, and keep the bound request selected after a save. | — |
| W-10 | Saving from the keyboard drops focus to `<body>`. Save is `[disabled]` while `savingRequest()` is true, so the focused button is disabled under the caret and focus moves to the document. | `composer/address-row.html:76-90` | Major | SHOULD | Use `aria-disabled="true"` plus the existing guard (`composer.ts:141`) instead of `disabled`. Check every button that disables itself while busy. | — |
| W-11 | Destructive confirmations fall back to "Proceed", and the shared confirm is a template: a warning glyph in a tinted circle, centred text, and two equal `w-28` buttons. Clear history asks "Are you sure?" with "Your entire history will be cleared". Delete secret and Reset all data also accept with "Proceed". Delete item says "This action cannot be undone. Continue?". | `ui/confirm.ts:55-79`; `app-shell.ts:302, 308-312`; `secrets-manager.ts:192-199`; `collections-sidebar.ts:487-490`; `hig-review/1440-dark-43-confirm-dialog.png` | Major | SHOULD | Clear history: "Clear history? Every entry is deleted; collections are not touched. This cannot be undone." with **Clear history** / Cancel. Delete secret: "Delete the secret {name}?" with **Delete** / Cancel. Reset: "Reset all data? Every collection, request, environment, secret, history entry and setting in this browser is deleted. This cannot be undone." with **Reset all data** / Cancel. Remove the "Proceed" default and drop the decorative glyph. | U-056; slop T4, T17 |
| W-12 | "Send to a different host?" says "Yes holds for {host} until the run ends", but the buttons are "Send" and "Don't send". The person never learns that one click allows every later request in the run. "Don't send" is also a contraction. | `state/workspace-store.ts:561, 829-832` | Major | SHOULD | "A script of this run changed where {request} goes: from {from} to {to}. It uses a vault secret, which would be sent there. Send allows {to} for the rest of this run." Buttons: **Send** / **Do not send**. | — |
| W-13 | Below 1,200 px the tree becomes a modal drawer, closed by default, that makes the composer and response inert. At 820 px, or in a half-width laptop window, a daily user cannot see saved requests beside the open one. Each switch costs a toggle, a click and an auto-close. | `app/app.ts:97`; `app-shell.html:46-63`; `hig-review/820-light-26-tree.png` | Major | SHOULD | Keep a pinned, non-modal `<aside>` down to 768 px and use the modal drawer only below that. Balance the response width with U-003 and the existing splitter. | U-049, U-003 |
| W-14 | Rows are named by index, not content: "Send parameter 1", "Send header row 2", "Send part 3". Every row's × is "Remove parameter" or "Remove variable", and the lock is "Mark variable as secret". | `params-panel.html:13, 32`; `rows-editor.html:10`; `multipart-editor.html:7`; `environments-manager.html:185-198` | Major | SHOULD | Name each control by its key: "Send kind" (or "Send empty row 3"), "Remove kind", "Mark apiKey as secret". | — |
| W-15 | The status bar's words are not its controls. "Route: Auto", "Vault locked" and "Secrets" are spans beside 26 px icon buttons named "Local Bridge settings", "Unlock secrets" and "Manage secrets", and a lock or unlock is not announced. This is the app's one owned element (section 4), and it is the least operable part of the shell. | `app-shell.html:323-362` | Major | SHOULD | Make each item one button of icon plus words, named by its visible text. Put the action in `aria-description`. Announce vault changes through the status region from W-2. | — |
| W-16 | At 200% text, rem-sized boxes double and px-sized text does not. The sidebar takes about 700 of 1,440 px and the response is squeezed to about 220 px, with its tabs cut ("Timi…"). Method badges outgrow the request names, and the status bar clips. It passes 1.4.4 through zoom, so Major. | `hig-review/1440-light-stress-font200-composer.png`, `hig-review/1440-light-stress-font200-settings.png`, `hig-review/390-light-stress-font200-composer.png` | Major | Web | Type tokens in rem (DS-7), the sidebar at `min(22rem, 30vw)`, and status-bar items that truncate. At large text, stack the response under the request. | DS-7 |
| W-17 | The HTTP method field has no focus mark of its own: it shares the address bar's sub-3:1 glow, so it is unclear which half of the bar has focus. | `input[aria-label="HTTP method"]`; `hig-review/1440-light-focus-method.png` | Major | Web | Give each half of the bar its own mark of 3:1 or more (a 2 px `--accent` inset outline or underline). | DS-4 |
| W-18 | Fourteen `role="status"` or `role="alert"` regions are created inside `@if` together with their message, so screen readers often skip them. That covers the update, backup, storage, bridge-test, paste-note and dropped-header messages. | `app-shell.html:237-305`; `bridge-pane.html:64, 104, 118, 131`; `composer.html:40`; `request-warnings.ts:22, 31`; `body-panel.html:29, 35`; `diagnostics-pane.html:31` | Major | Web | Render each region empty from the start and change only its text, as `address-row.html:119` already does. | — |
| W-19 | The environment variable Key and Value inputs are named only by the placeholders "KEY" and "Value", and the columns have no headings. | `environments-manager.html:154-167`; `hig-review/1440-dark-36-environments-rows.png` | Major | Web | Add `aria-label` "Key" and "Value of apiKey", plus a visible header row as in `params-panel.html:1-6`. | U-041, DS-5 |
| W-20 | Run results are a dead end. A failed row cannot open its request, its response or the failing test, so the QA tester must find the request in the tree and send it again, which loses the run's data. | `runner/run-view.html:158-191`; `hig-review/1440-dark-34-run.png` | Major | Research | Each row opens its exchange (`state.exchanges`) in the response pane, with an "Open request" action. List failed rows first when "Failed only" is on. | U-014, U-039 |
| W-21 | Slop cluster: 20 tells over 7 of 9 channels, 13 of them unexamined defaults and 7 of those against Wayfarer's own voice.md, motion.md or direction A. The direction kept Linear's and Yaak's surface (warm near-black, one muted green, hairlines, Inter, ⌘K keycaps). Of the mechanism it kept the parametric theme but not the hierarchy: the label tiers collapse, 12 px is the working size, and control boundaries are as faint as decoration. Chrome recedes, and so do the controls. Logo-off reads as any dark dev tool. | App-wide; `tokens.css:70-101`; `hig-review/1440-dark-03-response-json.png`, `hig-review/1440-dark-01-first-run.png` | Major | Taste | Do not swap looks. First clear the drift (W-11, W-26, W-27, W-39, DS-16, DS-21). Then keep the mechanism: hierarchy by tier and weight, interactive boundaries distinct from decorative ones, and density chosen per region (D4-e). Spend identity on the subject (section 4). | DS-18, DS-1, DS-5, DS-8, DS-19; U-020, U-036, U-054, U-056 |
| W-22 | The most frequent actions carry the most motion. Each send scales the button to 0.96 and flashes shimmer bars even for a 16–38 ms local reply. The response then fades in over 300 ms, and every tab switch fades over 240 ms, arrow-key switches included. The answer sits at partial opacity for 8× the network time, and the skeleton is not the response's shape. | `animations.css:63-68`; `tabs.css:117-119`; `response-viewer.html:12-23`; `button.css:67-71`; the review's motion notes (not kept) | Minor | SHOULD | No indicator under about 1 s (after that, "Sending" plus elapsed time); the response and panes appear in one frame; no scale on Send. Record the change in motion.md (F48). | U-055, DS-22; T7–T9 |
| W-23 | Toggling the sidebar slides the main column (`margin-left 300ms`, both ways). That re-lays out Monaco on every frame and breaks two motion.md rules. | `app-shell.html:136` | Minor | SHOULD | Switch the margin in one frame. | U-033 note |
| W-24 | Nothing can be undone. Deletes go through a confirm, a row's × removes it at once, and ⌘Z restores neither. | `collections-sidebar.ts:487-490`; rows-editor × | Minor | SHOULD | Remove at once, then show an in-place "Deleted Health. Undo" for a few seconds. Keep the confirm only for Reset all data and Replace all. ⌘Z restores a removed row. | U-056 (distinct) |
| W-25 | ⌥T and ⌥W are read on `window` with no text-field check. On a Mac, ⌥W types "∑", so typing it in a field closes a tab. On Windows and Linux, Alt+T is Firefox's Tools menu key. | `tab-strip.ts:88-99`; `shortcuts.ts:16-17` | Minor | SHOULD | Ignore Alt-only chords while focus is in an editable field. Use Ctrl+T/W in a standalone PWA window; test Alt+Shift+T/W in Firefox on Windows. | U-032 |
| W-26 | Strings use words or person forms that voice.md bans: "…failed", "Unable to import", "Invalid JSON", "not valid JSON" ×2, "Vault open", "Incorrect passphrase. Please try again.", "Unable to unlock secrets in this environment.", "the user's password", "I trust these scripts", "Toggle sidebar", and an OAuth error ending in "See docs/browser-limits.md#oauth." | `app-shell.html:302, 351`; `app-shell.ts:194, 369, 373, 412`; `oauth-tokens.ts:29-30, 217`; `socket-client.ts:107`; `script-sandbox.ts:113`; `import-dialog.html:36`; `environments-manager.html:220`; `workspace-backup.ts:59`; `secrets-vault.ts:223, 270`; `oauth-fields.html:22`; `script-review-dialog.html:52` | Minor | SHOULD | "Data was not reset: {error}. Nothing was deleted. Reload the page and reset again." · "The token request got no token: {message}" · "The connection did not open." · "The script stopped with an error." · "{file} was not imported:" · "This is not JSON: {parser message}" · "Vault unlocked" · "That is not the vault's passphrase." · "The vault could not be unlocked in this browser." · "The password grant gives the client the account's password." · **Trust these scripts** · "Show sidebar" / "Hide sidebar" · a link "Why browsers block token requests" plus **Send through the Local Bridge**. | U-026, U-014; T18, T19 |
| W-27 | 28 labels are in Title Case and two non-method labels are in capitals, beyond U-054's list: the palette, the New Collection and New Folder dialog titles, "Pre-request Script", "Status Code", "Add Variable", the banner, and the "KEY" placeholder and "RUN" badge. | `app-shell.ts:145-219`; `collection-context-menu.ts:33-49`; `collections-sidebar.ts:214-257, 531-537`; `inherited-settings-dialog.html:51, 61`; `test-assertion-ui.ts:6`; `environments-manager.html:157, 209`; `tab-strip.html:10` | Minor | SHOULD | Use sentence case everywhere: "New request", "Focus the address", "Lock the vault", "Reset all data…", "Pre-request script", "Status code", "Add variable", "Key", "Run". | U-054, U-020 |
| W-28 | One thing goes by several names. Address appears as "URL" and "Load … into composer". Secret appears as "Protected". Request appears as "New Item" and "Delete item?". The import review mixes "id" and "ID". History calls one act Remove, Delete history entry and (on phones) "Delete request", has two Clear names, and uses "Load". | `past-requests.html:38, 122, 189, 195`; `past-requests.ts:185-186`; `bridge-pane.html:19`; `collections-sidebar.ts:277, 537`; `environment-export-dialog.html:28`; `secrets-manager.html:40`; `import-dialog.html:84, 120`; `app-shell.html:89-90`; `settings.html:152` | Minor | SHOULD | "Search by address, method or status" · "Bridge address" · "Open {name}" · "Secret variables" · New request/folder/collection by kind · "Delete this entry from history?" / **Delete** · "Clear history" everywhere · "Open". | U-015, U-024 |
| W-29 | Empty places say what is missing, not what goes there: "No response headers available.", "No tests were run…", "The jar is empty.", "None." ×2, "No secrets yet … it'll show up here." | `response-viewer.html:329, 344, 488, 525`; `cookies-pane.html:56`; `diagnostics-pane.html:65, 77`; `secrets-manager.html:38-40` | Minor | SHOULD | "The response's headers show here." · "Send the request and its timings show here." · "Tests you add in the Scripts tab show their results here." with **Add test** · "Cookies that responses set through the Local Bridge are kept here." · "No errors since this page loaded." · "Secrets you mark in Environments are kept here." with **Open Environments**. | U-022 |
| W-30 | Modals stack inside the Environments modal, up to three layers: New environment, variables, export, Create vault, and `window.confirm`. | `environments-manager.html:263, 311, 320`; `.ts:209`; `app-shell.html:386-447, 457` | Minor | SHOULD | New environment becomes an inline row (Enter creates it, which closes U-044), vault creation an inline panel, and delete uses `Confirm` (DS-12). | DS-12, U-044, U-012 |
| W-31 | The red-at-rest, icon-only "Clear all history" button sits 34 px from Close in the History drawer. | `app-shell.html:84-103`; `hig-review/1440-dark-37-history.png` | Minor | SHOULD | A text button, "Clear history…", at the end of the list or in Settings, with a confirm that names the count. | U-024, U-043 |
| W-32 | The status-bar theme button flips between light and dark, and the first press silently leaves System. | `app-shell.html:370-379`; `theme.ts:51-53` | Minor | Web | A System / Light / Dark menu, or a cycle with the current state in its label. | T16 |
| W-33 | The PWA chrome does not match the app. `theme-color` is #000000 / #F5F5F7, not the canvas colours, and it follows the OS rather than the in-app theme. The manifest has no `theme_color`, `background_color`, `id` or `description`. | `index.html:8-9`; `manifest.webmanifest` | Minor | Web | Take both colours from the canvas tokens, update the meta in `ThemeService.apply()`, and add the four manifest fields. | DS-16, U-036 |
| W-34 | `viewport-fit=cover` is set but no safe-area padding exists, and the phone shell uses 100vh. | `index.html:7`; `app-shell.html:121` | Minor | Web | Pad with `env(safe-area-inset-*)` and use `min-h-dvh`. | — |
| W-35 | Tab panels that hold controls are Tab stops of their own: three empty stops on every composer walk. | `ngTabPanel` default; the review's Tab walks (not kept) | Minor | Web | `tabindex="-1"` on panels that contain focusable controls. | — |
| W-36 | Run and Send turn into Cancel in the same spot, so a double click cancels. "Cancel run" is red and filled. | `run-view.html:8-13`; `address-row.html:103-112` | Minor | Research | Ignore clicks for about 500 ms after the swap, or put Cancel beside the primary. Make "Cancel run" secondary. | — |
| W-37 | Diagnostics says "Nothing leaves this machine" while its self-test fetches the app's own manifest from the server. | `diagnostics-pane.html`; `.ts:158` | Minor | Research | "Runs a script, encrypts and decrypts, writes and deletes a record, asks the server this app came from for one of its own files, and asks the Local Bridge if one is used. No workspace data is sent." | — |
| W-38 | "Export with credentials" sits directly under "Export" at the same weight and acts at once. "Copy as cURL with credentials" does the same to the clipboard. | `collection-context-menu.ts:41-43`; `address-row.ts:48-53` | Minor | Research | Fold both into the one "Export…" dialog with an unchecked "Include credentials" box. | U-016 |
| W-39 | Cards are back inside overlays: palette rows, the environments list, the Settings › General theme box and History skeletons. | `hig-review/1440-dark-30-palette.png`, `hig-review/1440-dark-35-environments-empty.png`, `hig-review/1440-dark-44-settings-general.png`; `past-requests.html:5` | Minor | Taste | Reviewer judgement: one grouping cue per level. Extend D4-d's no-card rule to D4-f, D4-g and D4-h. | U-004, U-011; T2 |
| W-40 | A backdrop click closes Create vault passphrase and Save to collection, and the typed passphrases or name are lost. | `app-shell.html:390`; `save-as-dialog.html:6` | Minor | Taste | Reviewer judgement: no `dismissableMask` on dialogs with typed input, or only while their fields are empty. | — |
| W-41 | +8 Minor beyond the cap. **a.** The empty response offers cURL and Import when a request is ready, where the next step is Send (A5, Research, U-022). **b.** The run's setup stays above its results (A12, Taste, U-013). **c.** The 390 px toolbar has six controls, five of them icon-only; move Environments and History into the drawer (A13, Web, U-006 note). **d.** Monaco draws its own 1 px blue focus ring (B13, Taste, U-052). **e.** Wrong plurals: "environment(s) detected", "1 folders" (C11, SHOULD, U-015). **f.** At 2,560 px fields run about 1,530 px wide; cap the rows editor's width (B12, SHOULD, U-003). **g.** Mono values flip under `dir=rtl`; set `dir="ltr"` on them (D12, Web). **h.** `lang="en"` on British copy, names built by concatenation, plurals by ternary (D13, Research). | the review's pass notes (not kept) | Minor | mixed | as listed | as listed |
| W-42 | +5 Polish. **a.** The manifest marks every icon "maskable any" (A14). **b.** New request appears only in the drawer (A15, U-010, U-027). **c.** "Must be JSON" should read "Check it is JSON before sending" (C15). **d.** Timing tooltips hedge and use an unspaced em dash (C16). **e.** "Trust center" should be "Trust centre" (C17). | as listed | Polish | mixed | as listed | as listed |

waived: 4. These are the logo mark, ⌘S overriding the browser's Save page, shortcut notation for the reader's OS only, and 44 pt targets (2.5.8 was still checked).

Counts: Blocker 6, Major 15, Minor 27 (19 rows plus 8 in W-41), Polish 5.

### Confirms existing audit

| Audit ID | Status | Seen this run | Row |
|---|---|---|---|
| U-051 | Open, D4-e | Confirmed for refused, DNS, CORS and offline. Extended to history, HAR, the run table and the invented body. | W-7 |
| U-055 | Open, D4-e | Confirmed. The screen-reader side is new. | W-2, W-22 |
| U-056 | Open, D4-f | Confirmed. Extended to Clear history, Delete secret and Reset. | W-11 |
| U-054 | Open | Confirmed. Extended to the palette, dialog titles, collection settings, the assertion builder and the banner. | W-27 |
| U-020 | Open | Confirmed: "COLLECTIONS" and "ENVIRONMENTS" are still uppercase. | W-21, DS-8 |
| U-026 | Open, D4-g | Confirmed: still no "cannot be recovered". Close it before v3.0.0. | W-3, W-26 |
| U-041 | Open | Confirmed. | W-19 |
| U-049 | Open | Confirmed; it is a symptom of the modal drawer. | W-13 |
| U-003 | Open | Confirmed at 1,440 and 2,560. | W-13, W-41f |
| U-010, U-011, U-016, U-024, U-025, U-027 | Open | Unchanged; no regression. | W-38, W-39, W-31, W-42 |
| U-014, U-039 | Open | Confirmed. | W-20 |
| U-015 | Open | Confirmed. | W-28, W-41e |
| U-043, U-044 | Open | Confirmed. | W-31, W-30 |
| U-052, U-038 | Open | Not re-measured. | W-41d |
| U-006 note, U-033 note | Open notes | Confirmed. | W-41c, W-23 |
| **U-036** | Fixed #389 | **REGRESSION (remnant):** the status colours are still Apple's system values, and `theme-color` is #000 / #F5F5F7. | DS-16, W-33 |
| U-004 | Fixed #428 | Unfixed remainder (overlays, radii); not a regression. | W-39, DS-27 |
| U-022 | Fixed #427 | Holds. The "request ready" state was never covered. | W-41a |
| U-032 | Fixed #426 | Holds. The new ⌥ keys conflict with typing. | W-25 |
| U-050 | Fixed #431 | Confirmed working. | — |
| U-013 | Fixed #372 | Holds. | W-41b |

## Design system findings (DS numbering from ds.md kept; checked against the W rows: the DS row keeps the cause, the W row shows the screen consequence)

| # | Finding | Where | Impact | Apple | Fix |
|---|---|---|---|---|---|
| DS-1 | An unchecked checkbox's only mark is a `--separator` hairline at 1.20–1.26:1 (dark) and 1.21–1.22:1 (light). It has no visible label in the Params, Headers, multipart and History rows. WCAG 1.4.11. | `ui/checkbox.css:14-15`; `params-panel.html:10-16`, `rows-editor.html:7-12`, `multipart-editor.html:4-10`, `past-requests.html:71-77` | Blocker | Web | A `--border-control` token at 3:1 or more in both themes; keep `--separator` for decoration; add control boundaries to `contrast.test.mjs`. |
| DS-2 | The option the arrow keys are on in `ui-select` is marked only by `--fill-hover`: 1.19:1 (dark), 1.08:1 (light). | `select.css:101-105`; `select.ts:43, 90` | Blocker | Web | The 2 px `--accent` inset outline that the forced-colours block already uses. |
| DS-3 | 12 px `--label-tertiary` on `--status-warning-fill` measures 4.48:1 (dark). | `environments-manager.html:170-172`; `tokens.css:86, 116` | Blocker | Web | Use `--label-secondary-on-fill`; add label × fill pairs to the contrast gate. |
| DS-4 | Field focus is a 1.56–2.13:1 border plus a 1.41–1.79:1 glow, with `outline: none`. | `input.css:49-54`; `select.css:30-36`; `components.css:308-311` | Major | Web | A 2 px `--accent` border or the global ring. |
| DS-5 | Interactive borders are 1.14–1.43:1, field fills 1.05–1.13:1, hover changes contrast by +0.1:1, and the scrollbar thumb is about 1.3:1. | `input.css`, `select.css`, `segmented.css`, `file.css`, `components.css:565`, `styles.css:138-155` | Major | Web | A control-boundary token at 3:1 or more, plus a visible hover step. |
| DS-6 | There is no `prefers-contrast` variant. | `tokens.css`; `packages/tokens` | Major | SHOULD | A generated `more` block per theme, checked by the contrast gate. |
| DS-7 | Type is set in px: all tokens plus literals. | `tokens.css:36-67`; `button.css:29`; `input.css:16, 124`; `menu.css:19`; `tree.css:29, 88`; `components.css` | Major | Web | Rem tokens; replace the literals with `var(--type-*)`. |
| DS-8 | 12 px is the working size: 190 of 275 type-class uses; body (14 px) appears 5 times. | template grep; `tokens.css:52-63` | Major | SHOULD | 13 px as the working size, 12 for captions; decide in D4-e. |
| DS-9 | `btn-secondary` and `btn-danger` do not change on hover or press (`--fill-hover` = `--fill-secondary`). | `tokens.css:78-79, 180-181`; `button.css:122-140` | Major | Taste | Give each its own hover and active steps. |
| DS-10 | A disabled field looks enabled, and `ui-select` has no disabled style. | `input.css:70-77`; `select.css` | Major | SHOULD | A disabled state, plus a separate `readonly` style. |
| DS-11 | Nothing styles `[aria-invalid]`. | `address-row.html:39`; `input.css`, `select.css` | Major | Taste | An error border at 3:1 or more, plus `aria-describedby`. |
| DS-12 | Deleting an environment uses `window.confirm`. | `environments-manager.ts:209` | Major | Web | `Confirm.confirm` with Delete. |
| DS-13 | Elevation inside dialogs flattens (dark) or inverts (light). | `tokens.css:74, 91, 104-105, 176, 206-207` | Major | Web | One elevation step above the dialog. |
| DS-14 | Forced colours lose the select's focus, the unsaved dot, the timing bars, the storage meter and the drop line. | `select.css:31-36`; `tabs.css:95-101`; `components.css:360-363`; `settings.css:216-229`; `tree.css:47-53` | Major | Web | `forced-colors` rules for each, plus catalogue tests. |
| DS-15 | The selected row's fill is 1.14–1.23:1 and hover erases it. In dark, the chosen segment is darker than its track. | `tree.css:35-41`; `segmented.css:40-46` | Major | SHOULD | Hover never replaces selection; a 3:1 cue on the selected row; a raised chosen segment. |
| DS-16 | Status colours use Apple's system values; `theme-color` is #000 / #F5F5F7. This is a U-036 remnant, flagged as a regression. | `tokens.css:115, 118, 217, 220`; `index.html:8-9` | Major | SHOULD | Derive the status colours in OKLCH from the product's palette; take `theme-color` from the canvas tokens. |
| DS-17 | Hard-coded colours and shadows: `#fff`, a cool field shadow, a 40% black segmented shadow in light, scrims, the drawer shadow. | `button.css:9, 236`; `input.css:12`; `select.css:12`; `segmented.css:42-44, 86-88`; `dialog.css:17, 131, 138, 142` | Major | SHOULD | Tokenise each value per theme. |
| DS-18 | DS slop cluster: 9 tells over 5 channels. | as in ds.md | Major | Taste | See section 4; counted in W-21. |
| DS-19 | The label tiers have collapsed, and in light, tertiary is darker than secondary. | `tokens.css:84-87, 186-189` | Minor | Taste | Two tiers, or three spaced apart. |
| DS-20 | Some token roles are duplicates or misleading, and `text-method-*` renders the fill colour at 2.65:1. | `tokens.css`; `styles.css:65-101` | Minor | Taste | Expose only the `-text` shades as text colours. |
| DS-21 | A spring hover lift on chips. | `components.css:329-337`; `secrets-manager.css:14-27` | Minor | Taste | Drop the translate. |
| DS-22 | Every button scales on press, Send included. | `button.css:67-71, 221-223` | Minor | SHOULD | No scale on frequent controls. |
| DS-23 | About 90 control transitions fire on a theme switch. | `styles.css:182-195`; `button.css:39-45` | Minor | Taste | Suspend transitions for one frame. |
| DS-24 | `transition-all` on the environment variable row. | `environments-manager.html:151` | Minor | Taste | Name the properties; ban `transition-all` in the token test. |
| DS-25 | No spacing or control-height scale: heights of 40, 41, about 35, 34, 32 and 28 px. | `button.css`, `input.css`, `select.css`, `components.css` | Minor | Taste | Control-height and spacing tokens. |
| DS-26 | The global `:focus-visible` rule sets a 3 px radius on everything it focuses. | `styles.css:164-168` | Minor | Taste | Drop the radius. |
| DS-27 | Radii outside the scale (6 px, `999px`) and a wrong `--radius-lg` fallback. | `accordion.css:17-27`; `segmented.css:80`; `controls.css:93`; `settings.css:106, 219` | Minor | Taste | Snap to the scale (U-004 remainder). |
| DS-28 | Material residue in metrics; Material Symbols at weight 300. | `checkbox.css`, `input.css`, `select.css`, `dialog.css`, `components.css:531-534` | Minor | SHOULD | Set metrics from this product's density; match icon weight to labels; the icon set is D2.4's. |
| DS-29 | Method and status colours share values (GET = success green). | `tokens.css` | Minor | SHOULD | Separate them by lightness or chroma. |
| DS-30 | Stale file headers; the segmented control paints the chosen option twice. | `animations.css:1-4`; `components.css:1-4`; `segmented.css` | Polish | Taste | Fix the headers; delete one layer. |

waived: 1 (APCA). Counts: Blocker 3, Major 15, Minor 11, Polish 1.

## 3. Trust

No deceptive patterns found in what was seen (gate: 0 hits). There is no account, purchase, ads or consent banner. Credential options start off, and destructive confirms focus Cancel. There is no analytics or beacon code. The four items passed to D (run-scoped cross-host consent, "Proceed", one-click credential export, "I trust these scripts") are not Trust items; their copy and safety parts are W-11, W-12 and W-38.

**Honesty note (not a Trust Blocker).** W-7 breaks the anti-fabrication rule, and it is filed at Major.
- When no response arrives, the app shows "0 Unknown Error" as if a server had sent that status.
- When a 4xx or 5xx arrives with an empty body, it writes "Http failure response for {url}: 404 Not Found" into the body pane, in the red monospace voice.md keeps for a server's words.
- Both strings are saved to history and from there reach HAR exports and run reports.

There is no gain to the product and no gate type, so it is not deceptive design. It is still invented evidence in a debugging tool whose promised feeling is "sure what was sent and what came back". Two smaller items sit beside it: the "Nothing leaves this machine" overstatement (W-37), and Create vault still not saying a forgotten passphrase cannot be recovered (U-026, open).

## 4. Distinctiveness verdict

**default-assembled.** The catalogue threshold forces it: 20 tells across 7 of 9 channels, against a threshold of 5 tells or 3 channels. On the procedure alone it would be **partly authored**. Two channels are authored and one shows on the primary screen, but there is no committed signature element or behavioural moment, and the logo-off answer is a single phrase.

**Gate.** Every core flow has an open Blocker or Major: send (W-2, W-7, W-17), environments (W-1, W-19), vault (W-3), save (W-8 to W-10), shell (W-13, W-15) and run (W-20). The expression proposals below are therefore held as direction for after those fixes. Two of them are reliability-tier rather than pleasure-tier, and they grow out of W-2, W-7 and W-15.

**Channels**

| Channel | Source | Evidence |
|---|---|---|
| Type | trend default | Inter is the only UI face, tuned "to give Inter the clean geometric feel of SF Pro" (`components.css:19-27`), and the measuring script's `defaults` check flags it in all 12 combinations. The mono-for-values role split is authored, but W-7 shows the app breaking it. |
| Color use | trend default | Warm graphite plus one muted green: direction A's "closest to Yaak/Linear" (`tokens.css:70-101`). The status colours are Apple's system values. The method colours are shared across the category. |
| Shape | library default | The shadcn field (`shadow-xs` plus a 3 px ring), Material metrics, `rounded-xl` containers. |
| Motion | authored, leaking | motion.md traces each rule to a reason and the tests enforce it. It is diluted by the button squish, the spring hover, the skeleton plus fade on every send, and the theme fade (W-22, DS-21–23). |
| Iconography | library default | Material Symbols 300; D2.4 owns the set. |
| Imagery | none | Not counted. |
| Sound and haptics | platform default | None; correct for this register. |
| Layout idiom | trend default, one authored element | The silhouette is the category median: tree, tabs, request beside response. That convergence is correct for task flows. On top of it sit the reflexes (cards in overlays, centred icon empty states, icon-only headers, a sun/moon toggle). The status bar that states device state in words is authored. |
| Voice | authored, leaking | On the primary screen: "Saved in this browser only", "Editing Pet store / Pets / List pets — Save writes back to this request.", "16.6 ms · Direct", and "The run is complete. 4 results in 1 iteration; 1 failed; 4 of 5 tests passed." The masking copy note (U-050) is the best of it. Leaks: T17–T20 and W-11, W-12, W-26 to W-29. |

That makes 2 of 9 channels authored, and voice shows on the primary screen. Signature element: none committed. Signature moments: 0 visual (fine in this register) and 0 behavioural delivered. Speed is measured at 38 ms per local send but hidden behind a skeleton and a fade.

Tells per catalogue section: AI-template 8 · Apple-clone 1 · Material-clone 1 · shadcn/Tailwind-default 2 · praised-product clone 2 · research-blessed gone generic 2 · AI-microcopy 4. Waived: 1 (logo).

**Trace to the subject.** The subject is sending a request from a browser tab with nothing leaving the device except the request, and being able to say afterwards where it went. Already traced to it: the status bar words, the route word "Direct", the copy note that names what was masked, and C-053's cross-host question. Type, colour, shape and icons trace only to the reference products. The C inspector rail is the part of the direction derived from Wayfarer's own subject ("why a request failed, where it went, which secrets it used"), and it has no session (`ia.md:63-67`).

**Brand tests** (`hig-review/1440-dark-03-response-json.png`, `hig-review/1440-dark-01-first-run.png`, `hig-review/1440-dark-34-run.png`)
- **Logo-off, verbatim:** "Saved in this browser only". More weakly: "Route: Auto", "Vault locked" and "· Direct". Everything else is category stock. The run summary sentence comes closest to being a second answer.
- **Competitor swap:**
  - Yaak, Bruno, Insomnia (desktop): only "Saved in this browser only" reads wrong.
  - Postman: the same phrase reads wrong. "Route" and "Vault" do not, because Postman has its own agents and vault.
  - Hoppscotch (browser, PWA, local storage): almost nothing reads wrong, so the owned phrase is owned only against desktop rivals.
  - Linear: the chrome is its surface.
  - Rivals were not captured; the swap rests on reviewer knowledge (see Unverified).
- **Asset grid:**
  - Status-bar device words: partly unique, on 1 surface → investment potential.
  - Masking copy note: unique as far as seen, copy only → investment potential.
  - The route word: shared with Postman → avoid solo use.
  - Green accent: not unique → ignore or test.
  - Method colours: famous but not unique → avoid solo use.
- **Emotion questions (calm, fast, trustworthy):**
  - First screen: calm, on-brief for "in control", off-brief for "fast".
  - A pleasure to repeat: ⌘↵ with the caret already in the address (35 inputs, 0.06 s), spoiled by the fade.
  - What a user would show a friend: "it tells you what it masked".
  - Trustworthy: broken by W-7.

**Judged against the direction.** Direction A stands, and this pass does not reopen it. But the sameness has a clear source: the chosen direction drives the convergence on type, colour and shape, because it named two products and kept their look.
- Kept from Linear's mechanism: the parametric OKLCH theme.
- Lost: hierarchy discipline (DS-19, DS-8, DS-1, DS-5). Speed is measured but not shown (W-22).
- Mechanism to keep instead: hierarchy by tier and weight, with controls that stay findable while chrome recedes; speed made visible on the core action; keyboard-first without exceptions (W-10, W-25, W-35); and the C rail actually built.
- Declined: Linear's or Yaak's look as a target. It is catalogued as a praised-product clone.

**Signature elements** (the budget is one; two candidates, the first recommended)
1. **Provenance in the type split.** Mono means bytes that crossed the wire, exactly as sent or received. Sans means Wayfarer speaking, and the app never writes its own words in the server's slot.
   - Source: the existing mono rule and "sure what was sent".
   - Where it repeats: composer, response, history, run, HAR and copy notes. It fixes W-7 by construction.
   - Catalogue check: the catalogue flags mono for non-code labels, and this rule is the opposite, so no match.
   - Fits any product? No.
2. **The account of where it went.** One fixed sentence per exchange, always in the same place: the route taken, the host, the secrets filled (by name, masked), and what was kept where.
   - Source: `RoutePolicy.took`, `BuiltRequest.secrets`, the redactor, `copyNote`, C-007 and C-053. This is the C rail's content.
   - Catalogue check: it reports something true and lives where the response is, so it is neither a decorative status dot nor a toast.
   - Fits any product? Only a local-first one.

**Signature moments** (behavioural, brief, and they hold up under Reduce Motion and screen readers)
- **Send shows its speed.** On ⌘↵ the status line and body appear in one frame with the real elapsed time. No skeleton under about 1 s, and a live region says "200 OK, 16 ms, Direct". It builds on W-2 and W-22 and adds no new motion.
- **A failure says where it went.** Only on a failed send, the rail opens with what the browser actually reported, the route taken, and one action: **Send through the Local Bridge**. Source: U-051, U-014 and the C rail. It never appears on success, so it never slows the repeated task.

Both moments check clean against the catalogue: no celebration effect and no loading theatre. Under the gate, both come after W-2, W-7 and W-15.

## 5. Elevate (each guardrail-checked; none adds delight, illustration or motion)
1. **Agency: the status bar is the one place where device state is stated and changed.** Make each item a single control named by its words (W-15), announce changes through the W-2 region, and use the same words on phones.
2. **Responsibility: the app never speaks in the server's voice.** Mono for wire bytes and sans for Wayfarer, across the response pane, history, the run table and HAR, with an empty body shown as empty. This is signature element 1 and the structural fix for W-7.
3. **Simplicity: the answer to ⌘↵ arrives in one frame.** Remove the skeleton under 1 s, the 300 ms and 240 ms fades, and the press scale on Send (W-22, DS-22). Show elapsed time only once a request is slow.
4. **Craft: keep Linear's hierarchy mechanism, not its look.** In the tree, the Params and Headers rows and the environments editor: three visibly different label tiers (DS-19), 13 px as the working size (DS-8, D4-e), and a 3:1 interactive-boundary token kept apart from separators (DS-1, DS-5).
5. **Purpose: build the C rail as the account of a request.** Give it a session. It should hold the route, the host, the secrets used (masked) and what history kept, plus the next action on failure. The run table (W-20) and history then open into it.

## 6. Unverified
- **Rival screens:** none captured (D1.4 rivals half not run), so the competitor swap rests on reviewer knowledge. Verify by capturing Yaak, Postman, Bruno, Insomnia, Hoppscotch and Linear.
- **Firefox and WebKit:** not run (Chromium 156 only). Verify with the three-engine projects.
- **Screen readers (VoiceOver, NVDA):** not run; W-2, W-3 and W-18 rest on source. Verify on send, unlock and banners.
- **Toasts and notices:** "Copied as cURL." and the after-delete state were not captured.
- **Loading:** a sub-50 ms skeleton paint was not frame-captured, and slow-network throttling was not used.
- **Save:** whether ⌘S wrote to storage was not checked, and no real IndexedDB quota or blocked failure was produced (W-8).
- **W-1 at runtime:** confirmed in source only. Verify: edit petId, press Esc, reopen.
- **Error wording:** may differ in other engines; the CLI's `networkErrorWithoutPage` was not seen; `navigator.onLine` was not tested on captive networks.
- **2.5.8 targets:** the 8 px splitter, the 16 px checkbox, the 18 px response textbox and a 20 px vault button (possibly "Reveal", `environments-manager.html:175`) need a re-run that excludes ancestors.
- **Stress states:** forced colours, RTL, 200% text and pseudo-localisation were run on the composer and Settings only. Increased contrast has nothing to render (DS-6).
- **Installed PWA:** title bar, splash and iOS safe areas not seen (W-33, W-34).
- **⌥T/⌥W:** not tested in Firefox on Windows (W-25).
- **Hover:** a pointer sweep of the tree rows' hover actions was not done.
- **Theme flash:** the `data-theme="dark"` default on a light OS was not captured.
- **Monaco:** its screen-reader mode and focus ring, and its font and brackets (U-052, U-038), were not re-measured.
- **DS ratios:** computed over assumed surfaces. Two pairs were not found in a real view: tertiary text on a hovered overlay (4.11:1) and a placeholder in a filled field inside a dialog (3.90:1).
- **Indeterminate checkbox:** whether History's select-all needs one.
- **Importer strings:** linted, not read one by one.
- **Reading level:** no target set in the profile.

## 7. Offer

Fixable now, by group and owning session:
- **Data loss and the save path (first):** W-1 (D4-g), W-8 and W-10 (composer), W-9 (D4-f), W-40.
- **Accessibility names and announcements:** W-2 (D4-e), W-3, W-4, W-14, W-15, W-18, W-19 (D4-g), W-35, W-41g.
- **Pointer and reflow:** W-5 (D4-e), W-6.
- **Honest failure:** W-7 in core plus the response pane (D4-e, U-051). One core change also fixes history, HAR and run.
- **Copy rewrites:** W-11, W-12, W-26 to W-29, W-37, W-41e, and the copy parts of W-42. Owners: D4-f for palette, tree and history; D4-g for environments and vault; D4-h for settings and import.
- **Contrast and state tokens:** DS-1 to DS-5, DS-9 to DS-11, DS-13, DS-15, DS-17, DS-19, DS-20, plus W-17. One `packages/tokens` change plus new `contrast.test.mjs` pairs.
- **Forced colours:** DS-14.
- **Motion cleanup:** W-23, DS-21, DS-23, DS-24.
- **Keyboard:** W-25 (needs a key choice), W-41d.
- **PWA:** W-33, W-34, W-42a.
- **Structure:** W-30, W-31, W-36, W-38 (D4-f, U-016), W-39, W-41a, W-41b.

Need a decision first:
- DS-7, DS-8 and W-16 depend on D4-e's density decision.
- W-22 and DS-22 revisit motion.md's F48 row.
- W-13 and W-41c: the sidebar threshold, with U-003.
- W-24: the undo model.
- W-32: the theme control.
- DS-16, DS-6, DS-29: status colours and increased contrast.
- W-20: run navigation (D4-i).
- W-21, DS-18 and section 4's proposals: pick one signature element, and give the C rail a session. D2.4 owns icons and the mark (DS-28).

Optional, to verify more: Firefox and WebKit runs of the same captures, a VoiceOver or NVDA pass on send, unlock and banners, an installed PWA on macOS, Windows and iOS, and rival screenshots for the competitor swap.

## 8. Where each row went

Each row's finding in [`audit.md`](audit.md) and the plan task that owns
it (plan rows 1.41 to 1.46). A row that confirms or extends an earlier
finding changed that finding's status line, with the date; it has no ID
of its own.

| Row | Audit | Plan task (session) |
|---|---|---|
| W-1 | U-060 | D4.11 (D4-e) |
| W-2 | U-061 | D4.11 (D4-e) |
| W-3 | U-062 | D4.11 (D4-e) |
| W-4 | U-063 | D4.11 (D4-e) |
| W-5 | U-064 | D4.11 (D4-e) |
| W-6 | U-065 | D4.11 (D4-e) |
| W-7 | U-051, extended | D4.3 (D4-e) |
| W-8 | U-066 | D4.11 (D4-e) |
| W-9 | U-067 | D4.4 (D4-f) |
| W-10 | U-068 | D4.11 (D4-e) |
| W-11 | U-056, extended | D4.4 (D4-f), D4.5 (D4-g), D4.7 (D4-h) |
| W-12 | U-069 | D4.6 (D4-i) |
| W-13 | U-070 | D4.4 (D4-f) |
| W-14 | U-071 | D4.5 (D4-g) |
| W-15 | U-072 | D4.3 (D4-e) |
| W-16 | U-073 (with DS-7) | D3.6 (D3-b) |
| W-17 | U-074 (with DS-4) | D3.6 (D3-b) |
| W-18 | U-075 | D4.11 (D4-e) |
| W-19 | U-041, extended | D4.5 (D4-g) |
| W-20 | U-076 | D4.6 (D4-i), opening into D4.12 |
| W-21 | U-077 (with DS-18) | D2.5, D3.6 |
| W-22 | U-078 (with DS-22) | D3.7 (D4-e) |
| W-23 | U-079 | D3.7 (D4-e) |
| W-24 | U-080 | D4.4 (D4-f) |
| W-25 | U-081 | D4.4 (D4-f) |
| W-26 | U-082 | each view's session |
| W-27 | U-054, extended | each view's session |
| W-28 | U-083 | each view's session |
| W-29 | U-084 | each view's session |
| W-30 | U-085 (with DS-12) | D4.5 (D4-g) |
| W-31 | U-086 | D4.4 (D4-f) |
| W-32 | U-087 | D4.3 (D4-e) |
| W-33 | U-088 | D4.13 (D4-h) |
| W-34 | U-089 | D4.13 (D4-h) |
| W-35 | U-090 | D4.3 (D4-e) |
| W-36 | U-091 | D4.3 (D4-e), D4.6 (D4-i) |
| W-37 | U-092 | D4.7 (D4-h) |
| W-38 | U-016, extended | D4.4 (D4-f) |
| W-39 | U-093 | D4.4, D4.5, D4.7 |
| W-40 | U-094 | D4.4 (D4-f), D4.5 (D4-g) |
| W-41a | U-095 | D4.3 (D4-e) |
| W-41b | U-096 | D4.6 (D4-i) |
| W-41c | U-097 | D4.4 (D4-f) |
| W-41d | U-052, extended | D4.3 (D4-e) |
| W-41e | U-098 | D4.7 (D4-h) |
| W-41f | U-003, extended | D4.3 (D4-e) |
| W-41g | U-099 | D3.6 (D3-b) |
| W-41h | U-100 | D4.13 (D4-h) |
| W-42a | U-101 | D2.4 |
| W-42b | U-102 | D4.4 (D4-f) |
| W-42c | U-103 | D4.3 (D4-e) |
| W-42d | U-104 | D4.3 (D4-e) |
| W-42e | U-105 | D4.7 (D4-h) |
| DS-1 | U-106 | D4.11 (D4-e) |
| DS-2 | U-107 | D4.11 (D4-e) |
| DS-3 | U-108 | D4.11 (D4-e) |
| DS-4 | U-074 | D3.6 (D3-b) |
| DS-5 | U-109 | D3.6 (D3-b) |
| DS-6 | U-110 | D3.6 (D3-b) |
| DS-7 | U-073 | D3.6 (D3-b) |
| DS-8 | U-111 | decided in D4-e, built in D3.6 |
| DS-9 | U-112 | D3.6 (D3-b) |
| DS-10 | U-113 | D3.6 (D3-b) |
| DS-11 | U-114 | D3.6 (D3-b) |
| DS-12 | U-085 | D4.5 (D4-g) |
| DS-13 | U-115 | D3.6 (D3-b) |
| DS-14 | U-116 | D3.6 (D3-b) |
| DS-15 | U-117 | D3.6 (D3-b) |
| DS-16 | U-036, reopened | D3.6 (D3-b) |
| DS-17 | U-118 | D3.6 (D3-b) |
| DS-18 | U-077 | D2.5, D3.6 |
| DS-19 | U-119 | D3.6 (D3-b) |
| DS-20 | U-120 | D3.6 (D3-b) |
| DS-21 | U-121 | D3.7 (D4-e) |
| DS-22 | U-078 | D3.7 (D4-e) |
| DS-23 | U-122 | D3.7 (D4-e) |
| DS-24 | U-123 | D3.7 (D4-e) |
| DS-25 | U-124 | D3.6 (D3-b) |
| DS-26 | U-125 | D3.6 (D3-b) |
| DS-27 | U-126 | D3.6 (D3-b) |
| DS-28 | U-127 | D2.4, D3.6 |
| DS-29 | U-128 | D3.6 (D3-b) |
| DS-30 | U-129 | D3.6 (D3-b) |

Section 4's two signature-element candidates and two behavioural moments
are D2.5, a decision for the maintainer (the plan's DQ6 and DQ7); the C
inspector rail is D4.12, session D4-l. Section 6's unverified items are
D1.8.
