# Trust Center

This page exists so a security-conscious developer (or someone running a
procurement review before their org adopts Wayfarer) can find the facts
that matter in one place, without filing a ticket or DMing the maintainer.
Everything below is either verifiable directly in this repository or is a
plainly-stated "not yet" rather than a vague reassurance. If anything here
turns out to be stale, [open an issue](https://github.com/AshwinSathian/wayfarer/issues):
this doc is a build artifact, not a marketing page, and it should stay honest.

## The one-sentence version

Wayfarer has no backend, no account system, and no telemetry. <!-- claim:C-001 --> Everything you
create lives in your browser's IndexedDB. <!-- claim:C-002 --> Only values you put in the secrets
vault are encrypted; everything else, including request history, is stored
as plain text (see [Known limitations](#known-limitations)). <!-- claim:C-003 --> There is no
server-side copy of your data to breach, leak, or subpoena.

## Data residency

**100% client-side.** Requests, collections, environments, history, and
secrets are stored only in the browser's IndexedDB, on the device you're
using. <!-- claim:C-002 --> Nothing is uploaded to any server we operate. See
[`docs/storage.md`](storage.md) for the exact schema. Apart from loading
the app itself from its static host, the only network traffic Wayfarer's
code generates is the request *you* compose, sent directly from your
browser to the API target *you* specify (or through the Local Bridge, if
you turn it on). <!-- claim:C-001 -->

## Encryption at rest

Secret values (API keys, tokens, passwords stored in the vault) are
encrypted before they touch disk:

- **KDF:** PBKDF2-SHA-256, 600,000 iterations, a random 16-byte salt. The key it derives from the passphrase wraps the data key. <!-- claim:C-004 -->
- **Cipher:** AES-GCM with a random 256-bit data key, and a random 12-byte IV per secret. <!-- claim:C-004 -->
- **Key handling:** the data key is stored only wrapped. Unwrapped, it lives in
  memory for the unlocked session, as a key the browser will not export, and is
  dropped on lock, reload or tab close, and after 15 idle minutes (configurable). <!-- claim:C-005 -->
- **Passphrase change:** wraps the same data key under the new passphrase; the
  old one stops working and no secret is re-encrypted. <!-- claim:C-043 -->
- **Vault file:** the vault can be exported as a file that holds only ciphertext
  and opens with its passphrase, and imported into another vault. <!-- claim:C-044 -->

Full envelope format and key-derivation detail: [`docs/secrets.md`](secrets.md).

Everything else (collections, requests, environments, history) is stored
as plain text in IndexedDB, protected only by the browser's storage
sandboxing and the device's disk encryption. In particular:

- **A saved request holds what you typed.** A token typed into the Auth
  tab or a header is plain text in your collections. Put it in the vault
  and refer to it with a variable to keep it out of them.
- **History stores what was sent and what came back with credentials and
  vault secrets masked.** <!-- claim:C-008 --> A credential header
  (`Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, and any name with
  token, secret, key or pass in it) is stored as `***`. Every vault secret
  and credential of the request is also looked for in the URL, the bodies
  and the other headers, as text, percent-encoded, JSON-escaped and inside
  base64, since servers send them back. A value shorter than 6 characters
  cannot be looked for.
- **Collection exports mask credentials unless you ask for them in that
  export.** <!-- claim:C-014 --> "Export with credentials" writes them;
  a vault secret is never in a file, only its reference.
- **Vault secrets are sent as their plaintext when the vault is
  unlocked.** A locked vault asks for the passphrase first, and closing
  that dialog sends nothing. A secret's placeholder is never sent, and
  nothing stored, exported or copied holds the plaintext. <!-- claim:C-007 -->

## Encryption in transit

Wayfarer has no server of its own, so there's no "our API" to TLS-protect.
Outbound traffic is the request you build, sent directly to the host you
specify. If that host is `https://`, the connection is TLS-protected by the
browser exactly as it would be for any other web request; Wayfarer doesn't
touch, weaken, or intercept that connection. <!-- claim:C-015 --> If you use the optional
[Local Bridge](../local-bridge/README.md) to reach a CORS-restrictive or
intranet-only API, see that component's own security model: the bridge
relays your request from a process running on your own machine, and only
for an allowed origin that presents its token. <!-- claim:C-041 --> The
request never leaves your network unless your target host does.

## Content-Security-Policy

Every page is served with a strict Content-Security-Policy, generated from
[`security/csp.json`](../security/csp.json): scripts only from the app's
own origin, no `eval`, no inline script. <!-- claim:C-011 -->
It also requires Trusted Types, so strings can't reach DOM script sinks
such as `innerHTML` or a `Worker` URL unless the app's policy approves
them; its default policy approves only same-origin script URLs. <!-- claim:C-016 -->

A response is data, never part of the app. An HTML response is previewed in
a sandboxed frame with no permissions at all (no script, no form, no popup,
no access to the app's origin), from a document that carries its own policy
allowing nothing from the network: its scripts do not run, it loads nothing,
and it cannot leave its frame. <!-- claim:C-048 --> The policy lets a frame show only a `blob:`
document the app itself made, and lets only the app's own origin frame the
app (`frame-ancestors 'self'`; Safari applies that rule to the preview, so
`'none'` would leave it blank). An image is previewed only when its type is
one of a fixed list that a browser draws without running anything; SVG is
shown as text.

## Script sandbox isolation

Pre/post-request scripts run in every build, the hosted app included, in
QuickJS: a JavaScript engine compiled to WebAssembly, in its own worker.
The browser never evaluates a script's text, so the site's
Content-Security-Policy still forbids `eval`; it allows WebAssembly to be
compiled, and nothing else changed in it. <!-- claim:C-006 --> The engine's global object holds
the JavaScript language and sixteen names the app adds (`pm`, `console`,
`atob`, `btoa`, `setTimeout`, `require` for five libraries that ship with
the app and run inside the engine, and the ten globals of Postman's older
sandbox, such as `postman` and `tests`): there is no `fetch` or any other
browser API inside it to take away. A suite of escape attempts runs from inside a script
in Chromium, Firefox and WebKit under the production headers: every road to
the global object finds only those names, every network API is absent, a
dynamic `import()` loads nothing, and nothing of one run is left for the
next. The only requests a script makes are the ones it asks the app for
with `pm.sendRequest`: the app sends them as it sends yours (no cookies, no
`Referer`, at most 10 a run) and never reads the vault for one; the suite
counts the requests that leave. <!-- claim:C-052 -->
The sandbox keeps a script away from the browser. It does not keep a
script you approved away from your request: a pre-request script can change
where the request goes, and the request carries its secrets there. That is
what the review below is for.
A run is stopped at 5 seconds and at 64 MB.
Scripts that came from somewhere else do not run on arrival: the scripts of
an imported or restored collection, and those of a history entry, wait
until you have read them in the review dialog and said you trust them. The
collection then holds the SHA-256 of each script you approved, and a script
runs only if its own digest is there, so one that a later import changed
waits again. <!-- claim:C-051 -->
One redirect the app does ask about: when the pre-request script of a send
moved the request to another host and the request uses a vault secret, a
dialog names both hosts before the vault is read. Answered "Don't send",
nothing is sent and the variables that script set are put back.
<!-- claim:C-053 --> This compares one send. A host that an earlier
script stored in a variable is, by the next send, the variable's value, and
is not asked about; the review is the control for that.
See [`docs/scripts.md`](scripts.md).

## Telemetry

Wayfarer's code contains no analytics SDK, no error reporter, and no usage
ping. <!-- claim:C-001 --> If that ever changes, it will be an explicit, opt-in, off-by-default
setting.

The hosting zone currently injects Cloudflare's Web Analytics beacon and a
bot-detection script into the page. The site's Content-Security-Policy
blocks both from running <!-- claim:C-011 -->, and they are being switched off at the host
([#75](https://github.com/AshwinSathian/wayfarer/issues/75)).

## Subprocessors

**Cloudflare** hosts the app as static files at
`https://wayfarer.ashwinsathian.com/`. Like any web host, it sees the IP
address, user agent, and URL of each visit when your browser loads the app.
It never receives your collections, environments, history, or secrets,
because the app never sends them anywhere. <!-- claim:C-001 --> There are no other
subprocessors. If you self-host the static build, Cloudflare isn't
involved at all.

## Third-party audits & certifications

No third-party audits or certifications exist.

## Business continuity / availability

Wayfarer is a static, client-side application. After one visit it loads
with the network off: a service worker keeps the app's own files. <!-- claim:C-015 -->
That worker only ever handles requests to the app's own origin; the
requests you send go straight to the network, so a network failure shows
the real error, never a synthetic `504` (the pre-v1.1.0 worker did that,
[#63](https://github.com/AshwinSathian/wayfarer/issues/63)). <!-- claim:C-010 --> <!-- claim:C-015 -->
Your data
is not affected by the site's uptime, because the site never holds it: it's
in your browser's IndexedDB whether or not
`https://wayfarer.ashwinsathian.com/` is reachable.

That also means the only copy is in that browser. Settings, "Workspace
backup", writes every collection, request, environment, the global
variables and the vault (still encrypted) to one file, and restores from
one. A restored collection's scripts are untrusted until approved, like any
imported file. <!-- claim:C-046 --> The page reminds you when the last
backup is more than 14 days old.

## Data deletion

You delete your own data without contacting anyone: **Settings → Reset all
data** deletes the IndexedDB database and the app's
`localStorage`/`sessionStorage` keys, then reloads (see
[`docs/storage.md`](storage.md#resetting)). If another Wayfarer tab keeps
the database open, the reset says so and asks you to close that tab
instead of reporting success. <!-- claim:C-013 --> There is no server-side copy left behind,
because there was never a server-side copy.

## Known limitations

These are open, tracked, and scheduled in
[`PLAN-airtight-remediation.md`](../PLAN-airtight-remediation.md):

- Cross-origin phase timings are usually unavailable to the browser ([#69](https://github.com/AshwinSathian/wayfarer/issues/69)).
- Browser storage can be evicted (Safari deletes site data after 7 days without a visit, unless the app is installed). The app asks the browser to keep the data, says in Settings whether it agreed, and reminds you to back up after 14 days; it cannot make the browser promise.
- The Local Bridge is a global on/off switch, isn't on npm, and merges `Set-Cookie` headers ([#79](https://github.com/AshwinSathian/wayfarer/issues/79), [#80](https://github.com/AshwinSathian/wayfarer/issues/80)).
- A browser drops some request headers, adds others and hides most response headers of another origin. Wayfarer cannot change that from a page; it says so for each request before you send it <!-- claim:C-049 --> and on the Headers tab, and [`browser-limits.md`](browser-limits.md) lists all of it. The Local Bridge is the way around.

- In Safari's engine, once the app is cached, a request that needs a CORS preflight was seen to be sent although the server's answer refused it ([#209](https://github.com/AshwinSathian/wayfarer/issues/209)). Measured in a test build of WebKit; not yet confirmed in Safari itself.
- Data and files from Wayfarer 1.x are not read by version 2: the first open removes them and says so.

All audit findings: [label `audit-2026-09`](https://github.com/AshwinSathian/wayfarer/issues?q=label%3Aaudit-2026-09).

## Vulnerability disclosure & incident history

Reporting process, response-time commitment, and scope: [`SECURITY.md`](../SECURITY.md).
Automated-scanner discovery file: [`/.well-known/security.txt`](../public/.well-known/security.txt).
Every fixed security-relevant issue is recorded in [`CHANGELOG.md`](../CHANGELOG.md)
rather than quietly folded into an unrelated release note.

## Procurement / security questionnaire

A pre-answered CAIQ-lite packet covering the questions enterprise security
reviewers ask most often (data residency, encryption, subprocessors,
incident history, authentication model) lives at
[`docs/security-questionnaire.md`](security-questionnaire.md). Read it
directly rather than opening a review ticket for facts already written down.

## What this page is not

This is not a claim of compliance with any specific framework, and it is not
a substitute for your own security review. It's the fastest path to the
facts a review needs, kept in the same repository as the code they describe
so it can't silently drift out of date the way a separate marketing site
could.
