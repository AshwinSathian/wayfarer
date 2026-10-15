# Threat model

Wayfarer runs in one browser tab. It has no server of its own: the page, a
few workers, the browser's storage and, when you start it, the Local Bridge
on your machine. This document lists the places where data crosses from one
of these into another (the trust boundaries), what could go wrong at each
one, and what stops it.

Threats are sorted by STRIDE: **S**poofing, **T**ampering, **R**epudiation,
**I**nformation disclosure, **D**enial of service, **E**levation of
privilege. Repudiation does not apply to a single-user app with no server,
so it has no rows.

Each mitigation names the claims that prove it. A claim is a row of
[`claims.md`](claims.md) with a test that runs in CI, in three browsers where
the claim is about the page. `npm run check:claims` fails when a row here
links no claim, or a claim that is not in the ledger.

What the browser itself enforces (the same-origin policy, CORS, the sandbox
of a frame) is taken as given. So is the operating system under the Local
Bridge: anything that can read your home folder can read the bridge's token.

## The page and the network

The page talks to the host that serves it and to the hosts you send requests
to. Nothing else.

| Boundary | STRIDE | Threat | Mitigation | Claims |
|---|---|---|---|---|
| Page and the internet | I | The app reports what you do, or sends your data to a third party. | No account, no analytics, no telemetry. Apart from loading the app, the only traffic is the request you send, to the host you chose. | C-001 |
| Page and target server | I | A vault secret is sent somewhere you did not mean, or its `{{$secret.*}}` placeholder leaks into a request. | A placeholder never reaches the network, in any encoding. When a pre-request script moved the request to another host, the app asks before it reads the vault. | C-007, C-053 |
| Page and target server | T, E | A response carries script that runs in the app. | A response is shown, never run. HTML goes to a sandboxed frame with no script, no network and no way out of the frame. | C-048, C-009 |
| Page and target server | S | A service worker answers a failed request in the server's place, so you see a response the server never sent. | The service worker never handles a request to another origin, and a network failure shows the browser's own error. | C-010, C-015 |

## The page and its scripts

A user's pre-request and post-response scripts run in QuickJS, compiled to
WebAssembly, inside a worker. The page and the worker talk only through
messages.

| Boundary | STRIDE | Threat | Mitigation | Claims |
|---|---|---|---|---|
| Page and script worker | E | A script escapes the sandbox and reaches the network, the page, the worker's scope or the browser's storage. | The VM's global is an allow-list. `require` gives five libraries that ship with the app. The only request a script can make is `pm.sendRequest`, which the page sends on the same road as yours. | C-052, C-006 |
| Page and script worker | T | A script from someone else's collection runs on import and changes your requests or variables. | A collection from a file or a backup is untrusted. Its scripts run only once you have read them and said you trust them, and a script that changes afterwards waits for another review. The CLI runs a file's scripts only with `--allow-scripts`. | C-051, C-066 |
| Page and script worker | I | A script reads a vault secret's plaintext and sends it away. | A post-response script sees the request with every vault secret masked. A pre-request script that sends the request to another host makes the app ask before the vault is read. | C-053, C-007 |
| Page and script worker | E | Text a script or a response wrote is evaluated as code in the page. | The Content-Security-Policy forbids `eval` and inline script, and Trusted Types guard the DOM's script sinks. | C-011, C-016 |

## The page and its files

Imported files are someone else's text. They are parsed in a worker and
checked field by field before anything is stored.

