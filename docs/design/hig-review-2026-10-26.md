# hig-review, 2026-10-26: red team, landscape, type

A second UI and UX review of the whole app, run on 2026-10-26 on
`docs/hig-review-red-team` from `main` at `5b8c7a79`. The app's code is
the same as the tree the first review read (`6bb10cdb`): only docs
changed since. This run used the skill's new parts: research of the
category before judging, a red-team pass that attacks the premise, the
flows and the earlier review, structural reworks held to a stated bar,
theming proposals traced to the product, and an evaluation of the
typefaces. It is the audit's fourth pass: each new finding is a row of
[`audit.md`](audit.md) from U-130 on, and the table at the end says
which. What the plan does with it is [`PLAN-design.md`](../../PLAN-design.md),
rows 1.47 to 1.52 of its section 14. The maintainer answered its four
questions (DQ8 to DQ11) yes on the same day (row 1.52).

The earlier review, [`hig-review-2026-10-23.md`](hig-review-2026-10-23.md),
stands. Its 70 findings (U-060 to U-129) are still open on this tree and
are not filed again; rows here cite them when they confirm or extend one.
The review's own row IDs are kept: N-n for the red team, P8-n for the
distinctiveness pass, T-n for the type evaluation, R-n for reworks.
Impact maps to the audit's severity as the third pass defined it.

## 1. Summary

Reviewed: the whole Wayfarer web app (`/app/`, Angular 22, development
build) from a fresh browser context in Chromium 156 at 1,440 × 900 with
the echo server, plus its tokens and type, against the confirmed profile
(`.hig-review.md`: web only, `register: utilitarian`, `density: dense`,
`release_stage: development`, direction A amended by row 1.45).

Verdict: **default-assembled**, and the reason has moved. "Local-first,
no account" no longer belongs to Wayfarer: Bruno, Yaak, Hoppscotch,
Insomnia's Scratch Pad and Postman's lightweight client all claim it now
(section 4). What no studied product does is show, for each send, exactly
what left the browser: the request as resolved, the route it took and the
secrets it used. Wayfarer's core already holds those facts
(`RoutePolicy.took`, `BuiltRequest.secrets`, the redactor) and its UI
does not show them, or shows them wrongly.

Most important:
- **R1, the exchange record as the core object** (section 7): one record
  per send, a preview before Send and D4.12's rail after it, stored in
  history and runs. It clears 12 rows (cluster C1), gives the product the
  one thing no peer has, and is the signature element D2.5 needs.
- **N1** (U-130): on a send that used a vault secret, the Auth tab names
  the collection as the token's source. The network capture shows the
  environment's vault secret was sent. In a tool whose promised feeling
  is "sure what was sent", that is the defect that matters most.
- **N6 and N8** (U-135, U-137): "Mark as secret" is dropped when it
  triggers vault creation, so a token the person believes is secret is
  saved in plain text; and the status bar says "Saved in this browser only" while the
  browser's storage is not persistent (`persisted: false`), with the
  first backup reminder after Safari's seven-day eviction.

**Assumptions.** None beyond the confirmed profile. Its `direction`
string ("one muted green accent") is stale against row 1.45; the review
judged against section 1's "Direction (D2.1)" as amended.

**Run notes**
- Tools: Playwright MCP, Chromium 156, DPR 1, fresh context, against
  `http://localhost:4200/app/` (`ng serve`) and the echo server on 4300.
  Five flows walked with step counts and the cognitive walkthrough's
  four questions (section 9). Source read-only; every new finding was
  checked against the source by the main thread before it went in.
- Landscape: live web research on 2026-10-26, six products studied
  (Postman, Yaak, Bruno, Hoppscotch, Insomnia, Chrome DevTools' Network
  panel as the adjacent exemplar), every claim with a URL and date.
- Type: the skill's `scripts/type-eval.js` run on Inter Variable,
  Atkinson Hyperlegible Next and JetBrains Mono, loaded from this
  repository's `@fontsource` packages, in Chromium, Firefox and WebKit at
  12 and 13 px, plus magnified renders (section 6).
- Contrast: the skill's `contrast.py`; every value in the theming sketch
  was computed, and three were re-checked by the main thread.
- Evidence: 28 screenshots; the 17 that rows cite are in
  [`hig-review/`](hig-review/) as `1440-light-rt-NN-*.png`. The Postman
  fixture used for the import flow is `shop.postman_collection.json` from
  this repository's e2e fixtures.
- Not run: Firefox and WebKit captures of the app, 820 and 390 px,
  a screen reader, the Local Bridge (section 10).

## 2. Findings

Sorted by Impact, then the Apple column. "Prior" names overlapping audit
rows. Every row was checked in source; the file and line are in Where.

