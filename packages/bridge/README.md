# wayfarer-bridge

A small relay that runs on your own computer and lets
[Wayfarer](https://wayfarer.ashwinsathian.com), an API client that runs in
the browser, reach APIs a browser tab can't: hosts that send no CORS headers,
and hosts only your machine can see (an intranet, a dev server on
`localhost`). It binds to `127.0.0.1` only, has no runtime dependencies, and
does nothing until you start it.

```bash
npx wayfarer-bridge
```

```
  wayfarer-bridge v3.0.0 — listening on http://127.0.0.1:7717

  Pairing code: 674M-KU4D
  (enter it in Wayfarer's Local Bridge settings and press Pair; it works once)

  Bridge token: <your token>
  (persisted at ~/.wayfarer-bridge/token — reused across restarts unless you pass --rotate-token)

  Allowed origins:
    - http://localhost:4200
    - http://127.0.0.1:4200
    - https://wayfarer.ashwinsathian.com
```

It needs Node.js 22.21 or later on the 22 line, or 24.5 or later.

## Do you need it?

Usually not. Wayfarer sends a request from the page, and most public APIs
either allow that with CORS headers or don't need a browser at all. Start the
bridge when a request fails with a network or CORS error against a host you
know is up. The browser can't be told to skip CORS, and Wayfarer is a web
page, not a desktop app, so a process outside the browser is the way around
it.

## Pair it with Wayfarer

1. Start the bridge (`npx wayfarer-bridge`).
2. In Wayfarer, open Settings → Local Bridge. The bridge icon in the toolbar
   opens it there.
3. Type the pairing code and press **Pair**. The page gets the bridge's
   token and saves the settings. You can also paste the token yourself and
   press Save.
4. Choose a **Route**:
   - **Auto** (the default): a request goes from the page. If the browser got
     no answer, it is sent again through the bridge. That happens at once
     when the browser's preflight failed (so the request never reached the
     server) or when the method is GET, HEAD or OPTIONS (so sending it twice
     does no harm). Otherwise the browser may have sent it, and Wayfarer
     asks you first. A request that got a response is never sent again.
     Auto needs a paired bridge; without a token it behaves like Direct.
   - **Local Bridge**: every request goes through the bridge.
   - **Direct**: the bridge isn't used.

   A collection or a single request can set its own route; see
   [Routes](https://github.com/AshwinSathian/wayfarer/blob/main/docs/browser-limits.md#routes).

Each response shows a badge, **Direct** or **Via bridge**, so you can see
which way it went.

**Where the app keeps the token.** In Wayfarer's vault, as the secret "Local
Bridge token", if the vault is unlocked when you save. A send through the
bridge then asks for the vault's passphrase if the tab doesn't hold the
token yet. Without a vault, or with it locked, the token stays in that tab's
memory and you enter it again after a reload. It is never written to
`localStorage`.

Stop the bridge with `Ctrl+C` when you're done. It doesn't need to keep
running, and it shouldn't (see [Security](#security)).

## Browsers

- **Chrome and Edge** ask, the first time the page reaches the bridge,
  whether the site may connect to devices on your local network (Local
  Network Access). Allow it: the "device" is this computer. If you blocked it
  by mistake, allow it again in the site's settings (the icon to the left of
  the address).
- **Firefox** reaches `http://127.0.0.1` from the hosted app as it is.
- **Safari** blocks `http://127.0.0.1` from an HTTPS page (mixed content).
  Start the bridge over HTTPS with a certificate your Mac trusts, and give
  Wayfarer the `https://` address:

  ```bash
  # mkcert creates a local certificate authority your browsers trust:
  mkcert -install
  mkcert -cert-file bridge.pem -key-file bridge-key.pem localhost 127.0.0.1
  npx wayfarer-bridge --cert bridge.pem --key bridge-key.pem

  # or with openssl alone, then trust bridge.pem by hand
  # (Keychain Access: open it and set "Always Trust"):
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout bridge-key.pem -out bridge.pem \
    -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  ```

  With `--cert` and `--key` the bridge speaks HTTPS only. It reads the two
  files and never creates a certificate itself.

## Security

Read this before you point the bridge at anything that matters. A local
process that forwards any HTTP request it's given is a real capability, and
these are its limits.

- **Loopback only.** It binds to `127.0.0.1`. No other device on your
  network can connect to it.
- **Loopback `Host` only.** A request whose `Host` isn't `127.0.0.1`,
  `localhost` or `[::1]` gets 421. That stops DNS rebinding, where a web page
  re-points its own hostname at your machine.
- **An allowed `Origin`.** Every request needs an `Origin` header from the
  allowed list: the hosted app and `localhost:4200` by default, plus each
  `--allow-origin`. A page from any other site fails the browser's preflight
  before its request is sent.
