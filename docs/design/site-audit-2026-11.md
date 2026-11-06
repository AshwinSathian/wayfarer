# Site audit, November 2026

Session W6 of [`PLAN-design.md`](../../PLAN-design.md). The website
(`packages/site`, served at `/`) audited against Wayfarer as it is today,
v3.2.1, to find every place where the site sells a different app from the
one people get: a smaller or older one, or a vaguer, more generic or less
trustworthy one. The rework that follows is Phase W6 of the plan.

Run on 2026-11-07 against `main` at `05cd043`, built with `npm run build`
and served by `e2e/support/prod-server.mjs dist/deploy 4200`, in Chromium
(Playwright 1.64.1) on macOS, and against production
(`https://wayfarer.ashwinsathian.com`, v3.2.1) where a finding is about what
production serves. Evidence is a file and line, a ledger row, a command's
output or a capture; a finding with none is not here.

## 1. Ground truth: the app as it is

Built from the code, `CHANGELOG.md` and [`claims.md`](../claims.md), not
from the site or the README, and checked by using the built app (the first
request, a send with a token, a collection run, Share… as a link). The
version is the oldest changelog section that names the capability
(`0.1.0` was reconstructed from the commit history, so dates before 1.0 are
approximate).

### The composer and the response

| Capability | Claims | Shipped |
|---|---|---|
| Request tabs, kept over a reload; a restored tab's unreviewed scripts are held | none | 2.3.0 |
| Any HTTP method, sent in upper case; seven offered | C-017 | 2.0.0 |
| Body modes: none, raw, form, multipart, binary, GraphQL (6) | C-039 | 2.0.0, GraphQL 2.3.0 |
| A cURL command pasted into the address becomes the request | C-056 | 2.2.0 |
| Before a send: the headers a browser drops, the preflight and why, mixed content | C-049 | 2.0.0 |
| A request with an empty `{{variable}}` is held until you choose | C-045 | 2.0.0 |
| Cancel, and a timeout (none by default) | C-042 | 2.0.0 |
| Visual assertions, 10 operators | C-021 | 0.1.0 |
| Viewers by type (JSON, text, XML, HTML preview, image, hex); exact bytes downloaded | C-009, C-022, C-048 | 2.0.0 |
| Timings, withheld without `Timing-Allow-Origin` | C-023 | 1.1.0 |
| The real network error, never a made-up 504 | C-010 | 1.1.0 |
| The exchange record: where a request went, what was filled, what was masked | C-008 (masking) | 3.0.0 |
| JSON filter by path, history search, headers bulk edit | none | 2.0.0 |

### Auth, scripts, the vault

| Capability | Claims | Shipped |
|---|---|---|
| Auth types: inherit, none, Bearer, Basic, API key, AWS Signature V4, OAuth 2.0 (7) | C-019, C-061, C-062 | 0.1.0 to 2.2.0 |
| OAuth 2.0: authorization code with PKCE, client credentials, password | C-062 | 2.2.0 |
| Auth, variables and scripts inherited from a collection and its folders | C-019 (auth) | 2.2.0 |
| Scripts in QuickJS (WebAssembly), Postman's `pm` as the compatibility matrix lists | C-006, C-040, C-052 | 2.1.0 |
| `require`: chai, crypto-js, lodash, moment, uuid (5) | C-052 | 2.1.0 |
| Script trust: a file's scripts wait for review; a changed script waits again | C-051 | 2.1.0 |
| A secret is not read for a host a script moved the request to, unless you say so | C-053 | 2.1.0 |
| Vault: PBKDF2-SHA-256 at 600,000 iterations, AES-GCM-256; ciphertext only at rest | C-003, C-004 | 0.1.0 (600,000: 1.0.0) |
| Vault locks on reload and after 15 idle minutes; passphrase change; export and import | C-005, C-043, C-044 | 2.0.0 |
| Environments, globals, collection and folder variables; live variable chips | C-025 | 0.1.0 to 2.2.0 |