| # | Finding | Where | Impact | Apple | Fix | Prior |
|---|---|---|---|---|---|---|
| N1 | **The app names the wrong source for the credential it sends.** "Inherit bearer" was sent with `authorization: Bearer s3cr3t-local`, the vault secret `token` of environment Local, which shadows the collection's `col-token`. The Auth tab says "Bearer token is sent, from collection "Shop"" (`inheritedLine` names only where the auth is set, not where its value comes from). The variable chips skip variables used in Auth, so no chip shows `token`; the status line says only "Direct". The app knows a vault secret was used (it says so when the vault is locked, rt-28) and says nothing on success. Reviewer judgement against the profile's `feeling`. | `composer/auth-editor/auth-editor.ts:59-66`; `composer/variable-chips.html`; [`1440-light-rt-19-auth-tab.png`](hig-review/1440-light-rt-19-auth-tab.png); network request headers | Major | Taste | Name both sources: "Bearer token is sent, from collection Shop. Its value is {{token}}, from environment Local (vault secret)." Give Auth's variables chips like any other. | — |
| N2 | **"Route: Auto" misstates the route on an unpaired device.** The bridge README: "Auto needs a paired bridge; without a token it behaves like Direct." The status bar prints the configured route (`routeNames[bridgeService.config().route]`), not what the app will do. After a CORS failure the status line has no route word, so the person cannot tell whether the bridge was tried. | `app-shell.html:337`; `packages/bridge/README.md:55`; [`1440-light-rt-05-cors-first-run.png`](hig-review/1440-light-rt-05-cors-first-run.png) | Major | Taste | Unpaired: "Route: Direct (no bridge paired)". On a failed send the status line carries the route: "No response · Direct · bridge not paired". | U-051 (W-7) |
| N3 | **Variable chips do nothing for a missing, collection, secret or dynamic variable.** Their names say "Activate to locate." `handleVariableChipClick` acts only when `source === "environment"`, and sets `highlightedVariableSource`, which no template reads. The red "base Missing" chip, the one the person most needs, is dead. Dead control in a development build; may be unfinished. | `composer/variable-chips.ts:17-23`; `variable-chips.html:6`; [`1440-light-rt-10-missing-chip-click.png`](hig-review/1440-light-rt-10-missing-chip-click.png) | Major | Taste | A missing chip opens "Add base to: environment Local / collection Shop" with the value focused; collection and secret chips open their editors. Remove the unused signal. | — |
| N4 | **The import review does not say that every request uses an undefined variable.** All 6 requests of `shop.postman_collection.json` go to `{{base}}…`, and nothing imported defines `base`. The review lists three notes and imports; the first send fails. | import dialog; `packages/core/src/import/postman.ts`; [`1440-light-rt-07-import-review.png`](hig-review/1440-light-rt-07-import-review.png), [`1440-light-rt-09-imported-request.png`](hig-review/1440-light-rt-09-imported-request.png) | Major | Taste | Add to "Things to know": "6 requests use {{base}}, which nothing imported defines. Add it after import, or import the Postman environment with this file." | — |
| N5 | **The send refusal blames the address when a variable is missing.** With `{{base}}` unresolved, Send says "The address is not a URL a request can go to. Write it as https://host/path.", telling the person to rewrite the template. Three messages stack for one cause (the refusal, the red chip, the amber "Missing: base"). "URL" breaks voice.md's glossary (address). | `state/workspace-store.ts:483-491`; `composer.html:57`; [`1440-light-rt-11-send-missing-base.png`](hig-review/1440-light-rt-11-send-missing-base.png) | Major | SHOULD | When `missingVariableKeys` is not empty: "base has no value in any scope. Add it, or Send anyway." One message, not three. | U-054 |
| N6 | **"Mark as secret" is dropped when it triggers vault creation.** With no vault, the lock opens Create vault; after it, the row is still plain text, because `protectVariable` emits `requestUnlock` and returns with nothing pending. Save changes then stores the token as an ordinary variable while the person believes it is secret. A row with no name or value ignores the lock, with only a `console.debug`. | `environments/environments-manager.ts:246-262`; [`1440-light-rt-14-env-secret.png`](hig-review/1440-light-rt-14-env-secret.png), [`1440-light-rt-15-env-after-vault.png`](hig-review/1440-light-rt-15-env-after-vault.png), [`1440-light-rt-16-secret-marked.png`](hig-review/1440-light-rt-16-secret-marked.png) | Major | Taste | Keep the pending row and finish `protectVariable` after create or unlock. When the row is not ready, disable the lock with a tooltip that says why. | U-060 (same dialog) |
| N7 | **"Secret stored" appears before the environment is saved, and Save changes says nothing.** `saveSecret` writes to the vault when the lock is clicked; the reference lives only in the unsaved draft, so closing (U-060) leaves an orphan secret. Save changes is always enabled and confirms nothing; `save()` has no catch; rows with a value and no key are dropped (`filter((row) => row.key)`). | `environments-manager.ts:263-271, 331-351`; `environments-manager.html:237`; [`1440-light-rt-17-env-saved.png`](hig-review/1440-light-rt-17-env-saved.png) | Major | Taste | R2 removes the explicit save. Otherwise: "Secret stored. Save to keep it in Local"; Save enabled only when `hasEdits()`, confirmed in place ("Saved"), failures caught as U-066 proposes. | U-060, U-066 |
| N8 | **Data can disappear while the status bar says "Saved in this browser only".** `navigator.storage.persisted()` returned false after a save and an import. The status bar text never changes. The persistence state and the Safari note ("deletes a website's data after seven days without a visit") appear only in Settings › Data and storage. The backup reminder waits 14 days (`REMINDER_AFTER_MS`), so a Safari user who has not installed the app can lose everything before the first reminder. The occasional-user persona is the one hit. | `services/storage-persistence.ts:5-21`; `services/workspace-backup.ts:22`; `settings.html:272-279`; `app-shell.html:368` | Major | Taste | The status item states the promise: "Saved in this browser, not kept for sure" when not persisted, linking to Data and storage. In Safari without install, remind on first save and on day 5. | — |
| N9 | **No in-app path to the Local Bridge from the failure it fixes.** The failure body ends "for CORS, the Local Bridge can relay the request" with no action. No template shows `npx wayfarer-bridge`. Settings › Local Bridge has a pairing field and a GitHub link at the bottom. U-051's fix (a "Send through the Local Bridge" button) assumes a paired bridge; nothing covers an unpaired one. | `settings/bridge-pane.html:148-162`; `packages/core/src/send/exchange.ts:127`; [`1440-light-rt-05-cors-first-run.png`](hig-review/1440-light-rt-05-cors-first-run.png), [`1440-light-rt-06-bridge-settings.png`](hig-review/1440-light-rt-06-bridge-settings.png) | Major | Taste | On a failure while unpaired: "Run `npx wayfarer-bridge` in a terminal" with Copy, the pairing field in place, and "Send again" once paired (R3). | U-051 |
| N10 | **Disabled Postman query parameters are lost on save, and the import note contradicts the app.** The note says "the composer has no switch for a parameter"; every param row has a "Send parameter N" checkbox bound to `param.enabled`. The parameter's name in the note is unmarked ("switched off (c)"). | `packages/core/src/import/postman.ts:234`; `composer/params-panel.html:11-14`; [`1440-light-rt-07-import-review.png`](hig-review/1440-light-rt-07-import-review.png) | Major | Taste | Import disabled params as unchecked rows and drop the note. | — |
| N11 | **Closing a scratch tab asks to discard changes history already keeps.** "127.0.0.1:4300/echo has changes that are not saved. Closing the tab discards them." The request was sent unchanged and is in history. Every ad-hoc send leaves an unsaved dot (4 of 5 tabs), so the dot stops meaning anything. | tab close confirm; tab strip; [`1440-light-rt-24-close-scratch-tab.png`](hig-review/1440-light-rt-24-close-scratch-tab.png) | Minor | SHOULD | A never-saved tab whose draft equals its last history entry is clean and closes without asking. | — |
| N12 | **The import review's buttons are named "Confirm import" and "Cancel import".** The visible "Import" and "Cancel" are not at the start of the names: it passes 2.5.3 by containment and fails D4.11's planned e2e. Focus opens on × Close. | import dialog footer | Minor | Web | Drop the `aria-label`s; initial focus on Import. | U-063 (same rule) |
| N13 | **The fifth tab is cut under the tab actions at 1,440 px with no overflow cue.** | tab strip; [`1440-light-rt-23-after-history-load.png`](hig-review/1440-light-rt-23-after-history-load.png) | Minor | Taste | An overflow menu or scroll buttons; titles shortened to the request name or the address path. | — |
| N14 | **The unlock prompt during a send does not say what wants the vault.** "Enter your passphrase to unlock encrypted secrets for this session." names no request or secret. | `app-shell.html` (Unlock secrets); [`1440-light-rt-27-send-vault-locked.png`](hig-review/1440-light-rt-27-send-vault-locked.png) | Minor | Taste | "Inherit bearer uses the secret token. Unlock the vault to send it." | U-026 |
| N15 | **Opening a request from history replaces the current clean tab with no cue,** and the sidebar keeps highlighting the request whose tab was replaced. Dirty tabs are kept. | history load; tree selection; [`1440-light-rt-23-after-history-load.png`](hig-review/1440-light-rt-23-after-history-load.png) | Minor | Taste | A preview-tab cue (italic title), or a new tab; the tree's selection follows the active tab. | — |
| N16 | **Add variable does not focus the new row.** From the keyboard, focus stays on Add variable. | `environments-manager.html` (Add variable) | Minor | Taste | Focus the new row's Key field. | — |
| P8-1 | **The accent has five jobs** (Send fill, links, focus ring and glow, selection, checkbox) and in dark sits ΔE_ok 0.063 from GET and success green; its text shade 0.055 from GET's. On the primary screen three near-greens mean Send, GET and 200 OK. | `src/design-system/tokens.css:95-101` against `:108`, `:125`, `:126`, `:139`; `1440-dark-03-response-json.png` | Minor | SHOULD | Action and focus take a colour no protocol meaning uses (the sketch in section 5 uses ink); hue is for method and status only. | U-128 (DS-29) |
| P8-2 | **Wayfarer's own placeholder words are drawn in the wire face.** "Type an address, or paste a cURL command", "Key", "Value" and "Path: data.items[*].id" inherit `font-mono` from their fields, breaking the provenance rule on the first-run screen. | `address-row.html:33,41` (`class="address-url font-mono …"`); `params-panel.html:18-22,29`; `rows-editor.html:28`; `ui/input.css:40-43` (no `font-family`) | Minor | Taste | `.ui-input::placeholder { font-family: var(--font-sans); }`, and a placeholder case in `scripts/input-fonts.test.mjs`. | U-051 (W-7) |
| P8-3 | **Colour is written in OKLCH but not derived:** 73 (dark) and 74 (light) hand-set literals, nothing generating tiers, boundaries or states. That is how light tertiary (`#67635C`) ended up darker than secondary (`#6B675F`), and why an increased-contrast theme would be a third hand-set list. The first review's "parametric OKLCH theme kept" (its section 4) is wrong. | `packages/tokens/{dark,light}.tokens.json`; `tokens.mjs:111-122`; `tokens.css:186-188` | Minor | Taste | Generate neutral, label, boundary and state tokens from neutral hue and chroma, appearance and contrast level, against the contrast gate's targets, in D3.6 with the `prefers-contrast: more` block. | U-110 (DS-6), U-119 (DS-19) |
| T-1 | **In Inter, capital I and lowercase l render identically at 12 and 13 px** in Chromium and Firefox (pixel distance 0, 0 device pixels differ; WebKit at 13 px: 2 pixels). Request, collection, folder and variable names, which people type and tell apart, are set in Inter: "Illinois" reads "IIlinois", "api.lllI1.io" cannot be read. Inter's own fixes (`cv05`, `cv08`) have no effect in the `@fontsource-variable/inter` build this app ships (rendered and compared). | `tokens.css:32` (`--font-sans`); `src/styles.css:3-4`; section 6 | Minor | Research | Use a text face whose I, l and 1 differ at 12 px (section 6: Atkinson Hyperlegible Next, already a brand asset, measured distinct), or a build of Inter that keeps its character variants, checked with `type-eval.js`. | — |
| T-2 | **JetBrains Mono's zero and capital O differ by 1 device pixel at 12 px on a 1× display** (its dotted zero's dot); `slashed-zero` and `zero` change nothing in this build. Mono at 12 px carries method labels and tab titles; tokens and hosts at 13 px differ by 4 to 6 pixels. | `tokens.css:33`, `:64`; section 6 | Polish | Research | Keep JetBrains Mono (section 5's sketch keeps it on purpose); keep wire values at 13 px or more, and check `0/O` with `type-eval.js` on any 12 px mono role. | — |
| N17 | The Environments list's "+" sticks out of its card border at 1,440 px. | Environments dialog list header | Polish | Taste | `min-width: 0` on the header row, padded inside. | U-093 |

waived: 0

### Confirms or extends existing audit rows (not filed again)

- **U-061 (W-2)** is now confirmed at runtime: after a send every
  `role=status` in the page is empty, including the `sr-only` one (rt-03).
- **U-044**: Enter in New environment does not create it.
- **U-051 (W-7)**: "0 Unknown Error" in the response (rt-05), and "Http
  failure response for …: 0 Unknown Error" when an entry is loaded from
  history.
- **U-011**: the palette does not find past requests ("token" gives "No
  matching commands").
- **U-026**: the passphrase fields have no visible labels; "You'll need
  it…" is a contraction (`app-shell.html:400`, also U-082).
- **U-086 (W-31)**: opening History puts focus on "Clear all history",
  with its tooltip shown ([`1440-light-rt-21-history-search.png`](hig-review/1440-light-rt-21-history-search.png)).
- **U-024**: every history row truncates to "http://127.0.0.1:4…", so
  rows to one host look the same and a search match is hidden; a failed
  exchange's row has no status; rows do not show the saved request's name.
- **U-020, U-054 (W-27)**: the import review has the uppercase overlines
  "POSTMAN COLLECTION" and "COLLECTION" and uppercase "CREATE" badges.
- **U-093 (W-39)**: the import review's rows are cards inside the dialog.
- **U-085 (W-30)**: three modal layers at runtime: Environments, Create
  vault, the page (rt-14).

## 3. Trust

No deceptive patterns. On the honesty axis the profile chose as
Wayfarer's identity, three rows above are the ones a person would call a
broken promise: N1 (the wrong source named for a credential), N8 ("Saved in this browser only"
while storage is not persistent) and N6 (a secret that is not one). They
are Major, not Blockers, under the Rules: none is a dark pattern, and
each has a way round it. They lead the fourth pass's order of work (plan
row 1.48).

## 4. Landscape

Browser API clients, researched 2026-10-26.

**Category:** API client (HTTP workbench), local-first. Nearest seed playbooks: the skill's Developer tools playbook, plus its AI-native playbook for the planned BYOK/local-model AI (D1.7). Research used WebSearch and WebFetch. Every claim below has a source and date. `[S]` means a second-hand source. `(unverified)` means from memory or not confirmed on a primary page; those claims back no finding by themselves.

### Products studied

| Product | Why picked | New request → response | Import Postman collection → send one | Navigation model | Praised mechanism | Identity combination | AI (2025–26) | Privacy / local-first |
|---|---|---|---|---|---|---|---|---|
| **Postman** v12 | Category leader; D1.4 rival | Desktop only. Without signing in: install → "continue with the lightweight API Client" → New → pick type → URL → Send, so **4 in-app inputs** after install. That mode has no collections, environments or variables [P3] | Account and workspace needed for collections [P3]; step count not measured (unverified) | Sidebar tree + tabs + request-over-response; v12 "unified workbench" for collections, envs, specs, flows, mocks [P2 S] | Breadth: one collection holds HTTP/GraphQL/gRPC/MCP/MQTT/WS/AI requests [P2 S] | Orange accent, sans UI, three-pane (unverified) | Hero "API engineering for your agents"; Agent Mode local and on Cloud (sandbox, "full audit trail"), consent-gated; Context Graph; Passport credential proxy, where agents call APIs "without ever holding the secret" [P1, P4] | v12 Git-native YAML Collection 3.0, offline work (2026-03-04) [P2 S]. Free plan is 1 user; Team $19/user/mo yearly; AI credits listed as both 100 and 50 [P5] |
| **Yaak** 2026.9.0 | UX-praised challenger; D1.4 rival; named in Wayfarer's direction | ⌘N → URL → ⌘↵ = **3 inputs** after install [Y3]. Whether ⌘N asks for a name first: (unverified) | Settings → Import/Export → Import → pick file → new workspace opens → pick request → ⌘↵ = **~5 in-app inputs** (plus Postman's own export) [Y4] | Sidebar + request/response split; ⌘K palette, ⌘P request switcher [Y3]; Git status in the sidebar (2026.4.0) [Y1] | Speed at scale ("no lag at 3,000+ requests", 2026.6.0); chaining without scripts [Y1, Y2] | Dark default, violet/pink accents, sans UI (unverified) | No built-in AI on purpose. Agents connect via CLI/MCP plugin; `yaak agent install` adds a skill for Claude Code/Cursor/Codex (2026.6.0); readable LLM stream responses (2026.5.0) [Y1, Y2] | No account, no auto cloud sync, no telemetry, secrets encrypted with OS keychain keys, one YAML file per request. Work use $79/$149 per user per year [Y2] |
| **Bruno** v4.3 | Most-praised challenger [S]; D1.4 rival; closest AI stance to Wayfarer's | v3.2 (2026-03-18): "sending requests without creating a collection" [B1]; count (unverified) ~3 after install | + → Import Collection → file → (Options → Preserve scripts, off by default) → Import → open request → send = **~6** [B3] | Sidebar + tabs; v3.0 (2026-01-05) design overhaul, workspaces [B1] | Collections as plain-text files (OpenCollection YAML, default since v4.0) reviewed in Git [B1, B2] | Amber/orange accent from the dog mark, sans UI (unverified) | v4.0 (2026-07-23) BYOK AI sidebar aware of the active tab. Off by default. Sends redacted context: auth headers become `<redacted>`, response body is **shape only** (`<string>`), secret var names kept, values dropped. Edits arrive as a diff: "Nothing is applied to your files without your click." No preview of the exact outgoing payload [B4, B5] | "Your data never leaves your machine… No account. No login"; SOC 2 Type II (2026-10-05). v4.3 (2026-10-22) fetches provider secrets on demand, keeps them in memory, never on disk [B1, B2, B6] |
| **Hoppscotch** 2026.9.0 | Only rival that is a web app; D1.4 rival | Open hoppscotch.io → URL → Send = **2 inputs, no install** (unverified count). Any CORS-blocked target first needs an interceptor: extension install + origin allow-list, or the Agent app + one-time code, or a proxy [H3] | Import → "Import from Postman" tab → Choose file → Import → open request → Send = **~6**; scripts need consent (experimental) [H4] | Left icon rail + request-over-response (unverified) | Zero-install web app; proxy/interceptor "Bypass CORS" [H2, H3] | Emerald green accent, sans UI (unverified) | 2026.8.0 MCP server; 2026.9.0 AI chat bot and an Enterprise AI Assistant that edits/runs requests [H1] | "Local-first data storage. No tracking." [H2]. Secrets live in browser **local storage**, encryption not stated [H5]. The docs describe **no UI indicator of which route (proxy/extension/agent) a request took** [H3] |
| **Insomnia** 13 (Kong) | Former UX leader; D1.4 rival | Scratch Pad: "No login ever required" [I1]; count (unverified) | (unverified) | Sidebar + three columns (unverified) | Storage choice per project: local, Git, cloud, mixed; optional E2EE cloud [I1] | Purple accent (unverified) | v12+: MCP client, AI mock generation, AI commit suggestions; provider choice includes a **local LLM**; AI free "for now" [I1, I2] | Local-only offline mode; E2EE for cloud collaboration [I1] |
| **Chrome DevTools Network** (adjacent) | Solves the same job, "what went over the wire and why", inspection-first instead of compose-first | Resend (Chrome 152, 2026-08-25): right-click → Resend = **2 inputs**, any fetchable request [D2] | n/a | Master-detail: request table + waterfall → tabs (Headers, Payload, Response, Timing, Initiator) [D1] | Truthful failure and timing: Status column says "CORS error" / "(blocked:origin)"; Timing splits Queueing/DNS/connection/TTFB/download; Initiator shows the stack [D1] | Blue selection, system UI font, dense table (unverified) | AI assistance on a selected request: off by default, Google account and ToS required [D3]. DevTools MCP server v1.7.0 for coding agents [D2] | n/a (the browser itself) |

