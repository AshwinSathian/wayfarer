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
site to a request. Sent directly, a `Set-Cookie` in a response is not
stored: the browser keeps none of it for the app, and a page cannot read it.
Through the Local Bridge the app has a cookie jar of its own: see
"Cookies" below.

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

<a id="oauth"></a>

## OAuth 2.0 token endpoints

A token request ([`auth.md`](auth.md), "OAuth 2.0") is a `POST` from the
page to your identity provider. To the browser it is a request to another
origin like any other, so the provider's token endpoint must answer with
`Access-Control-Allow-Origin` for the app's origin, and must answer the
preflight when the client's secret goes in an `Authorization` header.

Many token endpoints do not: they were made to be called by servers. The
browser then gives the page no answer at all, and the app cannot tell this
from a host that is down. It says:

> The token request got no answer the page could read. A token endpoint
> that does not send Access-Control-Allow-Origin for this page cannot be
> called from a browser: switch on the Local Bridge, which has no such
> limit.

What you can do:

- **Switch on the Local Bridge.** The token request then leaves from the
  bridge, where CORS does not apply, and so does your own request.
- **Register the client as a browser (single-page) application** with the
  provider, where it has such a kind: providers that do then allow the
  origins you list.
- For a client secret, try **Client sent in: Request body**: without the
  `Authorization` header the request needs no preflight, which some
  endpoints never answer. The answer still needs the header above.

The sign-in window of the Authorization Code grant is not such a request:
it is a page the browser opens, and CORS does not apply to it.

## Response headers the browser hides

Of a response from another origin, a page can read only `Cache-Control`,
`Content-Language`, `Content-Length`, `Content-Type`, `Expires`,
`Last-Modified` and `Pragma`, plus the headers the server names in
`Access-Control-Expose-Headers`. `Set-Cookie` is never readable. The
Headers tab says so above the list. Through the bridge every header is
shown, each as it was received: two `Set-Cookie` headers are two lines. (A
Local Bridge before 1.1.0 joins them into one.)

## Cookies

A browser has a cookie jar, and a page can neither read it nor fill it for
another site. Wayfarer sends a direct request with `credentials: "omit"`,
so it carries none of the browser's cookies, and what a response sets is
kept nowhere.

**Through the Local Bridge the app keeps a jar of its own**, as a desktop
client does. Settings, **Cookies** lists it.

- **What a response sets is kept**, and sent with later requests through
  the bridge to the cookie's domain and path, by the rules browsers follow
  (RFC 6265): a cookie without `Domain` goes to that host alone, one with
  `Domain` to the domain and what is under it; a cookie goes to its `Path`
  and below; a `Secure` cookie only over `https`, and one set over `http`
  is refused; `Max-Age` wins over `Expires`; a cookie that has expired is
  dropped, and a server ends one by setting it expired. The `__Secure-` and
  `__Host-` prefixes hold. `SameSite` is shown and applied to nothing: a
  request from an API client has no site of its own.
- **On a redirect**, a cookie one hop sets goes out with the next.
- **Your own `Cookie` header** is sent as written, and the jar's cookies
  are added to it; a name you wrote yourself wins over the jar's.
- **A cookie is never a template.** Its value goes out as the server sent
  it: a `{{variable}}` in it is not replaced, and a cookie that names a
  vault secret's reference is not sent at all.
- **Edit and delete** in Settings, Cookies: change a value, delete one
  cookie, or delete all. A cookie the server gave no end is kept until you
  delete it: the app has no "session" that closes.
- **Where it is kept:** in this browser's storage, as text, like a
  credential you type into a request. History and every export have a
  cookie's value masked. A cookie whose value holds a vault secret of the
  request that got it is kept in the tab's memory only, and the list says so.
- **Not in the jar's rules:** there is no list of public suffixes. A
  `Domain` with no dot in it (`com`) is refused; `Domain=co.uk` is taken
  as a domain. Send requests to hosts you trust with the jar, or delete
  what such a host set.
- **Scripts** are not given the jar: `pm.cookies` stays unsupported. A
  script reads a response's `Set-Cookie` headers like its other headers.
- **Needs Local Bridge 1.1.0 or later** (the one of v2.3.0). An older one joins
  repeated `Set-Cookie` headers into one line, which cannot be split again
  (a date holds a comma): nothing of it is kept.
- The jar is not in a workspace backup. Reset all data removes it.

## Redirects

A browser follows a redirect itself and tells a page only where the request
ended. A page cannot ask it not to follow and still read the answer: a
redirect that was not followed is hidden from it altogether. So what the
app can show depends on the route.

- **Sent directly**, a request is always followed, whatever **Follow
  redirects** says. The response is the last one, and the status bar says
  "Redirected to" with its address. The hops between are not known.
