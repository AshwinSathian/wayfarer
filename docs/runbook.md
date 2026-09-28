# Runbook

Operational procedures for the production site `https://wayfarer.ashwinsathian.com` (Cloudflare Workers static assets, zone `ashwinsathian.com`). Every change made through a dashboard is recorded in the change record of its section, so it can be audited and reverted. Deploys and rollbacks: [`deployment.md`](deployment.md).

## Cloudflare zone

### Why

The zone injects scripts and headers that the app's CSP blocks, and that contradict the "no third-party requests" claim. Seen on production on 2026-09-28 (`no-edge-injection` test, 6 violations):

- **Bot Fight Mode** forces **JavaScript Detections**, which injects an inline `/cdn-cgi/challenge-platform/...` script into every HTML page. CSP (`script-src 'self'`) blocks it, and the console logs a violation on every load.
- **Web Analytics (RUM)** injects the `static.cloudflareinsights.com` beacon, which CSP also blocks.
- **Email Obfuscation**, **Rocket Loader** and **Zaraz** rewrite HTML and can inject scripts.
- **Network Error Logging** adds `nel` and `report-to` headers, which make browsers send error reports to Cloudflare.

### 0. Before you change anything

1. **Record a baseline**, so the effect of each step is provable:

   ```sh
   mkdir -p ~/wayfarer-zone-baseline && cd ~/wayfarer-zone-baseline
   curl -s  https://wayfarer.ashwinsathian.com/ > before.html
   curl -sI https://wayfarer.ashwinsathian.com/ > before.headers
   grep -oE 'cdn-cgi/challenge-platform[^"]*|cloudflareinsights[^"]*' before.html
   grep -iE '^(nel|report-to|speculation-rules|server-timing|cf-)' before.headers
   ```

2. **Check what else lives on the zone.** Bot Fight Mode can only be turned off for the whole zone. In DNS → Records, list every proxied (orange-cloud) hostname on `ashwinsathian.com`. For each one that relies on bot protection (a form, a login page), decide how it is protected once Bot Fight Mode is off. On the Free plan the usual answer is one WAF custom rule (Security → WAF → Custom rules, action *Managed Challenge*) scoped to that hostname and path, plus the free rate-limiting rule if it takes submissions. A static site needs neither.

### 1. Bot Fight Mode off

Security → Settings → filter **Bot traffic** → **Bot Fight Mode** → off.

It is zone-wide: Bot Fight Mode has no per-hostname scope and runs outside the rules engine, so a Configuration Rule or WAF skip can't exempt one hostname.

### 2. JavaScript Detections off

On the same page, turn **JavaScript Detections** off. It can only be turned off once Bot Fight Mode is off. It is not a Configuration Rule setting either.

### 3. Configuration Rule `wayfarer-no-injection`

Rules → Configuration Rules → **Create rule**:

- Rule name: `wayfarer-no-injection`
- If incoming requests match: **Custom filter expression**, then *Edit expression*:

  ```
  http.host eq "wayfarer.ashwinsathian.com"
  ```

- Then the settings are (only these; leave the rest untouched):
  - **Disable Real User Monitoring (RUM)**: on
  - **Disable Zaraz**: on
  - **Email Obfuscation**: off
  - **Rocket Loader**: off
- Place it **last** (after other configuration rules), so a broader rule added later can't override it. Deploy.

The rule is scoped to the one hostname, so the rest of the zone keeps these features.

### 4. Web Analytics site

Analytics & Logs → Web Analytics. If a site exists for `wayfarer.ashwinsathian.com` (or for the whole `ashwinsathian.com` zone) with **automatic setup**, open it → **Manage site** → turn automatic setup off for this hostname, or delete the site if nothing else uses it. The Configuration Rule already stops the injection; this removes the source, so the rule isn't the only thing keeping it off.

### 5. Network Error Logging off

Network → **Network Error Logging** → off. It is a zone-wide setting. The API equivalent, with a token that has *Zone Settings: Edit*:

```sh
curl -sX PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/nel" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value":{"enabled":false}}' | jq '.success, .result.value'
```

### 6. Verify

Each command must print nothing:

```sh
curl -s  https://wayfarer.ashwinsathian.com/ | grep -E 'cdn-cgi/challenge-platform|cloudflareinsights|rocket-loader|email-decode'
curl -sI https://wayfarer.ashwinsathian.com/ | grep -iE '^(nel|report-to):'
```

Then compare all response headers against what `public/_headers` sets. Anything not in this list (besides standard ones like `date`, `content-type`, `cf-ray`, `server`) came from the zone:

```sh
curl -sI https://wayfarer.ashwinsathian.com/ | cut -d: -f1 | tr 'A-Z' 'a-z' | sort
```

Then run the automated check. It fails on any CSP violation during page load:

```sh
BASE_URL=https://wayfarer.ashwinsathian.com npx playwright test e2e/no-edge-injection.spec.ts
```

Finally, load the site in a private window with DevTools open: the console must show no Content Security Policy violations, and the Network tab no request to any host other than `wayfarer.ashwinsathian.com`. Settings changes can take a minute to reach every edge location. If the first check still shows injection, wait and retry before assuming a step failed.

### 7. Read-only audit via API (optional, repeatable)

A token with *Zone Settings: Read* and *Zone: Read* is enough to re-check the zone at any time without the dashboard:

```sh
Z="https://api.cloudflare.com/client/v4/zones/$ZONE_ID"
H=(-H "Authorization: Bearer $CF_READ_TOKEN")
curl -s "${H[@]}" "$Z/settings/nel"                    | jq -c '.result.value'
curl -s "${H[@]}" "$Z/bot_management"                  | jq -c '.result | {fight_mode, enable_js}'
curl -s "${H[@]}" "$Z/rulesets/phases/http_config_settings/entrypoint" \
  | jq -c '.result.rules[] | select(.description=="wayfarer-no-injection") | {enabled, expression, action_parameters}'
```

Expected: `{"enabled":false}`; `fight_mode: false, enable_js: false`; the rule enabled with the host expression and the four settings above. The API field names aren't verified by any test here; if a filter prints `null`, print `.result` and read the actual names.

### Revert

Undo each step in reverse order: delete rule `wayfarer-no-injection`, re-enable Web Analytics automatic setup, and turn Network Error Logging, JavaScript Detections and Bot Fight Mode back on. Reverting brings the CSP violations back, and the `no-edge-injection` test fails again.

### Optional zone hardening (not required by the plan)

These are good hygiene for a site whose pitch is trust. Each changes behaviour for the whole zone, so they're listed separately and are your call:

- **SSL/TLS → Edge Certificates:** *Always Use HTTPS* on; *Minimum TLS Version* 1.2; *TLS 1.3* on.
- **HSTS:** better sent from `public/_headers` for this host only (`Strict-Transport-Security: max-age=31536000`) than zone-wide. Don't tick *includeSubDomains* or *preload* unless every subdomain of `ashwinsathian.com` is HTTPS-only forever: preload is effectively irreversible.
- **DNS → Settings → DNSSEC:** enable it, then add the DS record at your registrar if it isn't Cloudflare.

### Change record

| Date (UTC) | Who | Step | Before | After |
|---|---|---|---|---|
| _pending_ | | 0. Baseline captured | | |
| _pending_ | | 1. Bot Fight Mode | | off |
| _pending_ | | 2. JavaScript Detections | | off |
| _pending_ | | 3. Configuration Rule `wayfarer-no-injection` | absent | RUM disabled, Zaraz disabled, Email Obfuscation off, Rocket Loader off |
| _pending_ | | 4. Web Analytics site | | |
| _pending_ | | 5. Network Error Logging | | off |

## npm name reservation

`wayfarer-bridge` and `wayfarer-cli` are reserved with placeholder releases until their first real release (v2.4.0, P6.6). This needs an npm account with 2FA.