Also noted, not counted: **Proxyman** has an MCP server inside a live capture session and side-by-side request/response Diff [X1]. **Scalar** offers a browser client at client.scalar.com; the page does not say whether an account is needed [X2]. **Requestly** (BrowserStack) runs local projects with secrets that stay local, one-click Postman import and an AI test generator [X3].

### Conventions to keep
- Sidebar tree with method labels, tabs, and a request/response split. Every studied client has this; it is the Postman user's mental model.
- ⌘↵ to send, ⌘K command palette, ⌘P quick switcher (Yaak [Y3]). ⌘N for a new request.
- Postman v2/v2.1 import with a script choice: Bruno's "Preserve scripts" toggle [B3], Hoppscotch's script consent [H4]. cURL import.
- History grouped by time (Yaak 2026.5.0 [Y1]).
- A collection run driven by a data file (Hoppscotch 2026.8.0 [H1]; D1.4 task 7).
- Secrets kept apart from ordinary variables (Bruno v4.0; Hoppscotch secret vars excluded from sync) [B1, H5].
- Any AI is off by default, BYOK or local model allowed, and edits arrive as a reviewable diff (Bruno v4, Insomnia local LLM) [B5, I2].

### Convergence to avoid
- **"Local-first, no account, Git-native" as the pitch.** Bruno, Yaak, Hoppscotch, Insomnia's Scratch Pad and Postman's lightweight client all claim it now [B2, Y2, H2, I1, P3]. Local storage alone no longer makes a client different.
- **The look:** dark default, sidebar tree + tabbed editor + split, sans UI + mono values, one saturated brand accent. Wayfarer's direction A ("closest to Yaak/Linear") sits inside this cluster. Its green-teal accent also sits near Hoppscotch's emerald and the near-universal GET-green (both unverified). The competitor-swap test in D2.5/D5.1 should check this.
- **An AI chat sidebar that "understands the active tab" as the whole AI story:** Bruno v4, Hoppscotch 2026.9, Postman Agent Mode [B1, H1, P1].
- **Agents with no visible boundary.** Postman's Agent Mode page describes no approval model and does not say what data is sent [P1].

