# Pre/Post-Request Scripts & Assertions

Wayfarer lets you attach a pre-request script, a post-response script, and
a set of visual test assertions to any request. This document describes the
`pm.*` API surface those scripts see and, separately and honestly, the
current isolation model — verified against `src/app/shared/scripts/` at the
time of writing.

> **This document is spot-checked against source, the same way
> [`docs/secrets.md`](secrets.md) is.** If the sandbox implementation
> changes (see the "Isolation model" section below), this file needs to be
> re-verified line-by-line against `src/app/shared/scripts/` before it's
> trusted again — don't assume it stays accurate across refactors.

## The `pm.*` API surface

Scripts run with a single injected `pm` object and a shimmed `console`.
This is the complete surface, as implemented in `buildPmApi()` inside
`src/app/shared/scripts/script-runner.worker.ts` (the code that actually
evaluates script text — `script-sandbox.service.ts` on the main thread only
sends the script in and receives structured-clone results back):

### `pm.environment`

| Method | Behavior |
|---|---|
| `pm.environment.get(key)` | Returns the variable's value, or `null` if unset. If the same script already called `pm.environment.set(key, ...)` earlier in this run, the mutated value is returned (mutations are visible to later calls within the same script execution). |
| `pm.environment.set(key, value)` | Records a mutation (value is coerced to a string) and is immediately visible to subsequent `pm.environment.get()` calls in the same run. Mutations are only persisted to the actual environment by the host after the whole script finishes — a script can't reach into IndexedDB or any other real state itself. |
| `pm.environment.unset(key)` | Records the variable as cleared (internally, sets it to an empty string in the mutation set). |

### `pm.response` (post-response scripts only)

Available only when a response exists (i.e. not in pre-request scripts).
`pm.response` is `null` in a pre-request script.

