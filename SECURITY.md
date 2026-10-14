# Security Policy

## Scope

Wayfarer is a **client-side-only** application: there is no backend, no
account system, and no server-side data store. Everything (collections,
environments, history, secrets) lives in the browser via IndexedDB. Because
of that shape, the risk surface that matters here is different from a typical
server-backed product. The things we care most about are:

- **Cross-site scripting (XSS)**: anything that lets attacker-controlled
  content execute in the app's origin.
- **Script-sandbox escape**: the pre/post-request scripting feature runs
  user- and collection-supplied JavaScript. A vulnerability that lets a
  script escape its sandbox and reach the page, the DOM, cookies, or the
  network is treated as critical, since it can be reached simply by
  importing a shared collection.
- **Secrets-at-rest weaknesses**: anything that weakens the encryption,
  key handling, or storage of the local secrets vault (see
  [`docs/secrets.md`](docs/secrets.md)).

"Server compromise," account takeover, and similar are **not** applicable
threat models here: there is no server and no account.

Each trust boundary, what could go wrong at it, and the tested claim that
stops it are in the [threat model](docs/threat-model.md).

For the full data-residency, encryption, and compliance picture (including
what's *not* true yet, stated plainly), see the [Trust Center](docs/trust-center.md)
and the [pre-answered security questionnaire](docs/security-questionnaire.md).
Automated scanners can discover this policy via
[`/.well-known/security.txt`](public/.well-known/security.txt).

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security reports.**

Instead, report privately using one of:

1. **GitHub Private Security Advisory**: use the "Report a vulnerability"
   button under this repository's Security tab
   (`https://github.com/AshwinSathian/wayfarer/security/advisories/new`).
2. **Email**: send details to **ashwinsathyan19@gmail.com**.

Please include, where possible:

- A description of the vulnerability and its potential impact.
- Steps to reproduce (a minimal repro collection/request/script is ideal).
- Any relevant browser/environment details.

## Break the sandbox

An open challenge: break one of the three walls below and you are named in
the [hall of fame](docs/trust-center.md#hall-of-fame). There is no money,
and no bug bounty program; the credit is public and permanent.

### What counts

| Wall | You win when |
|---|---|
| **Script sandbox** (QuickJS in a worker; [`docs/scripts.md`](docs/scripts.md)) | A pre-request or post-response script makes a network request other than through `pm.sendRequest`, reads or writes the page's DOM, storage or cookies, runs code outside the VM, or reads the plaintext of a vault secret the app masked for it. |
| **Secrets vault** ([`docs/secrets.md`](docs/secrets.md)) | You recover a secret's plaintext from what the app stored or exported (IndexedDB, a vault file, a workspace backup, history, an export, a HAR) without the passphrase, or the app sends a `{{$secret.…}}` placeholder over the network. |
| **Local Bridge** ([`packages/bridge/README.md`](packages/bridge/README.md)) | A page on an origin the bridge does not allow, or a request without its token, gets the bridge to send a request; or the bridge answers on an address other than loopback. |

Each wall has claims and tests behind it; the [threat
model](docs/threat-model.md) lists them. A report that shows one of those
tests passing while the wall is broken is the strongest kind.

### Rules

- Test your own copy: a local build (`npm ci && npm start`), the hosted app
  in your own browser profile, or a bridge on your own machine. Never
  someone else's data, browser or machine.
- No denial of service, against the hosted app or anyone's infrastructure.
  A script that only uses up its own tab's CPU or memory is not a break: the
  sandbox's limits are documented in [`docs/scripts.md`](docs/scripts.md).
- No social engineering, and no attack on GitHub, Cloudflare or npm.
- An approved script changing your own request is the design, not a break:
  review is the control (see [`docs/scripts.md`](docs/scripts.md)).
- Report privately, as below, with the smallest collection, script or
  command that shows it. Give us the disclosure window below before you
  publish.

The first report of a break is credited, with your name or handle and a
link of your choice, once the fix ships.

## Response Time

This is a solo/small-team open-source project. There is no dedicated
security team and no bug bounty program, but reports are taken seriously.
You can expect an initial response **within 5 business days**. If a report
is confirmed, a fix will be prioritized ahead of other work and you'll be
credited in the release notes / CHANGELOG unless you'd prefer to remain
anonymous.

## Disclosure

Please give us a reasonable window to investigate and ship a fix before any
public disclosure. We'll coordinate a disclosure timeline with you once a
report is triaged.