### Frontier moves
1. **Redacted, shape-only AI context.** Bruno v4, 2026-08-31 [B5]. The baseline for D1.7 to beat.
2. **Secrets resolved on demand, held in memory, never written to disk.** Bruno v4.3, 2026-10-22 [B1]. Matches D1.4 task 4.
3. **Letting coding agents drive the client** with a CLI skill or MCP. Yaak 2026.6.0 [Y1], Postman CLI [P4], Hoppscotch MCP server [H1], Proxyman's in-session MCP [X1]. For a browser app the equivalent is WebMCP.
4. **Re-import that merges into an existing workspace.** Yaak 2026.8.0 [Y1].
5. **Send without creating anything first.** Bruno v3.2 [B1], Postman's lightweight client [P3].
6. **Resend any request, and decode binary payloads as Base64/Hex/UTF-8.** DevTools 152 [D2].
7. **Failure stated as the browser's actual reason** ("CORS error", "(blocked:origin)", timing phases). DevTools [D1].
8. **Readable streamed LLM/SSE responses.** Yaak 2026.5.0 [Y1].

### Openings (no studied product does these; Wayfarer's subject justifies them)
1. **An egress record for every send**: before and after each send, exactly what left the browser: the final resolved request, which route it took (direct fetch or the Local Bridge), and which secrets were used, by name only. No peer shows this (Bruno gives no payload preview [B5]; Hoppscotch no route indicator [H3]; DevTools nothing about secrets [D1]). It is the profile's `feeling` made into a feature, and the natural content for the inspector rail.
2. **The same egress view for AI**: a byte-exact preview of what an AI request sends, with the redaction visible (Bruno [B5] and Postman [P1] show neither).
3. **CORS failures explained in the browser's own terms, with the fix in place** ("Send through the Local Bridge" on that request), where Hoppscotch puts it in a settings choice [H3].
4. **A visible vault state in a web client**: a passphrase-encrypted browser vault whose lock state and per-send use are visible; Hoppscotch keeps web secrets in local storage with no stated encryption [H5].
5. **An agent driving the tab, in the open**: a WebMCP surface where each agent-initiated send goes through the same egress record. Limited: origin trial only [W2].

### Best peer step counts (from docs, not recordings)
- First request from nothing: Hoppscotch, 2 inputs, no install or account (unverified count; only when the target allows CORS) [H3]. Desktop: Yaak, 3 inputs after install [Y3].
- Import a Postman collection and send one request: Yaak, about 5 in-app inputs [Y4]; Bruno and Hoppscotch about 6 [B3, H4].

### Web platform capabilities that fit
- Same-document View Transitions (Baseline): request/response, tabs, opening the inspector rail; motion.md's "what closes goes at once" still governs dismissals.
- Popover API + invoker commands + `@starting-style` (Baseline): method picker, row menus, anchored confirmations.
- Anchor positioning: status conflicts (web-features explorer lists Limited on 2026-10-26 [W3]; research-2026 §4 says Baseline). Recheck in three engines.
- `field-sizing: content` (Baseline): address bar, value cells, body editor.
- `light-dark()`, relative colour, `contrast-color()` (Baseline): derive themes and method/status `-text` tokens.
- Navigation API (Baseline). Customizable `<select>` (Limited, no Firefox) with fallback.
- File System Access (Chromium only): bears on D1.6's Git decision.
- Chrome Prompt API (on-device Gemini Nano): multi-GB download on first use with no consent dialog described [W1]; Wayfarer must ask first.
- WebMCP: origin trial from Chrome 149, gated by the `tools` Permissions Policy [W2].

### Stale or contradicted in docs/design/research-2026.md (dated 2026-10-14)
- §2 "Wayfarer is the only one in this list that sends a request from a browser tab with no account and no install": Hoppscotch is a no-login web app [H2, S]; Scalar has a browser client [X2]. Narrow it: browser, no account, encrypted on-device vault, CORS-free sends via the Bridge, and a record of what left.
- §2 AI position "between Postman and Yaak": Bruno v4 now holds it, with redaction and diff approval [B1, B5]; Insomnia offers a local LLM [I2]. What remains is the byte-exact preview of what leaves.
- §2 rows for Bruno, Yaak, Hoppscotch, Insomnia and Postman need their 2026 releases (see the table).
- §4 anchor positioning "reached Baseline in early 2026": recheck [W3].
- §8 Prompt API: add the CPU-only path and the undescribed download consent [W1]. WebMCP origin trial from Chrome 149 confirmed [W2].

### Sources (accessed 2026-10-26 unless a page date is given)
- [P1] https://learning.postman.com/latest-v-12/docs/use/agent-mode/overview · [P2] https://heise.de/-11198271 (2026-03-04) [S] · [P3] https://learning.postman.com/docs/getting-started/basics/using-api-client/ · [P4] https://www.postman.com/ · [P5] https://www.postman.com/pricing/
- [Y1] https://yaak.app/changelog · [Y2] https://yaak.app/ · [Y3] https://yaak.app/docs/getting-started/keyboard-shortcuts · [Y4] https://yaak.app/docs/migration/postman
- [B1] https://www.usebruno.com/changelog · [B2] https://www.usebruno.com/ · [B3] https://docs.usebruno.com/get-started/import-export-data/postman-migration · [B4] https://docs.usebruno.com/ai/bruno-ai/introduction.md · [B5] https://blog.usebruno.com/bruno-ai-assistant (2026-08-31) · [B6] https://blog.usebruno.com/
- [H1] https://github.com/hoppscotch/hoppscotch/releases · [H2] https://hoppscotch.com/ · [H3] https://docs.hoppscotch.io/documentation/features/interceptor · [H4] https://docs.hoppscotch.io/documentation/features/importer · [H5] https://docs.hoppscotch.io/support/security-policy
- [I1] https://insomnia.rest/ · [I2] https://developer.konghq.com/insomnia/ai-in-insomnia/
- [D1] https://developer.chrome.com/docs/devtools/network/reference · [D2] https://developer.chrome.com/blog/new-in-devtools-152 (2026-08-25) · [D3] https://developer.chrome.com/docs/devtools/ai-assistance
- [X1] https://proxyman.com/ · [X2] https://scalar.com/products/api-client/getting-started · [X3] https://requestly.com/
- [W1] https://developer.chrome.com/docs/ai/prompt-api (2026-08-26) · [W2] https://developer.chrome.com/docs/ai/webmcp (2026-10-07) · [W3] https://web-platform-dx.github.io/web-features-explorer/features/anchor-positioning/
- Second-hand, used only for "Bruno most praised" and "Hoppscotch no-login" [S]: https://dupple.com/learn/best-free-api-clients, https://betterstack.com/community/guides/web-servers/hoppscotch-api/

Run notes: peer accents and typefaces, and Yaak, Bruno and Insomnia first-request counts, are unverified; fill them from D1.4's captures before the competitor-swap test. Step counts come from documentation, not recordings.

## 5. Distinctiveness

### Verdict: default-assembled

Basis: app tree unchanged since `6bb10cdb` (`packages/tokens` and `src/design-system` last touched 2026-10-22), so the 10-23 screenshots and slop count (20 tells across 7 channels) still describe the app; not re-measured. Contrast from `scripts/contrast.py`.

The slop-catalogue threshold forces the verdict (20 tells across 7 of 9 channels). On the procedure alone it would be partly authored: 2 of 9 channels authored (voice and motion, both leaking); voice shows on the primary screen. No signature element committed (D2.5 open; DQ6 default is the provenance rule). 0 behavioural moments delivered. The 10-23 gate still holds: every core flow has an open Blocker or Major, so everything below comes after those fixes.

| Channel | Source | Evidence (▲ = new since 10-23) |
|---|---|---|
| Type | trend default | Stack starts with Inter, tuned toward SF Pro (`components.css:19-27`). Mono/sans role split authored but leaks (W-7). ▲ Wayfarer's own placeholder words are drawn in mono (P8-2). |
| Colour | trend default | Warm graphite plus one muted green from mockup A. ▲ The accent `oklch(.695 .083 177)` sits ΔE_ok 0.063 from success/GET `oklch(.694 .131 154)` in dark: three near-greens on the primary screen mean Send, GET and 200 (`1440-dark-03`). ▲ Nothing is derived: 73 (dark) and 74 (light) hand-set OKLCH literals (P8-3). Near Hoppscotch's emerald (unverified). |
| Shape | library default | shadcn field (shadow-xs + 3 px ring), Material metrics, 7 radius steps plus off-scale values (DS-27). |
| Motion | authored, leaking | motion.md traces each rule to a reason; D3.7 not done: press scale, spring hover, skeleton and fade on every send. |
| Iconography | library default | Material Symbols at weight 300 (D2.4). |
| Imagery | none | Not counted. |
| Sound/haptics | platform default (none) | Correct for the register. |
| Layout idiom | trend default + 1 authored element | Category-median silhouette (tree, tabs, split): the right convention. The status bar that states device state in words is authored. Overlays still use cards (`1440-dark-36`, `1440-dark-30`). |
| Voice | authored, leaking | "Saved in this browser only", "Editing Pet store / Pets / List pets — Save writes back to this request.", "16.6 ms · Direct". Leaks: Title Case palette commands (W-27), uppercase "COLLECTIONS" overline (U-020). |

Logo-off (`1440-dark-03`, `-01`, `-34`), verbatim: "Saved in this browser only", "Route: Auto", "Vault locked", "· Direct". No visual channel identifies the product.

