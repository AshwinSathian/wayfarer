# Deployment

Wayfarer is a static Angular build served by [Cloudflare Workers with static
assets](https://developers.cloudflare.com/workers/static-assets/). Configuration
lives in [`wrangler.jsonc`](../wrangler.jsonc).

**Production:** https://wayfarer.ashwinsathian.com/

## How it ships

Production ships by hand today: [Manual deploy](#manual-deploy), from a
laptop logged in to Cloudflare with `wrangler login`. `deploy.yml` below
needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets
([One-time setup](#one-time-setup-owner)), which the repository does not
have yet, and has not run without them.

**Build once, deploy what was tested** (P1.7). Every push to `main` runs CI
(`.github/workflows/ci.yml`), which builds `dist/deploy` once and uploads it
as the `dist` artifact (kept 14 days). The browser tests are
`.github/workflows/e2e.yml` (Actions → **E2E** → *Run workflow*, or
`gh workflow run e2e.yml`), run by hand: they find the green CI run of the
commit they run on and test exactly its files, in Chromium, Firefox and
WebKit.

`.github/workflows/deploy.yml` (Actions → **Deploy** → *Run workflow*)
deploys a green CI run's artifact without rebuilding, and only when an
`e2e.yml` run of the same commit passed in all three engines (a run with
`engines` set to one browser is green too, and does not count):

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
| `SYNTHETIC_ENABLED` | production runs a release CI built (by `deploy.yml`, or by hand from CI's `dist` artifact) | the 6-hourly schedule does nothing; manual runs still work |

The manual procedure below is how production ships until those secrets are
set.

## Manual deploy

### Prerequisites (once)

- Node 24 (see `.nvmrc`; Angular 22 needs 22.22.3 or later, or 24.15 or later).
- `npx wrangler login`, then `npx wrangler whoami`. The login sees two
  accounts, and only one owns the `wayfarer` Worker: without
  `CLOUDFLARE_ACCOUNT_ID`, wrangler stops and asks which (or, with no
  terminal, fails). Export the ID of the account that owns the Worker in
  the shell you deploy from; it is not kept in this repository:

  ```bash
  export CLOUDFLARE_ACCOUNT_ID=<the account that owns the wayfarer Worker>
  ```

### 1. Preflight

From a worktree of the release tag, not a checkout with other work in it:

```bash
git worktree add ../wayfarer-deploy v1.x.y && cd ../wayfarer-deploy
git status --short                          # must print nothing
CI_RUN=$(gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)" --status success \
  --limit 1 --json databaseId --jq '.[0].databaseId')
test -n "$CI_RUN" || { echo "no green ci.yml run for HEAD"; exit 1; }
npm ci                                      # wrangler and Playwright
gh run download "$CI_RUN" -n dist -D dist   # the files CI built and e2e.yml tested
```

Deploy only a commit whose CI run and E2E run are green, and only from a
clean tree. CI's `dist` artifact is kept 14 days; past that, `npm run
build` makes the files again from the same commit, but they are not the
bytes that were tested. The
deployed files are exactly what is in `dist/deploy`: the site at its root,
the app under `app/`, and `version.json`, the release they are (the
synthetic monitor runs that release's tests). `deploy.yml` adds one file
beside them, `ci-run.json`: the E2E run they passed (where the `@claim` tests
run), its commit and its date, which the claims page (`/docs/claims/`) shows on each claim's row. A
deploy by hand writes the same file, from the green E2E run of the commit it
deploys:

```bash
RUN=
for id in $(gh run list --workflow e2e.yml --commit "$(git rev-parse HEAD)" --status success \
  --limit 20 --json databaseId --jq '.[].databaseId'); do
  n=$(gh run view "$id" --json jobs --jq '[.jobs[] | select(.name | test("^E2E \\((chromium|firefox|webkit)\\)$")) | select(.conclusion == "success")] | length')
  [ "$n" = 3 ] && { RUN=$id; break; }
done
test -n "$RUN" || { echo "no e2e.yml run of HEAD passed in all three engines: run it first"; exit 1; }
gh run view "$RUN" --json databaseId,headSha,createdAt \
  --jq '{run: .databaseId, commit: .headSha, date: .createdAt}' > dist/deploy/ci-run.json
cat dist/deploy/ci-run.json
```

Without it the claims page says it was not deployed from a CI run.

Optional local check, with production's headers applied (Playwright serves
`dist/deploy` through `e2e/support/prod-server.mjs` itself, and builds only
when there is none):

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
curl -sI "$PREVIEW/app/" | grep -i content-security-policy     # the app's CSP from _headers
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
curl -s https://wayfarer.ashwinsathian.com/app/ | grep -oE 'main-[A-Z0-9]+\.js'   # same name as dist/deploy/app/index.html
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

The site at `/` and the app at `/app/` are one deploy (`dist/deploy`), so
one rollback takes both back to that version; neither can be rolled back
alone. To check each after a rollback:

- **The site:** `curl -s https://wayfarer.ashwinsathian.com/version.json`
  names the version rolled back to, and `/` loads.
- **The app:** an open tab keeps the version its service worker holds
  until the app's banner says "A new version of Wayfarer is ready. Reload
  to use it." and the person reloads; Settings shows the version. A version from before the app moved to
  `/app/` needs the steps in [`runbook.md`](runbook.md), "After the deploy
  that moves the app to `/app/` (W1)".

## Headers & CSP

[`packages/site/public/_headers`](../packages/site/public/_headers), the
root of the deploy, is applied by Cloudflare to every response and defines
the Content-Security-Policies (the site's under `/*`; under `/app/*` the
site's is removed and the app's set), `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (this
host only, one year) and the `Cross-Origin-Opener-Policy` /
`Cross-Origin-Resource-Policy` pair. The app's CSP comes from
[`security/csp.json`](../security/csp.json) and the site's from
[`security/csp-site.json`](../security/csp-site.json): `npm run gen:csp`
writes both into that file and the app's into the `<meta>` tag in
`src/index.html`, and
`npm run check:csp` (in CI) fails if either file was edited by hand.
[`e2e/support/prod-server.mjs`](../e2e/support/prod-server.mjs) applies the
same file locally, so CI's e2e runs see production's headers.

## Zone settings

Zone-level features of `ashwinsathian.com` (Bot Fight Mode, Web Analytics,
Rocket Loader, Email Obfuscation, NEL) can inject scripts or headers into
this app. How they are turned off for this hostname, and how to verify it, is
in [`runbook.md`](runbook.md#cloudflare-zone).
