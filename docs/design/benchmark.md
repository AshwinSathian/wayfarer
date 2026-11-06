# Rival benchmark

Task D1.4 of [`PLAN-design.md`](../../PLAN-design.md), run in session D5-b
on 2026-11-04 as D5.1's measure. Eight tasks, written before anything was
measured (D1.4), done on Wayfarer and read from each rival's documentation.

## Method

**What is counted.** An action is a click, a key press, or a value typed
into a field, counted once however long it is: the way the rivals'
documentation counts a step (row 1.50). A file chosen in the system's
dialog is two actions: the click that opens it and the pick. What a task
needs before it starts (a collection to run, history to search) is set up
first and not counted. [`baseline.md`](baseline.md) counts the same tasks
in characters typed (D0.2) and restates them as actions.

**Wayfarer** is measured: each task is scripted the shortest way the app
offers ([`e2e/design/tasks.spec.ts`](../../e2e/design/tasks.spec.ts)), run
three times, each run in a new browser with nothing stored, at 1,440 × 900.
The time is the script's, from the first action to the result on the
screen: the app's own waiting, not a person's, who also reads and thinks.
Each task's first run is recorded in [`benchmark/`](benchmark/) (the
recording also shows the set-up before the first action).

**The rivals** are not run (row 1.55, the maintainer's decision): their
steps are the ones their own documentation gives, each with its source and
the date it was read, and marked as documented. No rival has seconds: none
publishes them, and a time is compared only where a rival does.

**Versions.** Wayfarer: `main` at `1a2ed52` (2026-11-05, the release
candidate for v3.0.0; first measured at `62d85ef` on 2026-11-04, and run
again after D5-e's changes to tasks 2 and 3, U-203), a production build served by
`e2e/support/prod-server.mjs` with production's headers; Chromium 156 in
Playwright 1.64.1's Linux image (`mcr.microsoft.com/playwright:v1.64.1-noble`)
under Docker on an Apple M4 Pro. The echo server of `e2e/support` is every
target; task 5's Local Bridge is the repository's `packages/bridge`. The
rivals' versions are those their documentation describes, below.

## Wayfarer, measured

| # | Task | Actions | Clicks | Keys | Fields | Seconds (median) | Runs | Recording |
|---|---|---|---|---|---|---|---|---|
| 1 | First request from nothing | 2 | 0 | 1 | 1 | 0.06 | 0.08, 0.04, 0.06 | [task-1.webm](benchmark/task-1.webm) |
| 2 | Import a Postman collection with scripts and run it | 7 | 7 | 0 | 0 | 1.36 | 1.38, 1.36, 1.35 | [task-2.webm](benchmark/task-2.webm) |
| 3 | Add an environment and switch to it | 8 | 4 | 1 | 3 | 0.27 | 0.28, 0.25, 0.27 | [task-3.webm](benchmark/task-3.webm) |
| 4 | Use a secret without it touching disk | 18 | 11 | 1 | 6 | 0.81 | 0.81, 0.80, 0.86 | [task-4.webm](benchmark/task-4.webm) |
| 5a | Find why a request failed: CORS | 8 (+2 in a terminal) | 6 | 0 | 2 | 0.34 | 0.35, 0.32, 0.34 | [task-5a.webm](benchmark/task-5a.webm) |
| 5b | Find why a request failed: DNS | 8 (+2 in a terminal) | 6 | 0 | 2 | 0.33 | 1.60, 0.33, 0.31 | [task-5b.webm](benchmark/task-5b.webm) |
| 5c | Find why a request failed: 401 | 4 | 3 | 0 | 1 | 0.20 | 0.20, 0.22, 0.20 | [task-5c.webm](benchmark/task-5c.webm) |
| 6 | Send the same request to a teammate | 2 | 2 | 0 | 0 | 0.34 | 0.35, 0.34, 0.33 | [task-6.webm](benchmark/task-6.webm) |
| 7 | Run a collection with a data file and read the report | 5 | 5 | 0 | 0 | 0.50 | 0.50, 0.51, 0.49 | [task-7.webm](benchmark/task-7.webm) |
| 8 | Find a request sent last week | 4 | 3 | 0 | 1 | 0.50 | 0.50, 0.48, 0.52 | [task-8.webm](benchmark/task-8.webm) |

What each task ends on, and how it gets there, is
[`baseline.md`](baseline.md)'s "What each task does"; since then:

- **1.** The caret starts in the address (D4-c): the address, then Enter.
- **2.** Since D5-e the import's report offers **Import and review
  scripts…**: the collection is stored with its scripts unapproved, and the
  review opens on it. With nothing stored, the sidebar's Import… opens the
  file dialog itself (L-16): Import…, the file, Import and review
  scripts…, Trust these scripts, then right-click, Run…, Run: 7. Before,
  the review was reached through a request's Scripts tab (11). D5-e
  counted 8 from the steps, with a File… that an empty sidebar does not
  ask for; the run of 2026-11-05 counts 7.
- **3.** An environment made while none is in use is the one in use (a
  first one already was; since D5-e any is), so the toolbar's select is
  not part of the task: Environments, New environment, the name, Enter,
  Add variable, the variable's name (the caret is already there, U-145),
  a click into the value and the value: 8. Before, the script also opened
  the select and chose the environment already in use (2), and clicked
  into the name it was already in (1).
- **4.** The same holds for the vault's environment: made while none is in
  use, it is the one in use, so the task no longer opens the toolbar's
  select and chooses it (U-203): 18, was 20.
- **5a and 5b** end when the cause is named. A direct send says "No
  response" and why the browser cannot say more, with **Send through the
  Local Bridge**. From the failure's record the task copies the command,
  types the code the bridge printed, pairs and sends again (Copy, the code,
  Pair, Send again). Starting the bridge is two actions in a terminal
  (paste the command, Enter), outside the app: not in the count, and done
  before the clock. For CORS the bridge's 200 names the cause (the server
  answers; the page could not read it); for DNS the record quotes the
  bridge: `getaddrinfo ENOTFOUND no-such-host.invalid`.
- **5c.** The status line says 401, and the record, opened, says no vault
  secret was filled: the cause, without a guess.
- **6.** Wayfarer had no sharing yet (phase T): Copy as cURL, which says
  "Copied as cURL." The teammate sends it with another tool. (Since 3.1.0,
  Share… sends a whole collection as a file or an encrypted link, see
  [Sharing](../sharing.md); this task was not measured again.)

## The rivals, documented

Read from each rival's own documentation on 2026-11-04, Scalar's on
2026-11-05; nothing here was run. An input is an action, as above. "(inferred)" marks a count where the
docs say what to do but not every click; "not documented" means no page
read covers it; "cannot" means a page says the product does not do it.
Task 5 counts the inputs after the send that it takes to see the evidence:
no rival's documentation says the cause is named on screen. Install,
account, licence and extensions are prerequisites, counted apart. The full
steps, quotes and every source, rival by rival, are in
[`benchmark/rivals.md`](benchmark/rivals.md). Screenshots are linked, never
copied (row 1.64).

### Versions

- **Postman**: v12 ("Latest (v12)" on every docs page; https://www.postman.com/release-notes/postman-app/ is titled "Release Notes v12" and shows no build number). Desktop app, or the web app with an agent.
- **Bruno**: v4.3.0, 22 Oct 2026 (https://www.usebruno.com/changelog). Desktop app; no account.
- **Yaak**: 2026.9.0, 10 Oct 2026; a 2026.9.1 patch has no date (https://yaak.app/changelog/2026.9.0). Desktop app; no account; a work licence. Yaak Web exists and sends through a proxy.
- **Hoppscotch**: 2026.10.0, 30 Oct 2026 (https://github.com/hoppscotch/hoppscotch/releases; blog post dated 29 Oct). Web app without an account; desktop app; CLI.
- **Insomnia**: 13.4.0, 29 Oct 2026 (https://github.com/Kong/insomnia/releases; the docs describe 13.x). Desktop app; Scratch Pad without an account.
- **Scalar**: API Client 1.1.43, 23 Oct 2026 (https://scalar.com/resources/changelog/api-client). Browser version at client.scalar.com, which sends through proxy.scalar.com by default, with no account stated; desktop app for macOS, Windows and Linux. Read on 2026-11-05.
- **Linear** (screenshots only): docs and changelog as of 2026-11-04; latest changelog entry 22 Oct 2026 (https://linear.app/changelog).

### Task 1: First request from nothing

| Rival | Documented steps | Inputs | Prerequisites | Source | Notes |
|---|---|---|---|---|---|
| Hoppscotch | URL, Send | **2** | None (web app). An interceptor (agent, extension, proxy) for a server without CORS | https://docs.hoppscotch.io/documentation/getting-started/rest/creating-a-request | Only where the target allows CORS |
| Postman | New (+), URL, Send | 3 | Desktop install; "continue with the lightweight API Client" (no sign-in) | https://learning.postman.com/docs/getting-started/first-steps/sending-the-first-request/ ; https://learning.postman.com/docs/getting-started/basics/using-api-client/ | The lightweight client has no collections or environments |
| Yaak | Cmd+N, URL, Cmd+Enter | 3 (inferred) | Desktop install | https://yaak.app/docs/request-types/http-requests ; https://yaak.app/docs/getting-started/keyboard-shortcuts | 4 if Cmd+N asks for a type |
| Bruno | +, URL, Enter, Cmd+Enter | 4 (inferred) | Desktop install | https://docs.usebruno.com/get-started/bruno-basics/create-a-request ; https://docs.usebruno.com/get-started/configure/keybindings | 3 if Enter sends |
| Insomnia | as documented on the requests page | 6 | Desktop install; "Use the local Scratch Pad" (no account) | https://developer.konghq.com/insomnia/requests/ ; https://developer.konghq.com/insomnia/storage/ | 8 if the collection must be named (inferred) |
| Scalar | URL, Send | 2 (inferred; a blank request and the default method are not documented) | None stated (browser). Requests go through proxy.scalar.com by default | https://scalar.com/products/api-client/getting-started ; https://scalar.com/resources/changelog/api-client (1.1.1) | CORS is worked around by Scalar's own proxy, not by an install |

### Task 2: Import a Postman collection with scripts and run it

| Rival | Documented steps | Inputs | Prerequisites | Source | Notes |
|---|---|---|---|---|---|
| Insomnia | Import, file (2), Scan, Import, name, Run Collection, Run | **8** | Desktop; the how-to uses a Cloud Sync project (account; +2 inferred) | https://developer.konghq.com/how-to/use-the-collection-runner/ ; https://developer.konghq.com/insomnia/scripts/ | Scripts converted; globals and `postman.*` not supported |
| Bruno | Import 6 (one location dialog inferred), run 3 | 9 (inferred) | Desktop; export from Postman as v2.1 first | https://docs.usebruno.com/get-started/import-export-data/import-collections ; https://blog.usebruno.com/postman-to-bruno-script-conversion (7 Oct 2026) ; https://docs.usebruno.com/get-started/bruno-basics/run-a-collection | `pm.*` partly translated; unmapped calls throw when run |
| Hoppscotch | Import, Postman, file (2), consent, Import; right-click, Run Collection, Run | 9 (consent and Run inferred) | None | https://docs.hoppscotch.io/documentation/features/importer ; https://docs.hoppscotch.io/documentation/features/runner | Scripts import as "experimental", after a consent prompt |
| Yaak | Import 8, Send All 2 | 10 | Desktop | https://yaak.app/docs/migration/postman ; https://yaak.app/docs/advanced/running-multiple-requests | **Task not met**: scripts are not imported, and Send All is not an ordered run |
| Postman | Import 4, run 7 | 11 | Sign-in and a workspace | https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data/ ; https://learning.postman.com/docs/collections/running-collections/intro-to-collection-runs/ | 9 if Functional and Local are preselected (inferred). No script review documented |
| Scalar | Add Item (⌘K), Import from …/Postman, file (2); run not documented | 4 for the import (inferred in part); run not documented | None stated | https://scalar.com/products/api-client/import | Postman import converts "Requests, folders, and basic authentication settings"; scripts not mentioned |

### Task 3: Add an environment and switch to it

| Rival | Documented steps | Inputs | Prerequisites | Source | Notes |
|---|---|---|---|---|---|
| Insomnia | Create 3; switch 2 (inferred) | **5** (2 inferred) | Desktop | https://developer.konghq.com/insomnia/environments/ | Adding a variable not counted |
| Bruno | Settings, create, name, variable, save, select | 6 (inferred) | Desktop; a collection open | https://docs.usebruno.com/variables/environment-variables | About 8 with name and confirm |
| Postman | Create, name, variable, save; selector open and pick (inferred) | 7 | Sign-in and a workspace | https://learning.postman.com/docs/sending-requests/variables/managing-environments/ | Values are "local" or "shared" (cloud) |
| Yaak | Create 6 (inferred), header dropdown, select | 8 (inferred) | Desktop | https://yaak.app/docs/templating/environments-and-variables | Only the switch is written out |
| Hoppscotch | Icon, new, name, variable, value, save; selector, pick | 8 (save and selector inferred) | None | https://docs.hoppscotch.io/documentation/getting-started/rest/environment-variables | |
| Scalar | Collection settings, Add Environment, name, colour, key, value; globe, pick | 9 (settings inferred) | A collection | https://scalar.com/products/api-client/environments | Collection environments export with the document; workspace environments do not |

### Task 4: Use a secret without it touching disk

No rival documents a secret that never touches disk in its free product. Where the secret lives, per the docs:

| Rival | Documented steps | Inputs | Prerequisites | Source | Where the secret is kept |
|---|---|---|---|---|---|
| Bruno | Secret variable: mark secret, value, save | 3 (inferred) | Desktop | https://docs.usebruno.com/secrets-management/secret-variables | On disk, encrypted ("OS level encryption when available or falls back to AES256"), out of the collection files. Off disk only with a secret manager (Ultimate licence): "never written to disk" (https://docs.usebruno.com/secrets-management/secret-managers/overview) |
| Yaak | Encrypt the workspace and the value, or a `keychain()` / `1password.item()` / `prompt.text()` function | 5 (inferred) | Desktop; 1Password service account for that one | https://yaak.app/docs/collaboration/secrets-encryption ; https://yaak.app/docs/templating/template-function-reference | Ciphertext in local SQLite, key in the OS keychain; "protects selected values, not the entire database or response history". Sent headers are stored since 2026.1.0, so a secret in a header is likely in history in clear (inferred) |
| Postman | Local Vault: key, add secret, reference it | 8 | Sign-in and a workspace | https://learning.postman.com/docs/use/postman-vault/manage-vault-secrets.md ; https://learning.postman.com/docs/use/postman-vault/postman-vault-key.md | On disk, AES-256; key in the OS password manager; not synced. Shared Vault is in the cloud |
| Insomnia | Vault key, private sub-environment, secret variable, select | about 12 (inferred) | Desktop | https://developer.konghq.com/insomnia/environments/ | On disk, "locally in encrypted form"; not synced or exported. "Confidential" variables are plaintext |
| Hoppscotch | — | cannot | — | https://docs.hoppscotch.io/support/security-policy | "Secret" variables are kept in the client's local store (localStorage in the web app): off the server, not off disk |
| Scalar | — | not documented | None stated | https://scalar.com/products/api-client/authentication ; https://scalar.com/resources/changelog/api-client (1.0.13) | No secret type documented; "Credentials are persisted in your workspace", which is "IndexedDB-backed": on disk (inferred) |

### Task 5: Find why a request failed (CORS, DNS, 401)

Inputs are counted after the send. No rival's docs say the product names the cause on screen for any of the three.

| Rival | CORS | DNS | 401 | Source |
|---|---|---|---|---|
| Hoppscotch | "Could not send request. Unable to reach the API endpoint. Check your network connection or select a different Interceptor and try again." (app strings, not docs). Same text as DNS (inferred). Cause not named; the docs send the person to the browser console. Not documented | Same generic message. Not documented | Status line shows 401: **0**. An inspection string "Please check your authentication credentials." exists; the docs do not tie it to 401 | https://docs.hoppscotch.io/documentation/getting-started/troubleshooting.md ; https://docs.hoppscotch.io/documentation/features/inspections ; `packages/hoppscotch-common/locales/en.json` |
| Postman | Desktop: does not apply. Web: "you may be experiencing a CORS error"; use the right agent. Cause not named. Not documented | "an overview of the issue", "Debug with AI", details in Console: 2 (inferred). No error text documented | Status shown, hover describes the code (0). Sent headers in Console: 2 (inferred) | https://learning.postman.com/docs/use/send-requests/response-data/troubleshooting-api-requests.md ; https://learning.postman.com/docs/use/send-requests/response-data/responses |
| Bruno | Desktop; no CORS page (inferred: does not apply) | Not documented; Timeline has a DNS timing | Status shown; Timeline, Request: 1–2 (inferred) shows auth as resolved | https://docs.usebruno.com/debugging/timeline ; https://docs.usebruno.com/send-requests/res-data-cookies/res-data |
| Yaak | Does not apply (desktop; Yaak Web proxies) | Not documented; user reports show raw errors ("reqwest::Error … HostUnreachable … No route to host", 26 Aug 2025). Timeline: 1 (inferred) | Status shown; Request or Timeline tab: 1 (inferred) | https://yaak.app/docs/troubleshooting/troubleshooting ; https://yaak.app/changelog/2026.1.0 (19 Jan 2026) ; https://yaakapp.featurebase.app/p/unexpected-hostunreachable-error |
| Insomnia | Does not apply (desktop; no doc mentions CORS, inferred) | Not documented | Status badge; Console: 1 (inferred) shows headers as sent | https://developer.konghq.com/insomnia/requests.md |
| Scalar | "Failed requests remain visible with guidance about possible CORS or network causes" (1.1.36): CORS and network not told apart; in the browser the default proxy avoids CORS (inferred). Inputs not documented | Same "possible CORS or network causes" (inferred). Not documented | Not documented | https://scalar.com/resources/changelog/api-client (1.1.36, 1.1.1) |

### Task 6: Send the same request to a teammate

| Rival | Documented steps | Inputs | Prerequisites | Source | Notes |
|---|---|---|---|---|---|
| Yaak | Copy as cURL | **2** | Desktop | https://yaak.app/docs/advanced/code-snippets | Docs do not say if variables are resolved. Export 6 (inferred); Git sync about 12 (inferred) |
| Postman | Copy link | **2** (+ paste outside) | Sign-in; request saved in a collection in a team workspace; teammate has a seat | https://learning.postman.com/latest-v-12/docs/collaborating-in-postman/sharing | Invite: 5. Goes through Postman's cloud |
| Hoppscotch | Save menu, Share Request, Link, Create, Copy | 5 | Sign-in | https://docs.hoppscotch.io/documentation/features/widgets.md | Variables not resolved; an app string warns that credentials in the request are readable by anyone with the link |
| Bruno | Export collection | 5 (inferred) | Desktop | https://docs.usebruno.com/get-started/import-export-data/export-collections | Whole collection, not one request; secret variables left out. Git UI: 14 (Pro or Ultimate for push) |
| Insomnia | — | not documented | — | https://developer.konghq.com/insomnia/organizations.md ; https://developer.konghq.com/insomnia/run-in-insomnia.md | No single-request share or copy as cURL in current docs. Organisation invite: 5 (account) |
| Scalar | Code snippet: picker, language, copy | 3 (inferred) | None stated | https://scalar.com/products/api-client/code-generation | No share link documented. Snippets resolve `{{ environment variables }}` to their values; no masking stated. Team workspaces need sign-in (plan not stated) |

### Task 7: Run a collection with a data file and read the report

| Rival | Documented steps | Inputs | Prerequisites | Source | Notes |
|---|---|---|---|---|---|
| Bruno | CLI: `bru run --reporter-html results.html --csv-file-path data.csv`, Enter | **2** (+ open the report; the docs count the command as 1, Enter added as for Hoppscotch) | `npm install -g @usebruno/cli`, Node 18+ | https://docs.usebruno.com/bru-cli/run/options ; https://docs.usebruno.com/bru-cli/run/reports | In the app: 5 (upload inferred); data files need Pro or Ultimate, HTML report download Ultimate (https://docs.usebruno.com/testing/automate-test/data-driven-testing) |
| Hoppscotch | CLI: `hopp test file.json --iteration-data data.csv`, Enter | 2 (+3 to export, inferred) | Node 22, `npm i -g @hoppscotch/cli` | https://docs.hoppscotch.io/documentation/clients/cli/overview | **The app's runner cannot** take a data file (https://docs.hoppscotch.io/documentation/features/runner) |
| Insomnia | App: collection, Run Collection, Upload Data, file (2), Run, Tests or Console | 7 (upload inferred) | Desktop | https://developer.konghq.com/how-to/use-the-collection-runner/ | CLI `inso run collection -d`: 2 (inferred). The docs describe no report; requests appear in Console |
| Postman | App runner with data file | 11 | Sign-in and a workspace | https://learning.postman.com/docs/collections/running-collections/working-with-data-files/ | Report: summary row, filters, grouped by iteration. Run details last the session; export is desktop only |
| Yaak | — | cannot | — | https://yaak.app/docs/advanced/running-multiple-requests ; https://yaak.app/feedback/posts/data-runner-yaak-plugin | "Yaak has no collection runner UI"; data runs under consideration |
| Scalar | — | not documented | — | https://scalar.com/products/api-client/testing ; https://scalar.com/tools/cli/commands | No runner, data file or report in the docs; the CLI has no command that sends requests |

### Task 8: Find a request sent last week

| Rival | Documented steps | Inputs | Prerequisites | Source | Notes |
|---|---|---|---|---|---|
| Hoppscotch | History, the request | **2** + scrolling | None | https://docs.hoppscotch.io/documentation/features/history | No text search, no date grouping; retention not documented |
| Bruno | History, the request | 2 (inferred) + scrolling | History may be Pro or Ultimate (blog vs pricing page disagree) | https://docs.usebruno.com/send-requests/history ; https://blog.usebruno.com/share-bruno-collections (23 Sep 2026) | No search or date filter; storage and retention not documented |
| Postman | History tab, search, entry | 3 (inferred) | None (syncs when signed in) | https://learning.postman.com/latest-v-12/docs/getting-started/basics/navigating-postman | The only rival with a documented history search. No retention or date filter documented. Console keeps 24 hours, so last week's sent headers are gone |
| Insomnia | — | not documented | — | https://developer.konghq.com/insomnia/requests.md | Screenshots show a per-request response history dropdown (3 inferred if the request is known); no global history |
| Yaak | — | not documented | — | https://yaak.app/feedback/posts/save-request-data-for-response-history | Per-response history button in screenshots; no docs on opening, search or retention |
| Scalar | — | not documented | — | https://scalar.com/products/api-client/keyboard-shortcuts ; https://scalar.com/resources/changelog/api-client | No docs page or release note describes history |

### Summary: fewest documented inputs

| Task | Fewest | Rival |
|---|---|---|
| 1 | 2 | Hoppscotch (web, CORS-permitting target); Scalar (inferred, through its proxy) |
| 2 | 8 | Insomnia (Bruno and Hoppscotch 9) |
| 3 | 5 (2 inferred) | Insomnia |
| 4 | none off disk in a free product | Bruno 3 (inferred) keeps it encrypted on disk; off disk only with Bruno Ultimate's secret managers |
| 5 | none documented to a named cause | 401 seen at 0 (Hoppscotch, Postman); sent auth one tab away (Bruno, Yaak, Insomnia, 1 inferred) |
| 6 | 2 | Yaak (copy as cURL); Postman (copy link, needs a team workspace) |
| 7 | 2 | Bruno CLI (free) and Hoppscotch CLI; in an app, Bruno 5 (inferred; paid licence) |
| 8 | 2 + scrolling | Hoppscotch; only Postman documents a search (3, inferred) |

### What the rivals' main screens show (D5.1 swap test)

The question: does any rival show, next to the response, a record of what the send did — the request as sent, the route it took, and the secrets it used?

**No rival does, on its main screen.** Per rival:

- **Postman**: the URL bar keeps `{{variables}}`. The request as sent is in the Console (a footer panel, 24 hours). The route is shown only on hover, in the response bar's network popover ("Agent: Desktop Agent"; image https://assets.postman.com/postman-docs/v12/https-network-info-response-12-3.png on https://learning.postman.com/docs/use/send-requests/response-data/responses). Secrets used: not shown; Local Vault values are masked in the Console. Postman is the only rival that shows the route at all.
- **Bruno**: the Timeline tab, one tab from the response, shows "the resolved request details" (URL, headers, auth and credentials, variables, script calls, timings) (https://docs.usebruno.com/debugging/timeline). Route: not shown; the docs say to check a proxy by calling an IP-echo service. Secrets used: not documented.
- **Yaak**: the Request and Timeline tabs (since 2026.1.0) show the request as sent, like `curl -v`, values in clear (https://yaak.app/changelog/2026.1.0, Timeline image). The main view shows the template. Route: not shown; "Invalid proxy URLs are silently ignored" (https://yaak.app/docs/advanced/proxy-configuration). Secrets used: not shown.
- **Insomnia**: a URL preview of the resolved address before the send; after it, a libcurl-style log in the Console tab (request line, headers as sent, IP and port) (https://developer.konghq.com/insomnia/requests.md ; https://developer.konghq.com/assets/images/insomnia/collection-runner.png). Route: no label; proxy is global. Secrets used: not shown.
- **Hoppscotch**: status, time, size, body, response headers, tests. No view of the request as sent, no route (the interceptor is a setting), no secrets used (https://docs.hoppscotch.io/documentation/getting-started/rest/response-handling.md ; https://hoppscotch.com/images/hero-screenshot.png). Its runner report shows `<<variables>>` unresolved.

So the resolved request exists one tab away in Bruno, Yaak and Insomnia, and as a console log in Postman. None names the secrets a send used, and only Postman names the route, on hover. A screen that puts all three beside the response would not survive a swap with any rival's: none of them shows it.

### Screenshots

All linked, none copied. Per rival, each image's URL, page, date and description is in [`benchmark/rivals.md`](benchmark/rivals.md)'s **Screenshots** subsection. In brief:

- **Postman**: all light; no dark screenshot on any docs page fetched. (a) https://assets.postman.com/postman-docs/v12/send-first-request.png ; (a)+(b) https://assets.postman.com/postman-docs/v12/workspace-diagram-02-28-26-v2.png (filename suggests 2026-02-28) ; (c) https://assets.postman.com/postman-docs/v12/intro-to-collection-runs-debug-v12-01.png.
- **Bruno**: (a)+(b) https://www.usebruno.com/_next/image?url=%2Fbruno-homepage-hero.png&w=3840&q=75 ; Timeline and Runner images on docs.usebruno.com (mintcdn). Theme not checked; no light/dark pair found.
- **Yaak**: (a)+(b) light https://assets.yaak.app/uploads/hero-yaak-light-xgmsn_2080x1200.webp and dark https://assets.yaak.app/uploads/hero-yaak-dark-EQjks_2080x1200.webp on https://yaak.app/ ; Timeline (dark) on https://yaak.app/changelog/2026.1.0 (19 Jan 2026). (c) none: no runner.
- **Hoppscotch**: (a)+(b) dark https://hoppscotch.com/images/hero-screenshot.png ; light `hoppscotch-light.png` on https://docs.hoppscotch.io/documentation/clients/web/overview.md ; (c) dark, on Hoppscotch's own dev.to post (23 Jan 2025).
- **Insomnia**: all dark. (a) https://developer.konghq.com/assets/images/insomnia/entry-page.png ; (b) https://insomnia.rest/images/home/image-hero-insomnia-20260612.png (2026-06-12) ; (c) https://developer.konghq.com/assets/images/insomnia/collection-runner.png.

#### Linear (reference of a dense pro tool)

- Main screen, dark. https://webassets.linear.app/images/ornj730p/production/a6643535918840dfdc1e41e4515ef1fdde3fb59d-2820x1352.png on https://linear.app/docs/conceptual-model (alt "Linear interface showing active issues page"; no page date; accessed 2026-11-04). A macOS window: a 330 px sidebar (workspace, Inbox, My issues, Workspace and Your teams groups, Issues selected with a quiet fill), view tabs above a filter row, then a list grouped under "In Review 12". Each row is one line: priority bars, ID in the secondary label, status ring, title in the primary label, then label chips, cycle, date and avatar right-aligned. Hue only in status, labels and avatars; the chrome is grey on near-black.
- Roadmap display options, theme not checked. https://webassets.linear.app/images/ornj730p/production/9723099db6c7913608fcdc59be40a27a33e528a4-1203x939.png on https://linear.app/docs/display-options (accessed 2026-11-04).
- No light-theme main screen found. The home page (https://linear.app/) draws its product views as HTML, not images, and the brand page has only a logo ZIP (https://static.linear.app/design-assets/Linear-Brand-Assets.zip?v=3), no press screenshots.

---

## Wayfarer against the rivals

Section 1 of the plan asks that Wayfarer be fastest or tied for fastest on
at least six of the eight tasks, in time and in actions. Time cannot be
compared: no rival publishes seconds, and the rivals were not run. In
actions, Wayfarer's measured count against the fewest any rival documents:

| # | Task | Wayfarer | Fewest documented | Wayfarer is |
|---|---|---|---|---|
| 1 | First request from nothing | 2 | 2 (Hoppscotch, a target that allows CORS; Scalar, inferred, through its proxy) | Tied, and Wayfarer's count holds for any target the bridge reaches |
| 2 | Import a Postman collection with scripts and run it | 7 (was 11) | 8 (Insomnia) | Fastest, by 1 (was behind by 3) |
| 3 | Add an environment and switch to it | 8 (was 11) | 5, 2 of them inferred (Insomnia) | Behind by 3 (was 6) |
| 4 | Use a secret without it touching disk | 18 (was 20) | None: no free rival keeps a secret off disk | The only one that does it |
| 5 | Find why a request failed | 8, 8 (+2 in a terminal), 4 | None documented to a named cause | The only one documented to the cause |
| 6 | Send the same request to a teammate | 2 | 2 (Yaak, Postman) | Tied |
| 7 | Run a collection with a data file and read the report | 5 | 2 (Bruno's and Hoppscotch's CLIs); 5 in an app (Bruno, paid) | Tied in an app; behind a CLI by 3 |
| 8 | Find a request sent last week | 4 | 2 and scrolling (Hoppscotch); 3 with a search (Postman, inferred) | Behind by 1 to 2 |

Fastest or tied on five of eight (1, 2, 4, 5, 6; task 2 since D5-e), six
if task 7 is compared app to app. Section 1's six is met only that way:
tasks 3 and 8 are behind, and
the comparison rests on documented counts, several of them inferred. D5-c
records the gap or closes it (plan row 1.64).