Competitor swap against the landscape (peer looks unverified where the landscape marks them so):
- Yaak (desktop, OS-keychain secrets): "Saved in this browser only" reads wrong; a visible vault lock probably wrong (unverified). Layout and type read right.
- Bruno (desktop files): storage phrase and route words read wrong (no route concept). Everything else reads right.
- Hoppscotch (browser, local storage): "Saved in this browser only" reads right. It has interceptor routes but no route indicator [H3], so "Route: Auto" reads wrong; web secrets in local storage with no stated encryption [H5], so "Vault locked" reads wrong. This upgrades 10-23's "almost nothing reads wrong": vault and route are owned against Hoppscotch on sourced evidence.
- Postman (desktop; lightweight client has no collections [P3]): storage phrase reads wrong; "Vault" reads right (Postman has Vault and Passport).
- Insomnia (Scratch Pad, local-only): storage phrase reads wrong.
Owned elements are verbal and behavioural only; nothing visual is owned against any peer.

Asset grid: status-bar device words: unique against all five peers on at least one word, 1 surface, investment potential. Masking copy note: investment potential. Teal accent: shared with GET, success and probably Hoppscotch: ignore or test (costs nothing to drop). Indigo→violet mark: near Yaak and Insomnia (unverified), inside the catalogue's indigo/violet band: avoid solo use; waived (D2.4).

### Drift from the direction (PLAN-design §1 "Direction (D2.1)" as amended in row 1.45)

The profile's `direction` string still says "one muted green accent"; row 1.45 says green, Inter and hairlines "are not reasons in themselves". Offer: update the profile wording.
- Hierarchy discipline: drifted. Light tertiary (#67635C) is darker than secondary (#6B675F) (DS-19, confirmed in `tokens.css:186-188`). 12 px is the working size (DS-8). Control boundaries 1.14–1.43:1 (DS-1, DS-5).
- Speed made visible: drifted. Skeleton and fade still play on a 16.6 ms reply (D3.7 open; W-22).
- Keyboard first: partial (W-10, W-25, W-35).
- "Hairlines instead of cards": drifted in the overlays.
- "Every type, colour or shape choice traces to the subject or a finding": not met. Inter traces to SF Pro; the teal has no written trace; the radius scale traces to nothing; status colours are Apple's (DS-16); the colour system is not derived (P8-3), which corrects 10-23 §4 ("parametric OKLCH theme kept").
- C rail: absent (D4.12 / D4-l pending). Status bar: present, on-direction.

### Attack on the direction

The mechanism (calm, dense, native professional tool, keyboard-first, chrome that recedes) survives. Its expression channels sit inside the category's convergence cluster:
1. Landscape: dark default, sidebar tree + tabbed editor + split, sans UI + mono values, one saturated accent is what every client looks like; direction A sits inside it.
2. Mockup A wrote down its own cost: "What it gives up: Personality. It looks like a well-made tool, not like Wayfarer. The privacy story lives in the status bar, not in the face of the app." (`docs/design/directions/directions.html`)
3. The pitch converged too: "local-first, no account" is claimed by Bruno, Yaak, Hoppscotch, Insomnia's Scratch Pad and Postman's lightweight client. What no peer has is the egress record.
4. The accent fails twice: ΔE_ok 0.055–0.063 from GET and success, and beside Hoppscotch's emerald (unverified).
5. Row 1.45 already freed these channels.
The evidence justifies a sketch that keeps the mechanism and moves accent, type and signature out of the cluster.

### Theming sketch (candidates for the team to judge, not a spec)

Default check, written first: for "theme a local-first browser API client" the model would produce a near-black dark canvas, Inter UI with JetBrains Mono for values, one emerald/teal or indigo accent on Send, focus and selection, method-coloured tree labels, hairline separators, 6–8 px radii, ⌘K keycaps and 150–200 ms fades. Today's app matches almost every item. Handling: accent revised to none; text face revised (conditionally) to Atkinson Hyperlegible Next; fades revised (D3.7); hairlines, keycaps and small radii kept as convention carrying no identity; JetBrains Mono still matches the default and is kept on purpose with a trace (flagged).

Sources, in order:
1. Brand assets, which conflict and each fail a check: app teal (ΔE 0.055–0.063 from GET/success); logo `#405DD0`→`#7B4CF5` and the site's `--route #3451d1` sit at hue 268–289, inside the catalogue's legacy indigo/violet band. A cobalt route was tested and rejected: in light `oklch(.47 .14 268)` = `#3953A8` lands ΔE_ok 0.021 from PUT `#2453A6`, and it would echo the indigo Send U-019 removed. What survives: the site names its accent by the subject ("route"), and the site's body face Atkinson Hyperlegible Next is already installed (`@fontsource/atkinson-hyperlegible-next` 5.3.0, OFL).
2. Material: wire vernacular has no brand colour. curl -v and RFC plain text are ink only; curl -v marks direction with `>` (sent), `<` (received), `*` (the tool speaking); RFC 9112 messages are a start line plus header fields.
3. Landscape gap: every peer spends one saturated accent; none keeps the chrome achromatic (peer accents unverified).
4. Audience: daily professionals scan method and status colour at 12–13 px; every chromatic hue is claimed by a method (GET 154, POST ~75, PUT 262, PATCH ~305, DELETE ~25, OPTIONS 215), so a chrome hue always collides with one.

Colour: chrome and actions in ink; hue means protocol and nothing else. Derived from three inputs: neutral hue/chroma (H 84, C 0.003–0.012, the existing asset), appearance, contrast level k (normal: 7 / 4.5 / 3 for secondary / tertiary / boundary; more: 10 / 7 / 4.5). Lightness solved against the contrast gate's targets. Method hues fixed by convention.

| Role | Dark | Light | Trace |
|---|---|---|---|
| canvas / sidebar / raised-in-dialog | `oklch(.196 .004 84)` #161513 · `(.178 .003 84)` #121110 · `(.31 .006 84)` #32302D | `(.985 .003 84)` #FBFAF8 · `(.964 .004 84)` #F4F3F0 · panel `(1 0 0)` #FFFFFF | Existing tokens, plus one raised step for dialogs (DS-13) |
| label primary / secondary / tertiary | `(.937 .007 84)` #ECEAE5 · `(.80 .012 84)` #C1BDB5 · `(.68 .012 84)` #9C9890 | `(.248 .004 84)` #22211F · `(.44 .012 84)` #56524B · `(.54 .012 84)` #726E67 | Solved from targets; tiers monotonic (DS-19) |
| control boundary | `(.58 .008 84)` #7C7A75 | `(.63 .008 84)` #8B8984 | 3:1 target (DS-1, DS-5) |
| ink action: Send fill, focus ring, selected-row mark | fill = label primary, text = canvas; hover `(.86 .007 84)` #D3D1CC | fill #22211F, text #FFFFFF; hover `(.34 .004 84)` #393836 | Material (ink) plus landscape gap; one meaning: "Wayfarer acts" |
| status text: success / warning / error | `(.80 .12 150)` #83D494 · `(.82 .13 75)` #F5B75B · `(.74 .15 27)` #FB8276 | `(.47 .10 150)` #296A3B · `(.48 .10 65)` #845011 · `(.50 .17 27)` #B02B27 | Own values (DS-16). Info loses its hue (label-secondary plus a glyph), freeing blue for PUT. DS-29 resolved by form: status is a word plus a chip, method a coloured mono label |
| methods | unchanged | unchanged | Convention |
| increased contrast | primary #FBFAF8, secondary `(.91 .01 84)` #E4E1DA, tertiary #C1BDB5, boundary `(.68 .008 84)` #9B9893 | primary `(.15 .004 84)` #0C0B09, secondary `(.355 .012 84)` #3F3B35, tertiary #56524B, boundary `(.54 .008 84)` #716E69 | Same inputs, k = more (DS-6) |

Contrast (`contrast.py`; spot-checked by the main thread: 4.58, 4.57, 3.15). Dark normal: primary 10.94 on raised, 15.18 on canvas; secondary 7.02 / 9.74; tertiary 4.58 on raised, 6.56 on sidebar; boundary 3.07 on raised, 4.26 on canvas; canvas text on ink fill 15.18, on hover 11.96; status on raised: success 7.40, warning 7.40, error 5.36. Light normal: primary 14.5 on sidebar, 15.42 on canvas; secondary 7.00 / 7.77 on panel; tertiary 4.57 / 5.07; boundary 3.15 / 3.49; white on ink fill 16.09, on hover 11.71; status on sidebar: 5.88, 6.03, 5.88. Increased contrast: dark secondary 10.07, tertiary 7.02, boundary 4.58; light 10.02, 7.00, 4.58.

Type role map (open licences only):
- Text, controls and numbers (Wayfarer speaking): candidate 1 Atkinson Hyperlegible Next, stack `'Atkinson Hyperlegible Next', 'Inter Variable', system-ui`. Trace: the brand's existing site face (`packages/site/src/app/fonts.ts:14-27`); its brief (I/l/1 and 0/O apart) fits hosts, names and timings at 12–13 px. Inter stays as per-glyph fallback (Atkinson ships Latin and Latin-ext only; Inter covers Cyrillic, Greek, Vietnamese). Candidate 2: keep Inter Variable only with a build whose I and l differ (section 6 measured Atkinson: tabular figures present, no confusable pair at 12 or 13 px in three engines). Catalogue stance: Inter-only is a convergence risk, never an error; swapping it for another trending sans is substitution; Atkinson qualifies only as an existing asset. Either way drop the "SF Pro feel" tuning.
- Wire (bytes sent or received, values that will be sent): JetBrains Mono kept: existing asset with a rule (CLAUDE.md:328-332), covers Cyrillic and Greek, contrasts with the text face so provenance shows at a glance. Extend to Monaco (U-052). Atkinson Hyperlegible Mono would blunt that contrast and edge toward "sans with its mono sibling".
- Display: none in the app (utilitarian). Bricolage Grotesque stays on the site.

Shape and space: three radii: 3 px inline marks and keycaps, 5 px controls, 9 px overlays; drop 7, 12, 16 and off-scale values (DS-27). Trace: density and concentricity. Not zero radius (a second-layer default). One container per overlay, no cards inside. Dense, 13 px working size (DS-8).

Motion (motion.md as revised by D3.7; serious, fast): productive `--dur-micro` 60 ms for a row's press background; `--dur-quick` 120 ms with `--ease-standard` cubic-bezier(0.25,0,0,1) for hover and colour; response, status line and tab panes 0 ms. Expressive, one place: the rail opening on a failed send, opacity only, `--dur-standard` 240 ms with `--ease-enter` (0,0,0,1); closes at once. Delete `--ease-spring` (only users DS-21, DS-22). Reduce Motion: `--dur-none`.

Iconography: one set (D2.4), stroke matched to the text face's 13 px stem, heavier than today's weight 300 (U-127, DS-28). Route, Local Bridge, vault and the egress record get in-house glyphs (the confusions behind U-006). `>` and `<` are type, not icons. No imagery in the app.

Signature element: the egress record. One per exchange, always in the same place (the C rail, collapsed by default to one line): the request as sent (`>` lines in mono, resolved, secrets masked and named); `<` with the response start line; one sans note giving route taken, host, secrets used by name, and what was kept where. Before Send the same view is a preview. The provenance rule (DQ6) becomes its grammar rather than a second element, keeping the budget at one. Repeats in history, run rows, the HAR comment, later the AI preview and agent sends. Trace: landscape opening 1, the profile's `feeling`, `RoutePolicy.took` and `BuiltRequest.secrets`.

Moment: "Send shows its speed" (D2.5 a). The record's failure state (rail opens with the browser's reason and **Send through the Local Bridge**) is part of the element, not a second moment.