### 1. Account security first

```sh
npm login --auth-type=web      # browser login; supports passkeys and security keys
npm whoami
npm profile get                # "two-factor auth" must say "auth-and-writes"
```

If 2FA isn't `auth-and-writes`, turn it on (`npm profile enable-2fa auth-and-writes`, or npmjs.com → Account → Two-Factor Authentication). Prefer a security key or passkey over an authenticator app.

### 2. Check the names are still free and publishable

```sh
npm view wayfarer-bridge; npm view wayfarer-cli      # both must fail with E404
```

npm also rejects names too similar to existing ones (same letters once punctuation is removed), so a free name can still be refused at publish time. `npm view wayfarerbridge` and `npm view wayfarercli` should also 404. If a publish is refused, the fallback is the scoped names `@wayfarer-http/bridge` and `@wayfarer-http/cli` (plan risk R11).

### 3. Build and inspect the placeholders

Run this block as is. The loop runs in a subshell with `set -e`, so it stops on the first failure without closing your shell, and `$ROOT` stays set for step 4:

```sh
ROOT="$(mktemp -d)"; echo "$ROOT"
( set -e
for name in wayfarer-bridge wayfarer-cli; do
mkdir -p "$ROOT/$name"
cat > "$ROOT/$name/package.json" <<JSON
{
  "name": "$name",
  "version": "0.0.0-reserved",
  "description": "Name reserved for github.com/AshwinSathian/wayfarer; first release ships with v2.4.0",
  "license": "MIT",
  "author": "Ashwin Sathian",
  "homepage": "https://github.com/AshwinSathian/wayfarer",
  "repository": { "type": "git", "url": "git+https://github.com/AshwinSathian/wayfarer.git" },
  "files": ["README.md"]
}
JSON
cat > "$ROOT/$name/README.md" <<MD
# $name

Name reserved for [github.com/AshwinSathian/wayfarer](https://github.com/AshwinSathian/wayfarer); first release ships with v2.4.0.

Until then, \`latest\` points at this placeholder, which contains no code. The first real release replaces it.
MD
(cd "$ROOT/$name" && npm publish --dry-run --access public --tag latest)
done )
```

The dry run must list only `package.json` and `README.md` in each tarball.

### 4. Publish

```sh
cd "$ROOT/wayfarer-bridge" && npm publish --access public --tag latest
cd "$ROOT/wayfarer-cli"    && npm publish --access public --tag latest
```

Each publish asks for 2FA. `--tag latest` is required: npm refuses to publish a prerelease version such as `0.0.0-reserved` without an explicit tag.

### 5. Lock the packages down

```sh
npm access set mfa=publish wayfarer-bridge      # every publish needs 2FA; tokens can't publish
npm access set mfa=publish wayfarer-cli
npm access list collaborators wayfarer-bridge   # only your account, read-write
npm access list collaborators wayfarer-cli
npm view wayfarer-bridge dist-tags maintainers  # latest: 0.0.0-reserved; your account
npm view wayfarer-cli    dist-tags maintainers
```

These are the P0.13 checks: `npm view … maintainers` lists the maintainer account.

### Notes for the first real release (P6.6)

- Publish from CI with **trusted publishing**: npmjs.com → package → Settings → Trusted Publisher → GitHub Actions, repository `AshwinSathian/wayfarer`, workflow `release.yml`. CI then publishes through OIDC, with no stored token, and gets a provenance attestation automatically. The package has to exist before a trusted publisher can be added, which is one more reason to reserve now. At that point, change `mfa=publish` to the setting the npm docs recommend for trusted publishing.
- After the real release: `npm deprecate wayfarer-bridge@0.0.0-reserved "placeholder; use the latest release"`, and the same for `wayfarer-cli`.
- Don't unpublish the placeholders. npm allows unpublishing only within 72 hours, and an unpublished name can't be reused for 24 hours, which is a window for a squatter.
