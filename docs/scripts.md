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

Scripts run with a `pm` object, a `console`, `atob`, `btoa` and
`setTimeout`. This is the complete surface, as written in
`packages/core/src/scripting/vm-bootstrap.ts` (the code that runs inside
the engine) and `host.ts` beside it (what that code can call):

### `pm.environment`

| Method | Behavior |
|---|---|
| `pm.environment.get(key)` | Returns the variable's value, or `null` if unset. If the same script already called `pm.environment.set(key, ...)` earlier in this run, the new value is returned. |
| `pm.environment.set(key, value)` | Records a change (the value is turned into a string), visible at once to later `pm.environment.get()` calls in the same run. The app applies the changes to the active environment after the whole script has finished; a script can't reach IndexedDB or any other real state itself. |
| `pm.environment.unset(key)` | Records the variable as removed. Setting a variable to an empty string removes it too. |

### `pm.response` (post-response scripts only)

`pm.response` is `null` in a pre-request script.

| Property/Method | Behavior |
|---|---|
| `pm.response.code` | HTTP status code (number). |
| `pm.response.status` | HTTP status text. |
| `pm.response.json()` | Parses the body as JSON; returns `null` on parse failure. |
| `pm.response.text()` | Returns the body as a string. A binary body is an empty string. |
| `pm.response.headers.get(name)` | Looks a response header up by the name as written, then in lower case; returns `null` if absent. |
| `pm.response.responseTime` | Response duration in milliseconds (`0` if unavailable). |

### `pm.test(label, fn)`

Runs `fn` immediately. If it throws, the test is recorded as failed with the
thrown message; otherwise it's recorded as passed. Results appear in the
response viewer's **Tests** tab alongside assertion-builder results, tagged
with `source: "script"` so they're distinguishable from the visual builder's
`source: "assertion"` rows.

A script that ends in an error (it throws, has a syntax error, or is
stopped by a limit) adds one failed row named "Pre-request script" or
"Post-response script" with the error as its message. The request is still
sent.

### `pm.expect(actual)`

A small Chai-`expect`-style fluent assertion helper, intended for use inside
`pm.test()`. Supported chains (throws an `Error` with a descriptive message
on failure, which `pm.test()` catches):

- `.to.equal(expected)`: strict `===`
- `.to.eql(expected)`: deep equality via `JSON.stringify` comparison
- `.to.include(expected)`: substring (strings) or membership (arrays)
- `.to.be.ok()`: truthy
- `.to.be.null()`: strict `=== null`
- `.to.be.undefined()`: strict `=== undefined`
- `.to.be.a(type)` / `.to.be.an(type)`: `typeof` check
- `.to.be.below(n)` / `.to.be.above(n)`: numeric comparison
- `.to.have.status(code)`: expects `actual.code === code` (pairs with `pm.expect(pm.response)`)
- `.to.have.property(key)`: `key in actual`
- `.to.not.equal(expected)`
- `.to.not.include(expected)` (strings only)

### `console`

`console.log`, `console.info`, `console.warn` (prefixed `[warn]`), and
`console.error` (prefixed `[error]`) append formatted strings to a list:
text as it is, anything else as JSON. **The app does not show these lines
yet** ([#213](https://github.com/AshwinSathian/wayfarer/issues/213)).

### `atob`, `btoa`, `setTimeout`

`atob(text)` and `btoa(text)` are the browser's. `setTimeout(fn, ms, ...args)`
runs `fn` later, inside the same run: the run ends when no timer and no
promise reaction is left, or at the time limit. A timer that would fall due
after the limit is not waited for. There is no `clearTimeout` and no
`setInterval`.

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
(`packages/core/src/scripting/host.ts`) then adds exactly five names: `pm`,
`console`, `atob`, `btoa` and `setTimeout`. A new browser API cannot appear
inside the engine, because the engine is not the browser. A unit test
(`host.spec.ts`) lists the global object's own property names and compares
them with the language's list plus those five.

**What crosses the boundary.** The functions behind `pm`, `console` and the
rest take and return strings, numbers and booleans only, and check the type
of each argument themselves. No object of the app, the worker or the page is
ever handed to a script. The response is given to the script as JSON text
and parsed inside the engine.

**What a script is given.** The enabled variables of the active environment
by name, and for a post-response script the response. A protected variable's
value is its `{{$secret.…}}` reference, not the secret. A script cannot make
a request.

**Limits.** Each run gets a new engine runtime, so no script sees another's
state. A run is stopped after 5 seconds ("Script timed out after 5000 ms"),
when it holds more than 64 MB ("Script exceeded memory limit (64 MB)"), and
when it recurses too deep ("Script exceeded the stack limit": between
about 700 and 1,500 calls, depending on the browser). A script cannot catch
the time limit. After any of the three the worker is
ended and the next run starts a new one. The page also stops waiting one
second after the time limit, should the engine itself not answer.

**Loading.** The engine (about 500 kB of WebAssembly) and its worker are
fetched the first time a script runs, from the app's own origin, and kept
by the service worker after that, so scripts run offline.

**Not there yet:** the review step before a collection's scripts may run
(plan P3.8); the test suite of escape attempts in three browsers (P3.7);
the Postman-compatible API (session 3B). Until the review step lands, don't
run scripts from collections you don't trust: a script cannot reach the
network, but it can change a variable that a later request uses.

See [SECURITY.md](../SECURITY.md) for how to report a concern.
