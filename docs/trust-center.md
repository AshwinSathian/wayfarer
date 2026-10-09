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

- **KDF:** PBKDF2-SHA-256, 600,000 iterations, random 16-byte salt per secret. <!-- claim:C-004 -->
- **Cipher:** AES-GCM, 256-bit key, random 12-byte IV per secret. <!-- claim:C-004 -->
- **Key handling:** the derived key lives in memory only for the unlocked
  session and is dropped on lock or tab close; it is never itself persisted. <!-- claim:C-005 -->

Full envelope format and key-derivation detail: [`docs/secrets.md`](secrets.md).

Everything else (collections, requests, environments, history) is stored
as plain text in IndexedDB, protected only by the browser's storage
sandboxing and the device's disk encryption. In particular:

- **History stores the headers that were sent, resolved.** An
  `Authorization` header or API key you typed or resolved from a variable
  is saved in plain text in history
  ([#71](https://github.com/AshwinSathian/wayfarer/issues/71)). <!-- claim:C-008 -->
- **Collection exports include auth fields in plain text**
  ([#72](https://github.com/AshwinSathian/wayfarer/issues/72)). <!-- claim:C-014 -->
- **Vault secrets can't be used in requests yet.** A request that
  references a protected variable is blocked rather than sent with the
  placeholder ([#60](https://github.com/AshwinSathian/wayfarer/issues/60)). <!-- claim:C-007 -->

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

## Script sandbox isolation

Pre/post-request scripts are **disabled in the hosted app** while the
sandbox is rebuilt ([#58](https://github.com/AshwinSathian/wayfarer/issues/58)):
the current Web Worker sandbox needs `eval`, which the site's
Content-Security-Policy forbids. Tests-tab assertions still run; they are
not JavaScript. <!-- claim:C-006 --> The current worker's isolation removes known dangerous
globals (a deny-list) rather than granting only what scripts need, and it
is being replaced ([#59](https://github.com/AshwinSathian/wayfarer/issues/59)).
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

- Scripts are disabled in the hosted app ([#58](https://github.com/AshwinSathian/wayfarer/issues/58)); the sandbox is a deny-list ([#59](https://github.com/AshwinSathian/wayfarer/issues/59)).
- Vault secrets can't be used in requests yet ([#60](https://github.com/AshwinSathian/wayfarer/issues/60)).
- Binary responses can be downloaded but not previewed ([#62](https://github.com/AshwinSathian/wayfarer/issues/62)).
- The vault passphrase can't be rotated, and with no secrets stored any passphrase "unlocks" ([#66](https://github.com/AshwinSathian/wayfarer/issues/66)).
- Cross-origin phase timings are usually unavailable to the browser ([#69](https://github.com/AshwinSathian/wayfarer/issues/69)).
- History and collection exports hold credentials in plain text ([#71](https://github.com/AshwinSathian/wayfarer/issues/71), [#72](https://github.com/AshwinSathian/wayfarer/issues/72)).
- Browser storage can be evicted (Safari deletes site data after 7 days without a visit), and there is no full-workspace backup yet ([#73](https://github.com/AshwinSathian/wayfarer/issues/73), [#74](https://github.com/AshwinSathian/wayfarer/issues/74)).
- The Local Bridge is a global on/off switch, isn't on npm, and merges `Set-Cookie` headers ([#79](https://github.com/AshwinSathian/wayfarer/issues/79), [#80](https://github.com/AshwinSathian/wayfarer/issues/80)).
- The browser adds or hides some headers without telling you ([#81](https://github.com/AshwinSathian/wayfarer/issues/81)).
- Edits to the same environment from two tabs can overwrite each other ([#94](https://github.com/AshwinSathian/wayfarer/issues/94)).

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
