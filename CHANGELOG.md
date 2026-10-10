# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project intends to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