### History, runs, the command line

| Capability | Claims | Shipped |
|---|---|---|
| History by day, masked; load back, delete, clear | C-008, C-029 | 0.1.0 |
| Collection runs, in Newman's order, with data files and iterations | C-065 (parity) | 2.3.0 |
| Run reports: JSON, JUnit XML, HTML | none | 2.3.0, HTML 3.0.0 |
| `wayfarer-cli run`: the app's engine in CI; scripts only with `--allow-scripts` | C-065, C-066 | 2.4.0 |

### Import, export, sharing

| Capability | Claims | Shipped |
|---|---|---|
| Import: Postman (v2.0, v2.1, environments, globals), Insomnia (4 and 5), OpenAPI 3.0 and 3.1, Swagger 2.0, HAR 1.2, cURL, Wayfarer files (8 formats) | C-054, C-056, C-058 to C-060 | 0.1.0 to 2.2.0 |
| The import report before anything is stored | C-054 | 2.2.0 |
| Export: cURL; code for fetch, Python requests, HTTPie; HAR 1.2; Postman v2.1; Wayfarer files | C-014, C-020, C-026, C-035, C-055, C-057 | 0.1.0 to 2.2.0 |
| Workspace backup and restore, the vault inside it encrypted | C-046 | 2.0.0 |
| Share… as a file or an encrypted link (AES-GCM-256 after the `#`, 12 kB at most) | C-084, C-087 to C-089 | 3.1.0 (claims 3.2.1) |
| A link leaves the address bar before the app reads anything | C-085 | 3.1.0 |
| Import › Link…, and the palette's "Open a shared link…" | C-086 | 3.2.0 |
| The report names every host the collection sends to | C-090 | 3.2.0 |
| The report's receiver lines (missing secrets, masked credentials, held scripts) and "You have this collection" | none | 3.2.0 |

### Protocols and the Local Bridge

| Capability | Claims | Shipped |
|---|---|---|
| GraphQL: schema introspection, completion and validation | C-039 (the mode only) | 2.3.0 |
| WebSocket (`ws:`, `wss:`) | none | 2.3.0 |
| Event streams (SSE), event by event | none | 2.3.0 |
| Local Bridge: relays only for an allowed origin with its token | C-041 | 1.1.0 |
| Routes Auto, Direct, Bridge; a response is never sent twice | C-064 | 2.4.0 |
| Redirects hop by hop; a request with a secret stays on its host | C-063 | 2.3.0 |
| A cookie jar for the bridge | none | 2.3.0 |
| Pairing code, HTTPS mode, per-request TLS skip, proxy variables | none | 2.4.0 |

### AI, and the app around it

| Capability | Claims | Shipped |
|---|---|---|
| AI off until a provider is added (OpenAI-compatible or Anthropic) | C-069, C-074, C-075 | 3.0.0 |
| Write tests, draft a request, explain a failure; every byte shown first | C-070 to C-073, C-076 to C-080 | 3.0.0 |
| Model calls in History and in a HAR, masked | C-081 to C-083 | 3.0.0 |
| Installable; offline after one visit | C-015, C-036 | 0.1.0, 1.1.0 |
| Palette (⌘K), shortcuts, keyboard alone | C-030, C-033, C-067 | 1.0.0 to 2.5.0 |
| Light, dark, System; `prefers-contrast: more` | C-037 (themes) | 0.1.0, 3.0.0 |
| No axe violation of WCAG 2.2 A or AA | C-038 | 2.5.0 |
| Phone layout | C-032 | 1.4.0 |
| Undo a delete for 10 s; Diagnostics; Reset all data | C-013, C-068 | 0.1.0 to 3.0.0 |
| No account, no cloud, no telemetry; IndexedDB on the device | C-001, C-002 | 0.1.0 |
| CSP without `eval` or inline script, Trusted Types | C-011, C-016 | 1.3.0 |

