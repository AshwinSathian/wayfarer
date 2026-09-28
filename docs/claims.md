# Claims ledger

Every factual statement that Wayfarer's public docs make about privacy,
security, data handling or network behaviour is a **claim**, with a stable
ID. Each claim is:

- marked where the docs make it, with `<!-- claim:C-NNN -->` (the same ID can
  be marked in several places);
- listed below with the test that proves it;
- proved by at least one automated test whose title contains `@claim:C-NNN`.
  e2e claim tests run in Chromium, Firefox and WebKit against the production
  build with production headers, with retries disabled.

`npm run check:claims` ([`scripts/check-claims.mjs`](../scripts/check-claims.mjs))
runs in CI and fails when a marker has no row, a row has no marker, or a row
has no test (for example, because the test was deleted or renamed).

Known-limitation bullets ("no request timeout", with an issue link) are
tracked by their issue, not here: they disappear when the issue is fixed.
Feature descriptions (the README's Highlights) are covered by the feature
specs in `e2e/`; P7.6 generates the README feature list from this ledger.

To add a claim: write the test first (title `@claim:C-NNN …`), add the row,
then add the marker next to the sentence.

| ID | Statement | Source | Test |
|---|---|---|---|
| C-001 | No account, no cloud, no telemetry: apart from loading the app, the only network traffic is the request the user composes, sent to the host they chose. | README.md, docs/trust-center.md | e2e/no-third-party-requests.spec.ts |
| C-002 | Collections, environments and history are stored in the browser's IndexedDB on the user's device. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-003 | Values in the secrets vault are stored only as ciphertext; nothing the app persists holds the plaintext. Everything else is plain text. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-004 | Vault crypto: PBKDF2-SHA-256 with 200,000 iterations, AES-GCM-256, a random 16-byte salt and 12-byte IV per secret. | README.md, docs/trust-center.md | src/app/shared/secrets/secret-crypto.service.spec.ts |
| C-005 | The vault key is held in memory only; reloading the page locks the vault. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-006 | Scripts are disabled in the hosted app and say so with a banner; Tests-tab assertions still run. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts |
| C-007 | A request that references a vault secret is blocked, never sent with the placeholder. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts |
| C-008 | History keeps the headers that were sent, including `Authorization`, in plain text. | README.md, docs/trust-center.md | e2e/claims.spec.ts |
| C-009 | HTML, XML and text responses render as text; binary responses are offered as a download with the exact bytes. | README.md | e2e/tripwire.spec.ts |
| C-010 | Network failures show the real network error, never a synthetic `504` from a service worker. | README.md, docs/trust-center.md | e2e/tripwire.spec.ts, e2e/service-worker.spec.ts |
| C-011 | The Content-Security-Policy forbids `eval` and inline script, so injected script does not run. | docs/trust-center.md | e2e/claims.spec.ts |
| C-012 | The production page loads with no script the app didn't ship (0 CSP violations); checked every 6 hours. | docs/runbook.md | e2e/no-edge-injection.spec.ts |
| C-013 | Settings → Reset all data deletes the database; if another tab holds it open, that tab is told to reload. | README.md, docs/trust-center.md | e2e/reset-all-data.spec.ts |
| C-014 | Collection exports include auth fields in plain text. | docs/trust-center.md | e2e/claims.spec.ts |
| C-015 | After one visit the app loads offline; its service worker caches only the app's own files and never answers requests to other origins. | README.md, docs/trust-center.md | e2e/service-worker.spec.ts |
