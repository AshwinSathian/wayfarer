# Browser limits

What the browser does to requests Wayfarer sends from the hosted app, and
what the Local Bridge changes. This page grows with P2.14 (forbidden and
hidden headers, CORS preflight, credentials).

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