### Counts (each from the file named)

- 90 claims, C-001 to C-090 (`docs/claims.md`).
- 8 import formats (`IMPORT_FORMATS`, `packages/core/src/import/import.ts`).
- 7 auth types (`AUTH_TYPES`, `packages/core/src/model/request.ts`), 3 OAuth 2.0 grants.
- 3 code targets and cURL (`CODE_TARGETS`, `packages/core/src/export/codegen.ts`).
- 6 body modes (`BODY_MODES`), 10 assertion operators, 5 script libraries.
- 3 browser engines in the e2e suite (`playwright.config.ts`), 91 e2e spec files.
- 50 doc pages on the site: 21 for users and 29 design records (`packages/site/src/lib/content.ts`).

### What a new visitor cares about most

From [`personas.md`](personas.md) and [`research-2026.md`](research-2026.md),
not from what was hardest to build:

1. **Can I send a request now, with nothing installed and no account?**
   (SD, OC.) The answer is yes, in one click: from the landing, "Open
   Wayfarer" opens the app with the caret in the address field, and Enter
   sends (measured below).
2. **Will my Postman collection, its scripts and its environment come
   over?** (TP, QA.) Yes, with a report and the scripts held for review.
3. **Where do my keys and my requests go?** (PE.) Nowhere but the host,
   and the vault stores ciphertext only; the ledger and the threat model
   say how that is checked.
4. **Can I hand a collection to a teammate without a paid seat?** (TP.)
   Since 3.1.0, yes: a file or an encrypted link, no server and no
   account. This is what Postman's one-user Free plan took away in March
   2026, and the site does not say it (S-01).
5. **Can I run it in CI?** (QA.) Yes, `wayfarer-cli`.

## 2. Method

- Every built page (69, `find packages/site/out -name index.html`), at
  320, 390, 820 and 1440 px, in both themes, with JavaScript on and off:
  horizontal overflow, console errors, text under 12 px
  (`sweep.mjs`, a throwaway script; not committed).
- The landing and the comparison pages read as each persona of
  `personas.md`; every `<Claims>` on them held to its ledger row.
- The pictures of the app taken again with `scripts/site-screenshot.mjs`
  and `npm run gen:recordings` from today's build and compared pixel by
  pixel with what is committed (`magick compare -metric AE -fuzz 2%`).
- Lighthouse 12.8.2, mobile, three runs (`check-lighthouse.mjs --site`).
- Each page's title, description, canonical address, Open Graph image and
  structured data read from the build.
- The rivals' landing pages read on 2026-11-07 (section 5).

## 3. What holds

- No page is wider than the window at 320, 390, 820 or 1440 px, in either
  theme, with or without JavaScript; no console error but the one in S-04.
- Lighthouse, mobile, median of three on the landing: performance 99,
  accessibility 100, search 100; LCP 2.0 s, CLS 0, 185 KiB.
- From the landing to a first response: one click ("Open Wayfarer"), then
  the address and Enter; the caret is already in the address field when
  the app opens (`input.address-url` focused on load).
- Every page has a title, a description and an Open Graph image; every
  page but 404 has a canonical address. `security.txt` is served at
  `/.well-known/security.txt` (200, expires 2027-07-21).
- The site's still (`app.jpg`) and the first-request recording match
  today's app (0.007% and 0.03% of pixels differ, encoder noise).

## 4. Findings

Severity: **false** (says what is not so), **stale** (was so, is not now),
**missing** (the app has it, the site does not say it), **weak** (true,
and sells less than it could), **polish**.

### Truth

**S-01, false. Sharing is "not yet" in eight places.** Link sharing
shipped in 3.1.0 (C-084 to C-090, `docs/sharing.md`), and the site still
says a team shares only by file and that sharing without a server is to
come:

- the landing's question "Can my team share collections?": "Today, as
  files … Sharing without a server of anyone's is on the roadmap"
  (`packages/site/src/app/page.tsx:156-161`);
