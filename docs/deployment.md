# Deployment

Wayfarer is a static Angular build served by [Cloudflare Workers with static
assets](https://developers.cloudflare.com/workers/static-assets/) — Cloudflare's
currently-recommended path for static sites, and the successor to the older
Pages product (same edge network, same free tier, unified with the rest of
the Workers toolchain). Configuration lives in [`wrangler.jsonc`](../wrangler.jsonc).

**Production:** https://wayfarer.ashwinsathian.com/

## How it ships

- **`.github/workflows/deploy.yml`** deploys to production whenever the `CI`
  workflow finishes successfully on `master` (lint, unit tests, production
  build, Local Bridge suite, and the Playwright e2e suite all have to pass
  first — this workflow doesn't re-run or duplicate those checks, it just
  gates on their conclusion for that exact commit).
- **`.github/workflows/preview.yml`** uploads a Cloudflare
  [Worker Version](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)
  for every PR and comments the preview URL on it. The preview is a fully
  working build of that PR's code, reachable at its own `*.workers.dev` URL —
  it just never receives traffic on the custom domain, so production is
  unaffected until the PR merges and `deploy.yml` runs.

Both workflows need two repository secrets (Settings → Secrets and
variables → Actions):

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → **Edit Cloudflare Workers** template, scoped to this account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Overview (right sidebar), or `wrangler whoami` |

## Manual deploy

```bash
npm run build -- --configuration=production
npx wrangler deploy
```

Requires Node 22+ (`wrangler` itself refuses to run on older Node) and
`wrangler login` against the target Cloudflare account. `wrangler.jsonc`'s
`assets.not_found_handling: "single-page-application"` handles Angular's
client-side routing — any unmatched path falls back to `index.html` rather
than 404ing.

## Headers & CSP

[`public/_headers`](../public/_headers) is applied at Cloudflare's edge to
every response and defines the production Content-Security-Policy,
`X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. It is
**not** applied when serving the same build output locally via a plain static
file server (e.g. the `python3 -m http.server` command `playwright.config.ts`
uses for CI) — that's a Cloudflare-specific processing step, so header/CSP
behavior can only be verified against an actual deployment, not the local e2e
run.

## Known platform interaction

Cloudflare Web Analytics' automatic-injection beacon
(`static.cloudflareinsights.com/beacon.min.js`), if enabled anywhere on the
`ashwinsathian.com` zone, gets blocked by this app's own `script-src 'self'`
CSP — this is expected and desired (see the "no telemetry" promise in the
[README](../README.md) and [Trust Center](trust-center.md)), but it does mean
a blocked-by-CSP console error is visible on every page load if zone-wide Web
Analytics is on. Scoping or disabling that zone setting for this hostname
specifically removes the console noise; it does not change what data leaves
the browser either way, since the CSP already stops the request before it
fires.