- **A token.** Every relay also needs the bridge's token in the
  `X-Wayfarer-Bridge-Token` header, compared in constant time. The origin
  check says which site is asking; the token says it is a Wayfarer you set
  up. The token is 24 random bytes, created on the first run and kept in
  `~/.wayfarer-bridge/token` with mode `0600`, re-applied at every start.
- **Pairing works once.** The code printed at start is exchanged for the
  token by `POST /pair` from an allowed origin, once (after that: 410). Codes
  are eight characters from an alphabet of 31, with no `0`, `O`, `1`, `I` or
  `L`. Three wrong codes in a row lock pairing for 60 seconds, the right code
  included (429 with `Retry-After`). If another page paired before you, your
  own Pair is refused as used: stop the bridge and start it with
  `--rotate-token`.
- **Private Network Access.** A preflight from an allowed origin that asks
  for the private network is answered with
  `Access-Control-Allow-Private-Network: true`.
- **What the token doesn't protect against.** Anyone who has your token and
  can get a page from an allowed origin into your browser can make the bridge
  send requests for you. Any local relay built this way has that property.
  Treat the token as a password: keep it out of chats, screenshots and shared
  terminals. `--rotate-token` replaces it at once.
- **No list of allowed targets.** The bridge relays to any `http:` or
  `https:` address it's given; reaching arbitrary hosts is its job. You are
  its only intended caller.
- **No dependencies, no logs.** It uses Node's own `http`, `https`,
  `crypto` and `zlib`, and nothing from npm. It writes nothing but the token:
  a relayed request and its response exist in memory for the length of the
  call.

## Call it yourself

The bridge is plain HTTP and JSON, so you can try it, or script it, with
`curl`. Send an allowed `Origin`, since there is no browser to add one. The
example posts to a test server on port 4300; put your API's address in `url`:

```bash
TOKEN=$(cat ~/.wayfarer-bridge/token)
BODY=$(printf '{"hello":"world"}' | base64)

curl -s http://127.0.0.1:7717/relay \
  -H "Origin: http://localhost:4200" \
  -H "X-Wayfarer-Bridge-Token: $TOKEN" \
  -d "{\"method\":\"POST\",\"url\":\"http://127.0.0.1:4300/echo\",
       \"headers\":[[\"Content-Type\",\"application/json\"]],\"bodyB64\":\"$BODY\"}"
```

The answer has the target's status, its headers as a list, its body as
base64, both sizes, and how long each part of the exchange took:

```json
{
  "status": 200,
  "statusText": "OK",
  "headers": [["content-type", "application/json; charset=utf-8"], ["Date", "Thu, 15 Oct 2026 16:43:52 GMT"], …],
  "bodyB64": "eyJtZXRob2QiOiJQT1NUIiwidXJsIjoiL2VjaG8i…",
  "encodedSize": 266,
  "decodedSize": 266,
  "timings": { "tcp": 1, "ttfb": 0.5, "content": 0.2 }
}
```

`GET /health` answers `{"ok":true,"name":"wayfarer-bridge","version":"3.0.0"}`.
Settings → Local Bridge → Test connection reads it.

## Troubleshooting

Each status below is the bridge's own answer, with an `error` in the body.
Any other status is the target's, passed through.

| Status | `error` | What to do |
|---|---|---|
| 400 | `unknown field: …`, `headers must be a list of [name, value] pairs of text`, … | The relay body is wrong. The message names the field. Use the bridge from the same release as the page: each side refuses fields it doesn't know. |
| 401 | `invalid or missing bridge token` | Pair again, or paste the token from `~/.wayfarer-bridge/token`. After `--rotate-token` the old token stops working. |
| 401 | `wrong pairing code` | Check the code in the terminal. Codes contain no `0`, `O`, `1`, `I` or `L`. |
| 403 | `origin not allowed: …` | Start the bridge with `--allow-origin <origin>` for a self-hosted Wayfarer. From curl, send an allowed `Origin`. |
| 410 | `this bridge has no pairing code: …` | The code was used. Restart the bridge for a new one; if you didn't pair, add `--rotate-token`. |
| 421 | `unexpected Host header` | Use `127.0.0.1` or `localhost` in the address, not another name. |
| 429 | `too many wrong codes: wait` | Wait for the seconds in `Retry-After`. |
| 502 | `{ "message": "connect ECONNREFUSED 127.0.0.1:1", "code": "ECONNREFUSED" }` | The target couldn't be reached, its body couldn't be decoded, or the body was over 25 MB. The `code` is Node's. |
| 504 | `{ "message": "relay request timed out", "code": "RELAY_TIMEOUT" }` | The target didn't answer within the request's timeout (30 s unless `timeoutMs` says otherwise). |

