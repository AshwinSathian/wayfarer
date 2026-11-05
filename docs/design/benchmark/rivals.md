# Rival benchmark: each rival's documented steps

The appendix of [`benchmark.md`](../benchmark.md) (D1.4 of
[`PLAN-design.md`](../../../PLAN-design.md)): for each rival, the steps of
each task as its own documentation gives them, with quotes and sources,
read on 2026-11-04 (Scalar's on 2026-11-05). Nothing here was run.

Each section was written from the pages fetched on 2026-11-04. Where a research note says an image was "viewed", the tool fetched it to describe it; no copy is kept anywhere in the repository.


## Postman

Version: Postman v12. Every docs page fetched says "This page is for Postman Docs, version Latest (v12) (default)", with a link to the v11 index. The official release notes page (https://www.postman.com/release-notes/postman-app/, accessed 2026-11-04) is titled "Release Notes v12" but shows no build numbers to a fetch, so no exact 12.x build is given here.

Prerequisites:
- The desktop app (Mac, Linux; https://www.postman.com/downloads/, accessed 2026-11-04). The web app needs a free account ("Create a free account and you're in").
- Without signing in, the desktop app opens the "lightweight API Client": requests, history and post-response scripts only. "All of your work in the lightweight API Client is stored locally and isn't synced online with Postman." Collections, environments and variables need a workspace, and "To switch to a workspace, you need to sign up for a Postman account or sign in" (https://learning.postman.com/docs/getting-started/basics/using-api-client/, accessed 2026-11-04).
- In the web app, a request leaves through an "agent": Desktop Agent (an installed local app), Cloud Agent (Postman's servers, capped per plan, cannot reach local hosts), Browser Agent (subject to CORS) or Interceptor Agent (a browser extension). Auto-select tries Desktop, Cloud, Interceptor, Browser in that order (https://learning.postman.com/latest-v-12/docs/getting-started/basics/about-postman-agent, accessed 2026-11-04).

### Task 1: First request from nothing
1. Click the Add icon in the workbench to open a new tab.
2. Type the URL (`postman-echo.com/get`).
3. Click Send.
4. Read the response in the lower pane.

Inputs: 3
Prerequisites: install the desktop app; at first launch, choose to continue with the lightweight API Client instead of signing in (one click, inferred).
Source: https://learning.postman.com/docs/getting-started/first-steps/sending-the-first-request/ (accessed 2026-11-04); https://learning.postman.com/docs/getting-started/basics/using-api-client/ (accessed 2026-11-04).
Notes: Method defaults to GET. Saving the request to a collection needs sign-in.

### Task 2: Import a Postman collection with scripts and run it
Import:
1. Click the import icon ("Use resources or import").
2. Select the Import tab.
3. Choose the collection file: system dialog, open and pick (2). Drag and drop or pasted text also work.
4. Wait for "Import Complete"; the collection is in the sidebar.

Run:
5. Click Items in the sidebar.
6. Click Collections, then select the collection (2).
7. Click Run.
8. Under Run type select Functional, then Local (2).
9. Click Start run.

Inputs: 11 (import 4, run 7). Functional and Local may already be chosen (inferred), which would make it 9.
Prerequisites: signed in, in a workspace (the lightweight client has no collections).
Source: https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data/ (accessed 2026-11-04); https://learning.postman.com/docs/collections/running-collections/intro-to-collection-runs/ (accessed 2026-11-04).
Notes: The import page says nothing about scripts. No review or approval step for imported scripts is documented: they run on the first send or run. Collection v1 files are refused. Free plan: five imports a minute when each is over 500 KB. Run details live only for the session; "signing out or refreshing the browser" removes them.

### Task 3: Add an environment and switch to it
1. Click the Add icon in the sidebar, select Environments (2).
2. Enter a name (1).
3. Enter a variable name and its value (2). Changes save themselves.
4. Choose the environment in the environment selector at the top right: open, pick (2, inferred as two clicks).

Inputs: 7
Prerequisites: signed in, in a workspace.
Source: https://learning.postman.com/docs/sending-requests/variables/managing-environments/ (accessed 2026-11-04).
Notes: v12 names the values "local value" and "shared value" (not initial/current). Local value: "the value isn't synced to the Postman Cloud or shared with your teammates"; it is the one used when sending. Shared value syncs to the Postman Cloud and needs Editor access. A variable can be marked Secure; the page does not say how that is stored.

### Task 4: Use a secret without it touching disk
1. Open a workspace.
2. Click Vault in the footer, select Local Vault (2).
3. First time: save or download the vault key (1, inferred), click Open Vault (1).
4. In an empty row enter Key and Value (2); Allowed domains optional.
5. In the request, type `{{vault:name}}` in any field that takes variables (1).
6. Click Send (1).

Inputs: 8 (from an open request; the key is stored in the OS password manager by default, so later opens skip step 3).
Prerequisites: signed in, in a workspace.
Source: https://learning.postman.com/docs/use/postman-vault/postman-vault-key.md (accessed 2026-11-04); https://learning.postman.com/docs/use/postman-vault/manage-vault-secrets.md (accessed 2026-11-04); https://learning.postman.com/docs/use/postman-vault/use-vault-secrets.md (accessed 2026-11-04); https://learning.postman.com/latest-v-12/docs/use/postman-vault/manage-vault-secrets (accessed 2026-11-04); https://learning.postman.com/docs/sending-requests/postman-vault/postman-vault-secrets/ (accessed 2026-11-04).
Notes on what is stored where, as the docs say it:
- Local Vault: "Only you can access vault secrets in your Postman Local Vault, and they aren't synced to the Postman Cloud." They are "restricted to the Postman app and machine where you created them". Encrypted with AES, 256-bit key. The docs do not say where on the machine, so a local, encrypted copy is on disk.
- Vault key: "Your vault key isn't synced to the Postman Cloud." Saved to the OS password manager by default (opt out with a checkbox). In the web app the Desktop Agent is needed for that.
- "Vault secrets aren't preserved in your Postman Local Vault when you sign out of Postman."
- Shared Vault: secrets are in the Postman Cloud, scoped per teammate.
- External vaults: Postman stores a reference and fetches the value on use (desktop app only).
- Console: "Vault secrets stored in your Postman Local Vault are masked by default when they're logged to the Postman Console" (Settings > Mask vault secrets turns this off).
- Not supported with vault secrets: scheduled runs, monitors, Postman CLI, Newman. Safari deletes local vault secrets after seven days of inactivity.
- So nothing in Postman keeps a secret off disk entirely: the closest is the Local Vault (encrypted on the machine, not synced), or an environment local value (not synced, storage not described).

### Task 5: Find why a request failed
General: when Postman cannot send a request or gets no response, "You'll get an error message if Postman isn't able to send your request. This message includes an overview of the issue." The message has a "Debug with AI" button (opens Agent Mode). Details are in the Console: click Console in the footer, or Cmd+Option+C / Ctrl+Alt+C for a separate window. The Console logs "The primary request that was sent, including all underlying request headers, variable values, and redirects", proxy and certificates, IP addresses, ciphers and protocols, script logs, and "The raw response sent by the server before it's processed by Postman". It keeps 5,000 messages and 24 hours, locally.
Source: https://learning.postman.com/docs/use/send-requests/response-data/troubleshooting-api-requests.md (accessed 2026-11-04); https://learning.postman.com/latest-v-12/docs/use/send-requests/response-data/troubleshooting-api-requests (accessed 2026-11-04); https://learning.postman.com/docs/sending-requests/response-data/troubleshooting-api-requests/ (accessed 2026-11-04).

#### CORS
- Desktop app: requests do not go through a browser, so CORS does not apply.
- Web app: the docs say only "If the Postman web app fails to send your request, you may be experiencing a cross-origin resource sharing (CORS) error" and "Make sure you're using the best Postman Agent for your request." No error text is documented, and the docs do not say the screen names CORS as the cause; the wording ("may be") leaves the person to infer it.
- Inputs: not documented (the docs give no step that ends with the cause named). If the agent is switched: footer agent selector, pick an agent, Send again: 3 (inferred).

#### DNS
- The docs quote no error text (no "ENOTFOUND", no "Could not send request" on any fetched page). Advice: "check your connection by opening a page in your web browser"; the Console has the details.
- Whether the cause is named on screen: not documented.
- Inputs: read the error overview (0), click Console (1), expand the request's entry (1, inferred) = 2 (inferred).

#### 401
- A 401 is a response, not a failure to send: the status code is shown; "Hovering over the code shows a short description of it" (https://learning.postman.com/docs/use/send-requests/response-data/responses, accessed 2026-11-04). The troubleshooting page does not cover 401.
- The cause (missing or wrong credential) is not named by the product per its docs; the person reads the sent headers in the Console to find it.
- Inputs: 0 to see "401"; Console and expand to see the Authorization header as sent: 2 (inferred).

### Task 6: Send the same request to a teammate
1. In the sidebar, open the collection holding the request.
2. Click View more actions next to the request, then Share (2).
3. Enter the teammate's name, email or group (1).
4. Choose Viewer or Editor (1, inferred one click; inherited from the collection).
5. Optional: Include environment.
6. Click Invite (1). Postman emails them.

Or: View more actions, Copy link (2), then paste in another app.
Inputs: 5 (invite, from the open collection); 2 (copy link, plus pasting outside Postman).
Prerequisites: signed in; the request saved in a collection in a workspace the teammate can join. A person outside the team is asked to request to join, and an Admin approves. Free seats or Auto-Flex are needed to add members. Sharing a request with its response needs an internal or Partner workspace and Save Responses on in History.
Source: https://learning.postman.com/latest-v-12/docs/collaborating-in-postman/sharing (accessed 2026-11-04); https://learning.postman.com/latest-v-12/docs/use/send-requests/create-requests/request-basics (accessed 2026-11-04).
Notes: A shared request goes through the Postman Cloud; no local file hand-off is documented on these pages (export exists but is not the documented share path).

### Task 7: Run a collection with a data file and read the report
1. Click Items, expand Collections, select the collection (3).
2. Click Run (1).
3. Select Functional, then Local (2).
4. Click the Iteration data dropdown, select the Datafiles tab (2).
5. Click Select from computer and choose the CSV or JSON file: open, pick (2).
6. Preview the file (0).
7. Click Start run (1).
8. Read the results: the summary (Source, Environment, Iterations, Duration, All tests, Errors, Avg. Resp. Time) is on screen at once; filters All, Passed, Failed, Skipped, Errors, Console log; requests grouped by "Iteration N".

Inputs: 11
Prerequisites: signed in, in a workspace. "Save to Workspace" uploads the file to the Postman Cloud (Editor role, under 5 MB); a local pick is not uploaded per the page.
Source: https://learning.postman.com/docs/collections/running-collections/working-with-data-files/ (accessed 2026-11-04); https://learning.postman.com/docs/collections/running-collections/intro-to-collection-runs/ (accessed 2026-11-04).
Notes: Errors are badged NETWORK, REQUEST or SCRIPT, apart from failed tests. Response bodies kept only under 300 KB and only for the session. Only the person who ran it sees request and response details. Exporting results is desktop only. The data-file page does not describe the per-iteration view; the iteration grouping is from the run-results screenshot.

### Task 8: Find a request sent last week
1. Click the History tab in the sidebar (1).
2. Type in the History search bar (1, inferred: the v12 page names "the History search bar" but not what it matches).
3. Click the entry to open it in a new tab (1).

Inputs: 3 (inferred)
Prerequisites: none for history itself (the lightweight client has history); "When you're signed in to Postman, your history syncs across your devices."
Source: https://learning.postman.com/latest-v-12/docs/getting-started/basics/navigating-postman.md (accessed 2026-11-04); https://learning.postman.com/latest-v-12/docs/getting-started/basics/navigating-postman (accessed 2026-11-04).
Notes: No retention period, no date grouping and no date filter is documented. Responses are kept in history only with Save Responses turned on beforehand, and never for Collection Runner requests. A collection run is one summary entry, not its requests. The Console, which holds the request as sent, keeps only 24 hours, so last week's sent headers are not available.

### Screenshots
All on assets.postman.com, in the v12 docs. All light theme. No dark-theme screenshot was found on any docs page fetched (the theme settings page has none). Descriptions of the first four come from viewing the images.

1. (a) light. https://assets.postman.com/postman-docs/v12/send-first-request.png. Page: https://learning.postman.com/docs/getting-started/first-steps/sending-the-first-request/ (accessed 2026-11-04). Alt "Sending a request". A GET to postman-echo.com/get: method and URL bar, Send, tabs Docs/Params/Authorization/Headers 8/Body/Scripts/Settings, "No environment" selector; response bar "200 OK · 208 ms · 1.26 KB" and a globe (network) icon, JSON body. The echoed body lists the headers the server received; the app itself shows no sent request, route or secrets.
2. (a)+(b) light. https://assets.postman.com/postman-docs/v12/workspace-diagram-02-28-26-v2.png. Page: https://learning.postman.com/latest-v-12/docs/getting-started/basics/navigating-postman (accessed 2026-11-04; filename suggests 2026-02-28). Alt "Postman app". Whole window labelled Sidebar, Header, Workbench, Right Sidebar, Footer. Sidebar shows COLLECTIONS as a tree (Postman Echo > HTTP Methods > GET/POST/PUT/PATCH/DEL requests, method tags), then ENVIRONMENTS, SPECS, SDKS, FLOWS. Request URL `{{baseUrl}}/get?hello=hello&world=world` shows the variable unresolved; response "200 OK · 144 ms · 997 B" and network icon. Right sidebar is the AI pane. Footer: Switch to Local, Console, Terminal, Globals, Vault, Tools. No agent name on the main screen.
3. (a) light, detail. https://assets.postman.com/postman-docs/v12/https-network-info-response-12-3.png. Page: https://learning.postman.com/docs/use/send-requests/response-data/responses (accessed 2026-11-04). Alt "Hover over network icon for information". The hover popover "Network": Agent "Desktop Agent", HTTP Version 2.0, local and remote address (blurred), TLS Protocol TLSv1.3, cipher, certificate CN, issuer, valid until. This is the one place on the main screen that names the route, and only on hover.
4. (c) light. https://assets.postman.com/postman-docs/v12/intro-to-collection-runs-debug-v12-01.png. Page: https://learning.postman.com/docs/collections/running-collections/intro-to-collection-runs/ (accessed 2026-11-04). Alt "Collection Runner results". "Postman Echo Collection - Run results": summary row (Source Runner, Environment Base, Iterations 1, Duration 1s 458ms, All tests 5, Errors 0, Avg. Resp. Time 106 ms); filters All 5 / Passed 2 / Failed 3 / Skipped / Errors / Console log; "Iteration 1" list with method, folder path, URL, status chip, PASS/FAIL and assertion text; a selected request opens with Response / Headers / Request tabs. The Request tab is a per-request record of what was sent in a run (content not shown).
5. (c) light. https://assets.postman.com/postman-docs/v12/collection-run-errors-v12-01.png. Same page. Alt "Collection Runner errors". Not viewed; per the page, the Errors tab with NETWORK/REQUEST/SCRIPT badges.
6. (c) light. https://assets.postman.com/postman-docs/v12/collection-run-tab-v12-01.png. Same page. Alt "Past runs tab". Not viewed; per the page, run history with start time, duration, test counts and average response time.
7. (a) light. https://assets.postman.com/postman-docs/v12/echo-request.png. Page: https://learning.postman.com/latest-v-12/docs/use/send-requests/create-requests/request-basics (accessed 2026-11-04). Alt "New Request". Not viewed.
8. (a) light, detail. https://assets.postman.com/postman-docs/v12/response-code-v12-3.png and https://assets.postman.com/postman-docs/v12/response-time-v12-3.png. Page: https://learning.postman.com/docs/use/send-requests/response-data/responses (accessed 2026-11-04). Hover on the status code (description) and on the time (phase graph; the page's alt text for it is wrong). Not viewed.
9. Other: https://assets.postman.com/postman-docs/v12/environment-selector.png, https://assets.postman.com/postman-docs/v12/environment-set-active.png (https://learning.postman.com/docs/sending-requests/variables/managing-environments/, accessed 2026-11-04). Not viewed.

### Exchange record
- Resolved request as sent: not on the main screen. The URL bar keeps `{{variables}}` (screenshot 2). The resolved headers, variable values and redirects are in the Console, a footer panel or separate window, kept 24 hours (troubleshooting page). In a collection run, each request has a Request tab beside Response and Headers (screenshot 4).
- Route: shown only on hover, in the network popover beside status/time/size: "Agent: Desktop Agent" (screenshot 3). The agent selector is in the footer of the web app (about-postman-agent page). The response page's text does not mention the agent; the screenshot does.
- Secrets used: not shown on the main screen per any page fetched. Local Vault values are masked in the Console by default (use-vault-secrets page). No page says which secrets a send used.
- Evidence: https://learning.postman.com/docs/use/send-requests/response-data/troubleshooting-api-requests.md, https://learning.postman.com/docs/use/send-requests/response-data/responses, https://learning.postman.com/latest-v-12/docs/getting-started/basics/about-postman-agent, https://learning.postman.com/docs/use/postman-vault/use-vault-secrets.md, https://learning.postman.com/latest-v-12/docs/getting-started/basics/navigating-postman (all accessed 2026-11-04).


## Bruno

Version: v4.3.0, released 22 October 2026. Changelog: https://www.usebruno.com/changelog (accessed 2026-11-04). Earlier: v4.2.1 (30 Sep 2026, security patch), v4.2.0 (23 Sep 2026). The docs' default pages are v4. The docs also keep `/v3/` and `/v2/` copies.

Prerequisites:
- A desktop app for macOS, Windows and Linux: DMG/PKG/Homebrew, EXE/MSI/Chocolatey/Winget/Scoop, AppImage/deb/rpm/APT/Flatpak/Snap. The install page names no web app. Source: https://docs.usebruno.com/get-started/bruno-basics/download (accessed 2026-11-04).
- No account: "No cloud sync. No account. No login." Source: https://www.usebruno.com/ (accessed 2026-11-04).
- Paid tiers: Open Source $0, Pro $6 per user a month, Ultimate $11 per user a month (both billed yearly). The pricing page lists "License Management", and Preferences has a licence pane (the `license-settings` image). Sources: https://www.usebruno.com/pricing and https://docs.usebruno.com/get-started/configure/settings (accessed 2026-11-04).
- The `bru` CLI is installed separately with `npm install -g @usebruno/cli`. It needs Node 18 or later, or Docker can be used instead. Source: https://docs.usebruno.com/bru-cli/installation (accessed 2026-11-04).
- Collections are folders on disk. The default folder is `~/Documents/bruno`. Source: https://docs.usebruno.com/get-started/bruno-basics/create-a-collection (accessed 2026-11-04).

### Task 1: First request from nothing

1. Open Bruno. It opens on the workspace Home.
2. Click `+` to create a request.
3. Type the URL.
4. Press Enter.
5. Send with ⌘ Enter or Ctrl Enter (the keybindings page).

Inputs: 4 (inferred). Steps 2–4 are as written. The create-request page does not name the send control. The send key comes from the keybindings page. If Enter in step 4 already sends, the count is 3.
Prerequisites: install the desktop app.
Source: https://docs.usebruno.com/get-started/bruno-basics/create-a-request (accessed 2026-11-04); https://docs.usebruno.com/get-started/configure/keybindings (accessed 2026-11-04).
Notes:
- v4 lets you make a request without a collection. When you save one with no collection open, Bruno creates a new collection by default. The page has "create request without a collection" images.
- Making a collection first is optional: `+`, Create Collection, name, an optional location, then Create (create-a-collection page).
- The response pane shows the body (Editor or Preview), headers, status code and Timeline. Source: https://docs.usebruno.com/send-requests/res-data-cookies/res-data (accessed 2026-11-04).

### Task 2: Import a Postman collection with scripts and run it

1. Click Import Collection on the home screen. Or click `+` at the top left, then Import Collection: 1 more input.
2. Choose the format in the dialog. The docs list the formats but do not name the Postman option. The file can also be dropped in.
3. Browse to the `.json` file: open the dialog and pick the file (2).
4. Pick a destination folder (the blog says "pick a destination folder"): 2 if it is a system dialog (inferred).
5. Optional: Options, Show Advanced Options, Preserve scripts (keeps `pm.*` as it is). Off by default.
6. Click Import.
7. Run it: the collection's `···` menu, then Run. Or the Collection Runner icon in the top bar.
8. Click Run Collection to start.

Inputs: 9 (inferred): 1 + 2 + 2 + 1 for the import, then 3 for the run. Add 1 for the format choice if the dialog does not detect it. Add 1 if you start from the `+` menu.
Prerequisites: install the desktop app. Export the collection from Postman as Collection v2.1 JSON first, in Postman.
Source: https://docs.usebruno.com/get-started/import-export-data/import-collections (accessed 2026-11-04); https://docs.usebruno.com/get-started/import-export-data/postman-migration (accessed 2026-11-04); https://blog.usebruno.com/postman-to-bruno-script-conversion (7 Oct 2026); https://docs.usebruno.com/get-started/bruno-basics/run-a-collection (accessed 2026-11-04).
Notes:
- Bruno translates common `pm.*` calls into its own APIs on import (`pm.test`, `pm.environment`, `pm.globals`, `pm.collectionVariables`, `pm.response`).
- Calls it does not map stay in the script unchanged and throw when run: `pm.response.to.be.json`, `pm.response.reason()`, `pm.request.auth`, `pm.vault.*`.
- `postman-collection`, `newman` and `@postman/*` are not supported.
- `require()` packages trigger an Install packages prompt. Installing them needs npm on the PATH, and some need Developer Mode, which "can give scripts filesystem and system command access".
- Imported values become strings ("5000"). Secret values do not come across.
- The order scripts run in differs by default ("sandwich"). It can be set to sequential.
- The blog's way to find conversion errors is to run the collection and read the error text: "pm is not defined", "is not a function", "Cannot find module".
- Bulk import of a Postman data dump is Ultimate only.
- The Runner runs HTTP requests only, not gRPC or WebSocket.

### Task 3: Add an environment and switch to it

1. Click "No environment" at the top right. With no environments, Bruno asks you to create one.
2. Type a variable name.
3. Type its value.
4. Save.
5. Switch: open the environment selector at the top right and pick the environment (2).

Inputs: 6 (inferred: the page does not count the name and the confirm for a new environment, which would add about 2, making 8). ⌘E or Ctrl E opens "Edit environment".
Prerequisites: install the app, and have a collection open.
Source: https://docs.usebruno.com/variables/environment-variables (accessed 2026-11-04); https://docs.usebruno.com/get-started/configure/keybindings (accessed 2026-11-04).
Notes:
- Environments are files in the collection: `environments/<name>.bru` or `.yml`.
- The default environment is in `bruno.json` or `opencollection.yml`.
- v4.2.0 added an environment inheriting from a parent environment.
- Workspace Global Environments exist from v3.1.0.

### Task 4: Use a secret without it touching disk

Three documented mechanisms.

A. Secret variable (free). Steps:
1. Open the environment (⌘E).
2. Tick the variable's secret checkbox.
3. Save.

Inputs: 3 (inferred; the save is inferred). The value is on disk, encrypted. It is not in the collection's files. The docs say:
- "Bruno stores secrets on your local machine." The location "depends on the OS". The docs give no paths.
- "The secrets are encrypted using OS level encryption when available or falls back to AES256 encryption." The docs do not say how the AES key is kept.
- "Secret values are stored securely and are not saved to the environment file." The file keeps only the names: `vars:secret [ baseUrl ]` in BRU, `secret: true` in YAML.
- Secret variables are left out of an export. From v4.0.0 they have a tab of their own.

Source: https://docs.usebruno.com/secrets-management/secret-variables (accessed 2026-11-04); https://docs.usebruno.com/secrets-management/overview (accessed 2026-11-04).

B. `.env` file (free). You create it by hand at the root of the collection folder as `KEY=value` lines. You reference a value as `{{process.env.KEY}}`. It is a plain file on disk; the docs show only plain `KEY=value` lines and say nothing of encryption. The docs say: "Always add the `.env` file to your `.gitignore` file". To share the names, share a `.env.sample`. From v3.1.0 a Workspace Global Environment can be used for `process.env` values instead. Inputs: not counted: the file is made outside the app.
Source: https://docs.usebruno.com/secrets-management/dotenv-file (accessed 2026-11-04).

C. Secret manager (Ultimate only): HashiCorp Vault, AWS Secrets Manager, Azure Key Vault and Google Cloud Secret Manager.
- This is the only mechanism where the value is not stored on disk. The docs say: "Secrets are fetched on demand into a per-environment, in-memory cache for the active session."
- "Secret values are never written to disk — only provider config and secret identifiers are saved."
- "The cache clears when you close the app or collection."
- The v4.3.0 changelog says the same: external secrets are fetched on demand and kept in memory, not written to disk.
- The docs do not say where the provider's token (for example the Vault token) is kept.
- Setup steps are on subpages I did not fetch. Inputs: not counted.

Prerequisites: Ultimate licence; an account with the secret provider.
Source: https://docs.usebruno.com/secrets-management/secret-managers/overview (accessed 2026-11-04); https://docs.usebruno.com/secrets-management/secret-managers/hashicorp-vault/overview (accessed 2026-11-04); https://www.usebruno.com/changelog (accessed 2026-11-04).

Summary: free Bruno cannot keep a secret off disk. The secret variable is on disk, encrypted (OS-level encryption, or AES-256 as a fallback). The `.env` file is a plain file on disk. Only the paid secret-manager integration keeps the value in memory alone.

### Task 5: Find why a request failed

Tools the docs describe:
- The response pane: status code, headers, body, Timeline.
- The Timeline tab has three categories: Request, Response and Network Logs.
  - Request shows "what was sent": the full URL, params, body, request headers, "authentication details and credentials", and the variables used. The page calls these "the resolved request details" for each step.
  - Network Logs give "Network Timing - Breakdown of connection, DNS, SSL, and transfer times", protocol details and "debugging information".
  - Calls from scripts appear too, with filters: All, Request, Pre-Request, Post-Response.
- Dev Tools: an icon at the bottom right, next to cookies, with Console, Network, Performance and Terminal tabs. The Network tab is to "Identify network-related issues and errors".
- A script error shows as an inline card in the response pane, with the message, the code and a stack trace.

Sources: https://docs.usebruno.com/debugging/timeline (accessed 2026-11-04); https://docs.usebruno.com/debugging/dev-tools (accessed 2026-11-04); https://docs.usebruno.com/send-requests/res-data-cookies/res-data (accessed 2026-11-04).

#### CORS

Not documented. The docs index (https://docs.usebruno.com/llms.txt, accessed 2026-11-04) has no page on CORS. No Bruno page I fetched says CORS does not apply. Bruno is a desktop app (download page; no web app is named). Requests are not made by a browser page, so a browser's CORS rule would not stop them. That is inference, not a quoted source. Inputs: not applicable / not documented.

#### DNS

Not documented. No page says what Bruno shows when a name does not resolve (for example `ENOTFOUND`). The closest are:
- the Timeline's Network Logs, which give a DNS timing;
- Dev Tools' Network tab ("network-related issues and errors"), which the docs do not describe further.

The docs do not say the cause is named on screen. Inputs: not documented.

#### 401

1. After the send, the response pane shows the status code.
2. Click Timeline.
3. Open the Request category, which shows the request headers and "authentication details and credentials" as resolved.

Inputs: 1 to 2 (inferred): the Timeline tab, then the Request category. The status 401 is shown. No page says Bruno names why the server refused (for example a missing or expired token): the person has to read the sent headers and auth in the Timeline.
Prerequisites: none beyond the app.
Source: https://docs.usebruno.com/debugging/timeline (accessed 2026-11-04); https://docs.usebruno.com/send-requests/res-data-cookies/res-data (accessed 2026-11-04).

### Task 6: Send the same request to a teammate

Export file (free):
1. Hover over the collection.
2. Open its `···` menu.
3. Click Share.
4. Choose a format: Bruno Collection, Postman Collection or OpenAPI.
5. Pick a place to save the file (2, system dialog, inferred).

Inputs: 5 (inferred). Secret variables are left out of the export. The teammate imports the file with Import Collection. The export is the whole collection, not one request: no export of a single request is documented.
Source: https://docs.usebruno.com/get-started/import-export-data/export-collections (accessed 2026-11-04); https://blog.usebruno.com/share-bruno-collections (23 Sep 2026).

Git through the app's Git UI:
1. Git icon (1).
2. Initialize (1).
3. Quick Links, then Remotes, then Add Remote (3).
4. Type the remote's name (1).
5. Type its URL (1).
6. Save (1).
7. Add All Changes (1).
8. Commit Changes (1).
9. Type the message (1).
10. Commit (1).
11. Push (1).
12. Push to selected branch (1).

Inputs: 14. Prerequisites:
- an empty repository at a Git host;
- a Pro or Ultimate licence for remotes, commit and push. The free Git UI can initialise, diff, fetch, pull and clone. The blog says free users can do the rest with any Git client, since a collection is a plain folder.
- The teammate needs Bruno: Import Collection, the Git repository option, paste the URL, pick a location.

Source: https://docs.usebruno.com/git-integration/using-gui/provider (accessed 2026-11-04); https://blog.usebruno.com/share-bruno-collections (23 Sep 2026).

Other ways:
- Export Workspace makes a ZIP of several collections and the global environments.
- A "Fetch in Bruno" button (HTML or Markdown) links to a collection that is in Git and pushed.

There is no share link to a hosted copy; the collection stays in Git. Source: https://blog.usebruno.com/share-bruno-collections (23 Sep 2026).

### Task 7: Run a collection with a data file and read the report

In the app:
1. Click the runner icon in the right-hand navbar.
2. Choose the file type, CSV or JSON.
3. Upload the file: open the dialog and pick the file (2).
4. Click Run Collection.
5. Review each request's result and status.
6. Optional: Download Report saves `report.html`.

Inputs: 5 (the upload's 2 is inferred). Add 1 for Download Report.
Prerequisites: a Pro or Ultimate licence for data files ("Run with Parameters"). Downloading the HTML report needs Ultimate.
Source: https://docs.usebruno.com/testing/automate-test/data-driven-testing (accessed 2026-11-04).

With the CLI:
1. In the collection's root folder, run `bru run --reporter-html results.html --csv-file-path /path/to/file.csv`. Use `--json-file-path` for JSON. `--iteration-count`, `--env` and `--env-var` also exist.
2. Open `results.html` in a browser.

Inputs: 1, plus opening the report (not counted).
- Reporters: `--reporter-json`, `--reporter-junit` and `--reporter-html`, which can be combined.
- `--reporter-skip-headers`, `--reporter-skip-all-headers` and the skip-body flags leave parts out of the report.
- The options page and the reports page mark nothing as paid.

Prerequisites: install the CLI with npm and Node 18 or later.
Source: https://docs.usebruno.com/bru-cli/run/options (accessed 2026-11-04); https://docs.usebruno.com/bru-cli/run/reports (accessed 2026-11-04).

Notes: no page describes what the HTML report or the in-app result contains (pass/fail counts, timings) beyond "a visual representation of the test outcomes". The pages are https://docs.usebruno.com/get-started/bruno-basics/run-a-collection and https://docs.usebruno.com/testing/automate-test/automate-test (accessed 2026-11-04).

### Task 8: Find a request sent last week

1. Open a request (navigate to it, or create one).
2. Click the History icon at the top right.
3. Read the log: "a detailed log of all the requests you've executed and worked with within your collections".

Inputs: 2 (inferred), if you already know which request to open. The docs describe no search or date filter for history. They do not say where history is stored, how long it is kept, how many entries it holds, or whether it survives a restart. So finding "last week's" request is not documented beyond scrolling the log.
Prerequisites: the blog says the History tab is Pro or Ultimate. The pricing page as I fetched it seemed to show History in every tier, but its table lost its tick marks, so that is uncertain. Global search (⌘K) and sidebar search (⌘F) exist; the keybindings page does not say they search history.
Source: https://docs.usebruno.com/send-requests/history (accessed 2026-11-04); https://blog.usebruno.com/share-bruno-collections (23 Sep 2026); https://www.usebruno.com/pricing (accessed 2026-11-04); https://docs.usebruno.com/get-started/configure/keybindings (accessed 2026-11-04).

### Screenshots

Theme: I did not download or view the images, and no alt text names a theme. "Theme: not stated" means it was not checked.

- (a)+(b), theme not stated.
  Image: https://www.usebruno.com/_next/image?url=%2Fbruno-homepage-hero.png&w=3840&q=75 (src `/_next/image?url=%2Fbruno-homepage-hero.png…` on the homepage).
  Page: https://www.usebruno.com/. Date: accessed 2026-11-04.
  The alt text says: "a GitHub REST API collection in the sidebar, a GET request with its query parameters, and the JSON response returned 200 OK". It is the main screen with the sidebar, the request and the response. The alt text names no Timeline and nothing of the route or secrets.
- (a), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/k_zr3I3gL1BrG0vM/images/screenshots/send-request/res-data-and-cookie/res-data.webp?fit=max&auto=format&n=k_zr3I3gL1BrG0vM&q=85&s=eac8aaa42a624e3b52a8c041b327ecb6
  Page: https://docs.usebruno.com/send-requests/res-data-cookies/res-data. Date: accessed 2026-11-04.
  Alt text "Response Panel": the response pane with body, status and headers.
- (a), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/9NrSsDog68NYU7cH/images/screenshots/send-request/res-data-and-cookie/01-timeline.webp?fit=max&auto=format&n=9NrSsDog68NYU7cH&q=85&s=076dc89ab410802b267d2ded6d24163b
  Page: https://docs.usebruno.com/debugging/timeline. Date: accessed 2026-11-04.
  Alt text "Response Timeline": the Timeline tab, the record of the resolved request (URL, headers, auth, variables) and network timing.
- (a), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/9NrSsDog68NYU7cH/images/screenshots/send-request/res-data-and-cookie/res-timeline.webp?fit=max&auto=format&n=9NrSsDog68NYU7cH&q=85&s=e3a22a263076bfbc307b825a4969e84f
  Pages: https://docs.usebruno.com/debugging/timeline and the res-data page. Date: accessed 2026-11-04.
  Alt text "Script Logs in Timeline" / "Response Timeline": the Timeline with the calls scripts made, under filter tabs.
- (a), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/bxo1fiL7eYEAUlg7/images/screenshots/get-started/bruno-basics/create_request/after-req-create.webp?fit=max&auto=format&n=bxo1fiL7eYEAUlg7&q=85&s=689eb136738a037987dd7b573269080c
  Page: https://docs.usebruno.com/get-started/bruno-basics/create-a-request. Date: accessed 2026-11-04.
  Alt text "Request tab after creating from home": a new request tab in the v4 workspace.
- (b), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/K-YsMv4Crp6p2uFR/images/screenshots/get-started/bruno-basics/run_collection/run_collection.webp?fit=max&auto=format&n=K-YsMv4Crp6p2uFR&q=85&s=68fb4976a846c2f37c45f57d9c9490f5
  Page: https://docs.usebruno.com/get-started/bruno-basics/run-a-collection. Date: accessed 2026-11-04.
  Alt text "Click Run from collection menu": the sidebar's collection tree with the `···` menu open.
- (b), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/lK4oxIJsFt1GYUhN/images/screenshots/homepage.webp?fit=max&auto=format&n=lK4oxIJsFt1GYUhN&q=85&s=08a03edf20edc82fa2c48e06942f51dc
  Page: https://docs.usebruno.com/send-requests/overview. Date: accessed 2026-11-04.
  Alt text "homepage": the app's home screen with the sidebar.
- (c), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/RIZZUa4STb33tpjE/images/screenshots/get-started/bruno-basics/run_collection/runner.webp?fit=max&auto=format&n=RIZZUa4STb33tpjE&q=85&s=e1237a15ec85c188490c5320cc0b43e7
  Pages: https://docs.usebruno.com/get-started/bruno-basics/run-a-collection and the data-driven-testing page. Date: accessed 2026-11-04.
  Alt text "Collection Runner": the Runner's pane.
- (c), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/RIZZUa4STb33tpjE/images/screenshots/collection-runner/data-driven-testing/4-req-result.webp?fit=max&auto=format&n=RIZZUa4STb33tpjE&q=85&s=758301a287933c92eded52a872a1a6b3
  Page: https://docs.usebruno.com/testing/automate-test/data-driven-testing. Date: accessed 2026-11-04.
  Alt text "Request Results": the results of a run with a data file, request by request.
- (c), theme not stated.
  Image: https://mintcdn.com/bruno-a6972042/coTQlNiOALulIY4J/images/screenshots/collection-runner/data-driven-testing/5-variable-usage.webp?fit=max&auto=format&n=coTQlNiOALulIY4J&q=85&s=b1fcd8e05ae8777af218430ec024de53
  Page: same. Date: accessed 2026-11-04.
  Alt text "Variable Usage": how the data file's values were used in a run.
- Theme references: Preferences has Dark, Light and System modes and several themes. v4.3.0 added Dracula, Gruvbox and Cyberdream.
  Images: https://mintcdn.com/bruno-a6972042/K-YsMv4Crp6p2uFR/images/screenshots/get-started/config/settings/display-settings.webp?fit=max&auto=format&n=K-YsMv4Crp6p2uFR&q=85&s=292476b9234e329e6d250d2823b0df7f and https://mintcdn.com/bruno-a6972042/K-YsMv4Crp6p2uFR/images/screenshots/get-started/config/settings/themes.webp?fit=max&auto=format&n=K-YsMv4Crp6p2uFR&q=85&s=50c7232a532ead55a7da1d79904c3c29
  Page: https://docs.usebruno.com/get-started/configure/settings. Date: accessed 2026-11-04.
  These are settings panes, not the main screen.

No dark and light pair of the same main screen was found on the homepage, the docs or the blog posts I fetched. The homepage has no runner screenshot. The blog posts I fetched (sharing, Postman conversion) have no app screenshots.

### Exchange record

- Resolved request as sent: yes, one tab away, not on the main screen by default. The Timeline tab in the response pane shows "the resolved request details". Its Request category holds the full URL, params, body, request headers, "authentication details and credentials" and the variables used. Calls made by scripts are listed beside it, with filters. Network Logs give the DNS, connection, SSL and transfer times and the protocol. Source: https://docs.usebruno.com/debugging/timeline (accessed 2026-11-04).
- Route (direct or proxy): no. The proxy docs say nothing about a response or the Timeline showing whether a proxy was used. To check, they say: "send a request to a service that returns your public IP address." Proxy settings are in Preferences (Off, On, System Proxy, PAC) and can be overridden per collection. System Proxy has been the default since v3.1.0. Source: https://docs.usebruno.com/get-started/configure/proxy-config (accessed 2026-11-04).
- Secrets used: not documented. The Timeline page names "credentials" among what it shows. It does not say whether a secret is masked there, or that it marks which values came from secrets. Source: https://docs.usebruno.com/debugging/timeline (accessed 2026-11-04).


## Yaak

Version: 2026.9.0, released 10 October 2026, is the newest entry on the changelog index. The 2026.9.0 page also lists a 2026.9.1 patch with no date: it updates the bundled Node.js runtime and HTTP engine for a Brotli CVE. Sources: https://yaak.app/changelog and https://yaak.app/changelog/2026.9.0 (accessed 2026-11-04).

Prerequisites:
- A desktop app for macOS, Windows and Linux: "Yaak is a desktop application available for macOS, Windows, and Linux." Source: https://yaak.app/docs/getting-started/installation (accessed 2026-11-04).
- No account to use it: "no account is required to use the app." Source: https://yaak.app/docs/getting-started/security-and-privacy (accessed 2026-11-04).
- Licence: "Yaak is free for personal use." "A license is only required when using Yaak at work." Individual $79 a year or $399 for life; Business $149 per user per year. A 30-day trial starts on first launch, with no sign-up. Paid licences are tied to a Yaak account. The code is MIT; the licence covers the prebuilt binaries only. Source: https://yaak.app/pricing (accessed 2026-11-04).
- There is also a browser version, "Yaak Web". It sends every request through a proxy "because browsers restrict direct API access", and it keeps the workspace and response history in the browser. Source: https://yaak.app/docs/getting-started/web-proxy (no date; footer © 2024–2026; accessed 2026-11-04). The rest of this file is about the desktop app.

### Task 1: First request from nothing

Steps:
1. New request: Cmd/Ctrl+N. Source: keyboard shortcuts page. HTTP is the default type.
2. Type the URL, with its protocol. The method defaults to GET.
3. Send: Cmd/Ctrl+Enter, or the Send button.

Inputs: 3 (inferred). The HTTP page gives no click path for "create a new request". Cmd+N comes from the shortcuts page, and I did not confirm that it creates an HTTP request without asking for a type. If it asks, count 4.
Prerequisites: desktop app installed. A first-run workspace may be needed; not documented.
Sources: https://yaak.app/docs/request-types/http-requests ; https://yaak.app/docs/getting-started/keyboard-shortcuts (accessed 2026-11-04).
Notes: the response panel shows the status, the duration and the size, with Body (Pretty/Raw, filter), Headers and Cookies tabs. Screenshots also show Request and Timeline tabs.

### Task 2: Import a Postman collection with scripts and run it

Steps (Yaak side; exporting from Postman is not counted):
1. Open the main menu.
2. Choose Import Data.
3. Choose the file: open the dialog, then pick the file (2). Dropping the file on the dialog, or typing a path or URL, is the other way.
4. Choose New Workspace.
5. Click Preview Import.
6. Click Apply Changes.
7. Click Done.
8. Optional, for an environment: repeat 1–7 with the environment file and Current Workspace (8 more). Then select the environment in the header (2).
9. "Run": right-click the folder, then Send All (2).

Inputs: 10 (8 to import, 2 for Send All). With one environment file, 20. "Send All" sends everything at once, not one after another: "Yaak has no collection runner UI."
Prerequisites: desktop app. Optional: the `yaak` CLI, for an ordered run.
Sources: https://yaak.app/docs/migration/postman ; https://yaak.app/docs/advanced/running-multiple-requests ; https://yaak.app/docs/templating/pre-post-request-scripting (accessed 2026-11-04).
Notes:
- Scripts are dropped. "Pre-request and test scripts, saved response examples, and authentication types Yaak doesn't support aren't imported." The page does not name `pm.*`. Postman's scripts are `pm.*`, so none of them survives the import.
- "Yaak does not currently support request scripting." "Scripting remains under consideration." Yaak points to templating instead: `response()` chaining, template functions and `secure()`. It also offers plugins that add custom template functions. There is a feedback post for scripting.
- Re-importing the same file or URL merges instead of making duplicates.
- An ordered run is CLI only: `yaak send <folder-id>`, with `--fail-fast`, `--environment` and `--verbose`. It prints "Send summary: 12 succeeded, 1 failed". The page does not say how to find the ID. No count is given for this path.

### Task 3: Add an environment and switch to it

Steps:
1. Open the environment editor: Cmd/Ctrl+Shift+E.
2. Create a sub-environment (one click; the docs give no click path).
3. Name it.
4. Add a variable name.
5. Add its value.
6. Close the editor.
7. Click the environment dropdown in the header.
8. Select the new environment.

Inputs: 8 (inferred). Steps 7–8 are documented: "Click the environment dropdown in the application header" and select the sub-environment. Steps 2–6 are inferred, because the page gives no click path for creating one.
Prerequisites: desktop app; a workspace.
Sources: https://yaak.app/docs/templating/environments-and-variables ; https://yaak.app/docs/getting-started/keyboard-shortcuts (accessed 2026-11-04).
Notes:
- Each workspace has a global environment that is always active, plus sub-environments. A sub-environment's variables apply only while it is the active one.
- Variables are written `${[ NAME ]}`, with autocomplete (Ctrl+Space).
- A folder can override variables (Folder > Settings > Variables).
- A sub-environment can have a colour, which shows in the header while it is active.

### Task 4: Use a secret without it touching disk

What the docs say is stored where:
- The master key: "A 32-byte master key is stored in the host OS keychain."
- The workspace key: 32 bytes, kept in Yaak's local database, encrypted with the master key. It is shown in Workspace Settings in a form like `YKV2DK-HT1MD0-...`. Another device needs it to read the encrypted values.
- The cipher is ChaCha20-Poly1305 with a 24-byte nonce (XChaCha20-Poly1305).
- Which values are encrypted: once encryption is on, sensitive fields are encrypted automatically: `Authorization` header values, auth passwords and environment variable values. Any other field can be wrapped in `secure(…)`.
- Everything is in one local SQLite database: "Yaak stores requests, environments, response history, and settings on your device in a local SQLite database." Encryption "protects selected values, not the entire database or response history."
- Since 2026.1.0, "request headers are now captured and stored" for each response. My inference: a secret that went out in a header is in the response history, in the database, and not encrypted. The docs do not say so in these words.
- Sync and export: an environment marked sharable goes into export and directory sync, and Yaak warns when such an environment holds unencrypted values. Environments are left out of directory sync by default.
- Secrets that are not stored in Yaak at all:
  - `keychain(service, account)` reads from the operating system's store: the macOS Login keychain, Windows Credential Manager, or the Linux Secret Service.
  - `1password.item(vault, item, field)` is read from 1Password "whenever the request is rendered". It needs a service-account token in the `1PASSWORD_TOKEN` environment variable. The page does not say whether the value is cached.
  - `prompt.text(label, store=none)` asks for the value at send time. The page does not explain the other `store` values.

Steps (encrypted environment variable):
1. Open Workspace Settings.
2. Turn on encryption.
3. Reveal and copy the workspace key, to keep it.
4. Open the environment editor: Cmd/Ctrl+Shift+E.
5. Type the value into an environment variable. It is encrypted automatically.

Inputs: 5 (inferred). The page lists what to do but not the clicks.
The keychain path (inferred):
1. Type the template tag.
2. Click the tag to configure it.
3. Enter the service.
4. Enter the account.
5. Close the editor.
That is 5 (inferred), and the secret must already be in the OS store.
Prerequisites: desktop app. For 1Password, a service account and an environment variable set before launch.
Sources: https://yaak.app/docs/collaboration/secrets-encryption ; https://yaak.app/docs/getting-started/security-and-privacy ; https://yaak.app/docs/templating/template-function-reference ; https://yaak.app/docs/templating/1password-vault-integration ; https://yaak.app/changelog/2026.1.0 (19 January 2026) (all accessed 2026-11-04).
Notes: Yaak's encrypted value is encrypted at rest, but it does touch disk as ciphertext. Only `keychain`, `1password` and `prompt` keep the value out of Yaak's own store, and even then the sent headers may be stored in history (inferred, as above).

### Task 5: Find why a request failed

None of the docs pages covers a failed request. The troubleshooting page covers the Web Inspector console, the app's log file (`yaak.log`, whose path is in Settings), crashes and missing previews. It says nothing on DNS, connection errors, CORS or 401. Source: https://yaak.app/docs/troubleshooting/troubleshooting (accessed 2026-11-04).

The Timeline tab (since 2026.1.0) shows the exchange like "curl -v in a GUI": request and response headers in collapsible sections, the redirect chain, DNS resolution timing, and a raw view. Source: https://yaak.app/changelog/2026.1.0 (19 January 2026).

#### CORS
Does not apply to the desktop app. No desktop doc mentions CORS, and the security page names none for the desktop app. Requests go from the app's own HTTP engine: the 2026.1.0 rewrite handles redirects, compression and cookies "inside Yaak".
Yaak Web sends through a proxy "because browsers restrict direct API access". It does not name CORS. So in either form the person does not meet a CORS failure.
Inputs: not applicable.
Sources: https://yaak.app/docs/getting-started/security-and-privacy ; https://yaak.app/docs/getting-started/web-proxy (accessed 2026-11-04).

#### DNS
The docs do not describe how a DNS failure is shown.
The only evidence of a connection error's wording is user reports, from before the 2026.1.0 rewrite:
- A raw library error: "error sending request → reqwest::Error { kind: Request, source: hyper_util::client::legacy::Error(Connect, ... kind: HostUnreachable, message: "No route to host"". On macOS the cause turned out to be a privacy setting (Local network), which a user found, not the app. Source: https://yaakapp.featurebase.app/p/unexpected-hostunreachable-error (posted 26 August 2025).
- "An existing connection was forcibly closed by the remote host" (os error 10054). Source: https://yaak.app/feedback/posts/executing-simple-get-domain-health-returns-error (27 March 2025; status Backlog).

The Timeline shows DNS timings, and workspace settings can override DNS. The docs do not say whether a failed lookup is named in plain words.
Steps: send (1); read the error in the response pane; open Timeline (1).
Inputs: 2 (inferred). Whether the cause is named on screen is not documented. The evidence suggests a raw error string.

#### 401
The response header line shows the status code and text: screenshots show "201 Created" and "200 OK".
The Request tab and the Timeline show the request headers as sent, so the person can see whether `Authorization` went out, and with what value.
Steps: send (1); read the status (0); open Request or Timeline (1) to see what auth was sent.
Inputs: 2 (inferred). Yaak names the 401 status. No doc says that Yaak names why it happened, such as a missing token or an unresolved variable.
Sources: https://yaak.app/changelog/2026.1.0 (19 January 2026); https://yaak.app/docs/request-types/http-requests (accessed 2026-11-04).

### Task 6: Send the same request to a teammate

(a) Copy as cURL
1. Right-click the request in the sidebar, or open its actions menu.
2. Choose Copy as Curl.

Inputs: 2.
The docs do not say whether Copy as Curl resolves variables or includes auth: "Check the copied output before sharing it." The plugin's Generate Code Snippet does resolve them: "Template variables are resolved to their values, and configured authentication is written out as a header". A bearer token or Basic credential appears in the code. Generate Code Snippet takes 4 inputs: menu, Generate Code Snippet, choose language/library, Copy to Clipboard.
Sources: https://yaak.app/docs/advanced/code-snippets ; https://yaak.app/docs/collaboration/import-and-export-data (accessed 2026-11-04).

(b) Export
1. Open the main menu.
2. Choose Export Data.
3. Select the workspace.
4. Confirm.
5. Choose a folder: open the dialog, then pick (2).

Inputs: 6 (inferred: the confirm click is not written in the text).
The output is one JSON file per export, of whole workspaces. A single request cannot be exported as a file. The export dialog has a "private environment option".
Source: https://yaak.app/docs/collaboration/import-and-export-data (accessed 2026-11-04).

(c) Git sync
1. Open Workspace Settings.
2. Choose a sync directory: open the dialog, then pick (2).
3. Open the sync dropdown, then Initialize Git (2).
4. Commit: open the dropdown, choose Commit, select changes, type a message, commit (5, inferred).
5. Push: open the dropdown, then Push (2, inferred).

Inputs: about 12 (inferred). There is a built-in Git UI with branch, commit, push, pull and history, and a diff review.
- The teammate opens the shared folder: New Workspace > Open Folder.
- The files are one YAML file per resource, named `yaak.<id>.yaml`.
- Environments are left out unless marked sharable. Encrypted values need the workspace key on the other device.
Sources: https://yaak.app/docs/collaboration/local-directory-git-sync ; https://yaak.app/docs/collaboration/secrets-encryption (accessed 2026-11-04).

### Task 7: Run a collection with a data file and read the report

Cannot. "Yaak has no collection runner UI." "Data-driven runs over a CSV are not built yet."
- An iteration feature is tracked on the feedback board as "Data Runner". The post "Data Runner - Yaak Plugin" (YK-546), from 3 July 2025, is "Under Consideration". In it the maintainer said results "would appear in the existing response history in the order they were sent", and that plugin UI "won't be possible for a while".
- The docs' workaround is a shell loop over `yaak send`, with one environment per iteration.
- There is no report beyond the CLI's line "Send summary: N succeeded, M failed" (and bodies with `--verbose`).

Inputs: none (cannot).
Sources: https://yaak.app/docs/advanced/running-multiple-requests ; https://yaak.app/feedback/posts/data-runner-yaak-plugin (accessed 2026-11-04).

### Task 8: Find a request sent last week

Not documented. No docs page describes the response history: how to open it, how long it is kept, or how to search it.
What other sources show:
- The response pane has a history (clock) button at its top right, in the homepage and docs screenshot (my reading of the image).
- History is per request. There is no global history list or search in any page fetched.
- The 2026.7.0 "Filter History" recalls response filters. It is not a request history.
- Feedback post YK-375, "Save Request Data for Response History", from 28 February 2025, is "In Progress" since 1 July 2026. It says the history "does not store the request data in sync with the response data" and asks for timestamps on entries. The maintainer wrote on 6 September 2026: "request versioning is now being built". Each response will link to the request version that made it. Not yet released.
- Retention: not documented. The security page says nothing on a period, a limit or deletion.

Inputs: not documented.
Sources: https://yaak.app/docs/getting-started/security-and-privacy ; https://yaak.app/feedback/posts/save-request-data-for-response-history ; https://yaak.app/changelog (accessed 2026-11-04).

### Screenshots

- (a) light. Image: https://assets.yaak.app/uploads/hero-yaak-light-xgmsn_2080x1200.webp
  - Page: https://yaak.app/ (also https://yaak.app/docs/request-types/http-requests).
  - Date: accessed 2026-11-04.
  - Alt: "Yaak showing a project API request and its JSON response".
  - The header names the workspace and environment, "Acme API > Production". A POST to `base_url/projects` has a JSON body with `uuid.v4` and `timestamp.iso8601` template chips.
  - The response reads "201 Created • 184 ms • 398 B", with tabs Response, Request, Headers 0/1 and Cookies, and a history button.
  - The sidebar shows folders (Projects, Team members, Authentication, Webhooks) and each request's last status code. It has a git branch "main" with ahead/behind counts.
  - The main screen shows the template, not the resolved request. No route and no secrets used are shown.
- (a) dark. Image: https://assets.yaak.app/uploads/hero-yaak-dark-EQjks_2080x1200.webp
  - Page: https://yaak.app/ (theme toggle on the hero).
  - Date: accessed 2026-11-04.
  - The dark variant of the same hero, from the page's HTML. I did not view this image.
- (a) dark, Timeline. Image: https://i.yaak.app/iBa7pyhar8-G-p2jNPUZGi60Q0mYGU55AbmyXCd-9Ls/resize:fill:1000/format:webp/quality:90/plain/https%3A%2F%2Fassets.yaak.app%2Fuploads%2Ftimeline-tab_2096x1248.png
  - Page: https://yaak.app/changelog/2026.1.0.
  - Date: 19 January 2026.
  - Alt: "Timeline Tab".
  - The response pane, "200 OK • 2.4 s • 4 B", with tabs Response, Request, Headers 1/15, Cookies 2 and Timeline 39.
  - It is a time-stamped list of events:
    - settings (`redirects = true`, `timeout = Infinity`);
    - `GET /x/sleep/2000`;
    - the cookie header sent, with its value in full;
    - "Sending request to server";
    - `HTTP/1.1 301 Moved Permanently` and each response header;
    - "Ignoring the response body";
    - "Redirecting 301 …".
  - This is a record of what was sent, with resolved values in clear. No proxy or route line is visible. Secrets are not marked as such.
- (a) Request headers and request body. Images:
  - https://i.yaak.app/LsrGjEdGU_yD6YUK_nuLFEbGOIJf6z1j4pY3qxa3NTE/resize:fill:1000/format:webp/quality:90/plain/https%3A%2F%2Fassets.yaak.app%2Fuploads%2Fresponse-headers-1605x1100-iz9h_1605x1100.png (alt "Request headers")
  - https://i.yaak.app/czsNkitSyNIylwQKTId_Z2uhRhiKk8uSTdjr1Kkvs7A/resize:fill:1000/format:webp/quality:90/plain/https%3A%2F%2Fassets.yaak.app%2Fuploads%2Frequest-body-1608x874-ibr3-fW9JW_1608x874.png (alt "Request body")
  - Page: https://yaak.app/changelog/2026.1.0. Date: 19 January 2026.
  - These show the request as captured, in the response pane. Theme not checked.
- (a) DNS timings. Image: https://i.yaak.app/YRvQDHa7zmHntOHo2_K1qTAPyPrliQp5dh0Jh6SWaR8/resize:fill:1000/format:webp/quality:90/plain/https%3A%2F%2Fassets.yaak.app%2Fuploads%2Fdns-timings-Dzty1_1495x952.png
  - Page: https://yaak.app/changelog/2026.1.0. Date: 19 January 2026.
  - Alt: "DNS timings". DNS resolution timing in the Timeline. Not viewed.
- (b) light. The hero above is the clearest view of the collection tree: folders, method labels and last status per request.
- (b) light, environments. Image: https://assets.yaak.app/uploads/environments-yaak-light-4dNwp_1780x580.webp
  - Pages: https://yaak.app/docs/templating/environments-and-variables and the secrets page.
  - Date: accessed 2026-11-04.
  - Alt: "Environment variables". The environment editor, with global and encrypted values. Not viewed.
- (b) light, sync files. Image: https://assets.yaak.app/uploads/01946550-6fec-7b18-8eb7-6e345fa8a801-3ebcf0a7_1808x1296.png
  - Page: https://yaak.app/docs/collaboration/local-directory-git-sync.
  - Date: accessed 2026-11-04.
  - Caption: "Workspace resources appear as YAML files in the sync directory". Not viewed.
- (c) none. There is no collection runner, so there is no run report: https://yaak.app/docs/advanced/running-multiple-requests.

### Exchange record

- Resolved request as sent: yes, but in a secondary tab, not on the main screen. Since 2026.1.0 Yaak captures and stores the request headers. The response pane's Request tab and Timeline tab show them with values in clear, like `curl -v`, including the redirect chain and DNS timing. The main view shows the template (`base_url/projects` with chips) and the status line.
- Route: not shown. Proxy settings are global (system, custom or none). The proxy page says nothing of a marker in the response or timeline, and "Invalid proxy URLs are silently ignored". No screenshot shows a route.
- Secrets used: not shown. Nothing names which encrypted, keychain or 1Password values went into a send. The Timeline shows resolved header values in full (the cookie in the screenshot), so a secret would appear in clear there (inferred).

Evidence:
- https://yaak.app/changelog/2026.1.0
- https://yaak.app/docs/advanced/proxy-configuration
- https://yaak.app/docs/request-types/http-requests
- https://assets.yaak.app/uploads/hero-yaak-light-xgmsn_2080x1200.webp
- the Timeline image above


## Hoppscotch

Version: 2026.10.0, released 30 Oct 2026 (GitHub releases, https://github.com/hoppscotch/hoppscotch/releases, accessed 2026-11-04). The blog post "Hoppscotch v2026.10.0" is dated 29 Oct 2026 (https://hoppscotch.com/blog/hoppscotch-v2026-10-0). The CLI is the npm package `@hoppscotch/cli` and needs Node.js 22 or later (https://docs.hoppscotch.io/documentation/clients/cli/overview).

Prerequisites: none for basic use of the web app at hoppscotch.io. The first-request guide names no account or sign-in (https://docs.hoppscotch.io/documentation/getting-started/rest/creating-a-request). Workspaces, team sharing and share links need sign-in. The workspaces page says "Once you are logged into Hoppscotch, you can toggle between multiple workspaces" (https://docs.hoppscotch.io/documentation/features/workspaces.md). The app's English strings include "Login to view your shared requests or create a new one" (`empty.shared_requests_logout`, https://raw.githubusercontent.com/hoppscotch/hoppscotch/main/packages/hoppscotch-common/locales/en.json). A request to another origin from the web app needs an interceptor: the Hoppscotch Agent (a local app), a proxy, or the browser extension (https://docs.hoppscotch.io/documentation/features/interceptor). The desktop app is a separate install. The README says "Request entries are synced with your cloud/local session storage" and that sign-in syncs "Workspaces, History, Collections, Environments, and Settings" (https://github.com/hoppscotch/hoppscotch). No docs page I fetched says where the web app keeps data when no one is signed in. The security policy says browser local storage (see Task 4).

### Task 1: first request from nothing (web app, no account)
1. Open hoppscotch.io. REST is the default protocol.
2. Type the URL into the request URL field.
3. Choose the method from the dropdown. GET is the default, so this step needs no input for a GET.
4. Click Send.
5. Read the response.

Inputs: 2 (URL, Send). A method other than GET adds 2 (open the dropdown, pick).
Prerequisites: none. For a server that does not allow CORS from hoppscotch.io, an interceptor is needed first (Agent install and pairing, the extension, or a proxy; see Task 5).
Source: https://docs.hoppscotch.io/documentation/getting-started/rest/creating-a-request (no page date; accessed 2026-11-04).
Notes: the guide uses `https://echo.hoppscotch.io` as its practice endpoint. It does not mention the interceptor at all.

### Task 2: import a Postman collection with scripts and run it
Import:
1. Click Import in the collections section.
2. Click the "Import from Postman" tab.
3. Click "Choose file", then pick the JSON file in the system dialog.
4. Agree to import the scripts when asked. The docs say a prompt appears but do not describe it.
5. Click Import.

Run:
6. Right-click the collection and choose "Run Collection", or hover over it and click the Run Collection icon.
7. A tab opens with the run settings. Start the run. The vendor's screenshot shows a Run button.

Inputs: 9 (inferred in part). The count is Import 1, the Postman tab 1, the file 2, consent 1 (inferred), Import 1, then right-click 1, Run Collection 1, Run 1. Opening the collections sidebar first, if it is not already open, adds 1 (inferred).
Prerequisites: none for a file import in the web app.
Source: https://docs.hoppscotch.io/documentation/features/importer (no page date; accessed 2026-11-04); https://docs.hoppscotch.io/documentation/features/runner (no page date; accessed 2026-11-04).
Notes: what happens to pm.* scripts. The importer page says: "When importing Postman collections (v2.0/v2.1), Hoppscotch can now import pre-request scripts and test scripts as an experimental feature." It continues: "You'll be prompted to consent to this import during the process." The scripts run through "the `pm` namespace compatibility layer" with "Chai.js-powered assertions". The page lists no unsupported pm APIs. It does not say what happens if you decline. It also says "Advanced authorization setups and collection-level settings aren't imported." Hoppscotch's own script API is `pw.*` (environments page, CLI page).

### Task 3: add an environment and switch to it
1. Click the Environments icon in the sidebar.
2. Click "new".
3. Type the environment's name.
4. Add a variable: its name and its value.
5. Save. No save step is documented.
6. If there is more than one environment, select the one to use. The vendor's screenshot shows an environment selector above the request ("Twitter Environment" with a chevron).
7. Use the variable in a request as `<<name>>`.

Inputs: 8 (inferred in part). The count is the icon 1, new 1, name 1, variable name 1, value 1, save 1 (inferred), then open the selector 1 and pick 1 (both inferred from the screenshot, since the docs only say "select").
Prerequisites: none.
Source: https://docs.hoppscotch.io/documentation/getting-started/rest/environment-variables (no page date; accessed 2026-11-04); https://docs.hoppscotch.io/documentation/features/environments (no page date; accessed 2026-11-04).
Notes: each variable has an Initial Value ("used when the environment is first loaded") and a Current Value ("used when the environment is active"). In a shared workspace, regular variables "will be synced to the server". For a personal or global environment the user chooses whether it syncs.

### Task 4: use a secret without it touching disk
Steps: as in Task 3, with the variable created as a secret. The docs do not describe the control that marks a variable as secret.
Inputs: cannot. The product cannot keep a secret off disk, by its own security policy.
Prerequisites: none.
Source: https://docs.hoppscotch.io/support/security-policy (no page date; accessed 2026-11-04); https://docs.hoppscotch.io/documentation/features/environments; https://docs.hoppscotch.io/documentation/features/variables (both accessed 2026-11-04).
Notes. What each source says is stored where:
- Environments page: "The values of secret variables in any workspace will never be synced to the server or shared with any workspace members." Also: "All secret variable values in Hoppscotch will be masked using asterisks (***)." Secret values are not exported and not copied when an environment is duplicated. The page does not say where the value is kept.
- Security policy: "Secret environment variables are stored locally and never synced to the server." Also: "Environment variables marked as secret are kept in the client's local store", which is the desktop app's data store or the browser's local storage, depending on platform. They "follow the same local-data security posture as other credentials on that platform".
- Desktop app, per the same policy: it "persists collections, environments, request history, and credentials" on the device, "protected by OS-level access controls and, where enabled, full-disk encryption". The policy does not mention any encryption by the app itself.
- Under "Out of scope", the policy lists "Credentials, tokens, or API keys stored in local storage, the application data store, local log files" as expected behaviour.
- So "local" means on disk in plain storage: browser localStorage in the web app, the app's data store in the desktop app. Secrets are kept off the server, not off disk. No passphrase or vault is documented.
- Secret variables cannot be scoped to a request, only to an environment or globally (variables page).

### Task 5: find why a request failed
The docs describe no error screen per cause. The troubleshooting page mentions only "Something went wrong" and tells the user to open the browser console. The app's English strings (en.json) show what the screens say.

#### CORS
- Shown (en.json): a failed send gives "Could not send request" (`error.network_fail`) with "Unable to reach the API endpoint. Check your network connection or select a different Interceptor and try again." (`helpers.network_fail`). There is also an inspection string "Please check your Cross-Origin Resource Sharing configuration." (`inspections.response.cors_error`). The docs do not say when it shows.
- Is the cause named? Not in the docs. The troubleshooting page explains CORS as a cause ("the API is not sending the proper API headers (`Access-Control-Allow-Origin`)") and points to Proxyscotch or the extension. The interceptor page describes no message for a CORS block.
- Inputs: not documented. Inferred: the generic message names neither CORS nor DNS, and a browser gives the page the same error for both. The person has to open the console (F12 or the browser's menu) to tell them apart. That is outside the product.
- Sources: https://docs.hoppscotch.io/documentation/getting-started/troubleshooting.md; https://docs.hoppscotch.io/documentation/features/interceptor; en.json (all accessed 2026-11-04).

#### DNS
- Shown: the same "Could not send request" and "Unable to reach the API endpoint…" message (en.json). With the extension, the Agent or a proxy, other headings exist: "Network Error" with "Network connection failed. {message}: {cause}" (`error.network.*`), and "Proxy Error" (`error.proxy.*`). The docs do not say which interceptor gives which.
- Is the cause named? The docs do not cover DNS, "could not connect" or that message. The troubleshooting page's "Connectivity" section says only that the user "could be … experiencing connectivity issues".
- Inputs: not documented.
- Source: https://docs.hoppscotch.io/documentation/getting-started/troubleshooting.md; en.json (accessed 2026-11-04).

#### 401
- Shown: the response's status line, for example "Status: 401". The vendor screenshot shows "Status: 200 • OK", so a 401 would appear in the same place (inferred). Inspections show "an alert icon" when "a request section is not configured correctly", and "Clicking the alert icon opens the Inspections panel". en.json holds "Please check your authentication credentials." (`inspections.response.401_error`). The Inspections page does not mention 401.
- Is the cause named? The status code is on screen after the send. The docs do not say that anything explains it.
- Inputs: 0 beyond the send to read the status. Opening the Inspections panel adds 1 (inferred).
- Sources: https://docs.hoppscotch.io/documentation/features/inspections (accessed 2026-11-04); https://docs.hoppscotch.io/documentation/getting-started/rest/response-handling.md (accessed 2026-11-04); en.json.

### Task 6: send the same request to a teammate
Share link ("Share Request"):
1. Open the dropdown next to Save. For a saved request you can instead right-click it in the collection.
2. Choose "Share Request".
3. Choose "Link". The other options are Button and Embed.
4. Click Create.
5. Copy the link. Shared links are listed in the "Shared Requests" panel in the right sidebar.

Inputs: 5.
Prerequisites: sign-in. The app's string is "Login to view your shared requests or create a new one" (en.json). The docs pages do not say so directly.
Source: https://docs.hoppscotch.io/documentation/features/widgets.md; https://docs.hoppscotch.io/guides/articles/uplifting-web-experience-with-hoppscotch-widgets (both no page date; accessed 2026-11-04).
Notes:
- "Sharing a request does not provide others with access to your request." The link is a copy.
- Environment variables are not resolved. The docs say to share without variables or "replace them with their values first".
- en.json has a warning (`shared_requests.auth_warning`): "This request contains authentication credentials." It goes on to say that anyone with the link can read the credentials (tokens, passwords, API keys).
- The keyboard shortcuts page lists Ctrl/Cmd+U for generating and copying a request link. I saw this only in a search result and did not fetch the page.

Other routes:
- Workspace: create it with "+" in the workspace switcher, click Invite, enter an email. Inputs: 4 for the invite (inferred: +, name, Invite, email). The docs do not say how to move a request into the workspace. Needs sign-in. Source: https://docs.hoppscotch.io/documentation/features/workspaces.md.
- Export: in the collection's options, click Export and choose Hoppscotch, OpenAPI or Postman. Inputs: 3 (inferred: options, Export, format). This exports the collection, not one request. Source: https://docs.hoppscotch.io/documentation/features/collections.md.

### Task 7: run a collection with a data file and read the report
In the app's Collection Runner: cannot. The runner page lists Delay, "Stop Run if Error Occurs", "Persist Responses" and "Keep Variable Values". It mentions no iterations and no data file (https://docs.hoppscotch.io/documentation/features/runner, accessed 2026-11-04). The vendor's post on the runner (Hoppscotch on dev.to, 23 Jan 2025) does not mention them either.

CLI:
1. Export the collection to a file (see Task 6, 3 inputs, inferred).
2. Run `hopp test <collection.json> --iteration-data data.csv`, adding `--iteration-count N`, `-e env.json` and `--reporter-junit [path]` as needed.
3. Read the console summary, or the JUnit XML.

Inputs: 2 for the run (the command typed once, Enter). Exporting the file adds 3 (inferred). A collection on a Hoppscotch instance can be given by its ID instead, which needs a personal access token.
Prerequisites: Node.js 22 or later, build tools (node-gyp) on Windows and macOS, and `npm i -g @hoppscotch/cli`.
Source: https://docs.hoppscotch.io/documentation/clients/cli/overview (no page date; accessed 2026-11-04).
Notes:
- Only CSV is documented for `--iteration-data`. Each row is one iteration, and its values replace the matching environment variables.
- The console summary gives counts and durations for test cases, test suites, test scripts and requests, and the pre-request scripts. The command exits non-zero if any assertion fails.
- The JUnit report has one `<testsuite>` per request and one `<testcase>` per `pw.expect()`. Request errors go in `<system-err>`.
- The in-app runner's report shows the collection, environment, duration and average response time, then each request's status and its tests. Response headers and bodies are kept only with Persist Responses.

### Task 8: find a request sent last week
1. Click the History icon on the side panel.
2. Optionally, click Filter and choose Favorites.
3. Find the request in the list and click it.

Inputs: 2 (History, the request), plus scrolling. The docs describe no text search and no date grouping.
Prerequisites: none. Sign-in syncs history across devices (README).
Source: https://docs.hoppscotch.io/documentation/features/history (no page date; accessed 2026-11-04).
Notes:
- Retention and any limit on entries are not documented.
- A send saves the request to history automatically.
- A self-hosting organisation's admin can turn history off. The app's string is "History is disabled. Contact your organization admin to enable history" (en.json).
- On a self-hosted instance, history is kept in PostgreSQL (security policy). The desktop app keeps it on the device.

### Screenshots
- (a) and (b), dark. https://hoppscotch.com/images/hero-screenshot.png on https://hoppscotch.com (accessed 2026-11-04). Alt text: "Screenshot". It shows the whole app. A GET to https://echo.hoppscotch.io is in a tab, with "Twitter Environment" chosen above it. Below are the Parameters, Body, Headers, Authorization, Pre-request Script and Tests tabs. The response shows "Status: 200 • OK, Time: 2235 ms, Size: 1.49 KB" and the tabs JSON, Raw, Headers (2) and Test Results. The right sidebar is a collection tree ("Twitter API v2", requests with coloured method labels) under a team workspace breadcrumb. The body happens to list the headers the server received, because echo returns them. That is the server's echo, not a record kept by the app. Nothing on screen shows the interceptor used or the variables resolved.
- (a) and (b), light. https://mintcdn.com/hoppscotch/WCaaGbVhL02n1fVh/images/hoppscotch-light.png?fit=max&auto=format&n=WCaaGbVhL02n1fVh&q=85&s=c4d7d5571a6a500ddaa3194486100a3c on https://docs.hoppscotch.io/documentation/clients/web/overview.md (no alt text; accessed 2026-11-04). It is the same layout in the light theme: an "Echo Server" tab, a green Send button, "Status: 200 • OK, Time: 728 ms, Size: 1.44 KB", the JSON body and the collection tree on the right. The status bar holds a Cookies button and "Help & feedback". No interceptor or route is shown, and there is no view of the request as sent.
- (c), dark (marketing composite). https://media2.dev.to/dynamic/image/width=800%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fkobi3o2x6a7d7vmnrkc7.png, alt "Web-based Collection Runner". It is on https://dev.to/hoppscotch/optimize-api-testing-with-hoppscotch-cli-and-web-based-collection-runners-17nm, Hoppscotch's own account on dev.to, posted 23 Jan 2025. The run report header shows the collection, the environment ("quotes-env"), duration 201ms and average response time 40ms, with tabs All Tests, Passed and Failed. Each request appears as written, `<<base_url>>/<<path>>`, not resolved, with a 200 badge and its tests ("Expected '200' to be '200' — test passed"). An "Environments" row shows a variable's change (`id — 3 ← 2`). Over it sits a "Run collection" dialog with Delay, "Stop run if an error occurs" and "Persist responses".
- (c), CLI. https://media2.dev.to/dynamic/image/width=800%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fzzkomi3oquapebcyo35v.png, alt "CLI Based Collection Runner", on the same post (23 Jan 2025). Not viewed. The post places it after the `hopp test` command.
- Other: https://mintcdn.com/hoppscotch/WCaaGbVhL02n1fVh/images/browser-extension-enable-2-light.png?fit=max&auto=format&n=WCaaGbVhL02n1fVh&q=85&s=9c2e7b3303756ea4ab1c5514e2a86244 on https://docs.hoppscotch.io/documentation/features/interceptor (light, accessed 2026-11-04). The docs say it shows the interceptor menu with the middleware changed to the browser extension. Not viewed. This is the only place the route is chosen and shown, as a setting rather than per response.
- Not found: a separate collection-tree image on the vendor's site. The homepage's `/images/feature-collections-folders.png` is a white glyph, not a screenshot.

### Exchange record
No. Per the docs and the vendor's screenshots, the main screen shows the response's status, time and size, the body (JSON or Raw), the response headers and the test results. The response-handling page describes no view of the request as sent, no timeline and no network details (https://docs.hoppscotch.io/documentation/getting-started/rest/response-handling.md).

Route: the interceptor (browser, proxy, extension or Agent) is chosen in Settings > Interceptors or in the interceptor menu (https://docs.hoppscotch.io/documentation/features/interceptor). Nothing documented records which one carried a given response. The light and dark app screenshots show no route on the response.

Secrets: secret values are masked with asterisks in the environment (https://docs.hoppscotch.io/documentation/features/environments). Nothing documented lists which secrets a send used.

The runner's report shows requests with their `<<variables>>` unresolved, and the variables' changes, but not the headers as sent (dev.to runner image above). The share-link warning in en.json shows that credentials travel in the request's own fields.

Evidence: https://hoppscotch.com/images/hero-screenshot.png; the hoppscotch-light.png docs image; https://docs.hoppscotch.io/documentation/getting-started/rest/response-handling.md; https://docs.hoppscotch.io/documentation/features/interceptor.


## Insomnia

Version: 13.4.0, released 29 October 2026 and marked "Latest" on GitHub (https://github.com/Kong/insomnia/releases, accessed 2026-11-04). The vendor's home page announces "Insomnia 13 GA", dated 16 June 2026 (https://insomnia.rest/, accessed 2026-11-04). The docs give no version number on their pages. They refer to features "in 13.2", "in 13.3" and "since Insomnia 13.3", so they describe the 13.x line.

Prerequisites: a desktop app. The docs call Insomnia "an open-source desktop client" and name no web version (https://developer.konghq.com/insomnia/insomnia-vs-postman.md, accessed 2026-11-04). No account is needed for the Scratch Pad: you click "Use the local Scratch Pad" at the bottom of the login screen, and its data stays on the device (https://developer.konghq.com/insomnia/storage/, accessed 2026-11-04). An account (sign-up at app.insomnia.rest) is needed for Cloud Sync, for organisations and for "Run in Insomnia" links (https://developer.konghq.com/insomnia/accounts.md; https://developer.konghq.com/insomnia/run-in-insomnia.md, both accessed 2026-11-04). Git Sync needs Git credentials. On the Essentials plan it is limited to 3 users per organisation (storage page).

Storage choices (storage page):
- Scratch Pad: local only, no login.
- Local Vault: on the device, or in Git through Git Sync.
- Cloud Sync: Insomnia Cloud, end-to-end encrypted, needs login.
- Git Sync: a third-party Git repository.

The data-security page says local project data is stored "on disk in raw form" and "Local data is not encrypted on disk" (https://developer.konghq.com/insomnia/data-security.md, accessed 2026-11-04).

### Task 1: First request from nothing
Steps (https://developer.konghq.com/insomnia/requests/):
1. Click **Create** in the project.
2. Click **Request collection**.
3. Click **+**.
4. Choose the request type (**HTTP**).
5. Type the URL in the **Endpoint** field.
6. Click **Send**.

Inputs: 6 as documented. The page gives no step for naming the collection. If the create dialog asks for a name and a confirm, it is 8 (inferred).

Prerequisites: install the desktop app. Opening the Scratch Pad from the login screen is one click, counted as a prerequisite, with no account.

Source: https://developer.konghq.com/insomnia/requests/ (no page date; accessed 2026-11-04). Storage: https://developer.konghq.com/insomnia/storage/ (accessed 2026-11-04).

Notes:
- The docs say Insomnia "automatically opens a newly created or imported request in the editor".
- The home-page hero image (dated 20260612 in its file name) shows a welcome box. It reads "Enter an endpoint URL or paste cURL, or ⌘N for a new blank request" and has a **Create** button. That suggests a shorter path of about 3 inputs (type URL, Create, Send; inferred from the image, not from the docs).

### Task 2: Import a Postman collection with scripts and run it
Steps (https://developer.konghq.com/how-to/migrate-collections-and-environments-from-postman-to-insomnia/):
1. Click **Import** in the project.
2. Open the file dialog (counts as 2 with the next step).
3. Pick the file.
4. Click **Scan**.
5. Click **Import**.

Then run it (https://developer.konghq.com/how-to/use-the-collection-runner/):
6. Click the collection's name.
7. Click **Run Collection**.
8. Click **Run**. Requests and responses appear in the **Console** tab.

Inputs: 8. Selecting requests is optional; "Select All" is shown ticked in the runner screenshot.

Prerequisites: desktop app. The how-to first creates a new project with **+** and uses Cloud Sync, which needs an account. Creating the project adds about 2 inputs (inferred). The docs do not say whether importing into the Scratch Pad is supported.

Source: the how-to and runner pages above (no page dates; accessed 2026-11-04). Scripts: https://developer.konghq.com/insomnia/scripts/ (accessed 2026-11-04).

Notes on scripts:
- Insomnia has pre-request and after-response scripts with an `insomnia.*` API: `environment`, `baseEnvironment`, `variables`, `collectionVariables`, `request`, `response`, `sendRequest`, `test`, `expect`, `parentFolders`, `vault`, `iterationData`.
- The migration how-to says "most Postman scripts can be automatically converted by Insomnia during the import process". This means `pm.*` is rewritten at import; the docs do not describe a `pm` alias at run time.
- The scripts page says Postman v2.0 and v2.1 scripts "should also work when imported into Insomnia". Top-level `await` works. `CollectionVariables` maps to `baseEnvironment`.
- Not yet supported: globals (`insomnia.globals`) and deprecated `postman.*` interfaces such as `postman.setEnvironmentVariable`.
- `require()` offers ajv, chai, cheerio, crypto-js, lodash, moment, postman-collection, uuid, xml2js and others, plus some Node modules.
- The docs do not say whether scripts are sandboxed.
- Mock servers do not import. Global environments have to be attached to each collection by hand (Base Environment).
- Legacy unit tests are hidden by default since 13.3 (https://developer.konghq.com/insomnia/import-export/, accessed 2026-11-04).

### Task 3: Add an environment and switch to it
Steps (https://developer.konghq.com/insomnia/environments/):
1. Click **Environments**.
2. Type a name in the **Name** field.
3. Click **Create**.
4. To switch, open the environment picker (inferred).
5. Pick the new environment (inferred).

Inputs: 3 documented for creating. 5 including the switch (inferred). Adding a variable is not counted.

Prerequisites: desktop app. In a Git Sync project you also choose the repository folder where the environment is stored.

Source: https://developer.konghq.com/insomnia/environments/ (no page date; accessed 2026-11-04).

Notes:
- The page gives no click steps for switching. It says the active environment "applies to all requests in the collection" and that sub-environments are chosen in the left panel.
- The screenshots show environment rows at the top of the sidebar ("OpenAPI env us.api.konghq.com", "New Environment").

### Task 4: Use a secret without it touching disk
Steps, from the docs' high-level list (https://developer.konghq.com/insomnia/environments.md):
1. Preferences → General → Security → **Generate Vault Key**.
2. Create a private sub-environment in a global environment.
3. Add a variable and set its type to **Secret**.
4. Select that private global sub-environment in the collection.

Inputs: about 12 (inferred). Breakdown: Preferences 1, Generate Vault Key 1, open the global environment 1, new sub-environment 1, mark it private 1, Add 1, name 1, type dropdown and Secret 2, value 1, select the sub-environment in the collection 2.

Prerequisites: desktop app. The docs require a global environment, so a Scratch Pad user may need a project; this is not stated.

Source: https://developer.konghq.com/insomnia/environments/ and https://developer.konghq.com/insomnia/environments.md (accessed 2026-11-04). The old https://docs.insomnia.rest/insomnia/secret-environment-variables now redirects (308) to the environments page.

Notes: what the docs say is stored where.
- A secret does touch disk, encrypted. In the docs' words, secret variables "store sensitive data locally in encrypted form", are "masked by default, are not stored in plain text, and are only accessible within the vault namespace" (`vault.foo`).
- The vault key: "Insomnia does not persist the vault key automatically." "If you lose your vault key, you can reset it, but all stored secrets will be permanently deleted."
- Private sub-environments "aren't synced or exported". Secret-type variables exist "only in private global sub-environment", not in collection environments.
- Scripts cannot read secrets until **Enable vault in scripts** is switched on. After that they use `insomnia.vault.get(...)`.
- Contrast: "confidential" variables are only hidden in the interface. They are not encrypted, are stored in plain text, and are exported in plain text.
- Everything else in a project is on disk unencrypted (data-security page).
- The docs say nothing about whether a secret's resolved value is kept in response history or in the Timeline/Console log after a send. The Console in the runner screenshot prints the request headers as sent, so an `Authorization` header built from a secret would presumably appear there in clear (inferred, not documented).
- An external vault integration also exists (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault in the autocomplete of the entry-page screenshot; https://developer.konghq.com/insomnia/external-vault.md is listed in the docs index but was not fetched).

### Task 5: Find why a request failed
General: the requests page says "After sending a request, open the **Timeline** tab on the right-side panel. This shows the exact encoded request that was transmitted". It also points to the **Request timeout (ms)** preference (https://developer.konghq.com/insomnia/requests.md, accessed 2026-11-04). In the 13.x screenshots the response pane's tabs are Preview, Headers, Cookies, Tests, Mock and **Console**; no tab is labelled "Timeline". The Console holds a libcurl-style verbose log.

Inputs: 2 (Send, then open Timeline/Console; inferred). The docs give no troubleshooting flow for any of the three cases.

#### CORS
- Does not apply. Insomnia is a desktop client ("an open-source desktop client", https://developer.konghq.com/insomnia/insomnia-vs-postman.md). Requests go out from the app (libcurl-style log, proxy settings "apply to all traffic that goes through the Insomnia application", https://developer.konghq.com/insomnia/allowlist.md). They are not sent from a browser page, so no browser CORS check runs.
- That is inferred: none of the docs fetched mention CORS (insomnia-vs-postman, allowlist, requests). A server's missing CORS headers would show only as response headers, not as a failure.
- Inputs: not applicable.

#### DNS
- Not documented. No docs page describes the message for a name that does not resolve.
- The runner screenshot's Console logs "Connected to api.kong-air.com (3.135.104.34) port 443". A failed lookup would presumably show the libcurl error in the same log and in the response pane (inferred, not documented).
- Whether the cause is named on screen: not stated by the docs.
- Inputs: not documented.

#### 401
- The response pane shows a status badge ("200 OK", "201 Created" in the screenshots), the time and the size. The Headers tab shows the response headers (e.g. a `WWW-Authenticate`), and the Console shows the request headers as sent.
- The docs do not say that Insomnia explains a 401 or links it to the request's auth.
- The person reads the status code and compares the `Authorization` header in the Console with what they expected (inferred).
- Inputs: 2 (inferred: Send, Console).

### Task 6: Send the same request to a teammate
- One request: not documented. The current docs fetched have no "copy as cURL", "generate code" or single-request export steps. The requests, collections and import-export pages do not cover them. The import-export page lists only Import.
- "Run in Insomnia" is a deep link (`https://app.insomnia.rest/run?...` with `curl`, `specUrl` or `endpoint` parameters) for docs and READMEs. It opens a pre-imported request, and "you must be signed in to Insomnia" (https://developer.konghq.com/insomnia/run-in-insomnia.md).
- Whole project: invite the teammate to the organisation, then share through Cloud Sync or Git Sync (https://developer.konghq.com/insomnia/organizations.md):
  1. Go to the organisation's page on the Insomnia dashboard.
  2. Enter the email addresses.
  3. Click **Invite**.
  4. Enter your passphrase.
  5. Click **Invite**.
- Inputs: 5 for the invite (counted from the documented steps; reaching the page is inferred as 1). The teammate then needs an account and must accept. Invites expire after 30 days.
- Prerequisites: account, organisation (owner or admin role), and Cloud Sync or Git Sync. Git Sync on Essentials is limited to 3 users.
- Source: organisations and run-in-insomnia pages (accessed 2026-11-04).
- Notes: confidential variables travel in plain text in exports and Git. Private sub-environments, which hold the secrets, are not synced.

### Task 7: Run a collection with a data file and read the report
GUI steps (https://developer.konghq.com/how-to/use-the-collection-runner/; https://developer.konghq.com/insomnia/dynamic-variables):
1. Click the collection's name.
2. Click **Run Collection**.
3. Click **Upload Data**.
4. Open the system file dialog and
5. pick the CSV or JSON file (2 inputs).
6. Click **Run**.
7. Open the **Tests** tab, or **Console** (inferred).

Inputs: 7. The upload steps are inferred from "you'll see an **Upload Data** button … You can upload either a SCV [sic] or JSON file"; the docs give no finer steps.

CLI: `inso run collection -d data.csv -r spec --output results.json --acceptRisk <workspace-id>`. That is 1 text entry plus Enter, so 2 inputs (inferred; the flags are from https://developer.konghq.com/inso-cli/reference/run_collection/, which gives no example command).

Prerequisites: desktop app for the GUI. The inso CLI is installed separately.

Source: the pages above (accessed 2026-11-04).

Notes:
- Iteration variables are used as `{{name}}` or `insomnia.iterationData.get()`.
- The how-to says only that requests and responses appear in the Console tab. It does not describe a report.
- The runner screenshot shows a right panel with **Tests 0/0**, **History** (past runs) and **Console** tabs.
- The CLI writes JSON results with `--output`. `--includeFullData` adds requests, responses and environments. `--acceptRisk` acknowledges a security warning when writing to a file.
- The CLI reporters are dot, list, min, progress, spec and tap. There is no HTML or JUnit reporter listed.
- The insomnia-vs-postman page says you can "Run collections and export results for analysis or CI".

### Task 8: Find a request sent last week
- Not documented in the current docs. The old "responses" docs page (https://docs.insomnia.rest/insomnia/responses) now redirects (308) to the Insomnia overview, and no current page covers request or response history.
- The screenshots show a per-request response-history dropdown at the top right of the response pane ("Just Now ▾", "4 Minutes Ago ▾").
- If you know which request it was: open the request 1, open the dropdown 1, pick the entry 1, so 3 (inferred from screenshots).
- No docs page describes a history across all requests, a search of past sends, or how long history is kept.
- The global search (⌘P, "Search..") in the screenshots is not documented as searching history.
- Inputs: not documented (3 inferred, only when the request is known).
- Source: https://developer.konghq.com/insomnia/requests.md and https://developer.konghq.com/insomnia/collections.md (neither covers history; accessed 2026-11-04). Screenshots listed below.

### Screenshots
All are dark theme. None of the pages fetched shows a light-theme screenshot of the app.

- (a) dark: https://developer.konghq.com/assets/images/insomnia/collection.png on https://developer.konghq.com/insomnia/collections/ (alt "Image of an API Collection"; accessed 2026-11-04). This is 13.x with a GET "List API Products" request. The Params tab shows a **URL PREVIEW** of the resolved address with the query encoded. The response pane shows "200 OK · 186 ms · 891 B", tabs Preview / Headers 35 / Cookies / Tests 0/0 / Mock / Console, a JSON body and a "Just Now" history dropdown. The sidebar tree of folders and method-badged requests is on the left. Nothing on screen shows the route (direct or proxy) or any secret used.
- (a) dark: https://developer.konghq.com/assets/images/insomnia/entry-page.png on https://developer.konghq.com/insomnia/ (alt "Image of the Insomnia UI"; accessed 2026-11-04). This is the full window: request tabs, POST "Create API Product" with a JSON body, and "201 Created · 431 ms · 418 B" with a pretty-printed response. A variable autocomplete lists `_.base_url`, `_.bearerToken` and "External Vault → AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault". The status bar shows "Online", and there is an Invite button. There is no record of the request as sent on the main view.
- (a) dark, partial: https://developer.konghq.com/assets/images/insomnia/request.png on https://developer.konghq.com/insomnia/collections/ (alt "Image of a request"; 571×410). This shows the request editor only: URL `_.base_url/api-products`, a URL PREVIEW with the resolved `https://us.api.konghq.com/...` and query-parameter rows. There is no response.
- (b) dark: https://insomnia.rest/images/home/image-hero-insomnia-20260612.png on https://insomnia.rest/ (alt "Insomnia user interface"; file dated 2026-06-12, accessed 2026-11-04). The project sidebar shows the "Insomnia-Airlines" tree: collections, nested folders, method-badged requests, and "Local Vault project" at the bottom. The welcome panel takes "Enter an endpoint URL or paste cURL", with Create/Import and cards for collections and an environment.
- (b) dark: collection.png above also shows the collection sidebar (folders, request rows, Filter, environment rows, Add Cookies, Add Certificates, git branch "master").
- (c) dark: https://developer.konghq.com/assets/images/insomnia/collection-runner.png on https://developer.konghq.com/how-to/use-the-collection-runner/ (alt "Collection runner with console tab"; accessed 2026-11-04). The Runner tab has Iterations, Delay (ms), **Upload Data**, Run, and a Request Order list with checkboxes. The right panel has Tests 0/0 / History / Console. The Console is a libcurl verbose log: "Preparing request to https://api.kong-air.com/flights", timeout, SSL validation, "Connected to api.kong-air.com (3.135.104.34) port 443", TLS, the request line and headers sent (`GET /flights HTTP/2`, `Host`, `accept`), the response status and headers, and the body. This is the clearest vendor image of a record of what the send did.
- (other, not opened) https://developer.konghq.com/assets/images/insomnia/postman-scan.png on the Postman migration how-to (alt "Import of Postman data with two collections and an environment"). The Kong 10.1 blog (https://konghq.com/blog/product-releases/insomnia-10-1, 16 October 2024) has two UI images with empty alt text: https://prd-mktg-konghq-com.imgix.net/images/2024/10/66fd8f95-image1-6.png and https://prd-mktg-konghq-com.imgix.net/images/2024/10/66fd8fa1-image2-7.png. These are old versions and were not opened.

### Exchange record
**Resolved request as sent:**
- Partly. Before a send, the Params tab shows a **URL PREVIEW** of the address with variables and query resolved (collection.png, request.png).
- After a send, the Timeline (per the docs) or the **Console** tab (in 13.x screenshots) shows "the exact encoded request that was transmitted" (https://developer.konghq.com/insomnia/requests.md). As the runner screenshot shows, that is a libcurl verbose log: request line, headers as sent after variables, connection, TLS and response headers.
- It is a raw text log in a secondary tab, not a structured record on the main screen. The default response tab is Preview.

**Route:**
- Not shown as a label. The log names the host, IP and port it connected to ("Connected to api.kong-air.com (3.135.104.34) port 443"). A proxy would presumably show in the same log (inferred).
- Proxy settings are global, in Preferences > Proxy, with OS proxy auto-detection since 10.1 (https://developer.konghq.com/insomnia/allowlist.md). Nothing on screen says "direct" or "via proxy".

**Secrets used:**
- Not shown. No doc or screenshot shows which vault or secret variables a send used.
- The Console prints headers in clear, so a secret placed in a header would appear there as plaintext (inferred).
- The docs do not say whether response history or logs keep resolved secrets.

Evidence:
- https://developer.konghq.com/insomnia/requests.md
- https://developer.konghq.com/assets/images/insomnia/collection-runner.png
- https://developer.konghq.com/assets/images/insomnia/collection.png
- https://developer.konghq.com/insomnia/allowlist.md
- https://developer.konghq.com/insomnia/environments.md

## Scalar

Version: Scalar API Client 1.1.43, released Oct 23, 2026 (release notes, https://scalar.com/resources/changelog/api-client, read as https://scalar.com/resources/changelog/api-client/index.md, accessed 2026-11-05). Earlier entries on the same page: 1.1.42 (Oct 20), 1.1.41 (Oct 16), 1.1.40 (Oct 12). The 1.0 release is the 1.0.13 entry, dated May 14, 2026, headed "Scalar Client 1.0 — team workspaces, registry sync, conflict resolution, and a rebuilt experience". The same notes are at https://scalar.com/products/api-client/release-notes (accessed 2026-11-05).

Prerequisites: none stated for the browser version. The download page says of it "No installation required" (https://scalar.com/products/api-client/download/index.md, accessed 2026-11-05), and the product page says the client is "free to use in the browser at client.scalar.com" (https://scalar.com/products/api-client, accessed 2026-11-05). No API Client page I read (product page, getting started, download, import, environments, authentication, scripts, testing, keyboard shortcuts, code generation, dynamic variables) names an account or sign-in for sending a request or for keeping a collection. Sign-in appears only with teams: "Team switching from the header menu, with routing that follows the active team after sign-in" (1.0.13), and the Registry says "To access Registry, create an account or sign in" (https://scalar.com/products/registry/getting-started/index.md, accessed 2026-11-05). The desktop app is a separate install for macOS (Universal), Windows, Linux AppImage x64 and Linux Debian x64 (download page). In the browser, requests go through Scalar's proxy by default: "Web client now defaults to proxy.scalar.com while desktop skips the proxy unless you configure one" (1.1.1, May 21, 2026, release notes). Data: "Requests and collections are stored locally, and nothing waits on a cloud sync" (product page); 1.0.13 lists "IndexedDB-backed persistence with a migration path from older localStorage installs" and "Clear separation between personal local workspaces and team-backed workspaces".

### Task 1: first request from nothing (browser version, no account)
1. Open client.scalar.com. Getting started: "Install the desktop app or open the browser version if you want to try it instantly."
2. "Enter a URL, choose an HTTP method, and send the request to inspect the response right away."
3. Send with the button or ⌘ Enter ("⌘ Enter": "Send request", keyboard shortcuts page).

Inputs: 2 (URL, Send) (inferred). The docs do not say that a blank request is open when the client starts, or which method is the default. If a request has to be made first, Add Item (⌘ K) adds at least 1 (inferred). A method other than the default adds 2 (open the picker, pick; inferred).
Prerequisites: none stated. In the browser the request goes through proxy.scalar.com unless the user configures otherwise (1.1.1), so a target without CORS headers is reachable without an install, but by way of Scalar's server.
Source: https://scalar.com/products/api-client/getting-started (read as /getting-started/index.md, no page date; accessed 2026-11-05); https://scalar.com/products/api-client/keyboard-shortcuts/index.md (accessed 2026-11-05); https://scalar.com/resources/changelog/api-client/index.md (1.1.1; accessed 2026-11-05).
Notes: the getting-started page does not mention the proxy, CORS or an account. No page I read says what the proxy logs or keeps; the security page and the privacy policy do not mention it (https://scalar.com/security/index.md, https://scalar.com/legal/privacy-policy/index.md, both accessed 2026-11-05).

### Task 2: import a Postman collection with scripts and run it
Import:
1. "To import, click Add Item (⌘ K or Control K) and select Import from OpenAPI/Swagger/Postman/cURL."
2. File source: "Drag and drop a local file, or browse to select one from your file system."
3. A confirming Import button is not described.

Run: not documented. No API Client page I read describes running a collection, a runner or "run all".

Inputs: import 4 (inferred in part): Add Item 1, the Import entry 1, the file 2. A confirm step, if there is one, adds 1 (inferred). Run: not documented.
Prerequisites: none stated.
Source: https://scalar.com/products/api-client/import/index.md (no page date; accessed 2026-11-05).
Notes: what happens to pm.* scripts is not documented. The import page says "Import Postman Collection files (v2.0 / v2.1) as a one-off import" and "Requests, folders, and basic authentication settings are converted to an OpenAPI-based collection." It does not mention scripts, tests or variables. Scalar's own scripts use the pm API: "Scripts use the same Postman-compatible `pm` API" (https://scalar.com/products/api-client/scripts/index.md) and "Scripts run in the official Postman Sandbox runtime, so the full `pm` API is available" (https://scalar.com/products/api-client/testing/index.md; both accessed 2026-11-05). Whether an imported Postman script becomes one of these is not stated. The CLI also converts: `scalar document convert`, "Convert a Postman collection to an OpenAPI description" (https://scalar.com/tools/cli/commands/index.md, accessed 2026-11-05).

### Task 3: add an environment and switch to it
1. "Open your collection settings and find the Environment Variables section."
2. "Click Add Environment, give it a name, pick a color, and add variables as key-value pairs."
3. Switch: "Use the environment picker in the request header (the globe icon)."
4. Use the variable as `{{ variable }}`; requests resolve against the selected environment.

Inputs: 9 (inferred in part): collection settings 1 (inferred; the docs do not say how they open), Add Environment 1, name 1, colour 1, key 1, value 1, then globe 1 and pick 1. A save step is not documented (⌘ S is "Save local workspace (same as the header Save control when it is shown)", keyboard shortcuts page); if needed, add 1.
Prerequisites: a collection (environments are opened from its settings).
Source: https://scalar.com/products/api-client/environments/index.md (no page date; accessed 2026-11-05).
Notes: two kinds. A collection environment "Travels with the document when you export it". A workspace environment is "available to every collection in the current workspace" and, per the page, is not included in exported documents. Scopes: "When the same variable name is set at multiple scopes, local wins over environment, then collection, then global."

### Task 4: use a secret without it touching disk
Steps: not documented. No API Client page I read describes a secret or sensitive variable type, masking, a vault or encryption.
Inputs: not documented.
Prerequisites: none stated.
Source: https://scalar.com/products/api-client/environments/index.md; https://scalar.com/products/api-client/authentication/index.md; https://scalar.com/products/api-client/dynamic-variables/index.md (all accessed 2026-11-05); https://scalar.com/resources/changelog/api-client/index.md (1.0.13).
Notes. What the sources say is stored where:
- Authentication page: "Credentials are persisted in your workspace and are never exported with the OpenAPI document." For OAuth 2.0 it "stores the access token — and refresh token, if returned — for subsequent requests"; Clear is there "to forget the tokens and start over".
- The same page suggests variables in auth fields: "reference them with {{ variableName }} to avoid hard-coding secrets." The environments page says environments are for "API keys, tokens, and base URLs". Neither says the value is kept anywhere but the workspace.
- Persistence is "IndexedDB-backed" (1.0.13). So a credential or variable is kept on disk in the browser's (or the desktop app's) IndexedDB (inferred: no page says the workspace is held in memory only or encrypted).
- Scripts can write values that persist: "pm.environment.set() persists values like bearer tokens so they survive to the next request" (1.1.22, Aug 13, 2026).
- A "cannot" is not given because no page says so; the docs simply describe no way to keep a value off disk.

### Task 5: find why a request failed
No API Client page I read describes an error screen or a response view. The release notes are the only source.

#### CORS
- Shown: "Failed requests remain visible with guidance about possible CORS or network causes" and "instead of disappearing after a toast message" (1.1.36, Sep 30, 2026). The guidance's text is not quoted anywhere I read.
- Is the cause named? Partly: the guidance names "possible CORS or network causes", together, so it does not tell them apart (as the note reads). In the browser version the default route is proxy.scalar.com (1.1.1), so a target without CORS headers would normally not fail for CORS at all (inferred).
- Inputs: not documented.
- Source: https://scalar.com/resources/changelog/api-client/index.md (1.1.36, 1.1.1; accessed 2026-11-05).

#### DNS
- Shown: not documented separately. Inferred: the same "possible CORS or network causes" guidance, since the note names no other case. Through the proxy, a name that does not resolve fails at Scalar's server, and what the page then shows is not documented.
- Is the cause named? Not documented.
- Inputs: not documented.
- Source: https://scalar.com/resources/changelog/api-client/index.md (1.1.36; accessed 2026-11-05).

#### 401
- Shown: not documented. Getting started says only "send the request to inspect the response right away". A status code on the response is likely but not described on any page I read (inferred).
- Is the cause named? Not documented.
- Inputs: 0 beyond the send to see the response (inferred). Not documented.
- Source: https://scalar.com/products/api-client/getting-started/index.md (accessed 2026-11-05).

### Task 6: send the same request to a teammate
No share link for a request is documented on any API Client page I read.

Code snippet (the nearest documented route):
1. "Pick a language from the picker next to the snippet, copy it, and paste it into your app."

Inputs: 3 (inferred): open the picker 1, pick (for example Shell › Curl) 1, copy 1. Where the snippet is shown is not described.
Prerequisites: none stated.
Source: https://scalar.com/products/api-client/code-generation/index.md (no page date; accessed 2026-11-05).
Notes:
- "`{{ environment variables }}` and `{{$dynamic-variables}}` are resolved to their current values in the output." The page says nothing about masking credentials, so a token in a variable goes into the snippet as its value (as the sentence reads).
- Targets include "Shell | Curl, Wget, HTTPie" and "C | Libcurl".

Other routes:
- Team workspace: 1.0.13 brought "First-class team workspaces", "Live sync with the Scalar Registry so shared API descriptions stay aligned across machines" and "Conflict detection and resolution when local edits and registry changes disagree". It needs sign-in ("routing that follows the active team after sign-in"; Registry: "create an account or sign in"). The steps from the client are not documented, nor which plan a team workspace needs. What syncs is "API descriptions" (OpenAPI documents); whether a request's own values, environments or credentials go with it is not stated (credentials are "never exported with the OpenAPI document", authentication page). Pricing: "Every new team starts with a 7-day trial with Pro limits"; Pro has "5 editor seats" (https://scalar.com/pricing, accessed 2026-11-05).
- Export: the environments page speaks of exporting the document, but no page I read gives the steps. Not documented.
- CLI: `scalar document share`, "Publish an OpenAPI or AsyncAPI description to a public sandbox" (https://scalar.com/tools/cli/commands/index.md). That shares a whole description, publicly, not one request.

### Task 7: run a collection with a data file and read the report
In the app: not documented. No API Client page I read, and no release note, mentions a collection runner, iterations, a data file, CSV or a run report. The testing page describes tests per request ("The test passes if the callback executes without throwing an error") and does not say where results are shown (https://scalar.com/products/api-client/testing/index.md, accessed 2026-11-05).

CLI: not documented. The `scalar` CLI's command list has no command that sends requests or runs tests; its request-related commands are `scalar document mock` ("Run a Mock Server…") and `scalar document void` ("Mirror HTTP requests with a local server") (https://scalar.com/tools/cli/commands/index.md, accessed 2026-11-05).

Inputs: not documented.
Prerequisites: —.
Source: as above.

### Task 8: find a request sent last week
Not documented. No API Client page I read describes request history, and the keyboard shortcuts page lists none for it (https://scalar.com/products/api-client/keyboard-shortcuts/index.md, accessed 2026-11-05). The release notes from 1.0.13 to 1.1.43 do not mention history (https://scalar.com/resources/changelog/api-client/index.md, accessed 2026-11-05). The product page says only that some users do not want "request history in someone else's database" (https://scalar.com/products/api-client, accessed 2026-11-05).
Inputs: not documented.
Prerequisites: —.
Notes: older builds of the npm package `@scalar/api-client` contain an `AddressBarHistory` component (seen in a search result pointing at unpkg, not read, and not documentation). It is not counted.

### Screenshots
- (a), product page illustration. https://scalar.com/api-client-static.svg on https://scalar.com/products/api-client (alt "Scalar API Client interface"; accessed 2026-11-05). Not viewed; an SVG, so possibly a drawing rather than a capture.
- (b), team workspaces. https://cdn.scalar.com/scalar-app/changelog/1.0.10/team.png, alt "Team workspaces and Scalar Registry", in the 1.0.13 entry of https://scalar.com/resources/changelog/api-client (accessed 2026-11-05). Not viewed.
- (b), local workspaces. https://cdn.scalar.com/scalar-app/changelog/1.0.10/local.png, alt "Local workspaces", same entry. Not viewed.
- Other: https://cdn.scalar.com/scalar-app/changelog/1.0.10/versions.png, alt "Registry from the client", same entry. Not viewed.
- Not found: a docs image of a response, an error, a run report or history.

### Exchange record
Not documented. No API Client page I read describes the response view, a view of the request as sent, a timeline or network details. Getting started says only "inspect the response".

Route: in the browser the default is proxy.scalar.com and the desktop app goes direct "unless you configure one" (1.1.1). Nothing documented shows on a response which way it went.

Secrets: no secret type is documented (Task 4), so nothing lists which secrets a send used. Code snippets resolve variables to their values (code generation page).

Evidence: https://scalar.com/products/api-client/getting-started/index.md; https://scalar.com/resources/changelog/api-client/index.md; https://scalar.com/products/api-client/code-generation/index.md (all accessed 2026-11-05).
