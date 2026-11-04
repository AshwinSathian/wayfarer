# hig-review, 2026-11-04: both passes repeated, logo-off and competitor swap

The fifth pass of the audit, for session D5-b of
[`PLAN-design.md`](../../PLAN-design.md) (task D5.1, row 1.64's note on
D2.5). It repeats the third pass
([`hig-review-2026-10-23.md`](hig-review-2026-10-23.md), HIG and WCAG 2.2,
the design system) and the fourth
([`hig-review-2026-10-26.md`](hig-review-2026-10-26.md), the red team) on
`main` at `62d85ef`, and runs the two tests D2.5 waits for: the logo-off
test on the primary screen and the competitor swap against the rivals'
documented screens.

The earlier reviews' row IDs are kept (W-n, DS-n, N-n, P8-n, T-n, R-n).
This pass's own rows are F5-n; each new finding is written in the
audit's format under the number the audit gave it (its fifth pass). Impact
maps to the audit's severity as the third pass defined it: Blocker 1,
Major 2, Minor 3, Polish 4.

## 1. Summary

Reviewed: the whole app (`/app/`, Angular 22) from today's design
captures of `main` at `62d85ef`: 49 screens of `e2e/design/screens.ts`
at 360, 390, 820 and 1,440 px, light and dark, in Chromium, Firefox and
WebKit (`~/.cache/wayfarer-d5/caps/{chromium,firefox,webkit}/`), plus
the source at the same commit, read with `git show`. Rivals: the
documented screens and dated public screenshots in
`~/.cache/wayfarer-d5/research/rivals.md`.

Verdict: **authored**, from "default-assembled" twice. The exchange
record is on the primary screen in all three engines and both themes, and
no rival shows it. The slop count fell from 20 tells over 7 channels to 3
tells over 3 channels, under the threshold (6 and 3). Six of nine
channels are authored.

D2.5's signature passes:
- **Logo-off** (`response-json-1440-{light,dark}`,
  `response-record-1440-{light,dark}`): the screen carries the record's
  own words: "Sends to http://127.0.0.1:4300/content/json?kind=pets",
  "Direct to 127.0.0.1:4300", and, opened, "Sent from this page to
  127.0.0.1:4300. / No vault secret was filled. / Nothing was masked. /
  History kept the request and the response."
- **Swap**: no rival's main screen shows the record. Two of its parts have
  a partial counterpart: Insomnia's URL PREVIEW (the address resolved
  before Send) and Postman's network popover (the agent, on hover). None
  names the secrets a send used or what was kept.

So U-077 can close (section 5).

What matters most:
- **F5-1 (Major, severity 2): the vault is called locked before one
  exists.** On a new visitor's first screen the status bar says "Vault
  locked", and the Secrets dialog says "Vault is locked. Unlock it to
  reveal secret values below." with Change passphrase and Export vault.
  On the primary screen it sits under a record that says "No vault
  secret was filled". It is the one finding of severity 2, so section 1's
  "no open finding of severity 1 or 2" fails until D5-c fixes it.
- **F5-2 (Minor): table headings are in the wire face at 12 px.** The
  run's "Iteration", "Request", "Status", "Time" and "Tests" are
  Wayfarer's words in JetBrains Mono, and every `.ds-table` heading is
  mono under 13 px. That breaks the provenance rule under the record and
  U-151's floor.
- **F5-3 (Minor): green is spent on device state.** "In use" and "Vault
  unlocked" take the success colour, against DQ11's "hue means protocol".

**Assumptions.** None beyond the profile the earlier passes confirmed
(web only, `register: utilitarian`, `density: dense`, `release_stage:
development`), with the direction as amended by rows 1.45 and 1.52.