- the landing's table, row "A workspace your team shares": "Not yet.
  Today a collection goes to a teammate as a file … Sharing is on the
  roadmap" (`components/AskFirst.tsx:132-136`);
- the comparison pages' Wayfarer column, "Sharing with a team": "None yet:
  a file; sharing without a server is on the roadmap", and "Git: None yet:
  a collection leaves as a file" (`lib/rivals.tsx:99-107`), on every
  comparison page and the index;
- "Where Wayfarer is behind", "No shared workspace for a team": "A team
  shares a collection as a file today; sharing without a server is on the
  roadmap" (`lib/rivals.tsx:772-776`);
- Moving from Postman, "Shared workspaces: a team shares a collection as a
  file today" (`compare/moving-from-postman/page.tsx:130`);
- `llms.txt`: "Sharing without a server is designed and not built"
  (`app/llms.txt/route.ts:73`);
- the roadmap page's description: "later: sharing collections with a team
  without a Wayfarer server" (`app/roadmap/page.tsx:10`).

What is true: a collection is shared as a copy, by file or by a link whose
encrypted content is after the `#` and reaches no server (C-084); the
receiver sees every host it sends to before anything is stored (C-090,
C-086). There is still no shared workspace that stays in step: that is T2
and T3.

**S-02, false. The roadmap says workspace sharing is done.** "Share a
collection or a whole workspace with your team as a file, or as a link
whose encrypted contents never reach a server. Done"
(`packages/site/src/roadmap.mjs:75`). T1 shipped collections only; sharing
a workspace was left out on purpose (PLAN-design.md, T1, "Left out").

**S-03, false today. The landing names C-012, which production fails.**
"The page runs no script it did not ship … <Claims C-011, C-016, C-012>"
(`page.tsx:118-119`). C-012 is "0 CSP violations"; production has one on
`/` and two on `/app/` from the zone's Bot Fight Mode script (handoff of
2026-11-07; runbook steps 1, 2 and 5 wait for the maintainer). The
sentence itself holds (the policy blocks that script, C-011, C-016); the
ID it names does not, until the zone is hardened.

**S-04, weak (trust). The claims page shows no test result in
production.** `/ci-run.json` is 404 on production (`curl -o /dev/null -w
'%{http_code}'`: 404), since every deploy since 3.0.0 was made by hand, so
`claims-ci.js` writes "This copy of the site was not deployed from a CI
run, so it shows no test results." The page that is the site's proof
shows none, and its "Last CI" column is absent. `deploy.yml` writes the
file from the E2E run of the deployed commit; the manual deploy in
`docs/deployment.md` does not, and says so.

**S-05, stale. The structured data and `llms.txt` describe 3.0's app.**
The `SoftwareApplication` feature list (`lib/structured-data.ts:13`) names
six claims and not sharing; `llms.txt`'s "What it does not do" lists
sharing (S-01).

### Staleness

**S-06, stale. Two of the landing's three recordings show an older app.**
Taken again from today's build: "Where it went" differs in 2.9% of its
poster's pixels (the composer now has "Where a value comes from" under the
variable chips), "A run's report" in 2.7% (the run's summary sentence is
gone; the counts and the table moved up). The clips are what the posters
end on. "The first request" matches.

**S-07, stale. The roadmap page is framed around 3.0.** Its lead is "What
3.0 brings, what comes after it", its first list "Shipped in 3.0", its
"Next" holds one item, "Fixes for the rough edges found in the last review
before 3.0. Done", and the shipped sharing sits under "Later"
(`app/roadmap/page.tsx`, `roadmap.mjs:7-8`). What is next (T2: Git, with
a diff before each change) reads as "Later".