If the bridge doesn't start with `Port 7717 is already in use`, another
bridge is probably still running; stop it, or pass `--port`.

## Protocol

There is one relay path, `POST /relay`. The page and the bridge each refuse
a field they don't read, so a page and a bridge of different versions report
the mismatch instead of misreading each other.

```
POST /relay
{ "method": "POST", "url": "https://api.internal/x",
  "headers": [["Content-Type", "application/json"]],   // a list: a name may repeat
  "bodyB64": "eyJhIjoxfQ==",                           // the body's bytes; absent for none
  "timeoutMs": 30000,                                  // absent: 30 s; at most 10 minutes
  "tls": { "insecure": true } }                        // absent: the certificate is verified

200
{ "status": 200, "statusText": "OK",
  "headers": [["Set-Cookie", "a=1"], ["Set-Cookie", "b=2"]],   // as received, one entry each
  "bodyB64": "…",                                             // the body's bytes, decoded
  "encodedSize": 512, "decodedSize": 2048,
  "timings": { "dns": 1.2, "tcp": 3.4, "tls": 21.0, "ttfb": 48.6, "content": 2.1 } }   // milliseconds
```

- **Bodies are bytes both ways.** A body is never read as text, so a file, a
  multipart form and a response in any charset arrive as they were sent.
- **Compressed responses are decoded** (`gzip`, `deflate`, `br`), and the
  answer gives both sizes. The `Content-Encoding` header is left as the
  server sent it. A request that names no `Accept-Encoding` asks for those
  three, as a browser does.
- **Timings** come from the bridge's own connection: the name lookup
  (`dns`), the TCP connection (`tcp`), the TLS handshake (`tls`), the wait
  for the first byte (`ttfb`) and the rest of the response (`content`). A
  part that didn't happen is absent: no `dns` for an IP address, no `tls`
  for `http:`. Through a proxy, `tcp` is the connection to the proxy.
- **`tls.insecure`** turns off certificate verification for that one
  request: any certificate is accepted, including one for another name. The
  field is exactly `{ "insecure": true }` or absent. Wayfarer shows a red
  "TLS verification off" pill on the request and on its response.
- **A `Host` header** in the request is sent as written, at most one.
- **One deadline** covers the whole exchange: `timeoutMs`, or 30 s.

## Options

```
wayfarer-bridge [options]

  --port <n>             Port to listen on (default: 7717)
  --token <value>        Use a fixed token (16 characters or more) instead of the
                         saved one. Others on the machine can see it in the process
                         list: prefer the WAYFARER_BRIDGE_TOKEN environment variable.
  --rotate-token         Create and save a new token, replacing the old one
  --cert <file>          Serve HTTPS with this PEM certificate (with --key)
  --key <file>           The certificate's PEM private key
  --allow-origin <url>   Another allowed Origin (repeatable), e.g. https://wayfarer.example.com
  --ca <file>            PEM certificates to trust besides the public authorities,
                         for a target whose certificate your own authority signed
  --help                 Show help
```

`HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`, in either case, are used for the
requests the bridge sends: set them before you start it. A target's
certificate is verified through the proxy's tunnel as it is without one.

A wrong argument (a port that isn't a number, an option with no value) stops
the bridge with an error instead of falling back to a default.

## Limits

- Bodies are buffered, not streamed. The cap is 25 MB: for the relay request
  as it arrives (base64 inside JSON, so about 18 MB of body), for the
  response as received, and for the response once decoded. An event stream
  through the bridge is shown when it has ended, and WebSockets don't go
  through the bridge at all.
- Request bodies are sent with `Content-Length`, never chunked, which a very
  old or unusual server may not expect.
- Redirects aren't followed: a 3xx comes back as the response. Wayfarer
  follows them itself, one relay per hop, and lists the hops. A request that
  uses a vault secret is never followed to another host.
- No connection is kept for the next relay, so every relay's timings cover
  a whole exchange.
- A proxy that asks for a user name and password hasn't been tested.
- Reaching the bridge from the hosted app in Safari itself hasn't been
  checked yet; the pairing flow and HTTPS mode are tested in Playwright's
  Chromium. That check is
  [#99](https://github.com/AshwinSathian/wayfarer/issues/99).

## Development

```bash
git clone https://github.com/AshwinSathian/wayfarer && cd wayfarer
npm ci
npm run bridge          # runs packages/bridge/bin/cli.js
npm run bridge:test     # node --test, no test dependencies
```

`test/fixtures/` holds a certificate authority and a certificate for
`localhost` and `127.0.0.1`, made once with `openssl` for the tests. The
private key is public on purpose: nothing trusts that authority except a test
that names it.

Releases are published from
[`release.yml`](https://github.com/AshwinSathian/wayfarer/blob/main/.github/workflows/release.yml)
with an npm provenance attestation.

## Licence

MIT.
