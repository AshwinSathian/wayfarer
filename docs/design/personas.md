# Personas: a cognitive walkthrough

D1.3 of [`PLAN-design.md`](../../PLAN-design.md). Five people the plan
names in section 1, each walked through the app as v3.0.0 will ship it:
their first ten minutes, and a day about two weeks later, when they know
the app and want it to keep up with them.

## Method

A cognitive walkthrough, run on 2026-11-04 against `main` at `62d85ef`.
For each persona the goals come first, then each step on the actual
screens, with the four questions at every step:

1. Will they try to do the right thing?
2. Will they notice the control that does it?
3. Will they connect the control with what they want?
4. After the action, will they see that it worked?

A step passes when all four hold, and fails when one does not. The reason
is the question that failed. Evidence is a capture of
[`baseline/design-chromium/`](baseline/design-chromium/) (taken from `main`
today, Chromium on Linux), a doc, a test of `e2e/design/tasks.spec.ts`, or
a source line. A step that the captures and the source cannot settle is
"not checked", not guessed. A step that fails because of a finding already
in the [audit](audit.md) names it; each new failure is a finding of the
audit's fifth pass, U-156 to U-167, listed at the end.

Only Chromium's captures were read. A step that fails in one browser only
says which.

The five codes are the audit's: SD solo developer, PE privacy-bound
engineer, QA tester, OC occasional user, TP a team leaving Postman.

| Persona | Steps | Pass | Fail | Not checked |
|---|---|---|---|---|
| SD | 17 | 12 | 4 | 1 |
| PE | 13 | 10 | 2 | 1 |
| QA | 14 | 10 | 4 | 0 |
| OC | 12 | 7 | 4 | 1 |
| TP | 13 | 9 | 4 | 0 |
| All | 69 | 48 | 18 | 3 |

The 18 failures come from 12 causes; several personas meet the same one.

## SD: the solo developer

### Profile

Writes and runs a backend on their own laptop, usually with Node or Go,
and tests it from an API client all day. Knows Postman, Insomnia or Bruno,
and uses the keyboard more than the mouse. Has Node installed and a
terminal open. Their requests go mostly to `localhost`, sometimes to a
staging host. They came for a client that opens in a tab and needs no
account. They do not read docs before trying.

Goals on arrival: send a request to the local server; see the response;
keep the request for tomorrow. On the tenth day: switch between local and
staging, find old requests fast, run a folder before a commit.

### Their first ten minutes

1. **Open the app to send a request to `localhost:3000`.** Passes. The
   caret is in the address field when the page opens, and the placeholder
   says what goes there ("Type an address, or paste a cURL command").
   Evidence: `first-run-1440-light.png`; task 1 of `e2e/design/tasks.spec.ts`
   (focus is asserted).
2. **Type the address and press Enter.** Passes. Enter sends; a request
   on its way shows "Sending…" with the time so far.
   Evidence: `response-loading-1440-light.png`; task 1.
