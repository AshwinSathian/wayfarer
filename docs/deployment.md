# Deployment

Wayfarer is a static Angular build served by [Cloudflare Workers with static
assets](https://developers.cloudflare.com/workers/static-assets/). Configuration
lives in [`wrangler.jsonc`](../wrangler.jsonc).

**Production:** https://wayfarer.ashwinsathian.com/

## How it ships

Deploys are **manual, from the maintainer's machine**, with the `wrangler`
CLI pinned in `devDependencies`. There is no deploy workflow in GitHub
Actions: CI (`ci.yml`) only verifies. An artifact-once pipeline with
automatic smoke tests and rollback replaces this in Phase 1 (plan task
P1.7).

## Manual deploy

### Prerequisites (once)

- Node 22 (see `.nvmrc`; `wrangler` refuses older versions).
- `npx wrangler login`, then `npx wrangler whoami`. Check that the account
  listed is the one that owns the `wayfarer` Worker. If you belong to several
  accounts, set `CLOUDFLARE_ACCOUNT_ID` in your shell so wrangler never has to
  guess.

### 1. Preflight

```bash
git switch main && git pull --ff-only
git status --short                          # must print nothing
gh run list --workflow ci.yml --branch main --limit 1   # must be "completed success" for HEAD
npm ci
npm run build -- --configuration=production
```

Deploy only a commit whose CI run is green, and only from a clean tree. The
deployed files are exactly what is in `dist/wayfarer/browser`.

Optional local check, with production's headers applied (Playwright builds
again and serves the build through `e2e/support/prod-server.mjs` itself):

```bash
CI=1 npx playwright test
```

### 2. Upload a version (not live yet)

```bash
npx wrangler versions upload --message "v$(node -p 'require("./package.json").version') $(git rev-parse --short HEAD)"
```

This prints a **Version ID** and a **Version Preview URL** (`*.workers.dev`).
Production traffic still goes to the previous version.

Check the preview before promoting it:

```bash
PREVIEW=https://<preview-url-from-the-output>
curl -sI "$PREVIEW/" | grep -i content-security-policy     # the CSP from public/_headers
BASE_URL="$PREVIEW" npx playwright test e2e/no-edge-injection.spec.ts e2e/tripwire.spec.ts
```

The preview runs on `workers.dev`, outside the `ashwinsathian.com` zone,
so zone features (Web Analytics, Bot Fight Mode) don't apply there. The
`no-edge-injection` test only means something on the custom domain (step 4).

### 3. Promote

```bash
npx wrangler versions deploy <version-id>@100% --message "promote v1.x.y"
```

(`npx wrangler deploy` does upload and promote in one step. Use it only when
you're skipping the preview check on purpose.)

### 4. Verify production

```bash
curl -sI https://wayfarer.ashwinsathian.com/ | grep -iE 'content-security-policy|nel|report-to'
curl -s https://wayfarer.ashwinsathian.com/ | grep -oE 'main-[A-Z0-9]+\.js'   # same name as dist/wayfarer/browser/index.html
BASE_URL=https://wayfarer.ashwinsathian.com npx playwright test e2e/no-edge-injection.spec.ts
```

Then open Settings in the live app and check the version.

### 5. Roll back if anything is wrong

```bash
npx wrangler deployments list            # find the previous version ID
npx wrangler rollback <previous-version-id> --message "rollback: <reason>"
```

Rollback switches traffic to an earlier uploaded version immediately; it
doesn't rebuild. It can't undo anything stored in users' browsers. See
[`runbook.md`](runbook.md) for the service-worker and data caveats.

## Headers & CSP

[`public/_headers`](../public/_headers) is applied by Cloudflare to every
response and defines the Content-Security-Policy, `X-Content-Type-Options`,
`Referrer-Policy`, and `Permissions-Policy`. The CSP is duplicated as a
`<meta>` tag in `src/index.html`; keep the two in sync.
[`e2e/support/prod-server.mjs`](../e2e/support/prod-server.mjs) applies the
same file locally, so CI's e2e runs see production's headers.

## Zone settings

Zone-level features of `ashwinsathian.com` (Bot Fight Mode, Web Analytics,
Rocket Loader, Email Obfuscation, NEL) can inject scripts or headers into
this app. How they are turned off for this hostname, and how to verify it, is
in [`runbook.md`](runbook.md#cloudflare-zone).
