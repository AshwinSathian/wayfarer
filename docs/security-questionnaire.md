# Security Questionnaire (Pre-Answered)

A standing answer to the security-review questions that come up in almost
every enterprise procurement process (the "CAIQ-lite" set), written down
once here instead of re-answered from scratch in a review ticket or vendor
portal every time. If your specific questionnaire needs an answer in a
different format, these facts are the source of truth to copy from.

See also: [Trust Center](trust-center.md) for the narrative version of the
same facts, and [`SECURITY.md`](../SECURITY.md) for the disclosure process.

## Company / product

| | |
|---|---|
| Product | Wayfarer, a local-first API testing client |
| Vendor | Ashwin Sathian (solo maintainer; no legal entity/incorporation as of this writing) |
| Hosting model | Client-side only. The app is a static bundle served from Cloudflare's edge; all application logic and data storage run in the end user's own browser |
| Support | Best-effort, community/solo-maintainer support via GitHub Issues. No SLA-backed support tier exists yet |

## Data residency and storage

- **Where is customer data stored?** Exclusively in the end user's own
  browser, via IndexedDB. Wayfarer has no database, no object storage, and
  no server-side persistence layer of any kind.
- **Does data ever leave the user's device?** Only the specific HTTP
  request the user composes, sent directly from their browser to the API
  host *they* specify. Wayfarer's own code never receives, proxies, or logs
  that traffic.
- **Data residency / geographic controls?** Not applicable. There is no
  server-side storage to have a region. Data resides wherever the user's
  own device and browser profile are.
- **Data retention policy?** Entirely user-controlled. Data persists until
  the user deletes it (per-item deletion, or **Reset All Data** for a full
  wipe) or clears their browser's site storage themselves.

## Encryption

- **Encryption at rest?** Secrets (API keys, tokens, credentials stored in
  the vault) are encrypted with AES-GCM (256-bit) using a key derived via
  PBKDF2-SHA-256 (600,000 iterations) from a user-chosen passphrase. Full
  spec: [`docs/secrets.md`](secrets.md). Everything else (collections,
  environments, history) is stored as plain text in IndexedDB, protected by
  the browser's storage sandbox and the device's own disk encryption, not
  an app-level cipher. History includes the request headers that were
  sent, so an `Authorization` header is stored in plain text
  ([#71](https://github.com/AshwinSathian/wayfarer/issues/71)).
- **Encryption in transit?** The app itself has no server to reach over
  the network. Outbound traffic is the user's own request to their own
  chosen target, protected by standard TLS whenever that target is
  `https://`. Wayfarer neither weakens nor intercepts that connection.
- **Key management?** The vault's derived key exists in memory only for
  the duration of an unlocked session and is dropped on lock, reload or tab
  close. There is no key-escrow, no server-side key storage, and
  no way for the maintainer to recover a lost passphrase. This is a
  structural trade-off of true client-side encryption, not an oversight.

## Authentication and access control

- **Does the product have user accounts?** No. There is no login, no
  identity provider integration, and no concept of a user session beyond
  the local browser tab. Access control is whatever access control the
  user's own device and OS already provide.
- **SSO / SAML / OIDC support?** Not yet. It's planned for a future
  team/enterprise control plane, as an opt-in addition rather than a
  requirement to use the product.
- **Multi-factor authentication?** Not applicable today, for the same
  reason: no account layer exists yet to attach MFA to.

## Network architecture

- **Does the vendor operate a backend that touches customer data?** No.
- **Third-party integrations that receive data?** None by default. The
  optional [Local Bridge](../local-bridge/README.md) companion process, if
  a user chooses to run it, relays requests **only between that user's own
  browser and a target the user specifies**, over a token-authenticated
  local connection. It is run and controlled entirely by the user, not
  operated by Wayfarer, and never leaves the user's own machine/network
  unless the target host itself is remote.
- **CDN / static hosting?** Cloudflare (Workers static assets), serving
  only the application's own code (HTML/CSS/JS/icons), never user data.

## Subprocessors

**Cloudflare**, as the static host of `https://wayfarer.ashwinsathian.com/`.
It sees the IP address, user agent, and URL of each page load, as any web
host does. It never receives collections, environments, history, or
secrets. There are no other subprocessors. A self-hosted build involves no
Cloudflare at all.

## Business continuity and availability

The application is static. After one visit it loads offline, from a
service worker that caches only the app's own files and never handles
requests to other origins. A user's data
is unaffected by the site's availability, since the site never stores it.
It only serves the app's own code.

## Incident history

Every security-relevant fix is recorded in [`CHANGELOG.md`](../CHANGELOG.md)
rather than folded silently into an unrelated release. There is no history
of a data breach, because there is no vendor-held data store that could be
breached. This is a structural property of the architecture, not a claim
about the future. See [`SECURITY.md`](../SECURITY.md) for how a report
would be handled if one ever came in.

## Compliance certifications

| Certification | Status |
|---|---|
| SOC 2, ISO 27001, penetration test | No third-party audits or certifications exist. |
| GDPR / CCPA | No personal data is collected, stored, or processed by the vendor in the first place; see Data residency above. Users are the sole controllers of any personal data they choose to enter into their own local requests |

## Vulnerability disclosure

Private reporting via GitHub Security Advisories or email, 5-business-day
initial response commitment, coordinated disclosure. Full process:
[`SECURITY.md`](../SECURITY.md). Automated-scanner discovery file published
at [`/.well-known/security.txt`](../public/.well-known/security.txt).

## Open-source licensing

MIT-licensed, per [`LICENSE`](../LICENSE): the entire client application
is source-available under this license, not a partial or ambiguous split
between free and proprietary components. If future paid tiers introduce a
server-side control plane (sync relay, SSO/SCIM), that component's license
will be stated explicitly and separately here the moment it ships, per the
project's standing anti-goal on ambiguous open-source claims.

---

Open audit findings, including the limitations above, are listed in the
[Trust Center](trust-center.md#known-limitations).

*Last reviewed: 2026-09-28. If your procurement process needs an answer
this document doesn't cover, please open an issue rather than assuming.
An absence here means "not yet written down," not "no."*
