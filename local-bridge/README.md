# Wayfarer Local Bridge

An **optional** companion process that lets Wayfarer reach APIs a browser
tab structurally cannot: intranet-only hosts, or hosts that don't send
permissive CORS headers. It runs entirely on your own machine, has zero
runtime dependencies, and stays off unless you explicitly start it.

This exists because of a browser platform constraint, not an engineering
gap: browsers cannot bypass CORS by policy, and Wayfarer is (deliberately)
not an Electron app that could sidestep that sandbox.

## When you need this

You don't, most of the time. The vast majority of public APIs either send
correct CORS headers or Wayfarer's direct browser fetch already reaches
them fine. Run the bridge only when a request fails with a CORS/network
error against a host you know is reachable (an internal API, a local dev
server without CORS configured, etc.).

## Quick start

```bash
node local-bridge/bin/cli.js
# or, from the repo root:
npm run bridge
```

This prints a **port** (default `7717`) and a **bridge token**. Open
Wayfarer, go to the Local Bridge settings (toolbar → bridge icon), enable
it, and enter both. While it is enabled, **every** request goes through the
bridge; there is no per-request choice and no automatic fallback from a
failed direct request ([#79](https://github.com/AshwinSathian/wayfarer/issues/79)).
Turn it off in the same settings to go back to direct requests.

The bridge isn't published to npm yet; run it from a clone of this
repository.

Stop the process (`Ctrl+C`) when you're done; it doesn't need to run
continuously, and per the security model below, it shouldn't.

## How it works

1. Wayfarer's own code never talks to the bridge unless you've explicitly
   enabled it in settings.
2. When enabled, instead of the browser calling the target API directly, it
   `POST`s a small JSON envelope (`{ method, url, headers, body }`) to
   `http://127.0.0.1:<port>/relay`, authenticated with a bearer-style token
   header.
3. The bridge process (running as a normal OS process, not sandboxed like
   a browser tab) makes the actual HTTP(S) request to your target and
   returns the target's status/headers/body wrapped in a JSON envelope.
4. Wayfarer unwraps that envelope and displays it exactly like a direct
   response, so the request composer, response viewer, scripts, and test
   assertions all work unmodified against a bridged request.

The bridge never talks to any Wayfarer-operated server; the only two
parties in this flow are your browser and the target you specified.

## Security model

This is the part worth reading before you run it against anything you care
about. A local relay that forwards arbitrary HTTP requests is a real
capability, and it deserves the same "state the trade-off plainly" treatment
the rest of this project gives its security-relevant surfaces.

- **Binds to `127.0.0.1` only.** The bridge is never reachable from another
  device on your network; only processes on your own machine can even
  open a TCP connection to it.
- **Origin allowlist.** Every request must carry a browser-set `Origin`
  header matching an explicitly allowed value (the hosted Wayfarer app and
  local dev origins by default; add more with `--allow-origin`). A page
  from any other origin fails CORS preflight before the browser will even
  send the real request.
- **Token-authenticated.** Every `/relay` call must also carry the correct
  bridge token in an `X-Wayfarer-Bridge-Token` header. This is a second,
  independent gate on top of the Origin check: Origin alone only proves
  *which site* is asking, not that it's a Wayfarer instance you configured.
  The token is generated on first run, persisted at
  `~/.wayfarer-local-bridge/token` (mode `0600`) so it survives restarts,
  and compared with a constant-time check to avoid trivial timing leaks.
- **What the token protects against, and what it doesn't:** anyone who
  learns your token *and* can get a page loaded from an allowed origin into
  your browser could make the bridge issue requests on your behalf. This
  is inherent to any local relay of this shape, not specific to this
  implementation. Treat the token like a credential: don't paste it into
  chat, a screenshot, or a shared terminal. `--rotate-token` invalidates the
  old one immediately.
- **No target-side allowlist by design.** The bridge will relay to any
  `http(s)://` host you tell it to; that's the point (reaching arbitrary
  intranet/CORS-restrictive targets). It does **not** protect you from
  yourself pointing it at a target you didn't mean to; you are the operator
  and the sole intended caller.
- **Zero runtime dependencies.** The entire implementation is Node's own
  `http`/`https`/`crypto` modules, nothing to audit in a dependency tree,
  nothing that can be compromised by a supply-chain attack on an upstream
  package.
- **Nothing is logged or persisted beyond the token.** Relayed
  requests/responses exist only in memory for the duration of each call.

## Known limitations (MVP scope)

- Response bodies are decoded as UTF-8 text unless the target's
  `Content-Type` clearly indicates a binary format (images, audio, video,
  `application/octet-stream`, `application/pdf`, `application/zip`, and
  similar), in which case they're base64-encoded. A binary response served
  with a misleading textual `Content-Type` will be decoded lossily.
- Outgoing bodies are always sent with `Content-Length` (chunked
  transfer-encoding isn't used), which some very old or nonstandard servers
  may not expect.
- No streaming: the full response is buffered in memory before being
  wrapped and returned, capped at 25MB.
- No redirect following: redirects come back as an ordinary 3xx response.
  A direct browser request, by contrast, follows redirects and shows only
  the final response.
- Multiple `Set-Cookie` headers are joined into one comma-separated value,
  which breaks cookies whose `Expires` contains a comma, and compressed
  responses are not decompressed
  ([#80](https://github.com/AshwinSathian/wayfarer/issues/80)).
- Whether browsers let the hosted HTTPS app reach `http://127.0.0.1` is not
  yet verified in every browser (Chrome's Local Network Access prompt,
  Safari's mixed-content rules)
  ([#99](https://github.com/AshwinSathian/wayfarer/issues/99)).

## CLI reference

```
wayfarer-local-bridge [options]

  --port <n>            Port to listen on (default: 7717)
  --token <value>        Use a fixed token instead of the persisted/generated one
  --rotate-token          Generate and persist a fresh token, replacing the saved one
  --allow-origin <url>    Additional allowed Origin (repeatable)
  --help                  Show help
```

## Development

```bash
cd local-bridge
npm test   # node --test test/, zero external test dependencies
```