Voice samples (voice.md): button "Show what was sent". Empty rail: "What left the browser, the route it took and the secrets it used show here after a send." Error: "The request did not reach 127.0.0.1:4320. The browser does not say why: the server may not be running, or it does not allow requests from this site (CORS)." with **Send through the Local Bridge**.

Landscape position (peer looks unverified): Yaak violet/pink, dark default: Wayfarer has no chrome hue and keeps a byte-exact record. Bruno amber, no payload preview [B5]: record before and after each send. Hoppscotch emerald (today's teal sits beside it), no route indicator [H3]: drop the teal, name the route on every send. Postman orange, Agent Mode with no visible boundary [P1]: ink chrome, agent sends through the same record. Insomnia purple; its Timeline reportedly uses curl notation (unverified): the notation is shared; Wayfarer differs on route, secrets-by-name and kept-where lines, and on having no accent.

Checks: default (done; JetBrains Mono the stated exception). Peer (no peer matches no-accent + Atkinson + three panes plus the egress rail; curl notation possibly shared with Insomnia). Catalogue: near-black + acid green removed; indigo band avoided by rejecting cobalt; Vercel clone 1 of 5 traits, no match (flagged); no fake terminal (no window chrome or prompt, real bytes only); mono on wire bytes only (P8-2 stricter); labelled lines, not "A · B"; an ink primary resembles shadcn's default primary in form and passes only because the hue rule is the system. Trace: every value traced. Accessibility MUST: every text pair ≥ 4.5:1, every boundary ≥ 3:1, both themes, both contrast levels; state never by colour alone. Where to land it: D3.6 already adds a boundary token, label tiers, an increased-contrast theme and own status colours, so the derivation costs little extra there.

### Identity-asset inconsistencies

- Mark vs app accent: `public/icons/logo.svg`, gradient `#405DD0`→`#7B4CF5` (hue 269→289) on a rounded square with a white glyph (the catalogue's gradient-squircle tell), beside the teal accent (hue 177) in the app's top-left. Waived (D2.4); no row.
- Site vs app differ on every brand channel: site faces Bricolage Grotesque + Atkinson Hyperlegible Next (`packages/site/src/app/fonts.ts:7-28`) vs app Inter + JetBrains Mono; site accent `--route #3451d1` / dark `#8ea2ff` (hue 268–273), close to the mark, vs app teal; site neutrals cool (paper `#f3f4ef`, ink `#121620`) vs app warm (`#FBFAF8` / `#22211F`). The mark and the site agree; the app is the outlier. W5.1 moves the site to the app's tokens; the sketch gives W5.1 a target.
- `theme-color` `#000000` / `#F5F5F7` (`index.html:8-9`) matches neither (DS-16, filed).

### New findings

P8-1 to P8-3 are rows of section 2. Confirmed unchanged from 10-23: DS-1, DS-5, DS-6, DS-8, DS-13, DS-16, DS-19, DS-21, DS-22, DS-27, DS-29, W-7, W-22, W-27, U-020, U-052.

## 6. Type

Measured with the skill's `scripts/type-eval.js` on the faces loaded from
this repository's `@fontsource` packages, in Chromium, Firefox and WebKit
at 12 and 13 px (the app's working sizes: of the text elements on the
first screen after a send, 30 are 12 px and 16 are 13 px), then rendered
at 1× and magnified to check every flagged pair by eye. The same script
on the running app found two families in use (Inter Variable in text,
control, input and keycap roles; JetBrains Mono in the address, values
and response) and five font files on first load, 342 KB: Inter's Latin
roman (73 KB) and italic (80 KB), JetBrains Mono 400 and 600, and Monaco's
`codicon.ttf` (153 KB, TTF).

| Pair, 12 px | Inter Variable | Atkinson Hyperlegible Next | JetBrains Mono |
|---|---|---|---|
| I / l | identical (0 px apart) in all three engines | distinct (d 0.84) | distinct (d 0.48) |
| l / 1 | distinct (d 0.95) | distinct (d 0.92) | distinct (d 0.58) |
| 0 / O | distinct (d 0.61) | distinct, slashed zero (d 0.44) | 1 px apart (dotted zero) at 1× |
| 8 / B | d 0.32 | d 0.31 | d 0.36 (13 px: 0.19, by eye: distinct) |

```
Face: Inter Variable (wght, opsz; roman and italic). Roles: UI text, controls, names, labels, keycaps
Legibility: FAIL for user-typed names. x-height ratio 0.709; I/l renders identically at 12 and 13 px in Chromium and Firefox (WebKit 13 px: 2 px apart); weights 400, 500, 600 in use
Figures and features: tabular available, not used by default; cv05 and cv08 (tailed l, serifed I) have no effect in @fontsource-variable/inter (rendered and compared)
Coverage: Latin, Latin-ext, Vietnamese, Greek, Cyrillic (unicode-range)
Scaling: type in px (U-073 and D3.6's rem work); 1.4.12 not re-run
Delivery: WOFF2, subset, swap; the italic (80 KB) loads on the first screen
Distinctiveness: default tier, tuned toward SF Pro (components.css:19-27); identity carried by nothing
Verdict: Replace in the text role (constraint: names and labels people type must be told apart at 12 px), or Tune with a build that keeps cv05/cv08, measured again. Keep as the fallback for Greek, Cyrillic and Vietnamese
Evidence: the type-eval output and specimens kept with the review's working notes
```

```
Face: Atkinson Hyperlegible Next 400 (the site's body face; 200-800 installed). Candidate role: UI text
Legibility: PASS. x-height ratio 0.743; no confusable pair at 12 or 13 px in any engine; slashed zero by default
Figures and features: tabular available (digit widths equal under tabular-nums)
Coverage: Latin and Latin-ext only (no Greek, Cyrillic or Vietnamese): pair with Inter as the per-glyph fallback
Delivery: WOFF2, 12 KB for the Latin regular
Distinctiveness: not default tier in product UI; an existing brand asset (packages/site/src/app/fonts.ts)
Verdict: Candidate for the text role (DQ11). Before taking it: render the app's own screens with it at 12 and 13 px in three engines, check the weight ladder (400/500/600) and Bold-equivalent steps, and check mixed Latin and Cyrillic names for a visible jump to Inter
```

```
Face: JetBrains Mono 400, 600. Roles: wire (address, values, response, method labels)
Legibility: CONCERN. x-height ratio 0.753; 0/O differ by 1 device pixel at 12 px on a 1× display (4 to 6 px at 13 px); slashed-zero and zero change nothing in this build
Figures and features: tabular by default
Coverage: Latin, Latin-ext, Vietnamese, Greek, Cyrillic
Distinctiveness: default tier for "mono accent", here carrying a rule (provenance), so it earns its place
Verdict: Keep, with wire values at 13 px or more and any 12 px mono role checked for 0/O (U-151)
```

Two delivery notes, not findings: Monaco's icon font ships as a 153 KB
TTF on first load, and Inter's italic loads before anything italic is
needed. Both are D4-e's to weigh against the response pane's budget.

## 7. Reworks

Each rework clears at least one condition of the skill's rework bar
(cluster: three or more rows with one cause that per-row fixes leave in
place; premise; peer gap; identity; system). Smaller clusters the red
team found are not reworks: the faint control layer (U-106, U-107, U-109,
U-074, U-113, U-114, U-117, U-112) is already D4.11 (U-106, U-107) and one token change in D3.6;
live regions made with their message (U-061, U-062, U-075) are one
fix and a test in D4.11; copy drift (U-054, U-082, U-083, U-084, U-020,
N5's "URL") needs a check, not a rework: extend the `scripts/ia.test.mjs`
string reading to fail on voice.md's banned words.

### R1. The exchange record as the core object, before and after Send

- **What changes.** One record per send: the address after variables are
  filled; each variable with the scope it came from, secrets masked and
  named; the Auth source and its value's source; the route taken,
  including "bridge not paired"; the host; what the redactor masked; what
  history kept. Before Send the same record is a preview in the composer,
  where missing and shadowed variables show and N3's chips act. After
  Send it is D4.12's rail. History entries and run rows store it and open
  into it. The status line and D4.11's status region speak its first line.
- **Bar.** Cluster C1, 12 rows: U-051 (W-7), U-092 (W-37), U-072 (W-15),
  U-031, U-076 (W-20), U-024 (extended), N1, N2, N3, N4, N5, N9. Identity:
  the verdict is default-assembled and the one logo-off survivor ("Saved
  in this browser only") is now claimed by five peers. Peer gap: no
  studied product shows a per-send record of what left (landscape
  opening 1).
- **Evidence.** N1 (the network capture shows the vault secret sent while
  the UI names the collection); N2; N4; N5 (rt-11); rt-28 (the honest
  copy, "Nothing was sent", exists only on failure). Flow (c) took 15
  inputs where 5 would do, because the missing `base` showed only after a
  failed send.
- **Plan.** Extends D4.12 with the pre-send half and history and run
  storage. Argues against DQ6's default: element 1 (provenance in the
  type split) is a rule nobody can see, so it cannot pass the plan's own
  measure ("with the logo off, the primary screen shows the signature
  element D2.5 chose", section 1). Keep element 1 as a voice.md rule
  under the record; it costs nothing and is how U-051 is fixed. Proposes
  moving D4-l (D4.12) ahead of D3-b, so D4.11's status region and D4.3's
  response work build toward the record instead of being redone for it.
  Asked as DQ8 (plan row 1.49); **the maintainer answered yes on
  2026-10-26** (row 1.52).
- **Cost.** Response pane, composer chip area, history drawer, run view,
  status bar; history store fields plus an IndexedDB migration (old
  entries get no record); the resolver returns a source per variable
  (`variableTokens` does most of it, minus Auth); e2e names change.
- **Unlocks.** U-051 fixed by construction, with U-024 and U-076; D1.4
  tasks 4, 5 and 8; D4.10's AI preview reuses the component (landscape
  opening 2); agent sends through WebMCP later go through the same record
  (opening 5).
- **Smallest experiment.** A static prototype of the record for the
  Inherit-bearer exchange, the vault secret shadowing the collection
  token. Ask five daily users "which token was sent, and by which route?"
  with today's UI (rt-19) and with the record. Then run D1.4's task 5,
  ending when the person names the cause, not when the error appears.

### R2. Environments become a document: per-field autosave, vault created in place

- **What changes.** An environment opens like a request, as a tab (or a
  sidebar section, if D4-f prefers). Each row is written on blur through
  the existing `changeEnvironment`; Save changes goes, which is U-060's
  own second fix. Creating the vault becomes a panel in the row that asked
  for it, and the mark-as-secret then completes. New environment becomes
  an inline row. "Removed apiKey. Undo" replaces the confirms (U-080's
  model, W-24).
- **Bar.** Cluster C2, 13 rows: U-060 (W-1), U-041 (with W-19), U-042, U-043, U-044,
  U-085 (W-30, DS-12), U-071 (W-14), U-094 (W-40), U-026, U-062 (its part a),
  N6, N7, N16. Per-row fixes keep a three-layer modal stack, and D4.11's
  Save/Discard/Cancel question would add a fourth dialog.
- **Evidence.** Flow (d): 11 clicks, 7 entries, a repeated step (N6), 3
  modal layers, no save feedback (N7). Baseline tasks 3 and 4: 45 and 135
  inputs (`docs/design/baseline.md`). That Postman opens environments in
  a workbench tab is recalled, not sourced (unverified).
- **Plan.** Contradicts `ia.md`'s placement (the Environments dialog in
  the toolbar's region) and D4.11's first AC (the guard question). The
  case: D4.11 would build and test a guard for a draft model that
  autosave removes. If R2 is taken, D4.11's first AC becomes "an edit
  survives ×, Escape and choosing another environment" (an e2e the same
  harness runs), and D4.5 (D4-g) takes the re-host. If it is declined,
  D4.11 ships as written. Asked as DQ9; **answered yes on 2026-10-26**
  (row 1.52): D4.11 autosaves, D4.5 moves environments into a tab.
- **Cost.** `environments-manager` re-hosted; the vault dialog made
  inline; `ia.md`'s rows and `scripts/ia.test.mjs`'s inventory updated;
  e2e names change. Storage risk is low: `changeEnvironment` already
  writes per field. Literal values and missing tokens (DS-17, DS-25) slow
  any re-host.
- **Unlocks.** U-060 and D4.11's guard dialog removed; N3's "Add base to
  Local" works in place; variables edited beside the request that uses
  them; marking a secret becomes reliable.
- **Smallest experiment.** Environment-as-tab with autosave for one
  environment; re-run baseline tasks 3 and 4. Target: under 45 and 135
  inputs and no modal layer.

### R3. A failed send recovers in place: the bridge set up from the failure

- **What changes.** On a failed send with no paired bridge, the failure
  states the route truth (N2), the command with Copy (`npx
  wayfarer-bridge`), the pairing field, and "Send again through the
  bridge" once paired. With a paired bridge it offers D4.12's one action.
- **Bar.** Premise. The purpose is "no account or install"; a daily
  professional's own APIs (internal, `localhost`, no CORS headers) fail
  on the first send, and today's way through is about 10 inputs across 3
  context switches (app, GitHub README, terminal, app), with a Node 22.21
  or later prerequisite the app never states. Peer gap is not claimed:
  Hoppscotch's interceptor needs a comparable install (landscape [H3]).
  It is the weakest of the three.
- **Evidence.** rt-05, rt-06, N2, N9, `packages/bridge/README.md`. The
  recovery was counted from the README and the pane, not walked: no
  bridge was run.
- **Plan.** Extends D4.12's failure action and D4.7 (the Local Bridge).
  No task schedules setting up the bridge from a failure. Asked as DQ10;
  **answered yes on 2026-10-26** (row 1.52), in D4.12.
- **Cost.** The failure panel; pairing moved from `bridge-pane` into a
  shared component; copy. No engine change.
- **Unlocks.** D1.4's task 5a can end at "sent". Pre-mortem reason 1.
- **Smallest experiment.** Time three people from rt-05 to a 200 against
  a no-CORS host, with today's UI and with a clickable mock of the panel;
  count inputs and context switches.

**No rework for the first screen or the shell.** The premise holds
there: the caret starts in the address, and a target that allows CORS
takes 2 inputs, tied with Hoppscotch's documented 2.

## 8. Enhancements

None of these is a fix in disguise; each traces to Wayfarer's subject or
a landscape gap.

**Information architecture**
- **Variables show precedence (Agency).** A chip says "token: environment
  Local (vault) overrides collection Shop"; hover or Enter gives the
  scope chain. N1 is the defect; this is the view on top of it.

**Flows**
- **Import takes the environment with the collection (Familiarity).** One
  file choice accepts a Postman environment beside the collection, and
  the review lists unresolved variables against the environment that
  resolves them. Traces to D1.4 task 2, the landscape's import convention
  and N4.
- **Destructive commands only when asked for (Simplicity, a deletion).**
  The palette shows "Delete {request}" only when the query names the verb;
  today "Inherit" offers Load, Duplicate and Delete at equal weight.
  Traces to `ia.md`'s palette rules and U-080's undo model (W-24).

**Content and voice**
- **The vault counts its use (Responsibility).** "Secrets · used by 3
  sends since unlock" opens those records (R1's record filtered by
  `BuiltRequest.secrets`). No studied product shows secret use per send
  (landscape opening 4).
- **The first run states the product's fact (Purpose).** The empty
  response pane says, in one line, "Requests go from this tab to the
  address you type, and nothing else leaves this browser", with the
  effective route word from N2 under it, instead of offering Import when
  a request is ready (U-095). Checked against the slop catalogue: a factual
  state, not a hero.

**Platform capabilities**
- **An agent drives the tab through the same record (Flexibility).**
  WebMCP (Chrome 149 origin trial, landscape [W2]): agent sends go through
  R1's preview and are approved per send. It is the browser counterpart of
  Yaak's and Postman's CLI skills and traces to D4.10's "every byte that
  leaves shown before it leaves". Behind D1.7.

**Visual design and theming**
- **Ink chrome, hue for protocol only (Craft).** Section 5's theming
  sketch, which the maintainer took on 2026-10-26 (DQ11, row 1.52).

## 9. Flows walked

An input is a click, a key or a text entry (a typed string counts once).

**(a) First run to a first response.** Target that allows CORS: 2 inputs
(type `http://127.0.0.1:4300/echo`, the caret already in the address;
Enter), response in 9.6 ms, no decisions or waits. Ties Hoppscotch's
documented 2. The walkthrough passes for sighted users; for screen-reader
users "see progress" fails (U-061, runtime-confirmed). Target that blocks
CORS: the same 2 inputs end in "0 Unknown Error" and a guess list (rt-05);
recovery is about 10 more inputs over 3 context switches (Route; scroll;
the README link; a terminal and `npx wayfarer-bridge`; wait; read the code;
back to the browser; type it; Pair, perhaps Chrome's local-network prompt;
close Settings and Send). Not walked: no bridge was run. "Notice the
correct action" fails: the failure offers none.

**(b) New request, send, read a JSON field.** 3 to 4 inputs: new tab, the
address, Enter, and for nested data a path in "Filter the JSON by path".
The path placeholder is in mono and reads like a value (P8-2).

**(c) Import a Postman collection and send one request.** 5 inputs to a
failure, 15 to a 200. Import…, pick the file (an OS dialog), read the
review (nothing about `base`, rt-07), Import, open "Inherit bearer" and
Send: refused with the address error (rt-11). Recovery: Environments, New
environment, the name, Enter (fails, U-044), Create, Add variable, the
key, the value, Save changes, close and Send. Yaak documents about 5 for
import and send. "Associate the action with the effect" fails at the
refusal, which points at the address.

**(d) An environment with a secret, used in a request.** About 11 clicks,
7 entries, 3 modal layers and 1 repeated step: Environments; New
environment, the name, Create; Add variable twice with two keys and
values; the lock (Create vault opens, rt-14); the passphrase twice and
Create vault (the row is still plain, rt-15); the lock again (rt-16); Save
changes (no feedback, rt-17); close and Send. The UI never says which
`token` went (rt-19, N1). After a reload, Send opens Unlock; Cancel says
"Nothing was sent" (rt-27, rt-28).

**(e) Find a request sent earlier.** 4 inputs: History (focus lands on
Clear all history), a search (the match is hidden by truncation), the row
(it replaces the current clean tab), Escape. The palette cannot do this
(U-011, D4-f). "Notice the correct action" fails: the rows cannot be told
apart.

**Pre-mortem: the three likeliest UI reasons Wayfarer fails, a year after
launch**
1. **The first real API fails and the way out is outside the app.**
   Internal and no-CORS hosts end in "0 Unknown Error"; "Route: Auto"
   claims a fallback that does not exist unpaired; setup is about 10
   inputs over 3 context switches plus Node. Desktop peers have no CORS.
   (rt-05, rt-06, N2, N9, U-051; R3 and R1.)
2. **The occasional user comes back to an empty app.** Safari evicts
   after 7 days, the reminder waits 14, storage was not persistent, and
   the status bar said "Saved in this browser only". For a product sold on keeping work on the
   device, one wipe ends trust. (N8; a fix, not a rework.)
3. **Credential confusion in a tool sold on knowing what left.** The Auth
   tab names the wrong source (N1), a secret silently is not one (N6),
   secrets are stored before the environment is saved (N7). One wrong
   token sent to production, or a "secret" found in plain text in an
   export, contradicts the product. (R1 and R2.)

Extreme users: a screen-reader user hears nothing on send (U-061); a
daily user for a year piles up scratch tabs with meaningless dots (N11)
and history rows that cannot be told apart (U-024); a quarterly user meets
eviction (N8). Slow network and the largest text size were not re-tested.

## 10. The first review, attacked

The red team read [`hig-review-2026-10-23.md`](hig-review-2026-10-23.md)
as a draft to attack. What it found, so the next review does not repeat it:

- **No structural answer, though the bar was met.** It had no reworks and
  no "no rework warranted" line, while its own environments rows formed a
  cluster of ten or more and its own verdict (default-assembled) met the
  identity condition. Its "Elevate" 1 to 4 were fixes in disguise (W-15,
  W-7, W-22 with DS-22, and DS-19 with DS-8, DS-1, DS-5); Elevate 5 (the
  C rail) was a rework without a bar, a cost or an experiment.
- **No flow was walked.** No step counts, no cognitive walkthrough. Its
  data was seeded ("Pet store" with `base` defined), so N3, N4, N5 and N6
  could not be reached. Not touched: import end to end, bridge recovery,
  which credential went on a success, storage persistence and eviction,
  history rows that look alike, a returning user, the vault locking again
  on reload, scratch tabs piling up.
- **It found the cause and declined the layer.** "The sameness comes from
  this plan's own choice" sits next to "Direction A stands, and this pass
  does not reopen it". It never treated the modality split (environments,
  history and settings all modal) as a model question.
