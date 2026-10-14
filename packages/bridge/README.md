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
node packages/bridge/bin/cli.js
# or, from the repo root:
npm run bridge
```

This prints its address (default `http://127.0.0.1:7717`), a **pairing
code** and the **bridge token**. Open Wayfarer, go to Settings → Local Bridge
(the toolbar's bridge icon opens it there), switch it on, type the pairing
code and press **Pair**: the bridge gives the page its token, and the
settings are saved. Or paste the token yourself and Save. While it is enabled, **every** request goes through the
bridge; there is no per-request choice and no automatic fallback from a
failed direct request ([#79](https://github.com/AshwinSathian/wayfarer/issues/79)).
Turn it off in the same settings to go back to direct requests.

**Where the app keeps the token.** In the vault, as the secret "Local Bridge
token", when the vault is unlocked as you save it or later in that tab. A
send through the bridge then asks for the vault's passphrase when the tab
does not hold the token yet. With no vault, or with it locked, the token is
in that tab's memory and you enter it again after a reload. It is not
written to `localStorage`; a token an earlier version left there is removed
the next time the app starts.

The bridge isn't published to npm yet; run it from a clone of this
repository.

Stop the process (`Ctrl+C`) when you're done; it doesn't need to run
continuously, and per the security model below, it shouldn't.

## How it works

1. Wayfarer's own code never talks to the bridge unless you've explicitly
   enabled it in settings.
2. When enabled, instead of the browser calling the target API directly, it
   `POST`s a small JSON envelope to `http://127.0.0.1:<port>/v2/relay`
   (see [Protocol](#protocol)), authenticated with a bearer-style token
   header.
3. The bridge process (running as a normal OS process, not sandboxed like
   a browser tab) makes the actual HTTP(S) request to your target and
   returns the target's status/headers/body wrapped in a JSON envelope.
4. Wayfarer unwraps that envelope and displays it exactly like a direct
   response, so the request composer, response viewer, scripts, and test
   assertions all work unmodified against a bridged request.

The bridge never talks to any Wayfarer-operated server; the only two
parties in this flow are your browser and the target you specified.

### From the hosted app, in each browser

- **Chrome and Edge** ask, the first time the page reaches the bridge,
  whether the site may look for and connect to devices on your local
  network (Local Network Access). Allow it: the bridge is on this computer.
  Blocked by mistake, it is allowed again in the site's settings (the icon
  left of the address). Settings → Local Bridge says this before you test.
- **Firefox** reaches `http://127.0.0.1` from the hosted app.
- **Safari** does not reach `http://127.0.0.1` from an HTTPS page (mixed
  content). Start the bridge over HTTPS with a certificate of yours, and
  give Wayfarer the `https://` address:

  ```bash
  # mkcert makes an authority your browsers trust, and a certificate from it:
  mkcert -install
  mkcert -cert-file bridge.pem -key-file bridge-key.pem localhost 127.0.0.1
  npm run bridge -- --cert bridge.pem --key bridge-key.pem

  # or with openssl alone: a self-signed certificate you then trust by hand
  # (Keychain Access on a Mac: open bridge.pem, set "Always Trust")
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout bridge-key.pem -out bridge.pem \
    -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  ```

  The bridge reads the two files and makes no certificate itself; with
  them it speaks HTTPS only.

## Security model

This is the part worth reading before you run it against anything you care
about. A local relay that forwards arbitrary HTTP requests is a real
capability, and it deserves the same "state the trade-off plainly" treatment
the rest of this project gives its security-relevant surfaces.

- **Binds to `127.0.0.1` only.** The bridge is never reachable from another
  device on your network; only processes on your own machine can even
  open a TCP connection to it.
- **Loopback `Host` only.** A request whose `Host` header is not
  `127.0.0.1`, `localhost` or `[::1]` is refused with 421. That stops DNS
  rebinding, where a page's own hostname is re-pointed at your machine.
- **Origin allowlist.** Every request must carry a browser-set `Origin`
  header matching an explicitly allowed value (the hosted Wayfarer app and
  local dev origins by default; add more with `--allow-origin`). A page
  from any other origin fails CORS preflight before the browser will even
  send the real request.
- **Pairing, once.** The pairing code printed at start is exchanged for the
  token by `POST /pair` from an allowed origin. It works once (then 410),
  is eight characters of 31 (no `0`, `O`, `1`, `I`, `L`), and three wrong
  codes in a row lock pairing for 60 seconds, the right code included
  (429 with `Retry-After`). A page that paired before you would have the
  token; you would see your own Pair refused with "was used": stop the
  bridge and start it with `--rotate-token`.
- **Private Network Access.** A preflight from an allowed origin that asks
  for the private network (`Access-Control-Request-Private-Network: true`)
  is answered `Access-Control-Allow-Private-Network: true`.
- **Token-authenticated.** Every relay call must also carry the correct
  bridge token in an `X-Wayfarer-Bridge-Token` header. This is a second,
  independent gate on top of the Origin check: Origin alone only proves
  *which site* is asking, not that it's a Wayfarer instance you configured.
  The token is generated on first run, persisted at
  `~/.wayfarer-local-bridge/token` (mode `0600`, re-applied at every start)
  so it survives restarts,
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
  `http`/`https`/`crypto`/`zlib` modules, nothing to audit in a dependency tree,
  nothing that can be compromised by a supply-chain attack on an upstream
  package.
- **Nothing is logged or persisted beyond the token.** Relayed
  requests/responses exist only in memory for the duration of each call.

## Protocol

The bridge speaks **protocol 2**, and so does the page. The number is in the
relay's path, so a page and a bridge of different protocols do not guess at
each other: a bridge of protocol 1 has no `/v2/relay` and sends nothing,
and the page says the bridge is too old. `GET /health` answers
`{ ok, name, version, protocol, capabilities }`; Settings → Local Bridge →
Test connection reads it.

```
POST /v2/relay
{ "method": "POST", "url": "https://api.internal/x",
  "headers": [["Content-Type", "application/json"]],   // a list: a name may repeat
  "bodyB64": "eyJhIjoxfQ==",                           // the body's bytes; absent for none
  "timeoutMs": 30000,                                  // absent: 30 s; at most 10 minutes
  "tls": { "insecure": true } }                        // absent: the certificate is verified (2.1.0)

200
{ "status": 200, "statusText": "OK",
  "headers": [["Set-Cookie", "a=1"], ["Set-Cookie", "b=2"]],   // as received, one entry each
  "bodyB64": "…",                                             // the body's bytes, decoded
  "encodedSize": 512, "decodedSize": 2048,
  "timings": { "dns": 1.2, "tcp": 3.4, "tls": 21.0, "ttfb": 48.6, "content": 2.1 } }   // milliseconds (2.1.0)
```

**Capabilities.** Protocol 2 has grown since Local Bridge 2.0.0, and
`/health` lists what a bridge can do: `bytes`, `decompression`,
`header-list`, `timeout` (2.0.0), and `timings`, `tls-insecure`, `host`
(2.1.0). Local Bridge 2.0.0 refuses a field it does not know and took a
`Host` header off, so the page reads `/health` before it sends `tls` or a
`Host` header, and sends neither to a bridge that does not list it: it says
to update the bridge instead.

- **Bytes both ways.** A body is never read as text here: a file, a
  multipart form and a response in any charset arrive as they were sent.
- **A compressed response is decoded** (`gzip`, `deflate`, `br`), and the
  answer has both sizes. Its `Content-Encoding` header is left as the server
  sent it. When the request names no `Accept-Encoding` the bridge asks for
  those three, as a browser does.
- **Timings** are the bridge's own connection, as durations: the name's
  lookup (`dns`), the TCP connection (`tcp`), the TLS handshake (`tls`),
  the wait from a ready connection to the response's first byte (`ttfb`)
  and the rest of the response (`content`). A part that did not happen is
  absent: no `dns` for an address that is a number, no `tls` for `http:`.
  Through a proxy, `tcp` is the connection to the proxy.
- **`tls.insecure`** switches certificate verification off for that one
  request: any certificate is accepted, also one for another name. The
  field is exactly `{ "insecure": true }` or absent. Wayfarer shows a red
  "TLS verification off" pill on such a request and on its response.
- **A `Host` header of the request's is sent as written.** One at most.
- **The request's timeout is the bridge's**: one deadline for the whole
  exchange. A target that does not answer in time is a 504.
- **A wrong field is refused** with 400 and a message: a field of the wrong
  type, or one the protocol does not have, is never read as something else.
- Any other status is the bridge's own answer, `{ "error": … }`: 401 for
  the token, 403 for the origin, 421 for the `Host`, 502 when the target
  could not be reached or its body could not be decoded or was too large.

## Known limitations

- Outgoing bodies are always sent with `Content-Length` (chunked
  transfer-encoding isn't used), which some very old or nonstandard servers
  may not expect.
- No streaming: the full response is buffered in memory before being
  wrapped and returned. The cap is 25 MB, for the request as it arrives at
  the bridge (base64 inside JSON: some 18 MB of body), for the response as
  received and for the response as decoded.
- No redirect following: redirects come back as an ordinary 3xx response.
  Wayfarer follows them itself, each hop as a relay of its own, and lists
  them. A direct browser request, by contrast, is followed by the browser
  and shows only the final response.
- Each relay makes a connection of its own (none is kept for the next), so
  that its timings are always those of a whole exchange.
- The proxy variables are read by Node itself (`http.Agent`'s `proxyEnv`),
  which is why the bridge needs Node 22.21 or 24.5 and later. A proxy that
  asks for a user name and password is not tested.
- Reaching the bridge from the hosted app was measured in 2026-09 (Chrome's
  Local Network Access prompt, Safari's mixed content: see
  `docs/browser-limits.md`, "Bridge reachability"); the pairing flow and
  HTTPS mode are tested in Playwright's Chromium, not yet in Safari itself
  ([#99](https://github.com/AshwinSathian/wayfarer/issues/99)).

## CLI reference

```
wayfarer-bridge [options]

  --port <n>            Port to listen on (default: 7717)
  --token <value>        Use a fixed token (16 characters or more) instead of the
                          persisted/generated one. Other users of the machine can
                          read it in the process list: prefer the
                          WAYFARER_BRIDGE_TOKEN environment variable.
  --rotate-token          Generate and persist a fresh token, replacing the saved one
  --cert <file>           Serve HTTPS with this PEM certificate (with --key)
  --key <file>            The certificate's PEM private key
  --allow-origin <url>    Additional allowed Origin (repeatable), e.g. https://example.com
  --ca <file>             A file of PEM certificates to trust besides the public
                          authorities (a server whose certificate your own
                          authority signed)
  --help                  Show help
```

`HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` (in either case) are honoured for
the requests the bridge sends: start it with them set. The target's
certificate is verified through a proxy's tunnel as without one.

A wrong argument (a port that is not a number, an option without its value)
stops the bridge with an error instead of falling back to a default.

## Development

```bash
cd packages/bridge
npm test   # node --test test/, zero external test dependencies
```

`test/fixtures/` holds a certificate authority and a certificate for
`localhost` and `127.0.0.1`, made once with `openssl` for the tests (and the
e2e of TLS verification off). Its private key is public on purpose: nothing
trusts that authority but a test that names it.
