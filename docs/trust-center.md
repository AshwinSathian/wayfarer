# Trust Center

This page exists so a security-conscious developer — or someone running a
procurement review before their org adopts Wayfarer — can find the facts
that matter in one place, without filing a ticket or DMing the maintainer.
Everything below is either verifiable directly in this repository or is a
plainly-stated "not yet" rather than a vague reassurance. If anything here
turns out to be stale, [open an issue](https://github.com/AshwinSathian/wayfarer/issues) —
this doc is a build artifact, not a marketing page, and it should stay honest.

## The one-sentence version

Wayfarer has no backend, no account system, and no telemetry. Everything you
create lives in your browser's IndexedDB, encrypted at rest where it's
sensitive. There is nothing on our side to breach, leak, or subpoena, because
there is no "our side" holding your data.

## Data residency

**100% client-side.** Requests, collections, environments, history, and
secrets are stored only in the browser's IndexedDB, on the device you're
using. Nothing is uploaded to any server we operate — see
[`docs/storage.md`](storage.md) for the exact schema. The only network
traffic Wayfarer's own code generates is the request *you* compose, sent
directly from your browser to the API target *you* specify.

## Encryption at rest

Secret values (API keys, tokens, passwords stored in the vault) are
encrypted before they touch disk:

- **KDF:** PBKDF2-SHA-256, 200,000 iterations, 16-byte random salt per vault.
- **Cipher:** AES-GCM, 256-bit key, random 12-byte IV per secret.
- **Key handling:** the derived key lives in memory only for the unlocked
  session and is dropped on lock or tab close — it is never itself persisted.

Full envelope format and key-derivation detail: [`docs/secrets.md`](secrets.md).

Everything else (collection/request/environment bodies, history) is stored
as plaintext in IndexedDB, same as any other browser-local app data —
protected by the browser's own storage sandboxing and the device's disk
encryption, not by Wayfarer's own cipher. If a value is sensitive, put it in
the secrets vault, not a plain environment variable.

## Encryption in transit

Wayfarer has no server of its own, so there's no "our API" to TLS-protect.
Outbound traffic is the request you build, sent directly to the host you
specify — if that host is `https://`, the connection is TLS-protected by the
browser exactly as it would be for any other web request; Wayfarer doesn't
touch, weaken, or intercept that connection. If you use the optional
[Local Bridge](../local-bridge/README.md) to reach a CORS-restrictive or
intranet-only API, see that component's own security model — the bridge
relays your request from a process running on your own machine, and never
leaves your network unless your target host does.

## Script sandbox isolation

Pre/post-request scripts and test assertions run user- and
collection-supplied JavaScript. That code executes in an isolated Web
Worker with no access to the page, DOM, cookies, or network — verified
isolation model and what's explicitly still true/false about it:
[`docs/scripts.md`](scripts.md).

## Telemetry

None. No analytics SDK, no error reporter phoning home, no anonymous usage
ping. If that ever changes, it will be an explicit, opt-in, off-by-default
setting — not a default — per the project's standing anti-goal.

## Subprocessors

None. There is no backend, so there is no vendor list to disclose — no
hosting provider touches your data because no hosting provider ever
receives it. (The marketing/demo site itself is static and served from
Cloudflare's edge, but it serves the app's own code, not your data — your
browser never sends collections/secrets/history to it.)

## Third-party audits & certifications

**None yet.** No SOC 2 report, no ISO 27001, no pen-test report exists today.
This is tracked openly rather than implied — a SOC 2 Type II observation
period is the natural next step once there's a paid enterprise tier whose
buyers require it, since Type II specifically requires 6–12 months of
control-effectiveness evidence to accumulate before a report can even be
requested. Until a report is published here, treat "no cloud, nothing to
audit" as the honest current answer, not as compliance-by-absence.

## Business continuity / availability

Wayfarer is a static, client-side application — once loaded, most of the UI
keeps working even if the site that served it goes offline (see the PWA
service-worker config in [`ngsw-config.json`](../ngsw-config.json)). Your
data is not affected by the demo site's uptime at all, because the demo site
never holds it: it's in your browser's IndexedDB regardless of whether
`https://wayfarer.ashwinsathian.com/` is reachable at this moment.

## Data deletion

You control 100% of your own data deletion, instantly, without contacting
anyone: **Reset All Data** in the app clears every IndexedDB store and
related `localStorage`/`sessionStorage` keys and reloads to a clean slate
(see [`docs/storage.md`](storage.md#resetting)). There is no server-side
copy left behind, because there was never a server-side copy.

## Vulnerability disclosure & incident history

Reporting process, response-time commitment, and scope: [`SECURITY.md`](../SECURITY.md).
Automated-scanner discovery file: [`/.well-known/security.txt`](../public/.well-known/security.txt).
Every fixed security-relevant issue is recorded in [`CHANGELOG.md`](../CHANGELOG.md)
rather than quietly folded into an unrelated release note.

## Procurement / security questionnaire

A pre-answered CAIQ-lite packet covering the questions enterprise security
reviewers ask most often (data residency, encryption, subprocessors,
incident history, authentication model) lives at
[`docs/security-questionnaire.md`](security-questionnaire.md) — read it
directly rather than opening a review ticket for facts already written down.

## What this page is not

This is not a claim of compliance with any specific framework, and it is not
a substitute for your own security review. It's the fastest path to the
facts a review needs, kept in the same repository as the code they describe
so it can't silently drift out of date the way a separate marketing site
could.
