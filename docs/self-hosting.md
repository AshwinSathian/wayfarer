# Self-hosting

Wayfarer is a folder of static files. Any host that serves files over HTTPS
and lets you set response headers can run it. There is no server code,
database or environment variable to configure.

## Get the folder

- **From a release:** each [GitHub release](https://github.com/AshwinSathian/wayfarer/releases)
  attaches `wayfarer-<version>.tar.gz` (the built folder), a CycloneDX SBOM
  and `SHA256SUMS`. Check the download before you unpack it:

  ```bash
  sha256sum --check --ignore-missing SHA256SUMS
  tar -xzf wayfarer-<version>.tar.gz
  ```

- **From source:** `npm ci && npm run build`. The folder is
  `dist/wayfarer/browser`.

## Serve it

Serve the folder's root at the root of an origin (`https://api-client.example.com/`,
not a subpath). The app, its service worker (`/sw.js`) and its workers
expect to be at `/`.

1. **HTTPS.** The vault (WebCrypto), the service worker and the clipboard
   need a secure context. `http://localhost` counts as one; nothing else
   served over plain HTTP does.
2. **Every unknown path serves `index.html`** with status 200, so a reload
   on any address opens the app.
3. **`/oauth/callback` serves `oauth/callback.html`**, without a redirect
   that drops the query. This is the redirect URI of OAuth 2.0 sign-ins
   ([Auth](auth.md)). Many hosts already serve `x.html` at `/x`; if yours
   does not, add a rewrite. Register `https://<your origin>/oauth/callback`
   with your identity provider.
4. **The headers in `_headers`** (shipped in the folder, in Cloudflare's and
   Netlify's format) on every response:

   | Header | Why |
   |---|---|
   | `Content-Security-Policy` | No script but the app's own, no `eval`, Trusted Types for DOM script sinks. Without it, an injected script could reach your vault while it is unlocked. Copy it exactly; it is generated from `security/csp.json`. |
   | `Cross-Origin-Opener-Policy: same-origin` | The OAuth sign-in window answers on a `BroadcastChannel`, never through `window.opener`. |
   | `Cross-Origin-Resource-Policy: same-origin` | Other sites cannot embed the app's files. |
   | `X-Content-Type-Options: nosniff` | A file is read as its type. |
   | `Referrer-Policy: strict-origin-when-cross-origin` | Addresses do not leave in a `Referer`. |
   | `Permissions-Policy` | Camera, microphone, location, payment and USB are off. |
   | `Strict-Transport-Security` | Optional, for your host only. |

   For hosts that do not read `_headers`, set the same values in the host's
   own configuration (nginx `add_header … always;`, Caddy `header`, an S3
   and CloudFront response headers policy, and so on).
5. **No caching of `index.html` and `sw.js`** beyond revalidation. Hashed
   files (`main-XXXXXXXX.js`) can be cached forever.

## Check it

Open the app, then Settings → Diagnostics → **Run self-tests**: each of the
five should pass. In the browser's console there should be no
Content-Security-Policy violation (Diagnostics lists any it saw).

## The Local Bridge

The bridge relays only for origins it allows. Its list holds the hosted app
and local development addresses; add yours when you start it:

```bash
npx wayfarer-bridge --allow-origin https://api-client.example.com
```

## What changes when you host it

Nothing of your data: it lives in each user's browser, under your origin.
Data stored under the hosted app's origin does not move to yours. Export
collections or back up the workspace there, and import or restore here.