| Property/Method | Behavior |
|---|---|
| `pm.response.code` | HTTP status code (number). |
| `pm.response.status` | HTTP status text. |
| `pm.response.json()` | Parses the body as JSON if it's a string; returns it as-is if already an object; returns `null` on parse failure. |
| `pm.response.text()` | Returns the body as a string (stringifies if it isn't one already). |
| `pm.response.headers.get(name)` | Case-insensitively looks up a response header; returns `null` if absent. |
| `pm.response.responseTime` | Response duration in milliseconds (`0` if unavailable). |

### `pm.test(label, fn)`

Runs `fn` immediately. If it throws, the test is recorded as failed with the
thrown message; otherwise it's recorded as passed. Results appear in the
response viewer's **Tests** tab alongside assertion-builder results, tagged
with `source: "script"` so they're distinguishable from the visual builder's
`source: "assertion"` rows.

### `pm.expect(actual)`

A small Chai-`expect`-style fluent assertion helper, intended for use inside
`pm.test()`. Supported chains (throws an `Error` with a descriptive message
on failure, which `pm.test()` catches):

- `.to.equal(expected)` — strict `===`
- `.to.eql(expected)` — deep equality via `JSON.stringify` comparison
- `.to.include(expected)` — substring (strings) or membership (arrays)
- `.to.be.ok()` — truthy
- `.to.be.null()` — strict `=== null`
- `.to.be.undefined()` — strict `=== undefined`
- `.to.be.a(type)` / `.to.be.an(type)` — `typeof` check
- `.to.be.below(n)` / `.to.be.above(n)` — numeric comparison
- `.to.have.status(code)` — expects `actual.code === code` (pairs with `pm.expect(pm.response)`)
- `.to.have.property(key)` — `key in actual`
- `.to.not.equal(expected)`
- `.to.not.include(expected)` (strings only)

### `console`

`console.log`, `console.info`, `console.warn` (prefixed `[warn]`), and
`console.error` (prefixed `[error]`) are shimmed to append formatted strings
to a `logs` array, which the app surfaces in the Tests tab rather than the
browser devtools console.

## Visual Test Assertions (Tests tab)

Alongside scripts, requests can carry a list of declarative assertions
(`TestAssertion`, `src/app/models/test-assertion.models.ts`), evaluated by
`AssertionRunnerService` without running any user script at all:

- **Targets:** `status` (status code), `duration` (response time in ms),
  `header` (by name, case-insensitive), `body` (whole body, or a dot/bracket
  path like `data.users[0].id`).
- **Operators:** `equals`, `not-equals`, `contains`, `not-contains`,
  `exists`, `not-exists`, `is-array`, `is-object`, `less-than`,
  `greater-than`.

These are pure data evaluated in TypeScript — no `pm` API, no dynamic code
execution — so they carry none of the isolation considerations below and are
the safer option when a script isn't strictly needed.

## Isolation model — what's actually true today

Scripts execute in a **dedicated Web Worker**
(`src/app/shared/scripts/script-runner.worker.ts`), not on the main thread.
`ScriptSandboxService.execute()` (`script-sandbox.service.ts`) spawns a
brand-new worker for every single script run, sends it the script text plus
plain-data `env`/`response` context via `postMessage`, waits for a `result`
message (or a timeout — default **5000ms**, configurable via the `execute()`
call), and unconditionally `terminate()`s the worker afterward. A worker is
never reused across runs, so nothing persists between one script execution
and the next.

**Why this is a real boundary, not a block-list:** a dedicated Worker is a
separate JS realm. It structurally has no `window`, no `document`, no
cookies, no `localStorage`, and no reference back to the main thread's
memory (where the secrets vault's derived key and other requests' data
live) — that isolation is a browser guarantee inherent to what a Worker
*is*, not something the app has to implement or maintain correctly.
Communication with the host is `postMessage` only, which structured-clones
data across the boundary — functions and live object references can't
cross it, only serializable data (script logs, env mutations, test
results).

A worker realm is not empty by default, though — it still has some
network/storage-capable globals of its own (`fetch`, `XMLHttpRequest`,
`indexedDB`, etc., which exist in the `webworker` lib independently of
`window`). `script-runner.worker.ts` strips these explicitly, before any
user script is evaluated, via `stripDangerousGlobals()`:

```
fetch, XMLHttpRequest, WebSocket, EventSource, importScripts, Worker,
SharedWorker, indexedDB, caches, navigator, RTCPeerConnection,
BroadcastChannel, SharedArrayBuffer, eval
```

Note this stripping reassigns each property to `undefined` rather than
`delete`-ing it: in Chrome, these globals are writable but *non-configurable*
own properties of the worker global object, so `delete self.fetch` silently
no-ops (verified by the regression suite, which originally caught this as a
real bug during development) while reassignment actually clears them.

On top of that, the script body still runs inside a
`new Function("pm", "console", wrappedCode)` call with the same kind of
local-scope shadowing the previous main-thread implementation used
(`window`, `self`, `globalThis`, `document`, `fetch`, `eval`, etc. bound to
`undefined` as function parameters). **This shadowing layer is explicitly
documented in the source as not being real protection on its own** — a
`Function`-based global re-acquisition (e.g. `Function('return fetch')()`)
resolves free variables through the realm's global object, not through this
closure, so shadowing alone wouldn't have stopped the escape described in
the project's audit history. What actually stops it now is that, inside
this worker's global object, there is no `window`/`document` to re-acquire
in the first place, and `fetch`/`XMLHttpRequest`/etc. have already been
deleted before the script runs. The shadowing is kept as defense-in-depth on
top of that, not as the primary guarantee.

**Net effect:** a script — including one loaded from an imported, untrusted
collection — can read/write environment variables via `pm.environment` and
report `pm.test()` results back to the host, but cannot reach the DOM,
cookies, `localStorage`, the main thread's memory (including the secrets
vault's in-memory key), or the network, because none of those are reachable
from inside the worker realm it actually executes in.

**Caveats worth knowing:**

- This isolation model is covered by a regression suite —
  `script-sandbox.service.spec.ts` — that asserts, among other things, that
  `window`/`self`/`globalThis.window`/`document`/`localStorage` are all
  `typeof "undefined"` from inside a script, and specifically that
  `Function("return typeof fetch")()` (the exact re-acquisition technique
  from the original main-thread vulnerability) yields `"undefined"` rather
  than a usable reference — i.e. the specific Part B3 escape is a named,
  passing regression test, not just a design claim in this document.
- A hung or slow script is bounded by the timeout (default 5s, overridable
  per call) — after that the worker is force-terminated and the run reports
  a timeout error; this is also covered by a test.
- The env context handed to a script is only the key/value pairs the host
  explicitly passes in — a script cannot see any environment variable it
  wasn't given, which is also asserted by the regression suite.
- If `Worker` isn't available at all in the host environment, scripts don't
  run and the app reports that explicitly rather than falling back to an
  unsandboxed execution path.

See [SECURITY.md](../SECURITY.md) for how to report a concern, and
`docs/plans/plan-specimen-modernization.md` (Part B3 / Phase 0) for the
history of the main-thread `new Function()` vulnerability this design
replaced.

**Re-verify this section against `src/app/shared/scripts/` before relying on
it** — the same way every other section of this document should be
spot-checked against source, not trusted from memory.