**S-08, stale-risk. The comparison pages' facts were read on 2026-11-04
and the price of Postman on 2026-10-19.** Read again on 2026-11-07
(section 5): Postman's Team plan is still $19 a user a month, billed
yearly; Yaak's lifetime licence is now $349 (the benchmark's appendix had
$399); Postman's home page leads with agents and "Sign up for free".
Nothing on the site is wrong yet; the dates show their age to a rival's
reader.

**S-09, stale-risk. The benchmark is 3.0.0's.** `docs/design/benchmark.md`
measured `1a2ed52` (3.0.0's candidate). Task 6, "Send the same request to
a teammate", is 2 actions there; with Share… a collection is 3 to 4
(right-click, Share…, Link, Make link). Not re-measured since.

### What is missing

**S-10, missing. Encrypted link sharing is nowhere a visitor looks.** The
landing, the header and the comparison pages never name it (S-01 says the
opposite); it is a docs page (`/docs/sharing/`) reached only from the docs
index. It is the one thing no rival's landing offers (section 5).

**S-11, missing. Much of the app has no sentence on the landing.** Not on
it, nor one click from it: request tabs; GraphQL with a schema; WebSocket;
event streams; OAuth 2.0 and AWS Signature V4; the run's data files and
its JSON, JUnit and HTML reports; the cookie jar and pairing of the Local
Bridge; offline use and installing (one question of seven, closed);
keyboard alone and the screen reader (C-038, C-067); the import formats
past Postman's are one sentence. Of these, WebSocket, event streams,
GraphQL's schema, tabs, the run reports and the bridge's pairing have no
claim, so a sentence about them waits for one (rule of W2.1).

**S-12, missing. The trust story is not a section.** The claims ledger,
the threat model and the trust center are three links in the footer; the
landing never says that each of its sentences names a test, which is the
proof no rival uses (section 5). Row 1.74 keeps the claims page to one
link (the footer's); the trust center and the threat model may be linked
from the page.

### Positioning

**S-13, weak. The hero sells 3.0's three things.** "Import a Postman
collection, run its scripts and keep your API keys encrypted, all in your
browser." Read cold, the five-second answer is "an API client in a tab",
which is right and is the line to keep. The sixty-second answer lists
import, scripts and the vault, and leaves out the two reasons a team
leaving Postman has to switch now: no seat to buy for a second person,
and a collection handed over without a server.

**S-14, weak. The landing is a feature list, not a day.** Seven sections
in a row, each a feature beside a mock-up (Postman, keys, failure, AI,
CI), then the recordings in a separate band. The recordings, the only
pictures of the real app, are 70% down the page. The persona walkthroughs
are days: a request in the morning, a failure, a hand-off, a run.

**S-15, weak. The table's last row admits less than it should, and more
than is true.** "A workspace your team shares: Not yet" is false (S-01),
and the honest form ("a copy, by file or link; no workspace that stays in
step") is a stronger answer than either.

### UX

**S-16, weak. The header names four pages and not the reason to come.**
Docs, Compare, Changelog, GitHub. Nothing for sharing or trust. The
roadmap and the blog are footer-only (by design, D5-e).

**S-17, polish. The recordings show the browser's own controls.** Each
`<video controls>` draws Chromium's bar over the bottom of the poster,
"0:00" and all, covering a sixth of the app's picture; in Chromium the
loading arc is drawn over the poster's middle until the clip is asked for.
Nothing else on the site looks native.

**S-18, polish. The docs search finds 29 design records.** They are
pages (`/docs/design/*`), each marked "Design record, not user
documentation" and `noindex`, and out of the sitemap but for the three the
comparisons cite; Pagefind indexes every one. A visitor who searches "share" finds `design/teams/share` (a design
for T-c, not built) beside `sharing`.

**S-19, polish. Pagefind's hidden Clear button is 11.2 px.**
`pagefind-ui__search-clear` on every docs page, measured; it is
`pagefind-ui__suppressed` and drawn only after a search.

### Craft and voice

**S-20, polish. Some doc titles are in title case.** "Pre/Post-Request
Scripts & Assertions", "Collections Schema", "Storage Layout", "Trust
Center" (`<title>` of each page); `voice.md` asks sentence case. The
variables doc's description says "the URL" where the voice says
"address".

### Trust and search

**S-21, polish. The 404 page has no Open Graph image** (it is not meant to
be shared, and has no canonical address by design). Listed so it is not
found again.

### Found in a second read of every page's text

**S-22, false. The table says Wayfarer names a DNS failure and a 401
"before and after you send".** `AskFirst.tsx:108-113`, citing C-049 and
C-010. Neither claim names a cause: C-049 is what the browser will do,
C-010 the real error. In the benchmark, tasks 5a and 5b name the cause
only after the Local Bridge is paired and the request sent through it
(`benchmark.md`, 8 actions and 2 in a terminal).

**S-23, false. The claims-ledger post says the tests run on every change
in three engines, and that the deploy publishes only a run in which every
job passed** (`content/blog/2026-10-19-the-claims-ledger.md:24-34`). The
browser tests are `e2e.yml`, run by hand since 2026-10-26 (CLAUDE.md), and
every deploy since 3.0.0 was by hand, with no `ci-run.json` (S-04).

**S-24, false. The trust center says "The Local Bridge isn't on npm"**
(`docs/trust-center.md:246`). It is: `npm view wayfarer-bridge version`
gives 3.0.1, and `self-hosting.md` says `npx wayfarer-bridge`.

**S-25, stale. The trust center says the zone injects the Web Analytics
beacon** (`trust-center.md:174-177`). The beacon is gone (2026-11-07);
Bot Fight Mode's script and the `nel` and `report-to` headers remain.

**S-26, false today. The threat model says a monitor loads production
every 6 hours and fails on a foreign script** (`docs/threat-model.md:110,
119`, C-012). The monitor skips that test until `ZONE_HARDENED` is set
(`synthetic.yml`), so it would not find one.

**S-27, missing. Neither the trust center nor the threat model has the AI
provider as a place data goes.** "Third parties receiving data: None"
(`trust-center.md:293`) is true until a provider is added; then prompts go
to it (C-069 to C-083), and the threat model has no boundary for it.

**S-28, stale. The trust center says "Data and files from Wayfarer 1.x are
not read by version 2"** (`trust-center.md:253`): history, and against the
one-version rule (no word about earlier versions).

**S-29, weak. "Collections, environments, history, the vault and scripts
are kept in your browser" cites C-002 alone** (`page.tsx:512-513`), which
covers the first three.

**S-30, weak. "Postman Free has been one user since March 2026" is
sourced to Yaak's blog** (`page.tsx:344-347`), a rival's, with no date;
Postman's own "About plans" says it (`rivals.tsx:123`). The price beside
it was read on 19 October, the comparison pages' on 4 November.

**S-31, weak. The comparison sets Wayfarer's data-file run in the app (5
actions) against Bruno's and Hoppscotch's command line (2)**
(`rivals.tsx:744-751`); `wayfarer-cli run -d` is the like for like
(`docs/cli.md`).

**S-32, stale. The benchmark's task 6 says "Wayfarer has no sharing yet
(phase T)"** (`docs/design/benchmark.md:86-87`), on the page the
comparisons link to.

**S-33, missing. The comparison pages never say Wayfarer sends GraphQL
or WebSocket requests**, though Yaak's facts list both and "behind" names
only gRPC, MQTT and Socket.IO. GraphQL's schema, WebSocket and event
streams have no claim (S-11).

**S-34, missing. Import and export docs do not name Import › Link… or
Share…** (`docs/import.md`, `docs/export.md`); `browser-limits.md` does
not say how to start the bridge.

**S-35, weak. The roadmap's "Every control works from the keyboard and
with a screen reader" cites C-038 and C-067** (`roadmap.mjs:42`): axe on
the primary views, and the core flow by keyboard. Neither says "every
control" or a screen reader. Same for "the status line is read out"
citing C-038 (`whats-new.mjs:274-277`).

**S-36, polish. Voice in the trust center**: contractions (lines 22, 84,
87, 104, 200, 216, 246, 309), "URL" for address, "Trust Center" in title
case; `rivals.tsx:242` "can't", `:605` "a URL of your own".

## 5. The rivals' landing pages, read on 2026-11-07

Read with each page's own words, 2026-11-07; quoted from the fetched page.

| Rival | Hero | Main call | Proof shown |
|---|---|---|---|
| Postman | "API engineering for your agents" | Sign up for free (and `npm install -g postman-cli`) | "over 50 million developers and 500,000 companies", logos |
| Insomnia | "AI-ready APIs Built Smarter. Tested Faster. Governed Better." | Get Started for Free | logos, 4,500 stars, SOC 2 |
| Bruno | "The Git-native API client" | Download | 46K stars, logos, SOC 2 Type II, quotes |
| Yaak | "The local-first API client" | Download | 19k stars, 159k downloads, quotes |
| Hoppscotch | "Make Better APIs" | Get Started on Cloud | "5M+ requests every month", logos |
| HTTPie | "Flow through APIs" | Go to App | 47,961 stars; its site's newest release is 2025.2.0 |

What is crowded: "local-first" and "no account" (Bruno, Yaak, Hoppscotch,
Insomnia's Scratch Pad), "Git-native" (Bruno, Yaak), "open source", and
"for agents". What none says: a collection handed to someone with no
server, no account and no seat; and a page whose every sentence is held by
a test. Postman's Free plan is one user since March 2026 (Postman's
"About plans": "the Free plan is limited to one user and can't create a
team"). The site should lead with the tab (no install, one click to a
first request), then the hand-off, then the proof; it should not lead with
"local-first", which is Yaak's line.

## 6. The landing and the navigation, as recommended

Written before any code (W6.4). The landing is a marketing page for one
application; it argues in this order, each part a claim and its proof.

1. **Hero.** "The API client that opens in a tab" stays: it is the one
   thing no desktop rival can say, and the visitor's first question
   ("what is it, do I have to install it?") is answered in seven words.
   Under it, one sentence with the three reasons to switch now: Postman
   collections and their scripts, a hand-off without a server, and nothing
   of Wayfarer's between you and the API. "Open Wayfarer" first;
   "Moving from Postman" second. The demo stays beside it: the request,
   and everything that left the tab.
2. **What the others ask of you first.** The table, its sharing row made
   true (a copy by file or encrypted link; no workspace in step) and its
   failure row held to what the claims say.
3. **A day with Wayfarer.** The feature story follows a person's day, each
   step a statement beside a recording or a fragment of the real app:
   the first request; where it went (the exchange record); a key in the
   vault; a request the browser stops, and the Local Bridge; a collection
   handed to a teammate by link (new recording); the same run in CI. The
   recordings move from their band at the foot into the story.
4. **Trust you can check.** One section: every sentence on the page names
   a test in the ledger (the count read from `claims.md` at build time),
   the tests run in three engines, the threat model says what is not
   covered, and the source is MIT. Links to the trust center and the
   threat model; the claims page stays the footer's one link (row 1.74).
5. **Also in the app.** A short index of what the day did not show, each
   line naming its claim and linking its doc: OAuth 2.0 and AWS
   Signature V4, import formats, exports, GraphQL, offline and installing,
   keyboard and screen reader, AI that asks first. A line with no claim
   waits for one (W6.6).
6. **Questions**, made true.
7. **Send your first request**, the closing call.

The header: Docs, Compare, Sharing (the docs page), Trust (the trust
center), Changelog, GitHub, and "Open Wayfarer". Below 1024 px they fold
into the menu as today.

## 7. What the rework does

Phase W6 of `PLAN-design.md` takes each finding to a task. What is left
after it, each with its reason, is in its section 14 row.
