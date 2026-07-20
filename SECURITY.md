# Security Policy

## Scope

API Sandbox is a **client-side-only** application: there is no backend, no
account system, and no server-side data store. Everything (collections,
environments, history, secrets) lives in the browser via IndexedDB. Because
of that shape, the risk surface that matters here is different from a typical
server-backed product. The things we care most about are:

- **Cross-site scripting (XSS)** — anything that lets attacker-controlled
  content execute in the app's origin.
- **Script-sandbox escape** — the pre/post-request scripting feature runs
  user- and collection-supplied JavaScript. A vulnerability that lets a
  script escape its sandbox and reach the page, the DOM, cookies, or the
  network is treated as critical, since it can be reached simply by
  importing a shared collection.
- **Secrets-at-rest weaknesses** — anything that weakens the encryption,
  key handling, or storage of the local secrets vault (see
  [`docs/secrets.md`](docs/secrets.md)).

"Server compromise," account takeover, and similar are **not** applicable
threat models here — there is no server and no account.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security reports.**

Instead, report privately using one of:

1. **GitHub Private Security Advisory** — use the "Report a vulnerability"
   button under this repository's Security tab
   (`https://github.com/AshwinSathian/api-sandbox/security/advisories/new`).
2. **Email** — send details to **ashwinsathyan19@gmail.com**.

Please include, where possible:

- A description of the vulnerability and its potential impact.
- Steps to reproduce (a minimal repro collection/request/script is ideal).
- Any relevant browser/environment details.

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