3. **In Safari, send to `http://localhost` from the hosted `https` page.**
   Not checked. Whether WebKit treats `http://localhost` as mixed content
   from this page was not captured (the captures are Chromium's), and
   `browser-notes.html` decides from the address alone.
4. **The dev server sends no CORS headers: find out why nothing came
   back.** Passes. The record opens under the status line: "No response",
   what was sent and to where, what the browser reported ("Failed to
   fetch"), the three possible causes in plain words, and the Local Bridge
   offered in place.
   Evidence: `response-error-1440-light.png`.
5. **Start the bridge from the record and pair it.** Fails in Safari
   (question 4), passes in Chromium. The record gives `npx wayfarer-bridge`,
   Copy, the code field and Pair (task 5a passes in Chromium). It does not
   say that Safari reaches the bridge from the hosted app only over HTTPS,
   with `--cert` and `--key`, or that Chrome and Edge first ask about the
   local network. Both are said only in Settings, Local Bridge. A Safari
   user follows the record's steps and Pair does not work.
   Evidence: `src/app/components/exchange-record/bridge-setup.html:1-4`;
   `src/app/components/settings/bridge-pane.html:148-154`. U-159.
6. **Make it a POST with a JSON body.** Passes. The method list opens
   from the method field; Body offers raw JSON in an editor.
   Evidence: `method-menu-1440-light.png`, `composer-body-1440-light.png`.
7. **Add an `Authorization` header.** Passes. Headers is a tab beside
   Params, with a named row.
   Evidence: `composer-headers-1440-light.png`.
8. **Press Ctrl+S to keep the request.** Fails (question 4). With no
   collection yet, Save to collection says "A request is saved into a
   collection, and there is none yet. Make one with New collection in the
   sidebar." and offers only Cancel and a disabled Save. The person closes
   the dialog, makes a collection (below 1,200 px the sidebar is a closed
   drawer), and saves again.
   Evidence: `src/app/components/composer/save-as-dialog.html:9-12`.
   U-163.

### Their tenth day

1. **Open the app; yesterday's tabs are there.** Passes. Tabs are kept
   across a reload (README, "tabs that survive a reload";
   `src/app/state/tabs-storage.ts`).
2. **Switch from local to staging.** Passes. The environment is a select
   in the toolbar, named "Environment", showing the one in use.
   Evidence: `environments-rows-1440-light.png`; task 3.
3. **Open a saved request by name from the keyboard.** Passes. Ctrl+K
   shows its key in the toolbar's search field, and the palette finds
   requests, folders, environments and past requests.
   Evidence: `palette-1440-light.png`;
   `src/app/components/app-shell/app-shell.ts` (`paletteItems`).
4. **Find last week's request.** Passes. History has a search by address,
   method or status, grouped by day; the palette finds past requests too.
   Evidence: `history-1440-light.png`; task 8.
5. **Run the Orders folder before a commit.** Fails (question 2). Run…
   is only in the tree's context menu, reached by a right-click or
   Shift+F10 on a row. No row shows a button for it and the palette has no
   run command; the palette's commands for a selected row are New, Duplicate,
   Export and Delete.
   Evidence: `tree-menu-1440-light.png`;
   `src/app/shared/collections/collection-context-menu.ts:25,39`;
   `src/app/components/collections/collections-sidebar.ts:188-260`.
   U-156.
6. **Copy the request as code for a bug report.** Passes. The terminal
   icon beside the address copies cURL and says "Copied as cURL."; the
   response's export menu names each copy.
   Evidence: `export-menu-1440-light.png`; task 6.
7. **Back up when reminded.** Passes. The banner says why ("This
   workspace lives only in this browser…") and offers Back up now.
   Evidence: `vault-unlock-1440-light.png` (the banner is behind the
   dialog); `settings-data-1440-light.png`.
8. **Learn the shortcuts.** Passes. The palette shows each command's keys
   (Alt+T, Alt+W, Ctrl+Enter, Ctrl+S), and Settings has a Shortcuts pane.
   Evidence: `palette-1440-light.png`, `settings-shortcuts-1440-light.png`.
9. **On Windows, look up how to export a collection.** Fails (question 3).
   Settings, Data and storage says "from the command palette (⌘K, "Export
   …")". The toolbar on the same screen says Ctrl+K; ⌘ is written by hand.
   Evidence: `settings-data-1440-light.png` (the toolbar's "Ctrl+K" and
   the pane's "⌘K" in one capture);
   `src/app/components/settings/settings.html:244`. U-167.

## PE: the privacy-bound engineer

### Profile

Works where API keys, customer data and internal hosts may not reach a
third party: a bank, a hospital, a company with a security review before
any tool is used. Has been told to stop using Postman's cloud sync. Reads
the trust page before the app, checks the network tab, and needs an
answer for the security team. Uses secrets every day and calls internal
hosts that only their machine can reach.

Goals on arrival: confirm that nothing leaves but the request; keep a
token encrypted; send with it. On the tenth day: work with the vault
locking itself, pass a vendor's collection safely, reach an intranet host,
hand a backup to IT.

### Their first ten minutes

1. **Read what leaves the browser before opening the app.** Passes. The
   README's first claim (C-001) says it, each claim names its test, and
   the Trust centre and threat model are linked from the README and from
   Settings, About.
   Evidence: `README.md`; `docs/trust-center.md`;
   `settings-about-1440-light.png`.
2. **Check that nothing else is switched on.** Passes. Diagnostics says
   what it holds "leaves this page only if you copy it", and what Run
   self-tests asks of the server. AI says "Wayfarer sends nothing to a
   model until you add one here."
   Evidence: `settings-diagnostics-1440-light.png`;
   `src/app/components/settings/ai-pane.html:7-10`.
3. **Notice the status bar's "Vault locked" before making a vault.**
   Fails (question 3). No vault exists, but the status bar, the Secrets
   dialog ("Vault is locked. Unlock it to reveal secret values below.",
   with Unlock, Change passphrase and Export vault) and Settings, Vault
   ("The vault is locked.") all speak of a locked vault. A careful reader
   asks whose vault, and with what passphrase. A click recovers: Unlock
   opens "Create vault passphrase".
   Evidence: `first-run-1440-light.png`, `secrets-manager-1440-light.png`,
   `settings-vault-1440-light.png`;
   `src/app/components/app-shell/app-shell.html:367-368`;
   `src/app/components/secrets/secrets-manager.html:14-15`. U-164.
4. **Add a token to an environment and mark it secret.** Passes. Each
   row has a lock button (its name is "Mark … as secret"); with no vault
   the row asks for the passphrase in place, and says a forgotten one
   cannot be recovered.
   Evidence: `environments-rows-1440-light.png`,
   `vault-create-1440-light.png`; task 4.
5. **Send with `{{token}}` and see what went.** Passes. The record says
   which vault secret was filled and what was masked, and "Sends to"
   shows the resolved address before Send.
   Evidence: `response-record-1440-light.png`;
   `packages/core/src/send/record.ts:134`.
6. **Confirm that History keeps the token masked.** Passes. Claim C-008,
   with its test; the record says what history kept.
   Evidence: `README.md` (C-008); `response-record-1440-light.png`.
7. **Export a collection for a colleague.** Passes. "Include credentials"
   is off by default, and the dialog says a vault secret is never written.
   Evidence: `src/app/components/collections/export-dialog.html`,
   `export-dialog.ts:37`.

### Their tenth day

1. **After a reload, send a request that needs the token.** Passes. The
   vault asks for the passphrase first (C-007), and the unlock dialog says
   how long it stays open.
   Evidence: `vault-unlock-1440-light.png`; U-143 (fixed).
2. **Send a vendor's request whose script moved it to another host.**
   Passes. The app asks before it reads the vault (C-053), and says what
   Yes allows (U-069, fixed).
3. **Shorten the idle lock.** Passes. Settings, Vault, "Lock the vault
   when idle", in minutes.
   Evidence: `settings-vault-1440-light.png`.
4. **Pair the bridge from a failure to reach an intranet host, in Chrome.**
   Fails (question 4). Chrome asks whether the site may reach the local
   network the first time the page reaches the bridge; the record's
   set-up does not say so, and a person who blocks the prompt is left
   with a Pair that fails. Settings, Local Bridge says it.
   Evidence: `src/app/components/exchange-record/bridge-setup.html:1-4`;
   `src/app/components/settings/bridge-pane.html:148-151`. U-159.
5. **Back from a holiday, the passphrase is forgotten: start a new vault
   without losing collections.** Not checked. The app says a forgotten
   passphrase cannot be recovered, and Danger zone offers only Reset all
   data, which deletes everything. Whether deleting every secret lets a
   new passphrase be set was not traced.
   Evidence: `src/app/components/app-shell/app-shell.html:425`;
   `settings-danger-1440-light.png`.
6. **Hand a backup to IT.** Passes. Data and storage, Workspace backup:
   "the vault (still encrypted)".
   Evidence: `settings-data-1440-light.png`.

## QA: the tester who lives in the runner

### Profile

Tests an API for a team, mostly through collection runs: smoke runs after
a deploy, runs with a data file of cases, a JUnit file for CI. Receives
collections from developers as Postman exports with test scripts. Reads a
run's failures, then opens the request that failed. Knows Postman's
Collection Runner and Newman.

Goals on arrival: import the team's collection, run it, read what failed.
On the tenth day: data-driven runs, the report in CI, scripts that change.

### Their first ten minutes

1. **Import the team's Postman collection.** Passes. Import is a named
   menu in the sidebar's header; File… opens the picker.
   Evidence: `first-run-1440-light.png`; task 2.
2. **Read the import review.** Passes. It says what will be added, that
   nothing is stored until Import, and names a script call Wayfarer does
   not have.
   Evidence: `import-review-1440-light.png`.
3. **Find how to run the collection.** Fails (question 2). There is no
   Run button on the collection, in the toolbar or in the palette. Run…
   is in the context menu only. A Postman user looks for a Runner button
   and finds none.
   Evidence: `tree-1440-light.png`, `tree-menu-1440-light.png`;
   `src/app/shared/collections/collection-context-menu.ts:25,39`.
   U-156.
4. **Choose Run.** Fails (question 4). Before the run the view says "Each
   request is sent as Send would send it, with its scripts." The imported
   scripts are held until reviewed, so the run goes without them, and only
   afterwards says "Scripts of this collection wait for a review, so
   requests were sent without them." The first run of an imported
   collection tests nothing, after a sentence that said it would.
   Evidence: `src/app/components/runner/run-view.html:130`, `:100-113`;
   `src/app/services/collection-runner.ts:44`. U-157 (U-039's
   remainder).
5. **Review the scripts from the run and run again.** Passes. Review
   scripts… opens the review, each script under its holder's name; once
   approved the note says "Scripts reviewed. Run again to run them."
   Evidence: `script-review-1440-light.png`; `run-view.html:100-118`.
6. **Read what failed.** Passes. The failed row carries its assertion in
   red ("Status code equals 200"), the status, and Record and Open.
   Evidence: `run-1440-light.png`.
7. **Show only the failures.** Passes. "Failed only" sits beside the
   counts when anything failed.
   Evidence: `run-1440-light.png`.
8. **Save a JUnit report.** Passes. "Save the report: JSON, JUnit XML,
   HAR…" under the results.
   Evidence: `run-1440-light.png`.

### Their tenth day

1. **Run with a CSV of cases.** Passes. Data file… with the hint "CSV with
   a header line, or a JSON list of objects", then its name and row count.
   Evidence: `run-view.html:69-94`; task 7.
2. **Come back to last night's run after a reload.** Fails (question 4).
   A run's tab is not stored, so a reload or a closed browser loses its
   report. The run view says nothing of it; the person learns by losing
   one. Saving the JSON or JUnit file is the only way to keep it.
   Evidence: `src/app/state/tabs-storage.ts:124-126`;
   `src/app/state/tab-state.ts:139-141`; `run-view.html` (no such note).
   U-162.
3. **Run the same collection in CI.** Passes. `npx wayfarer-cli run`
   takes the Postman file as the app imports it and exits 1 on a failed
   test.
   Evidence: `docs/cli.md`.
4. **Re-import a collection whose scripts changed.** Passes. The review
   marks each changed script "Not reviewed yet".
   Evidence: `script-review-1440-light.png`; U-040 (fixed).
5. **Send one imported request by hand to debug it.** Fails (question 4).
   Its scripts are held, so its pre-request script does not run. The
   response's Body tab, the status line and the record say nothing of it;
   the note is inside the response's Tests tab, and the Scripts tab of the
   composer has no mark.
   Evidence: `src/app/components/response-viewer/response-viewer.html:563-568`;
   `src/app/components/composer/composer.html:128`;
   `src/app/components/composer/scripts-panel.html:3-16`. U-158.
6. **Set iterations and stop on the first failure.** Passes. Both are
   labelled fields of the run's setup.
   Evidence: `run-view.html:26-68`.

## OC: the occasional user

### Profile

Calls an API a few times a month: a frontend developer checking an
endpoint, a support engineer reproducing a customer's report, a product
manager trying a partner's API from its docs. Does not keep an API client
installed and may not have Node. Opens whatever is in a tab. Forgets the
app's layout between visits and will not read a manual first.

Goals on arrival: paste the example from an API's docs, add a token, see
the answer. Weeks later: find what they sent last time, and not lose it.

### Their first ten minutes

1. **Open the app and see where to start.** Passes. The address field has
   the caret and says what goes in it; the response pane says "Send a
   request and its response shows here." and offers Paste a cURL command
   and Import a collection.
   Evidence: `first-run-1440-light.png`.
2. **Paste the cURL example from the API's docs.** Passes. Pasted into
   the address it becomes the request (C-056), as the placeholder says.
   Evidence: `import-curl-1440-light.png`; `README.md` (C-056).
3. **Add a bearer token.** Passes. Auth is a tab with a Type select and a
   line saying what each choice does.
   Evidence: `composer-auth-1440-light.png`.
4. **The partner's API sends no CORS headers: follow the record's fix.**
   Fails (question 3). The record offers `npx wayfarer-bridge`, "Start it,
   then type the code it prints." It does not say that this is a command
   for a terminal, that it needs Node.js 22.21 or later, or where to read
   more. Without Node, the step ends there.
   Evidence: `response-error-1440-light.png`;
   `src/app/components/exchange-record/bridge-setup.html:1-7`;
   `packages/bridge/README.md` ("It needs Node.js 22.21 or later").
   U-159.
5. **Look in the app for help.** Fails (question 2). No screen links to
   the docs. Settings, About links the changelog, the trust centre, the
   source and the licences; the only other link in the app is the
   bridge's README in Settings, Local Bridge.
   Evidence: `settings-about-1440-light.png`;
   `src/app/components/settings/bridge-pane.html:156-164`. U-166.
6. **Understand where the work is kept.** Passes. The status bar says
   "Saved in this browser, which may delete it", and at the first save a
   banner offers Back up now.
   Evidence: `first-run-1440-light.png`; `vault-unlock-1440-light.png`
   (the banner).
7. **On a phone, find History.** Passes. The drawer lists "Request
   history" as a labelled row above the collections.
   Evidence: `tree-390-light.png`.

### Their tenth day

Weeks later, not days: for this person the tenth day is the tenth visit.

1. **Come back in Safari after more than a week.** Fails (question 4).
   Safari deletes a site's data after seven days without a visit, unless
   the app is installed. The status bar says only "which may delete it",
   the backup banner says the browser "has not promised to keep it", and
   the seven days and the cure (Add to Dock) are said only in Settings,
   Data and storage. The person finds an empty app with no word of why.
   Evidence: `src/app/components/app-shell/app-shell.ts:191`, `:573`;
   `src/app/components/settings/settings.html:268-273`;
   `README.md`, "Known limitations". U-165.
2. **Come back in Chrome and find last month's request.** Passes.
   History searches by address, method or status, by day.
   Evidence: `history-1440-light.png`.
3. **Recognise History in the toolbar.** Passes. A clock icon, named and
   with a tooltip, beside a labelled Environments; at 390 px it is a
   labelled row in the drawer.
   Evidence: `first-run-1440-light.png`, `tree-390-light.png`; U-006
   (fixed).
4. **Unlock the token kept last month, with the passphrase half
   remembered.** Not checked. A wrong passphrase was not captured, so what
   the dialog says to it is not known here.
   Evidence: `vault-unlock-1440-light.png`.
5. **Keep this request for next time.** Fails (question 4). The same
   dead end as SD's: Save says to make a collection in the sidebar first.
   Evidence: `save-as-dialog.html:9-12`. U-163.

## TP: a team leaving Postman

### Profile

A team of three to ten developers and testers whose free Postman plan
became one user in March 2026. They have years of collections with
pre-request scripts that set tokens, environments per stage, and test
scripts. One person moves first and must bring the others. They expect
Postman's layout and words, a Runner, and a way to share.

Goals on arrival: bring a collection and its environment over, send its
requests as they sent them in Postman, run it. On the tenth day: share
changes with a teammate without a server, and run the same collection in
CI.

### Their first ten minutes

1. **Import the Postman collection, then its environment.** Passes.
   Both go through Import, File…, one at a time, each with its report.
   Evidence: `docs/import.md` (the table of formats); C-058.
2. **Read what did not come over.** Passes. The review names each script
   call Wayfarer does not have, and the variables nothing in the file
   gives a value (U-133, fixed).
   Evidence: `import-review-1440-light.png`.
3. **Send a request whose pre-request script fetches a token.** Fails
   (question 4). The scripts are held, so no token is set and the server
   answers 401. Nothing in view says why: the response's Body tab, the
   status line and the record are silent, and the one note is in the
   response's Tests tab. The person suspects the import, not the review.
   Evidence: `response-viewer.html:563-568`; `composer.html:128`.
   U-158.
4. **Find and approve the review.** Passes once found. The composer's
   Scripts tab says the scripts do not run yet and why, with Review
   scripts.
   Evidence: `script-review-1440-light.png`; `scripts-panel.html:3-16`.
5. **Choose the imported environment.** Passes. The toolbar's
   Environment select lists it.
   Evidence: `environments-rows-1440-light.png`; task 3.
6. **Look for the Runner.** Fails (question 2). As for QA: Run… is only
   in the tree's context menu.
   Evidence: `tree-menu-1440-light.png`. U-156.
7. **Send one request to a teammate.** Passes. Copy as cURL, and the
   screen says "Copied as cURL."
   Evidence: task 6; U-050 (fixed).

### Their tenth day

1. **Export the collection for a teammate.** Passes. Export… in the
   collection's menu; Wayfarer's file by default, Postman's on a choice,
   with what Postman's format cannot hold listed.
   Evidence: `src/app/components/collections/export-dialog.html`.
2. **The teammate imports it into an empty app.** Fails (question 3).
   Every row of the review reads "Replaces", in the warning colour, though
   nothing in the app has those IDs, and "Import as duplicate" says it
   "Keeps the original" when there is none. The importer marks every item
   of a Wayfarer file as an overwrite without looking at what is stored.
   Evidence: `import-review-1440-light.png` (empty tree, two "Replaces");
   `packages/core/src/import/wayfarer-collection.ts:154-155`;
   `src/app/components/import/import-dialog.html:83-84`, `:99-110`.
   U-160.
3. **The teammate sends back a changed copy; import it over yours.**
   Fails (questions 3 and 4). The review lists each item as "Replaces"
   without saying which changed, and an import has no undo. Edits made
   here since the last exchange are lost without a word. Section 1 of the
   plan puts "see what the other changed before taking it" in phase T;
   v3.0.0 ships without it.
   Evidence: `import-dialog.html:99-110`; `PLAN-design.md`, section 1.
   U-161.
4. **Run the collection in CI.** Passes. `wayfarer-cli` reads the Postman
   file directly.
   Evidence: `docs/cli.md`.
5. **Meet a script that uses `pm.cookies`.** Passes. The import report
   and the review name the call, and the error names its section of the
   compatibility page.
   Evidence: `docs/postman-compatibility.md`; `script-review-1440-light.png`.
6. **Approve a teammate's changed scripts after a re-import.** Passes.
   Only the changed ones read "Not reviewed yet".
   Evidence: `script-review-1440-light.png`.

## Findings

Each is written out in the [audit](audit.md#fifth-pass-2026-11-04), in its
fifth pass.

| Finding | Title | Severity | Personas |
|---|---|---|---|
| U-156 | A collection run is reached only from the tree's context menu. | 2 | QA, TP, SD |
| U-157 | Before a run, the view says the scripts will run; held ones do not. | 2 | QA, TP |
| U-158 | A send whose scripts are held says so only in the response's Tests tab. | 2 | TP, QA |
| U-159 | The failure's bridge set-up leaves out what the bridge needs. | 2 | OC, SD, PE |
| U-160 | A Wayfarer file's import says "Replaces" for items that do not exist. | 3 | TP |
| U-161 | A re-import replaces each item without saying what changed, and cannot be undone. | 2 | TP |
| U-162 | A run's report is gone after a reload, and nothing says so. | 3 | QA |
| U-163 | The first save cannot make the collection it needs. | 3 | SD, OC |
| U-164 | With no vault, the app says the vault is locked. | 3 | PE, OC |
| U-165 | In Safari, the seven-day deletion is said only in Settings. | 2 | OC, SD |
| U-166 | The app links to no documentation. | 3 | OC, TP |
| U-167 | Settings writes ⌘K on every platform. | 4 | SD |