- **Its brand evidence is stale.** It rated "Saved in this browser only"
  as an asset worth investing in, against one peer. Five peers now claim
  it, and the phrase was never checked against `persisted()` (N8).
- **Its Trust section went soft on the owned element.** It flagged
  "Nothing leaves this machine" (U-092) but not the status bar's constant
  "Saved in this browser only", nor the Auth tab's wrong source (N1).
- **Its parametric-colour claim was wrong** (P8-3).
- **Source-only claims.** U-061 is now confirmed at runtime; U-060 is
  still not (Escape was not pressed with edits); U-062 and U-075 remain
  source-only.
- **The benchmark it leaned on cannot compare.** `docs/design/baseline.md`
  counts characters as inputs (task 1 is 35); the landscape and peer docs
  count actions (Hoppscotch's 2). Section 1's measure ("fastest on 6 of 8
  tasks in input events") compares numbers that do not match. Task 5
  ("find why a request failed") stops when the error appears (0.13 s),
  not when the cause is known. D4.2 is ticked against an AC that needs
  D1.4's rivals, which have not been run. Plan row 1.50 takes these.
- **What held.** No hedged rows; its own copy has no contractions outside
  quoted strings; DS-25, DS-26 and W-35 name files and lines. No rating
  needs to move under the Rules.

## 11. Unverified

- U-060 at runtime (× or Escape with unsaved edits): not pressed. N7's
  orphan secret rests on source (`saveSecret` before save), not on a
  listing of the vault.
- The bridge recovery (R3, N2, N9): no bridge was run; the count comes
  from the README and the pane. "Auto behaves like Direct unpaired" is
  from the README, not traced in `transport/route.ts`.
- N8 in Safari: eviction and `persist()` were not run in WebKit; only
  Chromium's `persisted: false` was seen.
- N16: focus landing on Close after a mouse click was seen once; the
  keyboard behaviour is confirmed.
- N3: a dead control in a development build; may be unfinished.
- Peer claims: from documentation, not recordings; peer accents and
  typefaces are unverified (fill them from D1.4's captures).
- T-1 and T-2: measured at DPR 1 and 2 in three engines from this
  repository's font files; not checked on Windows ClearType or Linux.
- Atkinson Hyperlegible Next at 12 and 13 px in the app itself (rather
  than a specimen page), and its lack of Greek, Cyrillic and Vietnamese
  in request names (Inter would draw those as the fallback).
- Not checked: Firefox and WebKit captures of the app, 820 and 390 px,
  slow-network throttling, the runner on the imported collection with
  scripts (U-039), concurrent edits in two tabs, whether import then
  export keeps disabled parameters (N10).

## 12. Where each row went

| Review row | Audit | Plan |
|---|---|---|
| N1 | U-130 | D4-e (D4.11), first in the fourth pass's order (row 1.48) |
| N2 | U-131 | D4-l (D4.12) |
| N3 | U-132 | D4-g (D4.5) |
| N4 | U-133 | D4-h (D4.7) |
| N5 | U-134 | D4-e (D4.3) |
| N6 | U-135 | D4-e (D4.11) |
| N7 | U-136 | D4-e (D4.11) |
| N8 | U-137 | D4-e (D4.11) |
| N9 | U-138 | D4-l (D4.12) |
| N10 | U-139 | D4-h (D4.7) |
| N11 | U-140 | D4-f (D4.4) |
| N12 | U-141 | D4-e (D4.11's e2e catches it) |
| N13 | U-142 | D4-f (D4.4) |
| N14 | U-143 | D4-g (D4.5) |
| N15 | U-144 | D4-f (D4.4) |
| N16 | U-145 | D4-e (D4.11) |
| N17 | U-146 | D4-g (D4.5) |
| P8-1 | U-147 | D3-b (D3.6), with DQ11 |
| P8-2 | U-148 | D4-e (D4.3) |
| P8-3 | U-149 | D3-b (D3.6) |
| T-1 | U-150 | D3-b (D3.6), with DQ11 |
| T-2 | U-151 | D3-b (D3.6) |
| R1 | — | DQ8, answered yes (row 1.52): D4.12 |
| R2 | — | DQ9, answered yes (row 1.52): D4.11, D4.5 |
| R3 | — | DQ10, answered yes (row 1.52): D4.12 |
| Theming sketch | — | DQ11, answered yes (row 1.52): D3.6, W5.1 |
| Benchmark validity (section 10) | — | row 1.50, D1.4 |
