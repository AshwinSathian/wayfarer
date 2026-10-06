# Deployment

Wayfarer is a static Angular build served by [Cloudflare Workers with static
assets](https://developers.cloudflare.com/workers/static-assets/). Configuration
lives in [`wrangler.jsonc`](../wrangler.jsonc).

**Production:** https://wayfarer.ashwinsathian.com/

## How it ships

**Build once, deploy what was tested** (P1.7). Every push to `main` runs CI
(`.github/workflows/ci.yml`), which builds `dist/wayfarer/browser` once,
uploads it as the `dist` artifact (kept 14 days), and runs the e2e suite in
Chromium, Firefox and WebKit against exactly those files.

`.github/workflows/deploy.yml` (Actions → **Deploy** → *Run workflow*)
deploys a green CI run's artifact without rebuilding:

1. records the live version (the rollback target);
2. `wrangler versions upload` (not live yet), tagged with the commit;
3. runs the `@smoke` tests against the version's preview URL in 3 browsers;
   if they fail, the workflow stops and **production is untouched**;
4. `wrangler versions deploy <id>@100%`;
5. runs `@smoke` against production; if they fail, `wrangler rollback` to
   the version from step 1 and opens a `prod-down` issue.

`ci_run_id` picks a specific CI run (default: the latest green run on
`main`). `drill_failing_smoke` makes step 3 fail on purpose, to prove that a
failing smoke leaves production alone (check `npx wrangler deployments
list`: the previous version is still active).

`.github/workflows/synthetic.yml` runs the same `@smoke` tests against
production every 6 hours in 3 browsers and opens (or comments on) a
`prod-down` issue when they fail; the next passing run closes it.

### One-time setup (owner)

1. Cloudflare dashboard → My Profile → API Tokens → *Create token* with the
   **Edit Cloudflare Workers** template, scoped to the account that owns the
   `wayfarer` Worker.
2. GitHub → Settings → Secrets and variables → Actions → add
   `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID`.
3. GitHub → Settings → Environments → create `production` (the deploy job
   uses it). Optionally add yourself as a required reviewer.

Two repository variables (Settings → Secrets and variables → Actions →
Variables) stage the rollout, because the Cloudflare changes are scheduled
last:

| Variable | Set to `true` when | Until then |
|---|---|---|
| `ZONE_HARDENED` | the zone changes in [`runbook.md`](runbook.md#cloudflare-zone) (P0.12) are done | deploy and synthetic skip the `no-edge-injection` test, with a warning; the zone still injects scripts, which the CSP blocks |
| `SYNTHETIC_ENABLED` | production runs a build shipped by `deploy.yml` | the 6-hourly schedule does nothing; manual runs still work |

The manual procedure below stays as the fallback when Actions is
unavailable.

## Manual deploy

### Prerequisites (once)

- Node 24 (see `.nvmrc`; Angular 22 needs 22.22.3 or later, or 24.15 or later).
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
npm run build
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
BASE_URL="$PREVIEW" npx playwright test --grep @smoke
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
BASE_URL=https://wayfarer.ashwinsathian.com npx playwright test --grep @smoke
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
`Referrer-Policy`, and `Permissions-Policy`. The CSP comes from
[`security/csp.json`](../security/csp.json): `npm run gen:csp` writes it into
`public/_headers` and the `<meta>` tag in `src/index.html`, and
`npm run check:csp` (in CI) fails if either file was edited by hand.
[`e2e/support/prod-server.mjs`](../e2e/support/prod-server.mjs) applies the
same file locally, so CI's e2e runs see production's headers.

## Zone settings

Zone-level features of `ashwinsathian.com` (Bot Fight Mode, Web Analytics,
Rocket Loader, Email Obfuscation, NEL) can inject scripts or headers into
this app. How they are turned off for this hostname, and how to verify it, is
in [`runbook.md`](runbook.md#cloudflare-zone).