**Run notes**
- Input: the captures above, not a running app. The repository was read
  only (`git show main:…`); nothing was built, served or edited. No
  measuring script was run. Contrast is `scripts/contrast.test.mjs`'s
  (every text and fill pair in both themes, both contrast levels, since
  #478) and was not re-measured.
- Engines: the primary screen was compared in all three
  (`response-record-1440-dark`, `response-json-1440-light`): the same
  words, layout and status bar. Other screens were read in Chromium.
- Crops and montages were made in the session scratchpad. Two rival
  images were fetched to look at (Hoppscotch's
  `hero-screenshot.png`, Postman's `send-first-request.png`) and deleted
  after; the rest of the swap rests on `rivals.md`'s descriptions.
- The captures freeze time: every send reads "12 ms". Not a finding.
- `e2e/design/screens.ts` describes `confirm-dialog` as "deleting a
  request from the tree"; the capture shows Reset all data (a delete
  asks nothing since U-080). The index's words are stale; the capture is
  right.
- Not run: a screen reader, the stress states (D5-a's
  [`hig-review/d18.md`](hig-review/d18.md) took them on `723167a` in three
  engines), a pointer sweep for hover states, slow-network throttling.

## 2. The third pass, row by row

"Seen" means the fix is visible in a capture named. "Not in a capture"
means the audit's status line names a PR and a test, and no capture shows
the state; nothing here contradicts it. "Does not hold" points at a new
row.

### W rows (the app)

| Row | Audit | Now | Evidence |
|---|---|---|---|
| W-1 | U-060 | Holds: environments autosave, no Save button | `environments-rows-1440-dark` |
| W-2 | U-061 | Not in a capture (a live region; e2e and structure test); the screen reader is the owner step | — |
| W-3 | U-062 | Not in a capture (alert regions from first render) | — |
| W-4 | U-063 | Holds by test (`e2e/label-in-name.spec.ts`); "Unlock" is named "Unlock secrets vault", which starts with the visible word | `secrets-manager.html:21` |
| W-5 | U-064 | Not in a capture (click to step the split) | — |
| W-6 | U-065 | Holds at 320 px in three engines per D5-a | `hig-review/d18.md` |
| W-7 | U-051 | Holds: "No response", the engine's words quoted ("What was reported: Failed to fetch"), no status code, no invented body, prose in sans | `response-error-1440-light`, `-390-light` |
| W-8 | U-066 | Not in a capture | — |
| W-9 | U-067 | Not reproducible (audit, 2026-11-02) | — |
| W-10 | U-068 | Not in a capture | — |
| W-11 | U-056 | Holds: "Reset all data?" names what goes; **Reset all data** / Cancel, focus on Cancel | `confirm-dialog-1440-dark` |
| W-12 | U-069 | Not in a capture | — |
| W-13 | U-070 | Decided (row 1.55): the drawer stays below 1,200 px | `response-record-820-light` |
| W-14 | U-071 | Holds (D5-a, #538) | — |
| W-15 | U-072 | Holds: each status-bar item is one button with its words | `response-json-1440-light` |
| W-16 | U-073 | Holds (rem; U-153's em breakpoints) | `hig-review/d18.md` |
| W-17 | U-074 | Holds: the focused address has a 2 px ink edge | `first-run-1440-dark` |
| W-18 | U-075 | Not in a capture | — |
| W-19 | U-041 | Holds: column heads Name and Value, each row named | `environments-rows-1440-dark`; see F5-5 |
| W-20 | U-076 | Holds: each run row has Record and Open | `run-1440-dark` |
| W-21 | U-077 | Closes with this pass (section 5) | section 5 |
| W-22 | U-078 | Holds: no skeleton; "Sending… 1.2 s" past a second | `response-loading-1440-light` |
| W-23 | U-079 | Not in a capture (motion test) | — |
| W-24 | U-080 | Not in a capture (Undo); the confirm capture now shows Reset all data, which is consistent with a tree delete no longer asking | `confirm-dialog-1440-dark` |
| W-25 | U-081 | Not in a capture | — |
| W-26 | U-082 | Holds where seen: the no-response copy has none of the banned words | `response-error-1440-light` |
| W-27 | U-054 | Holds: "Add parameter", "Clear history…", "Run again", "Add variable" | `first-run-1440-dark`, `history-1440-light`, `run-1440-dark` |
| W-28 | U-083 | Holds where seen ("Search by address, method or status") | `history-1440-light` |
| W-29 | U-084 | Holds: "Secrets you mark in Environments are kept here." | `secrets-manager-1440-dark` |
| W-30 | U-085 | Holds: environments are a tab, no modal stack | `environments-rows-1440-dark` |
| W-31 | U-086 | Holds: "Clear history…" worded, away from Close | `history-1440-light` |
| W-32 | U-087 | Holds: "Theme: system" | every capture's status bar |
| W-33 | U-088 | Not in a capture (`theme-color`) | — |
| W-34 | U-089 | Not in a capture (installed app: owner step) | — |
| W-35 | U-090 | Not in a capture | — |
| W-36 | U-091 | Holds: one Run again button | `run-1440-dark` |
| W-37 | U-092 | Not in a capture | — |
| W-38 | U-016 | Not in a capture (one Export… dialog) | — |
| W-39 | U-093 | **Does not hold in the Secrets dialog**: a bordered banner and a dashed box inside the dialog | F5-4 |
| W-40 | U-094 | Not in a capture | — |
| W-41a | U-095 | Holds: an empty request's pane offers cURL and Import; a ready one says Send | `first-run-1440-dark` |
| W-41b | U-096 | Holds: "1 iteration, no delay" and Change | `run-1440-dark` |
| W-41c | U-097 | Holds: the phone toolbar is sidebar, environment, lock, Settings | `response-json-390-light` |
| W-41d | U-052 | Holds: Monaco in the app's mono | `response-json-1440-light` |
| W-41e | U-098 | Holds where seen ("4 requests", "1 iteration") | `run-1440-dark` |
| W-41f | U-003 | Holds: response about 543 px beside a 441 px composer | `response-json-1440-light` |
| W-41g | U-099 | Holds (RTL in three engines) | `hig-review/d18.md` |
| W-41h | U-100 | Accepted (row 1.64) | — |
| W-42a–e | U-101–U-105 | Hold where seen; U-104's timings not opened | — |

### DS rows (the design system)

| Row | Audit | Now | Evidence |
|---|---|---|---|
| DS-1 | U-106 | Holds: the unchecked "Failed only" box has a visible edge | `run-1440-dark` |
| DS-2 | U-107 | Not in a capture (a select open) | — |
| DS-3 | U-108 | Holds by `contrast.test.mjs` | — |
| DS-4 | U-074 | Holds (W-17) | `first-run-1440-dark` |
| DS-5 | U-109 | Holds: field edges are visible in both themes | `environments-rows-1440-dark`, `response-json-1440-light` |
| DS-6 | U-110 | Holds by the generated `more` block; no capture at `more` | — |
| DS-7 | U-073 | Holds | — |
| DS-8 | U-111 | Holds for rows, tabs and fields (13 px); **not for table headings**, F5-2 | `run-1440-dark` |
| DS-9 | U-112 | Not in a capture (hover) | — |
| DS-10 | U-113 | Holds: disabled Send and the empty-address icons are quiet | `first-run-1440-dark` |
| DS-11 | U-114 | Not in a capture | — |
| DS-12 | U-085 | Holds | — |
| DS-13 | U-115 | Holds: the confirm sits a step lighter than Settings in dark | `confirm-dialog-1440-dark` |
| DS-14 | U-116 | Holds in Chromium and Firefox per D5-a; WebKit has no forced colours | `hig-review/d18.md` |
| DS-15 | U-117 | Holds: the selected row has a fill and a 3 px ink mark | `response-json-1440-light`, `history-1440-light` |
| DS-16 | U-036 | Holds: own status colours; the 200 chip's green is not GET's | `response-json-1440-light` |
| DS-17 | U-118 | Holds by the token test | — |
| DS-18 | U-077 | Closes (section 5) | — |
| DS-19 | U-119 | Holds: three tiers read apart ("Editing" tertiary, path secondary, value primary) | `response-json-1440-light` |
| DS-20 | U-120 | Holds | — |
| DS-21–24 | U-121–U-123, U-078 | Hold (motion test; no chip lift, no squish) | — |
| DS-25 | U-124 | Holds: three control heights | — |
| DS-26, 27 | U-125, U-126 | Hold: radii from the three steps | — |
| DS-28 | U-127 | Holds: the icon set is the brand's, stroked to the text | every capture |
| DS-29 | U-128 | Holds: GET green and success green differ | `response-json-1440-light` |
| DS-30 | U-129 | Holds | — |

## 3. The fourth pass, row by row

| Row | Audit | Now | Evidence |
|---|---|---|---|
| N1 | U-130 | Not in a capture with a token (`composer-auth` is "no auth") | — |
| N2 | U-131 | Holds: "Route: direct" with no bridge paired; the status line says "Direct to 127.0.0.1:9" on a failure | `response-error-1440-light` |
| N3 | U-132 | Not in a capture (a missing variable's chip) | — |
| N4 | U-133 | Not in a capture | — |
| N5 | U-134 | Not in a capture | — |
| N6, N7 | U-135, U-136 | Not in a capture past `vault-create` | — |
| N8 | U-137 | Holds: "Saved in this browser, which may delete it" while not persisted, a button to Data and storage | every capture's status bar |
| N9 | U-138 | Holds: `npx wayfarer-bridge`, Copy, the pairing code and Pair, in the record | `response-error-1440-light`, `-390-light` |
| N10 | U-139 | Not in a capture | — |
| N11 | U-140 | Holds (D5-a) | — |
| N12 | U-141 | Holds by test | — |
| N13 | U-142 | Holds: the response's tab bar fades over Tests' count at 820 px | `response-record-820-light` |
| N14 | U-143 | Not in a capture | — |
| N15 | U-144 | Holds (D5-a) | — |
| N16 | U-145 | Not in a capture | — |
| N17 | U-146 | Holds: New environment is an icon in the header line | `environments-rows-1440-dark` |
| P8-1 | U-147 | Holds: Send, focus, the selected mark and checked boxes are ink. **Except** "In use" and "Vault unlocked", F5-3 | `response-json-1440-light`, `environments-rows-1440-dark` |
| P8-2 | U-148 | Holds: "Type an address, or paste a cURL command", "Name", "Value" in sans; "Path: data.items[*].id" and "ABCD-2345" stay mono as example values | `first-run-1440-dark`, `response-error-1440-light` |
| P8-3 | U-149 | Holds (derived tokens) | — |
| T-1 | U-150 | Holds: the text face is Atkinson Hyperlegible Next (slashed zeros in sans) | `response-record-1440-light` |
| T-2 | U-151 | **Does not hold in tables**: `.ds-table th` is mono at 12 px | F5-2 |
| R1 | — | Built (D4.12, #470): the preview under the address, the record under the status line, Record on each run row, history's record | `response-record-1440-*`, `run-1440-dark` |
| R2 | — | Built: environments are a tab and save per field | `environments-rows-1440-dark` |
| R3 | — | Built: the failure sets up the bridge in place | `response-error-1440-light` |
| Theming sketch | — | Built (D3.6, W5.1): ink chrome, Atkinson and JetBrains Mono, three radii | every capture |

The fourth pass's pre-mortem, read again. (1) "The first real API fails
and the way out is outside the app": the way out is now in the record
(N9, R3). (2) "The occasional user comes back to an empty app": the
status bar says the browser may delete it (N8). (3) "Credential
confusion": fixed per the audit (N1, N6, N7) and not re-seen; the one
credential word on today's screens that is wrong is F5-1's.

## 4. New findings

Sorted by Impact. Each is in the audit's format; the number is the
audit's to give.

| # | Finding | Where | Impact | Apple | Fix |
|---|---|---|---|---|---|
| F5-1 | The vault is called locked before one exists | `app-shell.html:367-368`; `secrets-manager.html:13-15`; `vault-actions.html` | Major | Taste | Three states: "No vault" (opens Create), "Vault locked", "Vault unlocked"; the dialog's banner and actions follow |
| F5-2 | Table headings in the wire face at 12 px | `components.css:434-438`; `run-view.html:185-190`; `response-viewer.html:360-366`; `event-list.html:19`; `socket-view.html:105` | Minor | Taste | Headings of the app's words in the text face; a header *name* cell at `type-mono-body`; a test over tables |
| F5-3 | Green spent on device state | `components.css:399-409`; `app-shell.html:352, 362` | Minor | Taste | "In use" as ink text and a glyph; route and vault words in the label colour |
| F5-4 | Cards and a dashed box inside the Secrets dialog | `secrets-manager.html:11, 34-36` | Minor | Taste | One grouping cue: the state as a line under the title, the empty text plain |
| F5-5 | "Key / Value" over columns headed "Name" | `environments-manager.html:173, 186` | Polish | SHOULD | One word: "Name / Value" or "Variables" |
| F5-6 | A no-response says the bridge's offer twice | `response-viewer.html` (the no-response body); `exchange-record` | Polish | SHOULD | The body's paragraph drops its last sentence; the record holds the action |
| F5-7 | The editing line breaks before its dash on a phone | `composer` (editing line) | Polish | Taste | Keep "— Save writes back…" with the path, or drop the dash on its own line |

waived: 0. Counts: Major 1, Minor 3, Polish 3.

**U-164. The vault is called locked before one exists.** Severity 2. H2, H1.
PE, OC.
A new visitor has no vault, and the status bar says "Vault locked" on
every screen (`app-shell.html:367-368` writes "Vault locked" whenever
the vault is not unlocked; `isFirstVaultSetup`, `app-shell.ts:583`, knows
there is none and only changes the dialog's title). The Secrets dialog,
captured "the vault not made yet" (`e2e/design/screens.ts:52`), says
"Vault is locked. Unlock it to reveal secret values below.", with
**Unlock**, **Change passphrase**, **Export vault** and **Import vault**,
and no values below. Unlock then opens "Create vault passphrase". On the
primary screen the bar's "Vault locked" sits under a record that says "No
vault secret was filled": the product's signature tells the truth and
its status bar does not. A person told a vault is locked may look for a
passphrase they never set. This is the honesty axis the fourth pass made
the product's identity (N8 was the same kind of finding, at Major).
Evidence: `first-run-1440-dark.png`, `secrets-manager-1440-dark.png`,
`response-json-1440-light.png` (status bar), in Chromium, Firefox and
WebKit.
**Status:** Open, D5-c.

**U-181. Table headings are drawn in the wire face, at 12 px.** Severity 3.
H4. SD, QA.
`.ds-table th` sets `font-family: var(--font-mono)` at
`--type-footnote-size` (0.75rem, 12 px) (`components.css:434-438`).
In the run's results the headings "#", "Iteration", "Request", "Status",
"Time" and "Tests" are Wayfarer's words, drawn in JetBrains Mono: the
provenance rule that `voice.md` keeps under the exchange record (mono is
what crossed the wire) is broken on the screen the QA tester lives in.
In the response's Headers tab the `th` is a header's name, a wire value,
so mono is right there, but at 12 px, under the 13 px floor U-151 set
(JetBrains Mono's 0 and O one device pixel apart). The same class draws
the event list (`event-list.html:19`) and the WebSocket log
(`socket-view.html:105`). `scripts/input-fonts.test.mjs` reads text
fields only and the token test reads stylesheets for px, so neither sees
it.
Evidence: `run-1440-dark.png` (the table's heading row),
`response-headers-1440-light.png` (names smaller than their values).
**Status:** Open, D5-c.

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
Evidence: `environments-rows-1440-dark.png` ("In use"); the bridge and
unlocked states are not captured and rest on source.
**Status:** Open, D5-c.

**U-198. The Secrets dialog keeps cards inside the dialog.** Severity 3.
H8. Everyone.
U-093 took cards out of overlays and Settings. The Secrets dialog still
puts a bordered, filled banner ("Vault is locked…") and, under it, a
dashed rounded box with a centred icon and two lines of text inside the
dialog's own surface: three grouping cues at one level
(`secrets-manager.html:11` and `34-36`). The audit's first pass named
"dashed empty boxes" as part of the template look it removed.
Evidence: `secrets-manager-1440-dark.png`.
**Status:** Open, D5-c.

**U-192. The environment editor calls one column two names.** Severity 4.
H4. Everyone.
The tab reads "Key / Value"; the columns under it are headed "Name" and
"Value" (`environments-manager.html:173, 186`); the composer's rows say
"Name". One thing, two words (U-083's kind).
Evidence: `environments-rows-1440-dark.png`.
**Status:** Open, D5-c.

**U-175. A failed send offers the bridge twice.** Severity 4. H8. SD.
With no response, the record ends "The Local Bridge sends a request from
this computer, where CORS does not apply, and says why one failed. Start
it, then type the code it prints." with the command and the pairing
field. The Body tab under it repeats "…Send it through the Local Bridge
to see which." The record is where the action is (`ia.md`, "the
failure's action moved into it"); the body's last sentence points away
from it, and Headers, Timings and Tests stay as tabs with nothing in
them.
Evidence: `response-error-1440-light.png`, `response-error-390-light.png`.
**Status:** Open, D5-c.

**U-199. On a phone the editing line breaks before its dash.** Severity 4.
H8. Everyone on a phone.
At 360 and 390 px "Editing Pet store / Pets / List pets — Save writes
back to this request." wraps so that the second line starts with "—".
Evidence: `response-json-390-light.png`, `response-json-360-light.png`.
**Status:** Open, D5-c.

U-154 (the Params checkbox's 2.5.8 spacing at 390 px) is still open for
D5-c; the captures cannot measure it.

## 5. Distinctiveness

### Logo-off, the primary screen at 1,440 px

With the name and the mark hidden (top-left of every capture), what says
Wayfarer and no other tool, quoted as the captures draw it.

`response-json-1440-light` and `-dark` (the record closed, as it is after
a success):
- The preview under the address: **"Sends to
  http://127.0.0.1:4300/content/json?kind=pets"**, the address in mono,
  and the chip **"baseUrl environment "Staging" http://127.0.0.1:4300"**.
- The status line: **"200 OK 12 ms · 60 B Direct to 127.0.0.1:4300"**,
  the host in mono, with the chevron that opens the record.
- The status bar: "Route: direct", "Vault locked" (wrong, F5-1),
  "Secrets", "Saved in this browser, which may delete it", "Theme:
  system".

`response-record-1440-light` and `-dark` (the record open):
- **"Sent from this page to 127.0.0.1:4300."**
- **"No vault secret was filled."**
- **"Nothing was masked."**
- **"History kept the request and the response."**

The same words, in the same places, in Firefox and WebKit
(`design-firefox/response-record-1440-dark.png`,
`design-webkit/response-record-1440-dark.png`).

What is not on the primary screen: a secret named by the record. The
fixture fills none, so the line reads in its empty form; no capture in
the set shows "Filled from the vault: token, from environment "Local"".
The record's code writes it (`packages/core/src/send/record.ts`,
`recordLines`). See section 8.

The 10-23 pass's answer was one phrase, "Saved in this browser only";
the 10-26 pass found five rivals claim that phrase. Today's answer is the
record, on the face of the primary screen, and its words are about this
send.

### Competitor swap

The question, from `rivals.md`: could the rival's main screen carry the
exchange record beside the response (the request as sent, the route, the
secrets used by name), and does it show one?

| Product | Main screen (source) | Request as sent | Route | Secrets used | Record found? |
|---|---|---|---|---|---|
| Postman v12 | Light only. URL bar keeps `{{baseUrl}}`; response bar "200 OK · 208 ms · 1.26 KB" and a globe (`send-first-request.png`, seen; `workspace-diagram-02-28-26-v2.png`) | In the Console, a footer panel; a Request tab in a run | Only on hover: "Agent: Desktop Agent" (`https-network-info-response-12-3.png`) | Not shown | No. "Direct to {host}" has a hover counterpart, not a face one |
| Bruno v4.3 | Hero: tree, GET with params, JSON 200 (`bruno-homepage-hero.png`, alt text) | Timeline tab, one tab from the response | Not shown; the docs say call an IP-echo service | Not documented | No |
| Yaak 2026.9 | "201 Created • 184 ms • 398 B"; the template with chips (`hero-yaak-light-…webp`) | Request and Timeline tabs, `curl -v` style, values in clear | Not shown; "Invalid proxy URLs are silently ignored" | Not shown (in clear in Timeline, inferred) | No |
| Hoppscotch 2026.10 | Dark: "Status: 200 • OK  Time: 2235 ms  Size: 1.49 KB" (`hero-screenshot.png`, seen) | None | The interceptor is a setting, not per response | Not shown | No |
| Insomnia 13.4 | Dark: **URL PREVIEW** of the resolved address in Params; "200 OK · 186 ms · 891 B" (`collection.png`) | Before: URL PREVIEW. After: Console, a libcurl log | No label; the log names IP and port | Not shown | No. "Sends to …" has a counterpart here |
| Linear | Dark: sidebar, a one-line issue list, hue only in status, labels, avatars (`a66435…png` on `linear.app/docs/conceptual-model`) | n/a | n/a | n/a | n/a: no request. It shares Wayfarer's mechanism (grey chrome, hue for state), not its record |

Per element, what reads wrong when put on a rival's screen:
- **"Sends to …" (the preview)**: reads right on Insomnia, which has URL
  PREVIEW; wrong on Postman and Yaak, whose bars keep the template, and
  on Hoppscotch and Bruno, which show none. Owned against four of five.
- **"Direct to {host}"**: Postman names its agent on hover only; no
  other rival names a route. Owned on the face against all five.
- **"No vault secret was filled" / a secret by name**: no rival names the
  secrets a send used. Owned against all five.
- **"Nothing was masked" and "History kept …"**: no rival says what was
  masked in what is kept. Owned against all five.
- **The status bar's "Saved in this browser, which may delete it"**:
  reads right on Hoppscotch (browser storage). Owned against the four
  desktop rivals only, as in 10-26.

The record as a whole is on no rival's main screen. Bruno, Yaak and
Insomnia hold the resolved request one tab away, as a log; Postman in a
console. None puts the route, the secrets used and what was kept beside
the response.

**D2.5 passes.** The logo-off test quotes the record's own words, the
preview under the address and the status line's "Direct to {host}"; the
swap finds the record in no rival. Row 1.64's condition is met, so U-077
can close, with this pass as its evidence. One caveat for D5-c, not a
condition: the secrets line is quoted only in its empty form (section
8).

### Verdict: authored

| Channel | Source | Evidence (▲ moved since 10-26) |
|---|---|---|
| Type | ▲ authored, one leak | Atkinson Hyperlegible Next for Wayfarer's words, JetBrains Mono for the wire (DQ11), the split carried into the record (`record.ts`: "a value of the wire … drawn in monospace"). Leak: table headings in mono at 12 px (F5-2). |
| Colour | ▲ authored, one leak | Ink chrome: Send, focus, the selected mark, a checked box. Hue for methods and status only, derived tokens. Leak: "In use" and "Vault unlocked" in success green (F5-3). |
| Shape | ▲ convention, traced | Three radii and three control heights from density (U-124, U-126); no field shadow. Leak: the Secrets dialog's cards and dashed box (F5-4). |
| Motion | ▲ authored | Nothing under a second, then "Sending… 1.2 s"; no fades, no press scale (`response-loading-1440-light`). |
| Iconography | ▲ authored | The brand's own set, stroked to the text (D2.4). |
| Imagery | none | Not counted. |
| Sound and haptics | platform default (none) | Right for the register. |
| Layout idiom | ▲ convention plus an owned element | The category's tree, tabs and split (kept on purpose). Owned: the preview under the address and the record under the status line, at every width (`response-record-390-dark`, `-820-light`). |
| Voice | authored | The record's sentences, "Saved in this browser, which may delete it", "The request got no response. The browser does not say why…". |

Counts: 6 of 9 channels authored (type, colour, motion, icons, layout's
record, voice); two show on the primary screen. Signature element:
present, verbal and structural (the exchange record). Moments: one
behavioural delivered ("Send shows its speed": no skeleton under a
second, the status line in one frame, the status region speaking the
record's first line); zero visual, right for the register. Tells: 3 over
3 channels (nested grouping in the Secrets dialog, layout; a colour with
no single meaning, colour; mono on non-code labels, type), under the
threshold of 6 and 3. Logo-off: names the record.

What moved since "default-assembled":
- 10-23: 20 tells over 7 channels; the logo-off answer was one phrase.
  The cause was the direction keeping Linear's and Yaak's look.
- 10-26: still 20 tells, and the one phrase belonged to five rivals.
- Today: the look was replaced by a mechanism (ink chrome, hue for
  protocol, a text face chosen for I, l and 1), the motion that hid
  speed is gone, and the record put the product's subject on its face.

The red team's attack on this verdict, and what survives it:
- **The signature is quiet.** On the default screen it is one phrase in
  the status line and a preview line, at 12 to 13 px in the secondary
  label; the record's body opens only on a click or a failure. A person
  who never opens it sees "Direct to 127.0.0.1:4300" and a URL preview,
  and Insomnia has a URL preview. This holds for a utilitarian register
  (`ia.md` chose a band the status line opens, for a 391 px pane), but it
  is why section 7's first enhancement exists.
- **Dark mode still sits in the category's cluster.** Near-black, a tree,
  tabs and a split; with the record closed, the dark capture's visual
  channels say "a calm dark tool", not "Wayfarer". The owned parts are
  words. That is what the plan chose (row 1.52: identity spent on the
  subject), and no visual channel is now a tell.
- **One owned word is false.** F5-1 puts "Vault locked" beside the
  record on the primary screen. A product whose signature is telling the
  truth about a send cannot have a status bar that does not.

## 6. Reworks

No rework warranted. No cluster of three rows with one cause: F5-2 and
F5-3 are each a rule the tests do not hold, in one stylesheet rule and
two templates; F5-1 is one missing state. The premise, the identity and
the peer gap the fourth pass argued from are now met by R1 to R3.

## 7. Enhancements

- **The status line says when a secret went (Responsibility).** Closed,
  the record shows only "Direct to {host}". When `record.secrets` is not
  empty, the status line's last words could read "Direct to
  api.example.com · 1 secret", opening the record. It puts the one fact
  no rival shows (secrets used) on the default screen, without opening
  the band. Traces to the swap table and `recordHeadline`.
- **The bar's words come from the same model as the record (Craft).** The
  route, vault and storage words are written from three services; the
  record's from `record.ts`. Saying the vault's three states (F5-1) and
  the route through one small function, tested beside `recordLines`,
  keeps the status bar from saying what the record contradicts.

Two, not more: the evidence for others is thin in captures alone.

## 8. Unverified

- **A filled secret on the record.** No capture shows "Filled from the
  vault: …". Add a `response-record` state with a vault secret (and its
  Auth line in the preview) to `e2e/design/screens.ts` and take it in
  three engines, so the logo-off test can quote the secrets line.
- **N1's Auth source line.** `composer-auth` is "no auth"; the line that
  names a token's value source is not captured.
- **The bridge route.** No capture shows "Sent through the Local Bridge
  to …" or "Route: bridge"; F5-3's route colour rests on source.
- **The vault unlocked.** Not captured; F5-3's vault colour rests on
  source.
- **Screen readers.** The status region speaking the record's first
  line (U-061) was not heard: the owner step, VoiceOver with Safari,
  gates D5.2.
- **Hover, focus walks and slow network.** Not run from captures.
- **Rivals' images.** Two were viewed; the others rest on `rivals.md`'s
  descriptions and alt text. Bruno's and Yaak's dark heroes were not
  viewed by anyone.
- **U-154.** Needs the 2.5.8 measurement again, not a capture.

## 9. Offer

Fixable in code, by group, all D5-c:
- **The vault's states:** F5-1 (status bar, Secrets dialog, its actions
  hidden or disabled with no vault). First, since it is severity 2.
- **Type and colour rules held by tests:** F5-2 (`.ds-table th` in the
  text face, a header name at `type-mono-body`, a test that reads table
  cells), F5-3 (the tag and the two status words without the success
  colour; extend the token test to the meaning, not only the token).
- **Grouping and copy:** F5-4, F5-5, F5-6, F5-7.

Needs a decision: the first enhancement (what the closed status line
says), and whether D5-c adds the secret-filled capture before ticking
D2.5.

## 10. Where each row goes

| Row | Audit | Plan |
|---|---|---|
| F5-1 | new, severity 2 | D5-c |
| F5-2 | new, severity 3 (extends U-151, U-148) | D5-c |
| F5-3 | new, severity 3 (extends U-147) | D5-c |
| F5-4 | new, severity 3 (extends U-093) | D5-c |
| F5-5 | new, severity 4 (U-083's kind) | D5-c |
| F5-6 | new, severity 4 | D5-c |
| F5-7 | new, severity 4 | D5-c |
| Logo-off and swap | U-077, closes | D2.5 ticks in D5-c, D5.1's note |
| Section 8, first item | — | D5-c, before D2.5 is ticked, if the maintainer wants the secrets line quoted |