- **Through the Local Bridge**, the app makes each hop as a request of its
  own, 20 redirects at most, and the response lists each one: its status,
  the address that answered with it, and its `Location` as the server wrote
  it. A `Location` is followed as it was sent: nothing in it is read as a
  `{{variable}}`. Any version of the bridge will do.
- **Follow redirects** is a setting of the request, on unless you switch it
  off. Off, through the bridge, the first 3xx is the response as it came.
- **What is sent on.** 301 and 302 turn a POST into a GET without its body,
  and 303 does so for every method but GET and HEAD, as browsers do; 307 and
  308 repeat the request. A hop to another origin goes without
  `Authorization` and `Cookie`. Every other header goes along.
- **A request that holds a vault secret is not followed to another host.**
  The app stops at that redirect, and it is the response, with a line
  that says why. Another host is another name or port, or the same host
  without TLS; `http` to `https` on one host is followed. To send the
  request there, put that address into it. <!-- claim:C-063 --> Nothing of such a
  request is sent elsewhere: not only the header or the part of the body
  that holds the secret. What this does not see: a secret you
  typed into the request as plain text is not a vault secret, and goes
  along with every header but the two above.
- **A `Location` that is not an `http` or `https` address** is not
  followed.
- A request a script makes with `pm.sendRequest`, and an OAuth 2.0 token
  request, are not followed through the bridge: a 3xx is their answer.

## Event streams

A response whose `Content-Type` is `text/event-stream` is read as it
arrives. There is nothing to switch on: send the request, and the response
panel lists each event with its id, its name (`message` when it has none),
its data and the time since the response began. The stream is read with
`fetch`, not with the browser's `EventSource`, so the request keeps its
method, its headers, its auth and its body.

- **The timeout is for the first byte.** A stream that has begun is not
  ended by the request timeout of Settings.
- **Stop** ends the stream. What had arrived is the response: its status,
  its headers, the events, and the body so far. Post-response scripts and
  assertions run then, and history gets the exchange, masked as always.
- **Reconnect** sends the request again with `Last-Event-ID`, the last id
  the stream gave, as a browser does. The id goes out as the server wrote
  it: a `{{variable}}` in it is not replaced, and one that looks like a
  vault secret's reference is refused like any other. The app does not
  reconnect by itself, and does not follow a stream's `retry`.
- **The list holds the newest 500 events** and says how many there were;
  the Body tab holds the first megabyte of the stream. Events are read as
  the HTML standard says: an event without a `data` line is none.
- **Through the Local Bridge** a response is relayed when it has ended, so
  a stream's events arrive together, without times, and a stream that never
  ends is not shown: the request runs into the timeout. Send a stream
  directly when the server allows it (CORS), or let it end.
- **In a collection run** a stream is read to its end like any body.

## WebSockets

An address that starts with `ws://` or `wss://`, as written or through a
variable, is a WebSocket's: the Send button is **Connect**, and the tab
shows the connection in place of a request's panels and its response.

- **No headers, no auth.** A browser makes the handshake itself and lets a
  page add nothing to it but subprotocols: no `Authorization`, no cookie of
  the app's, no custom header. The request's Headers and Auth tabs do not
  apply. A server that needs a token takes it in the address, in a
  subprotocol, or in the first message. The Local Bridge does not carry a
  WebSocket; a proxy for it is not built.
- **Subprotocols** are names parted by commas. The log says which one the
  server chose. A name that is not a token is refused by the browser, and
  the tab shows the browser's reason.
- **Messages** are text. `{{variables}}` are replaced in the address and in
  a message. "Must be JSON" holds back a message that does not parse.
  A binary message that arrives is logged with its size, not its bytes;
  none can be sent.
- **A vault secret cannot be sent.** The vault is not read for a WebSocket,
  so a secret's reference would go out as that text; an address or a
  message that holds one is refused, and nothing is sent.
- **The log** holds the newest 500 lines: each message with its direction,
  its time and its size in bytes, and what the connection did. When it
  ends, the log has the close code, what the code means, and the server's
  reason. A browser does not say why a connection failed: a server that is
  not there, a refused handshake and a lost network all end with 1006.
  WebKit, Safari's engine, gives no close code at all for a port it will
  not connect to; the log then says so.
- **Nothing is stored.** The log and the connection are in the page's
  memory: not in history, not with the tab. A reload ends the connection.
  The connection stays open while another tab is open, and closing its tab
  closes it, after a question.
- **From an https page**, `ws://` is mixed content, which browsers refuse;
  whether `ws://` to this computer is let through differs by browser, and
  was not measured here. `wss://` works.

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
