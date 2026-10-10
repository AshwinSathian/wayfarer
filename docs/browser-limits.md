# Browser limits

Wayfarer runs in a browser tab, and the browser has the last word on every
request a page sends. This page says what it does, and what the Local
Bridge changes. The composer shows the same for the request you are writing,
under **What the browser does to this request**, before you send it. <!-- claim:C-049 -->

With the [Local Bridge](../local-bridge/README.md) switched on, the request
leaves from a Node process on your machine instead, and nothing on this page
applies to it, except where the bridge's own row says so.

## Headers the browser will not send

A page may not set these request headers. The browser drops them without an
error, so the server never sees them:

`Accept-Charset`, `Accept-Encoding`, `Access-Control-Request-Headers`,
`Access-Control-Request-Method`, `Connection`, `Content-Length`, `Cookie`,
`Cookie2`, `Date`, `DNT`, `Expect`, `Host`, `Keep-Alive`, `Origin`,
`Referer`, `Set-Cookie`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`,
`Via`, and every header whose name starts with `Proxy-` or `Sec-`. A method
override header (`X-HTTP-Method-Override` and its two variants) is dropped
when it names `CONNECT`, `TRACE` or `TRACK`.

The composer names each such header you have set and says it will not be
sent. Through the bridge they are sent as written, except the ones that
belong to the connection the bridge itself makes, which it sets:
`Connection`, `Content-Length`, `Host`, `Keep-Alive`, `Proxy-Authenticate`,
`Proxy-Authorization`, `TE`, `Trailer`, `Transfer-Encoding` and `Upgrade`.
The composer names those when the bridge is on. The bridge also sends a
header name once: of two rows with one name, the later value goes.

## Headers the browser adds

`Origin` (on every request to another origin, and on any request that is not
`GET` or `HEAD`), `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`,
`Accept-Encoding`, and, where you set none, `Accept` (`*/*`),
`Accept-Language` and `User-Agent`. Chromium also adds its `sec-ch-ua`
headers. You cannot remove them. Through the bridge none of them is added;
Node sets `Host` and `Connection` for its own connection.

## What Wayfarer leaves out

Wayfarer sends your request with no `Referer` and no cookies
(`referrerPolicy: "no-referrer"`, `credentials: "omit"`): an API client
should not add its own address or your browser's cookies for the target
site to a request. A `Set-Cookie` in a response is not stored. A cookie jar
arrives with the bridge (plan P5.3).

## When the browser asks the server first (CORS preflight)

For a request to another origin, the browser first sends an `OPTIONS`
request asking whether the real one is allowed, unless the request is one a
plain HTML form could have made. The real request is sent only if the
answer allows its method and headers. A preflight happens when any of these
is true:

- the method is not `GET`, `HEAD` or `POST`;
- a header is set other than `Accept`, `Accept-Language`,
  `Content-Language`, `Content-Type` and `Range` (so `Authorization` or an
  API-key header always causes one);
- `Content-Type` is not `application/x-www-form-urlencoded`,
  `multipart/form-data` or `text/plain` (so a JSON body always causes one);
- `Range` is anything but one simple range such as `bytes=0-99`;
- one of those header values is longer than 128 bytes or holds a character
  such as `(`, `<` or `"`, or they are over 1024 bytes together.

The composer says whether a preflight will happen and lists the reasons. A
server that does not answer `OPTIONS` with the right
`Access-Control-Allow-*` headers never receives the request; Wayfarer then
shows a network error, because the browser does not say why. Through the
bridge there is no preflight.

One exception was measured in session 2D and is tracked as
[#209](https://github.com/AshwinSathian/wayfarer/issues/209): in Playwright's
WebKit, once the app's service worker controls the page, a request whose
preflight the server refused was sent anyway. Whether Safari itself does
this is not confirmed.

## Response headers the browser hides

Of a response from another origin, a page can read only `Cache-Control`,
`Content-Language`, `Content-Length`, `Content-Type`, `Expires`,
`Last-Modified` and `Pragma`, plus the headers the server names in
`Access-Control-Expose-Headers`. `Set-Cookie` is never readable. The
Headers tab says so above the list. Through the bridge every header is
shown (the bridge still joins repeated `Set-Cookie` headers into one line,
[#80](https://github.com/AshwinSathian/wayfarer/issues/80)).

## Mixed content

The hosted app is loaded over HTTPS, and a page loaded over HTTPS may not
call an `http://` address: the browser blocks the request. The composer
says so before you send. The exception is this machine (`localhost`,
`127.0.0.1`, `[::1]`), which Chrome and Firefox allow and Safari does not;
see the table below. Through the bridge any `http://` address works, once
the bridge itself is reachable.

## Bridge reachability

Can the hosted app (`https://wayfarer.ashwinsathian.com`) reach a Local
Bridge on `http://127.0.0.1:7717`? Measured on 2026-09-28 (plan task P1.10,
risk R4) from the production page, with the bridge started as
`node local-bridge/bin/cli.js --allow-origin https://wayfarer.ashwinsathian.com`.
Each browser ran four `fetch` calls: `GET /health`, the same with
`targetAddressSpace: "loopback"`, a preflighted `POST /relay` (JSON body plus
the token header), and `GET http://localhost:7717/health`.

| Browser | Version | Result | What blocks it | What the app must do |
|---|---|---|---|---|
| Chrome (stable) | 153.0.8010.54, macOS | Blocked until the user allows local network access; then all four succeed. | Local Network Access: `Permission was denied for this request to access the 'loopback' address space`. Without a user gesture granting it, the request fails as a CORS error. No `Access-Control-Allow-Private-Network` header was needed once permission was granted. | Explain the permission prompt before the first bridge call, and send `targetAddressSpace: "loopback"` (accepted, no effect on the outcome). |
| Firefox | 151.0 (Playwright build; no stable Firefox on the test machine) | All four succeed. | Nothing yet. The console logs `Local Network Access detected` (informational), so a prompt is likely in a later release. | Same pre-explanation as Chrome, ready for when Firefox enforces it. |
| Safari (WebKit) | WebKit 26.5 (Playwright). Safari 27.0 is installed but could not be automated (see below). | All four fail with `TypeError: Load failed`. | Mixed content: `[blocked] The page at https://wayfarer.ashwinsathian.com/ requested insecure content from http://127.0.0.1:7717/health`. WebKit does not treat `http://127.0.0.1` or `http://localhost` as secure from an HTTPS page. | The bridge must serve **HTTPS on loopback** with a locally generated certificate the user trusts once (Phase 6, P6.2). |

Consequences for the Phase 6 design (P6.2): HTTPS loopback is required
for Safari, and a pre-explained Local Network Access prompt is required
for Chrome. The Private Network Access preflight header is harmless but
not what unblocks Chrome today.

Two things found while measuring:

- The bridge's default allowed origins are `http://localhost:4200`,
  `http://127.0.0.1:4200` and `https://wayfarer.ashwinsathian.com`. (Before
  v1.3.1 the list named the app's old domain, so the hosted app was rejected
  unless started with `--allow-origin`.)
- Automating real Safari needs `safaridriver --enable` (an administrator
  password) and *Develop → Allow Remote Automation*, so the Safari row uses
  Playwright's WebKit. To check real Safari by hand: start the bridge as
  above, open the production site in Safari, open the Web Inspector console,
  and run `await fetch("http://127.0.0.1:7717/health")`.
