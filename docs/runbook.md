# Runbook

Operational procedures for the production site `https://wayfarer.ashwinsathian.com` (Cloudflare Workers static assets, zone `ashwinsathian.com`). Every change made through a dashboard is recorded in the change record of its section, so it can be audited and reverted.

## Cloudflare zone

### Why

The zone injects scripts and headers that the app's CSP blocks, and that contradict the "no third-party requests" claim:

- **Bot Fight Mode** forces **JavaScript Detections**, which injects an inline `/cdn-cgi/challenge-platform/...` script into every HTML page. CSP (`script-src 'self'`) blocks it, and the console logs a violation on every load.
- **Web Analytics (RUM)** injects the `static.cloudflareinsights.com` beacon, which CSP also blocks.
- **Email Obfuscation** and **Rocket Loader** rewrite HTML and inject scripts.
- **Network Error Logging** adds `nel` and `report-to` headers, which make browsers send error reports to Cloudflare.

### Steps (dashboard, zone `ashwinsathian.com`)

1. **Bot Fight Mode off.** Security → Settings → filter "Bot traffic" → **Bot Fight Mode** → off. This is zone-wide: Bot Fight Mode has no per-hostname scope and cannot be skipped by rules.
2. **JavaScript Detections off.** On the same page, turn **JavaScript Detections** off. The toggle only becomes available once Bot Fight Mode is off.
3. **Configuration Rule.** Rules → Configuration Rules → Create rule:
   - Name: `wayfarer-no-injection`
   - When incoming requests match: custom filter expression `http.host eq "wayfarer.ashwinsathian.com"`
   - Settings:
     - **Disable Real User Monitoring (RUM)**: on
     - **Email Obfuscation**: off
     - **Rocket Loader**: off
   - Deploy.
4. **Web Analytics site.** Analytics & Logs → Web Analytics. If a site exists for `wayfarer.ashwinsathian.com` with automatic setup, disable automatic setup for it, or delete the site.
5. **Network Error Logging off.** Network → **Network Error Logging** → off. The API equivalent (the token needs Zone Settings: Edit):

   ```sh
   curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/nel" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"value":{"enabled":false}}'
   ```

6. Fill in the change record below.

### Verify

Each command must print nothing:

```sh
curl -s https://wayfarer.ashwinsathian.com/ | grep -E 'cdn-cgi/challenge-platform|cloudflareinsights'
curl -sI https://wayfarer.ashwinsathian.com/ | grep -iE '^(nel|report-to):'
```

Then load the site in a browser with DevTools open. The console must show no Content Security Policy violations. From Phase 1, the `no-edge-injection` `@claim` smoke test (P0.12, run every 6 hours by `synthetic.yml`, P1.8) checks the same thing automatically, so a setting that is turned back on is caught.

### Revert

Undo each step in reverse order: delete rule `wayfarer-no-injection`, and turn Network Error Logging, JavaScript Detections and Bot Fight Mode back on. Reverting brings the CSP violations back.

### Change record

| Date (UTC) | Who | Step | Before | After |
|---|---|---|---|---|
| _pending_ | | 1. Bot Fight Mode | | off |
| _pending_ | | 2. JavaScript Detections | | off |
| _pending_ | | 3. Configuration Rule `wayfarer-no-injection` | absent | RUM disabled, Email Obfuscation off, Rocket Loader off |
| _pending_ | | 4. Web Analytics site | | |
| _pending_ | | 5. Network Error Logging | | off |

## GitHub Actions deploy secrets

`deploy.yml` (production) and `preview.yml` (PR previews) need two repository secrets. Without them, every run fails with `it's necessary to set a CLOUDFLARE_API_TOKEN environment variable`, and merges to `main` don't reach production.

1. Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**. Scope it to the account that owns the `wayfarer` Worker and to the zone `ashwinsathian.com`.
2. GitHub → repository Settings → Secrets and variables → Actions → New repository secret:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID from the Workers & Pages overview.
3. Verify: re-run the latest failed `Deploy` workflow on `main` (Actions → Deploy → Re-run jobs). It must end green, and `curl -s https://wayfarer.ashwinsathian.com/ | grep -o 'main-[A-Z0-9]*\.js'` must print the same bundle name as the fresh `dist/wayfarer/browser/index.html`.

Rotate the token by creating a new one, updating the secret, re-running Deploy, and then revoking the old token.

## npm name reservation

`wayfarer-bridge` and `wayfarer-cli` are reserved with placeholder releases until their first real release (v2.4.0, P6.6). This needs an npm account with 2FA.

1. `npm login` (as the maintainer account), then `npm whoami` to confirm.
2. Publish both placeholders from a scratch directory. The script is not indented, so its heredocs work when pasted into a shell:

```sh
for name in wayfarer-bridge wayfarer-cli; do
dir="$(mktemp -d)/$name"; mkdir -p "$dir" && cd "$dir" || exit 1
cat > package.json <<JSON
{
  "name": "$name",
  "version": "0.0.0-reserved",
  "description": "Name reserved for github.com/AshwinSathian/wayfarer",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/AshwinSathian/wayfarer.git" }
}
JSON
cat > README.md <<MD
# $name

Name reserved for [github.com/AshwinSathian/wayfarer](https://github.com/AshwinSathian/wayfarer); first release ships with v2.4.0.

Until then, \`latest\` points at this placeholder, which contains no code. The first real release replaces it.
MD
npm publish --access public --tag latest   # prompts for the 2FA code
cd - >/dev/null
done
```

3. Verify: both commands list the maintainer account.

   ```sh
   npm view wayfarer-bridge maintainers
   npm view wayfarer-cli maintainers
   ```

When the first real versions ship (P6.6), run `npm deprecate wayfarer-bridge@0.0.0-reserved "placeholder; use the latest release"`, and the same for `wayfarer-cli`.