| Boundary | STRIDE | Threat | Mitigation | Claims |
|---|---|---|---|---|
| Imported file and page | T | A file holds values the app never writes (a method that is not a token, a header that is not a row) and corrupts the stores. | Every field is checked against what the app itself writes. The report shows what will be added before anything is stored, and nothing is stored if you cancel. | C-054, C-026 |
| Imported file and page | I | An OpenAPI `$ref` points at a URL, and importing it fetches that URL. | A reference is followed only inside the file. The importer has no code that could fetch one. | C-060 |
| Imported file and page | D | A small YAML file expands into a huge one through aliases. | A YAML file that grows through aliases is refused. | C-059 |
| Imported file and page | T, E | A collection file brings scripts that run at once. | Imported scripts are unapproved until reviewed. | C-051, C-058 |
| Exported file and others | I | An export or a HAR carries your credentials to whoever receives it. | Exports, cURL and code mask credentials and vault secrets unless you ask for them in that export. A HAR is built from masked exchanges. | C-014, C-035, C-055, C-020 |

## The page and its storage

Everything is stored in the browser's IndexedDB on your device.

| Boundary | STRIDE | Threat | Mitigation | Claims |
|---|---|---|---|---|
| Page and IndexedDB | I | Someone with your browser profile reads your secrets. | Vault values are stored only as ciphertext: AES-GCM-256 under a data key wrapped by a key derived from your passphrase (PBKDF2-SHA-256, 600,000 iterations). The key is in memory only, and the vault locks on reload and when idle. | C-003, C-004, C-005 |
| Page and IndexedDB | I | History keeps the credentials a request carried. | History masks credentials and vault secrets before anything is written. | C-008 |
| Page and IndexedDB | D | Data you want gone stays behind. | Reset all data deletes the database, and another tab holding it open is told to reload. | C-013 |

## The page and the Local Bridge

The Local Bridge is a process on your machine. It sends a request for the
page when the browser cannot, and answers on `127.0.0.1` only.

| Boundary | STRIDE | Threat | Mitigation | Claims |
|---|---|---|---|---|
| Page and Local Bridge | S, E | Another website you visit asks the bridge to send requests from your machine: to your intranet, or to `localhost` services. | The bridge relays only for an allowed origin that presents its token. | C-041 |
| Page and Local Bridge | I | A redirect takes a request that holds a vault secret to another host. | Through the bridge, such a request is not followed to another host, another port, or the same host without TLS. | C-063 |
| Page and Local Bridge | T | A request the server already received is sent a second time through the bridge. | Auto sends through the bridge only when the request cannot have reached the server, and asks you first otherwise. | C-064 |

## The page and the sign-in window

OAuth 2.0's Authorization Code grant opens the identity provider in another
window, which answers on `/oauth/callback`.

| Boundary | STRIDE | Threat | Mitigation | Claims |
|---|---|---|---|---|
| Callback page and app | S | Another page sends the app a sign-in answer, so that you use a token of the attacker's. | The app takes an answer only when it carries the `state` made for that sign-in, and uses PKCE for the code. | C-062 |
| Callback page and app | E | The callback page runs the app's code, or the app's code runs with the callback's query. | The callback page is a page of its own, with its own script and style under the same Content-Security-Policy. | C-011, C-062 |

## The page and its host

The app is static files on Cloudflare's network, or on any host you choose
([Self-hosting](self-hosting.md)).

| Boundary | STRIDE | Threat | Mitigation | Claims |
|---|---|---|---|---|
| CDN and page | T | The host serves a script the app did not ship. | The Content-Security-Policy allows the app's own origin only, and a monitor loads the production page every 6 hours and fails on any script that is not the app's. | C-012, C-011, C-016 |
| Service worker and page | T | The service worker serves an old or a foreign file as the app. | The service worker caches only the app's own files, and a new version takes over only when the page asks. | C-015 |

## What this model does not cover

- **A compromised browser or operating system.** An extension with access
  to the page, or malware that reads memory, sees what the page sees.
- **A hostile host for the hosted app.** The monitor (C-012) finds a
  changed page within 6 hours; it does not prevent one. If that matters to
  you, host the folder yourself.
- **The servers you send requests to.** What a server does with a request
  you sent it is out of the app's hands.
- **Scripts you approved.** An approved pre-request script can change your
  own request, which is then built with its secrets. Review is the control.
