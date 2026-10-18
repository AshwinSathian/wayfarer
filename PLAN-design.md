# RFC: Wayfarer rebuilt for people (design, website, teams)

> Status: LOCKED (v1.0, 2026-10-16, approved by the maintainer). Changes after lock need a row in section 14. The remediation plan's P7.8 is done (its v1.2.107); its P7.9 is the owner's and does not block this plan.
> Scale: Epic
> Target start: 2026-10-16 (remediation session 11), with W0
> Created: 2026-10-14
> Author: AshwinSathian (maintainer), drafted with Claude
> Research: [`docs/design/research-2026.md`](docs/design/research-2026.md)

## 0. How to use this plan

Read this section, section 1's decisions, then the phase you are in. The
plan follows the conventions of `PLAN-airtight-remediation.md`: tasks have
binary acceptance criteria, every change of plan gets a row in section 14,
and `CLAUDE.md` holds the rules for code. Task IDs carry the phase letter:
D for design, W for the website, T for teams.

Before a phase starts, its session re-reads it against the repository and
splits it into sessions (the D0, W0 and T0 tasks), as P2.0 to P6.0 did.

## 1. Goals

### Problem

Wayfarer's engine is careful: 67 claims with tests, a sandbox, a vault, a
claims ledger. Its interface was built on top of that engine one feature
at a time, by agents following rules. Nobody has yet designed the product
as a whole, judged it against the tools its users already know, or asked
whether a first-time visitor understands what it is.

Three facts make this the moment:

1. Since 1 March 2026 Postman's free plan is one user. Teams that shared
   collections for free now pay per seat (research, section 1).
2. Every rival asks for an install first. Wayfarer sends a request from a
   tab with no account. Its home page does not say so, because it has no
   home page: `wayfarer.ashwinsathian.com` opens the app.
3. The widget layer is expensive to keep. `controls.css` (1,079
   lines) and `material-theme.scss` (411 lines, 19 override mixins) exist
   to make Angular Material look like the tokens, and the "Angular Material"
   section of `CLAUDE.md` has 34 rules on how to use it and where
   it falls short.

### What success looks like

Measured at the end of phase D5 and W4, against the baseline of D0:

- In the rival benchmark (D1.4), Wayfarer is fastest or tied for fastest
  on at least 6 of the 8 tasks, measured in time and in input events,
  against Postman, Bruno, Yaak, Hoppscotch and Insomnia.
- The adversarial review (D1.2) has no open finding of severity 1 or 2.
- Every view passes axe at WCAG 2.2 AA in both themes, three engines,
  at 360, 390, 820 and 1,440 px, as today.
- `wayfarer.ashwinsathian.com` serves the website; the app is at `/app`.
  The site scores 100 in Lighthouse's SEO and accessibility categories
  and 95 or more in performance (mobile preset).
- A team of two can share a collection without a server (T1) and see
  what the other changed before taking it.

### Decisions already made (maintainer, 2026-10-14)

- **Scope is total.** Material, Tailwind, the tokens, the layout, the
  flows and even the framework may go if the research gives a reason.
  This reverses the 2026-10-09 decision that widgets are Angular Material,
  for this plan only and only through a decision recorded in D1.
- **Everyone is a user.** The solo backend developer, the engineer bound
  by privacy rules, the QA tester who lives in the runner, the occasional
  user, and teams leaving Postman's paid plans. Each screen is judged
  against each persona (D1.3).
- **Character: research decides.** D2 shows two or three directions and
  the maintainer chooses.
- **Placement: after the remediation plan**, as its own file, because
  P7.8 archives that plan. P7.8 is done (2026-10-15). The release of
  `main` and its deploy wait for the website (remediation v1.2.101,
  confirmed 2026-10-16).
- **Teams: all four ways to share** (Git, peer-to-peer, a self-hosted
  server, files and links). This plan designs all of them (D4) and builds
  them in phase T, files and links first.
- **Git in the browser: D1 decides** between Chromium's folder access, the
  Local Bridge doing the file and Git work, and a desktop shell.
- **Platforms with first-class design:** the desktop browser, and the CLI
  with its reports. Phones keep today's rule (nothing wider than 360 px,
  every control reachable) and get no flows of their own.
- **AI: bring your own key or a local model**, off by default, every byte
  that leaves shown before it leaves.
- **Accessibility: WCAG 2.2 AA everywhere.**
- **Identity: everything is open, the name too.**
- **Validation: heuristic and adversarial review, and benchmarks against
  the rivals.** No telemetry and no recruited usability study.
- **The app moves to `/app`** on the current host now (phase W1), and to
  an `app.` subdomain when the product has a domain of its own.
- **The website:** a landing page with a classic hero and a call to open
  the app, showing the app in a screenshot or an animation; docs,
  comparison pages, the trust center and changelog, a blog, and
  marketing and search work for organic reach. Its stack: research
  decides (W0).
- **All copy** (site, app, docs) goes through the `humanizing-writing`
  skill.

## 2. Background

What exists, measured 2026-10-14 and re-measured 2026-10-16 (details in the
research, section 11):

- Angular 22, zoneless, standalone; Angular Material for widgets; Tailwind
  4 without preflight; tokens in `src/design-system/tokens.css` (157
  declarations, Apple's naming); type classes in
  `src/design-system/typography.css`, of which `type-footnote`,
  `type-caption` and `type-callout` carry most of the interface.
- 15 component folders under `src/app/components`, 4,069 lines of
  templates, 44 inline SVG icons (`src/app/shared/icon/icon-paths.ts`).
- Layout by two widths in `App.updateViewportFlags`: 1,200 px (sidebar
  becomes a drawer) and 768 px (composer stacks).
- 1,125 e2e tests in 58 files across the three engines' projects, many of them reaching controls by
  role and name. A rebuild changes names; every changed test is a row in
  the PR saying why (as the remediation plan requires).
- Hosting: Cloudflare Workers static assets (`wrangler.jsonc`), headers
  in `public/_headers`, CSP generated from `security/csp.json`, the OAuth
  callback at `/oauth/callback` (`public/oauth/callback.html`), a service
  worker built by `scripts/build-sw.mjs`.

### Glossary

- **Persona:** one of the five users above, each with a written profile
  and task list in D1.3.
- **Finding:** a numbered problem from the audit, `U-NNN`, with a
  severity from 1 (blocks a task) to 4 (cosmetic).
- **Direction:** a whole visual and interaction proposal in D2, shown as
  a working prototype.

## 3. Non-goals

- Native phone or tablet apps, and flows designed for phones.
- A hosted Wayfarer service run by the maintainer, accounts, billing or
  paid tiers. The self-hosted server of T4 is software teams run.
- AI on by default, or any AI call the user did not set up.
- Telemetry in the app, and recruited usability studies.
- Changing what the engine does (`packages/core`): the resolver, the
  vault, the sandbox, the redactor and the claims stay as they are. A
  claim's wording may change; its test keeps proving it.
- A desktop shell, unless D1.6 recommends one and the maintainer
  approves; then it gets its own plan.
- Rewriting history: the remediation plan, `CHANGELOG.md` and the audit
  keep the names they had.

## 4. Architecture

### 4.1 Target shape

```
wayfarer.ashwinsathian.com
├── /                 website (W): landing, comparisons, blog, trust, changelog
├── /docs/            docs site, built from docs/*.md
├── /app/             the app (moved in W1), its own CSP, SW scope /app/
│   └── /app/oauth/callback
└── /llms.txt, /sitemap.xml, /robots.txt

packages/
├── core/             unchanged engine
├── bridge/           may gain file and Git work (D1.6 decides)
├── cli/              from remediation P6.5; its reports restyled in D4.9
├── tokens/           to be created in D3.1: DTCG tokens, built to CSS for app and site
└── site/             to be created in W2, stack per W0.2
```

### 4.2 Component inventory

| Component | New / changed | Notes |
|---|---|---|
| `packages/tokens` | New (D3.1) | DTCG 2025.10 JSON; one build writes CSS custom properties for the app and the site. Replaces `src/design-system/tokens.css`. |
| Widget layer | Re-decided (D1.5, built D3.3) | Angular Material, Angular Aria with our own styles, or the platform (popover, anchor positioning, `<dialog>`). |
| `src/design-system/*` | Rewritten (D3) | Typography, controls, animations from the tokens. |
| App shell and every view | Rewritten (D4) | New information architecture. |
| `packages/site` | New (W2) | Landing, docs, comparisons, blog. |
| Hosting config | Changed (W1) | `wrangler.jsonc`, `public/_headers`, `security/csp.json`, `scripts/build-sw.mjs` for `/app`. |
| Sharing | New (T) | Per T0's design: share files, Git, sync, server. |

### 4.3 Data

No stored shape changes in D. W1 moves the app's origin path, not its
origin: IndexedDB and `localStorage` stay with the origin, so data
survives the move to `/app`. The later move to an `app.` subdomain is a
new origin and does not carry data; that move needs an export and import
step, or a migration design if the app has users by then (D24 of the
remediation plan holds until it does).

T adds stored shapes for sharing (who changed what, from where). Each is
designed in T0 with its validator, as every stored shape is today.

## 5. Alternatives considered

| Option | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| Restyle in place | Keep Material and the layout; new tokens and type only | Smallest diff; tests mostly stand | Keeps the override layer and the flows nobody designed | Rejected by the maintainer's "truly everything"; kept as D2's fallback direction |
| Rebuild, widgets on Angular Aria | Headless accessible patterns, our own styles | No override layer; Angular's own; stable in v22 | Fewer ready parts than Material (no tree, no data table); we own the look of every state | Candidate, decided in D1.5 |
| Rebuild, widgets on the platform | `<dialog>`, popover, anchor positioning, native select | No dependency; fastest | Customizable select is not Baseline; some keyboard patterns are ours to write | Candidate for overlays at least, D1.5 |
| Another framework | React or Svelte for the UI | Larger design-system ecosystems | Rewrites 47 components and their tests; Angular is not the problem the audit has found so far | Kept open only if D1 finds a reason |
| Website inside the app | The landing is a route of the Angular app | One toolchain | The app's strict CSP and SW apply to marketing pages; the first load pays for the app | Rejected for the landing; W0 compares SSG options |

## 6. Trade-offs

- A rebuild breaks hundreds of e2e tests by name. Accepted: each is
  rewritten in the PR that changes its view, with the reason, and the
  claim tests keep their IDs. No test is deleted without a replacement
  that proves the same thing.
- A new name throws away whatever recognition "Wayfarer" has. Accepted as
  an option because there are no users (D24). The npm names are taken
  since 2026-10-15 (`wayfarer-bridge` 3.0.1, `wayfarer-cli` 2.0.1, with
  provenance): a new name means new packages and `npm deprecate` on these.
- A website brings the third parties a site usually has (fonts, video,
  analytics). The app's claim that it makes no third-party request
  (`e2e/no-third-party-requests.spec.ts`) stays true for `/app`; the site
  gets its own, stated policy (W3.6).

## 7. Risks

| Risk | L | I | Score | Mitigation | Owner |
|---|---|---|---|---|---|
| Scope grows past what sessions can finish; half the app is new and half old for months | H | H | 9 | D4 rebuilds one flow per PR behind no flag, old and new never shown together; the order in D4 ships the most-used flows first; each phase ends releasable | Session, maintainer |
| The widget decision is wrong and is found late | M | H | 6 | D1.5 builds the three hardest widgets (tree, select, menu) in each candidate and tests them in three engines before deciding | Session |
| The audit becomes taste instead of findings | M | M | 4 | Every finding cites a heuristic, a persona task or a benchmark number; "I don't like it" is not a finding | Session |
| Rival benchmark is unfair (the author knows Wayfarer) | H | M | 6 | Tasks written before measuring; each tool used from a fresh install with its own docs; numbers and screen recordings published with the method | Session |
| Moving to `/app` breaks OAuth for users who registered `/oauth/callback` | L | M | 2 | No users (D24); the old path answers with a page that says where the callback went; docs and the OAuth e2e change in the same PR | Session |
| AI features contradict the privacy promise | M | H | 6 | Off by default; a request preview of exactly what leaves; claims and e2e for "nothing is sent until the user sends it" | Maintainer |
| Rename collides with an existing trademark or package | M | M | 4 | D2.3 checks registries, npm, domains and trademarks before shortlisting | Maintainer |
| Peer-to-peer sync leaks data through its relay | L | H | 3 | End-to-end encryption, a relay that sees ciphertext only, a claim and a test that inspect the relay's traffic | Session |

## 8. Dependencies

- **Upstream:** `PLAN-airtight-remediation.md`'s P7.8, done 2026-10-15
  (production serves v2.5.0; the CLI is published). Its P7.9 owner steps
  (the Cloudflare zone, P0.12; the deploy token and rollback drill, P1.7;
  F42; F64) do not block D or W, but W4 deploys through `deploy.yml`,
  which needs the `CLOUDFLARE_API_TOKEN` secret.
- **Libraries, each decided in its task:** Angular 22 and Angular Aria;
  a DTCG token builder (Style Dictionary or Terrazzo, D3.1); the site
  generator (W0.2); a CRDT library for T3 (Yjs or Automerge).
- **Services:** Cloudflare Workers (hosting, owner), the domain registrar
  (owner, for a new name), GitHub Actions.
- **Rival tools** installed on the maintainer's machine for D1.4:
  Postman (free plan), Bruno, Yaak, Hoppscotch, Insomnia, at current
  versions.
- **The maintainer** for each decision marked "maintainer chooses".

## 9. Phases

Sessions are estimates. A session is one sitting of an agent with the
maintainer available.

### Phase D0: Baseline (1 session)

**Goal:** a record of the app as it is, to measure the rebuild against.

- [ ] **D0.1** Screenshot every view, dialog, menu and state (empty,
  loading, error, filled) at 360, 390, 820 and 1,440 px, both themes,
  three engines, with a Playwright spec kept under `e2e/design/`.
  - AC: `docs/design/baseline/` holds the images and an index page
    listing each state; the spec runs in CI as a job that does not fail
    the build.
- [ ] **D0.2** Count each core task in input events on today's app (the
  eight tasks of D1.4).
  - AC: a table in `docs/design/baseline.md` with events and seconds per
    task, three runs each, median given.
- [ ] **D0.3** Split D1 to D5 into sessions against the repository.
  - AC: a section 14 row with the split.

### Phase D1: Adversarial audit and research (2 sessions)

**Goal:** every problem written down with evidence, and the four
architectural decisions made.

- [ ] **D1.1** Repeat and extend the research (`docs/design/research-2026.md`)
  with primary sources for every point that rests on one blog, and
  read each rival's docs on onboarding, sharing and AI.
  - AC: each point of the research doc has a primary source or is marked
    unverified; a dated changelog at its end.
- [ ] **D1.2** Hostile review of every screen in D0.1's index: Nielsen's
  ten heuristics, plus the questions "what would a Postman user try
  first here, and does it work?" and "what does this screen say that the
  user did not need?".
  - AC: `docs/design/audit.md` lists findings `U-001` onward with screen,
    severity, heuristic, evidence (a screenshot path or a recording) and
    the persona hurt. Every screen of D0.1 has at least one line, "no
    finding" included.
- [ ] **D1.3** A cognitive walkthrough per persona: five written profiles
  and, for each, their first ten minutes and their tenth day.
  - AC: five walkthroughs in `docs/design/personas.md`; every step that
    fails is a finding in the audit.
- [ ] **D1.4** Rival benchmark. Eight tasks, written before measuring:
  first request from nothing; import a Postman collection with scripts and
  run it; add an environment and switch it; use a secret without it
  touching disk; find why a request failed (CORS, DNS, 401); send the same
  request to a teammate; run a collection with a data file and read the
  report; find a request sent last week.
  - AC: `docs/design/benchmark.md` has, for Wayfarer and the five rivals,
    input events, seconds, errors and a recording per task, with the
    method and the versions used.
- [ ] **D1.5** Decide the widget layer. Build a tree with drag and
  keyboard reorder, a select with a null option, and a context menu in
  Angular Material (as today), Angular Aria and the platform primitives;
  test each with axe and keyboard in three engines.
  - AC: a decision record in section 14 naming the choice, with the
    prototype branch, the test results and bundle sizes; the maintainer
    approves it.
- [ ] **D1.6** Decide how Git works: Chromium's folder access, the Local
  Bridge doing file and Git work, or a desktop shell; measured with a
  prototype that round-trips a collection through a Git repository.
  - AC: a decision record with the prototype's result in three browsers;
    the maintainer approves it.
- [ ] **D1.7** Decide the AI shape: what it does (draft a request from a
  description, write tests from a response, explain a failure, act as
  an MCP or WebMCP server for the user's agent), which providers (the
  user's key, Ollama, Chrome's Prompt API) and how each byte that leaves
  is shown.
  - AC: a decision record and a list of the claims it adds, each with the
    test that will prove it.

**Exit criteria:** the audit's findings are triaged (fix, accept with a
reason, or out of scope); D1.5 to D1.7 are decided.

### Phase D2: Direction and identity (1 to 2 sessions)

**Goal:** the maintainer chooses how Wayfarer looks, sounds and is
called.

- [ ] **D2.1** Two or three directions, each a working prototype of the
  composer, the response, the sidebar and the runner, in both themes
  (for example: a native professional tool; a dense keyboard-first tool;
  a calmer explanatory one). Each states what it gives up.
  - AC: each direction runs from a branch; screenshots at 1,440 and
    390 px in both themes are in `docs/design/directions/`; the
    maintainer's choice is a section 14 row.
- [ ] **D2.2** Voice and tone guide, written with `humanizing-writing`:
  how the app names things, says an error, asks a question, explains a
  limit.
  - AC: `docs/design/voice.md`, with the twenty most-shown strings of
    the app rewritten as examples.
- [ ] **D2.3** Name review: keep "Wayfarer" or choose another; check npm,
  GitHub, domains and trademark registers for each candidate.
  - AC: a shortlist with the checks done and dated; the maintainer's
    choice is a section 14 row. If the name changes, a list of every
    place it appears (`git grep -i wayfarer` count) and the task that
    changes them.
- [ ] **D2.4** Logo, wordmark, app icon, favicon and social image, and an
  icon set that replaces the 44 inline icons in one style.
  - AC: the files in `packages/tokens/brand/`; each icon at 16, 20 and 24
    px is checked at 1x and 2x.

### Phase D3: Foundations (2 sessions)

**Goal:** tokens, type, space, motion and the widget layer, ready for the
views.

- [ ] **D3.1** `packages/tokens`: DTCG 2025.10 JSON for colour (OKLCH,
  with sRGB fallbacks), type, space, radius, elevation, motion; a build
  that writes CSS for the app and the site.
  - AC: the build runs in CI; `scripts/contrast.test.mjs` reads the
    tokens from the package; every pair it checks passes 4.5:1 for text
    and 3:1 for controls in both themes.
- [ ] **D3.2** Type scale and density: one scale for the app (with a
  compact and a regular density) and one for the site; monospace for
  every value a user typed or a server sent.
  - AC: `typography.css` is generated from tokens; the number of type
    classes in use is reported before and after; no text below 12 px.
- [ ] **D3.3** The widget layer of D1.5, with a catalogue page of every
  widget in every state (a route present only in development builds).
  - AC: the catalogue passes axe in both themes and three engines; each
    widget has a keyboard e2e; `controls.css` and `material-theme.scss`
    are deleted if D1.5 dropped Material.
- [ ] **D3.4** Motion spec: what moves, how long, and what happens with
  `prefers-reduced-motion`.
  - AC: durations and easings are tokens; an e2e with reduced motion
    finds no animation longer than 0 ms.

### Phase D4: Flows rebuilt (4 sessions)

**Goal:** every view rebuilt on the foundations, in the order the
benchmark says matters most.

- [ ] **D4.1** Information architecture: what the shell holds, where each
  thing lives, how the command palette, the sidebar and tabs share work.
  - AC: a map in `docs/design/ia.md`; every action of today's app has a
    place in it or a recorded reason for its removal.
- [ ] **D4.2** First run: from an empty app to a first response in the
  fewest steps D1.4 measured among the rivals, or fewer.
  - AC: the benchmark task "first request from nothing" re-measured.
- [ ] **D4.3** The composer and the response. (AC below.)
- [ ] **D4.4** Collections, folders, tabs and history. (AC below.)
- [ ] **D4.5** Environments, variables and the vault. (AC below.)
- [ ] **D4.6** The runner and its reports. (AC below.)
- [ ] **D4.7** Settings, the Local Bridge and routes, import and export. (AC below.)
- [ ] **D4.8** Team flows designed, not built: share, receive, see who
  changed what, resolve a conflict, review before taking a change; for
  each of the four ways to share.
  - AC: clickable prototypes and a spec per flow in `docs/design/teams/`.
- [ ] **D4.9** The CLI's terminal output and its HTML and JUnit reports
  in the same design language. (AC below.)
- [ ] **D4.10** AI flows per D1.7: setup, the preview of what leaves,
  permission per action, diff and undo, a log. (AC below.)
  - AC (D4.3 to D4.7, D4.9, D4.10 each): the view's findings from the
    audit are closed or accepted with a reason; axe and width checks pass
    at four widths, both themes, three engines; its benchmark tasks are
    re-measured and recorded.

### Phase D5: Validation and release (1 session)

- [ ] **D5.1** Repeat D1.2's hostile review and D1.4's benchmark on the
  new app.
  - AC: the success numbers of section 1 hold, or the gap is a recorded
    decision of the maintainer.
- [ ] **D5.2** Release v3.0.0 with the site (W4).
  - AC: tag, changelog, release notes written with `humanizing-writing`.

### Phase W: The website (3 sessions; W1 may run before D)

**Goal:** `wayfarer.ashwinsathian.com` explains Wayfarer to someone who
has never heard of it and gets them into the app.

- [x] **W0.1** Re-read the phase and split it.
  - AC: a section 14 row with the split into sessions.
- [x] **W0.2** Choose the site's stack: a static generator (Astro or
  similar), Angular's prerendering, or plain HTML from Markdown. Measured
  on: bytes shipped for the landing, build time, sharing tokens with
  the app, Markdown docs, CSP without `unsafe-inline`.
  - AC: a decision record with a prototype landing page built in each.
- [x] **W1.1** Move the app to `/app`: the build's base href, the service
  worker's scope, `public/_headers` per path, the CSP per path, the OAuth
  callback at `/app/oauth/callback`, the Local Bridge's allowed origins
  (unchanged: the origin does not change), every e2e's base URL.
  - AC: the full e2e suite passes in three engines against `/app`; the
    smoke e2e asserts the app's headers at `/app/` and the site's at `/`;
    data stored before the move is there after it (an e2e that writes at
    the old path and reads at the new one).
- [x] **W1.2** Ground rules for the site: its own CSP; no request to a
  third party unless W3.6 allows it; no cookie.
  - AC: an e2e that loads every site page and records every request's
    origin.
- [x] **W2.1** Landing page: a hero line that says what Wayfarer is and
  what it does that the rivals do not (no install, no account, nothing
  leaves without you); "Open Wayfarer" as the main call; an animation or
  screenshot of the real app; the proof the rivals use (stars, users)
  only when it is true, and the proof they cannot copy (the claims
  ledger, each claim with its test).
  - AC: copy through `humanizing-writing`; every factual sentence on
    the page is a claim with an ID or links to its source; Lighthouse
    numbers of section 1.
- [x] **W2.2** Docs site from `docs/*.md`, with search that runs in the
  page.
  - AC: every file in `docs/` has a page; links between them work
    (`lychee` in CI).
- [ ] **W2.3** Comparison pages: Wayfarer and Postman, Bruno, Yaak,
  Hoppscotch, Insomnia; plus "Moving from Postman".
  - AC: each fact about a rival has a source and a date; a page lists
    where Wayfarer is behind.
- [x] **W2.4** Trust center, claims ledger with each claim's last CI
  result, changelog and roadmap as pages.
  - AC: the ledger page is generated from `docs/claims.md` and the last
    CI run on `main`.
- [ ] **W2.5** Blog with release notes and engineering write-ups.
  - AC: an RSS feed; the first three posts published.
- [ ] **W3.1** Search and sharing: titles, descriptions, canonical URLs,
  `sitemap.xml`, `robots.txt`, Open Graph and social images per page,
  `SoftwareApplication` structured data, `llms.txt`.
  - AC: each validates (Google's Rich Results test, an OG checker);
    recorded in the PR.
- [ ] **W3.2** Organic reach plan: the listings and directories where
  Postman alternatives are compared (openalternative.co, AlternativeTo
  and others found in W0), the launch posts, the comparison pages as
  search landing pages.
  - AC: `docs/design/reach.md` with each channel, what is posted there
    and when; the maintainer approves before anything is posted.
- [ ] **W3.6** Decide whether the site measures visits, and how, without
  breaking the app's promise.
  - AC: a decision record; whatever is chosen is said on the site's
    privacy page.
- [ ] **W4** Launch with v3.0.0: the site at `/`, the app at `/app`.
  - AC: the synthetic monitor checks both; `docs/runbook.md` has the
    rollback for each.
- [ ] **W5.1** The site takes the app's new identity: its colour, type,
  radius and motion come from `packages/tokens` (D3.1), the same build as
  the app's, so the two read as one product in both themes.
  - AC: the site's stylesheet holds no colour or font literal outside the
    tokens' output; `scripts/contrast.test.mjs` checks the site's pairs too.
- [ ] **W5.2** The landing shows the redesigned app working, not a still:
  the first request, the inspector saying where it went, a run's report.
  Recorded from the real app by a script (`scripts/site-screenshot.mjs`
  grown into a recorder) with canned answers, so it never calls the
  network; a still for `prefers-reduced-motion`.
  - AC: the recording is rebuilt by one command from the app's build;
    Lighthouse holds section 1's numbers; the site's request-origin e2e
    finds nothing new.
- [ ] **W5.3** Every picture of the app on the site and in `docs/` is
  taken again from the redesigned app, both themes, and every name of a
  control in the docs is the app's new one (D2.2's voice guide).
  - AC: a check that fails when a doc names a control the app no longer
    has (the names come from the e2e suite's roles and labels).
- [ ] **W5.4** The comparison pages (W2.3) carry D5.1's benchmark: events,
  seconds and a recording per task, per rival, with the method and the
  versions.
  - AC: each number links to its recording and its row in
    `docs/design/benchmark.md`.
- [ ] **W5.5** A "What changed in 3.0" page and post: before and after,
  screen by screen, from `docs/design/baseline/` and the new captures,
  each change tied to its audit finding.
  - AC: every severity 1 and 2 finding of the audit appears with its
    before and after, or with the reason it was accepted.

### Phase T: Teams (4 or more sessions, after D5)

**Goal:** a team shares its work without a Wayfarer server, in the four
ways the maintainer chose, built in this order.

- [ ] **T0** Re-read and split; turn D4.8's specs into tasks with stored
  shapes and validators.
  - AC: a section 14 row with the split; each new stored shape has a
    validator task and a claim to add.
- [ ] **T1** Files and links: share a collection or workspace as a file
  or as a link that carries the encrypted content in its fragment (the
  part a server never receives).
  - AC: a claim and an e2e that the link's content never reaches a
    server; the receiver sees a review of what changes before it is
    written.
- [ ] **T2** Git, as D1.6 decided.
  - AC: an e2e commits a collection, changes it on a second clone, and
    the first app shows the change and its diff before taking it.
- [ ] **T3** Peer-to-peer sync with end-to-end encryption and presence.
  - AC: a claim and a test that the relay sees ciphertext only.
- [ ] **T4** A self-hosted server, as a Docker image teams run.
  - AC: the image starts with one command from `docs/self-hosting.md`;
    two browsers share a collection through it in an e2e; a claim and a
    test say what the server stores and that it never stores a vault
    secret's plaintext.

## 10. Testing strategy

- **Unit and component:** the coverage gates stay (core 90%, app 70%).
- **e2e:** three engines, retries 0 before each PR, as today. A view's
  tests are rewritten in the PR that rebuilds it.
- **Visual:** the D0.1 spec becomes a `toHaveScreenshot` baseline once
  D3 lands; diffs are read in each PR.
- **Accessibility:** axe in both themes at four widths for every view
  and the catalogue; keyboard e2e per widget.
- **Benchmark:** D1.4's tasks re-run after each D4 task; the numbers go
  in `docs/design/benchmark.md`.
- **Rollback:** each D4 PR is one flow and can be reverted alone; W1
  can be reverted by restoring the root build.

## 11. Operations

- The synthetic monitor gains the site's pages (W4).
- `docs/runbook.md`: how to roll back the site and the app separately.
- New failure modes: the site and the app deploy from one Worker; a
  broken site must not take the app with it (W1.1 tests each path).

## 12. Open questions

Each has a default; a session goes ahead on the default and says so.

| # | Question | Default | Owner | Needed by |
|---|---|---|---|---|
| DQ1 | Does phase W1 (the move to `/app`) wait for this plan, or run right after P7.8 and before D0? | **Answered 2026-10-16: before D0.** The site's work does not depend on the redesign, and an early landing page can be replaced in W2 | Maintainer | P7.8 |
| DQ2 | Does the site measure visits (W3.6)? | No measurement until the maintainer decides | Maintainer | W3.6 |
| DQ3 | Where does the rival benchmark's Postman run: the free plan of one user, or a trial of Team for the sharing task? | Free plan; the sharing task is measured on Team's trial if one is available | Maintainer | D1.4 |
| DQ4 | Does a renamed product keep `wayfarer.ashwinsathian.com` as a redirect? | Yes, permanently | Maintainer | D2.3 |
| DQ5 | Can the self-hosted server of T4 be a paid product, or is everything MIT? | Everything MIT | Maintainer | T0 |

## 13. Appendix

- Research: [`docs/design/research-2026.md`](docs/design/research-2026.md).
- The remediation plan's D14 (custom widgets on the CDK) and its reversal
  on 2026-10-09 (Material) are the history of the widget question.

## 14. Change log

| Date | Version | Change |
|---|---|---|
| 2026-10-14 | 0.1 | Drafted. The maintainer's answers of this date are in section 1. Research in `docs/design/research-2026.md`. |
| 2026-10-16 | 0.2 | Refreshed against `main` at `b57632d` for the maintainer's review (remediation session 11): 67 claims, 47 components, 4,069 template lines, 1,125 e2e tests, `material-theme.scss` 411 lines with 19 override mixins (20 was a miscount), 34 Material rules in `CLAUDE.md`; P7.8 done; the npm names published; DQ1 answered (W1 before D0); the release of `main` waits for the website. |
| 2026-10-16 | 1.0 | **Locked: the maintainer approved the plan** ("Design looks good", 2026-10-16). Work starts with phase W (DQ1): W0.1 splits it into sessions, W0.2 chooses the site's stack, then W1.1 moves the app to `/app`. |
| 2026-10-16 | 1.1 | **The site ships before the redesign (maintainer, 2026-10-16).** Asked whether the site waits for v3.0.0 (W4 as written) or ships first, since the release of `main` waits for the website (remediation v1.2.101): it ships first. When W1 to W3 are done, a release (v2.6.0) carries `main`, the app at `/app` and the site, and is deployed; W4's AC (the monitor checks both paths, the runbook rolls each back) holds for that release. At D5, v3.0.0 brings the redesign to the same site, and the site's screenshots of the app are taken again. **W0.1, the split** (read against `main` at `b57632d`): **W-a**: W0.2 (a landing prototype in each candidate stack, measured, a decision record), W1.1 (the app to `/app`: `baseHref`, the service worker's scope and precache list in `scripts/build-sw.mjs` and `src/sw.ts`, `public/_headers` per path, `security/csp.json` per path with `gen:csp`, the callback at `/app/oauth/callback` and its 16 files, `wrangler.jsonc`'s SPA fallback for `/app/*` only, `prod-server.mjs`, Playwright's `baseURL` and the 198 `page.goto("/")` calls), W1.2 (the site's CSP, no cookie, the e2e that records every request's origin). **W-b**: W2.1, W2.2, W2.4. **W-c**: W2.3, W2.5, W3.1, W3.2, W3.6 and the release above. |
| 2026-10-16 | 1.2 | **W0.2: the site is built with Astro (maintainer's choice of three, 2026-10-16).** One landing page (hero, the call to open the app, a screenshot, four claims) and the 18 files of `docs/` as pages, built in each candidate from the same text and the app's `tokens.css`. Landing, HTML and CSS gzipped: plain HTML from Markdown (`marked`, already in the tree through Monaco, and a script of 20 lines) 4.4 kB, its CSS not minified; **Astro 7.4.0** 2.5 kB, no script; Angular 22's static prerender 82 kB, of which 245 kB raw is the script that hydrates the page (a docs page 169 kB gzipped, with every doc in one chunk, a short cut of the prototype). Build: plain 0.05 s, Astro 2.0 s for 19 pages, Angular 1.9 s. No inline script in any; Astro's Markdown highlighting (Shiki) writes `style` attributes, so the site's CSP without `unsafe-inline` needs it off (`markdown.syntaxHighlight: false`), and its small stylesheets inline unless `build.inlineStylesheets` is `"never"`. Astro adds 183 packages to the lockfile (`npm audit` 0) and has the sitemap, RSS and search that W2.2 to W3.1 need; plain HTML needs each written. The prototypes were throwaway and are not in the repository. |
| 2026-10-16 | 1.3 | **W1 (W1.1 and W1.2) done, in one PR: the site at `/`, the app at `/app/`.** `packages/site` (Astro, a placeholder page and a 404 page until W2.1); `npm run build` ends in `dist/deploy` (`scripts/build-deploy.mjs`), which Wrangler serves with `not_found_handling: "404-page"`. The app's own addresses are relative to its base (`sw.js` with the scope `./`, the manifest, the licences, `oauthRedirectUri`); the Trusted Types policy read a relative script URL against the origin and registered `/sw.js`, found by the e2e suite. `_headers` moved to `packages/site/public` with `/.well-known/security.txt` and `/ngsw-worker.js`; the site's CSP is `security/csp-site.json` (no script, nothing from another origin, `frame-ancestors 'none'`), and `/app/*` detaches it before setting the app's (checked with `wrangler dev` 4.149: one policy at each path). The synthetic monitor runs the latest `v*` tag's tests, since production runs v2.5.0 until the release. Measured in three engines: a worker registered at `/sw.js` before the move stays registered when its script is a 404, and the app's own controls `/app/` (`docs/runbook.md`, "After the deploy that moves the app"). `e2e/site.spec.ts` holds W1.2's AC; storage is the origin's, so the AC's "data stored before the move is there after it" is a test that writes at `/` and reads at `/app/`. |
| 2026-10-16 | 1.4 | **W2.1 done: the landing.** The hero line is the README's; the call is "Open Wayfarer"; the picture is the real app at 1440 and 720 px wide (`scripts/site-screenshot.mjs`, a request to `api.example.com` answered by `page.route`, since the e2e servers' addresses are not for a reader); five sections each name their claims (`data-claims`), and `e2e/site.spec.ts` holds every ID to `docs/claims.md`. No stars or user counts: none is true yet. Lighthouse, mobile preset, median of three on the local build: performance 100, accessibility 100, SEO 100; CI runs it (`check-lighthouse.mjs --site`). SEO was 92 first: Lighthouse fetches `robots.txt` from inside the page, and the site's `default-src 'none'` blocked it, so the site's CSP has `connect-src 'self'` (the site runs no script) and a `robots.txt`. Axe at WCAG 2.2 AA and the window's width at 360, 390, 820 and 1,440 px for every site page, in three engines. Links to the ledger and docs go to GitHub until W2.2 builds the docs pages. The site is dark only: it has no script to follow a choice, and D3 rebuilds the tokens. |
| 2026-10-16 | 1.5 | **W2.2 done: the docs pages and their search.** Every Markdown file under `docs/` is a page at `/docs/<name>/` (an Astro content collection over the repository's folder); a link to another doc becomes its page and a link to the rest of the repository the file on GitHub (`packages/site/src/doc-links.mjs`, a hast plugin of Astro 7's Markdown processor, Sätteri, which also makes a table that scrolls focusable: axe's `scrollable-region-focusable`). **Search: Pagefind 1.5.2, on `/docs/` only (maintainer, 2026-10-16)**: the index is built after Astro (`pagefind --site dist`); `/docs/*` and `/pagefind/*` have their own policy (`security/csp-docs.json`: the site's, with `script-src 'self' 'wasm-unsafe-eval'` and `img-src data:` for Pagefind's icons). Found on the way: Pagefind searches in a worker, and a worker has the policy of its own script's response, so `/pagefind/*` needs the docs' policy too, not the site's ("Failed to load the Pagefind WASM"). The landing keeps no script. **Links: not lychee.** `scripts/check-site-links.mjs` (CI's build job) follows every link of the built site to itself, to a page and to an id; a link to another site is not followed, so the check does not fail for the network's reasons. Code blocks wrap instead of scrolling. Smart punctuation is off: the docs' prose quotes commands. |
| 2026-10-16 | 1.6 | **W2.4 done; W-b is done.** The trust center is a docs page since W2.2. `/changelog/` is `CHANGELOG.md` (a second content collection, its links through `doc-links.mjs`). `/roadmap/` is generated from this file's section 9 (`packages/site/src/roadmap.mjs`, with a test that reads this file): each phase, and each task's ID, first sentence and tick. **The ledger's CI result (maintainer, 2026-10-16: built in at deploy):** `deploy.yml` writes `ci-run.json` (the run, its commit, its date) beside the tested files, which do not change, and `/claims-ci.js` on the claims page adds a "Last CI" column from it. The run is one `deploy.yml` accepts only with every job passed, and claim tests have no retry, so each row's "Passed" is true by construction; a test that does not run in an engine is said not to count. A copy with no such file (a local build, a self-hosted one) says so; a file that is not a run (a commit that is not 40 hex digits) is treated as none, and nothing of it reaches the page as markup. The header has five links and wraps at 360 px. |
| 2026-10-19 | 1.9 | **D1.2's first pass, D2.1's direction, and the shell moved ahead of D3 (maintainer, 2026-10-19).** The maintainer found the app "old, legacy and not modern" and asked for an adversarial review, research and an overhaul. **Audit:** [`docs/design/audit.md`](docs/design/audit.md), 36 findings (U-001 to U-036) from Chromium at 1,440, 820 and 390 px in both themes, with the screenshots it cites in `docs/design/baseline/`; the two of severity 1 are the page that scrolls as a document with the response below the fold (U-001) and the run report (U-013). Firefox, WebKit and five screens are its second pass. **Research (D1.1, added to):** Postman 12 has Native Git, desktop only ([Postman's docs](https://learning.postman.com/latest-v-12/docs/use/native-git/overview)); Linear's 2026 refresh: a dimmer sidebar, fewer and smaller icons, softer separators, warmer greys ([Linear](https://linear.app/now/behind-the-latest-design-refresh)). **Direction (D2.1):** three directions were shown as static mockups, not branches (`docs/design/directions/`): A Workbench (a native professional tool), B Console (dense, monospace, keyboard first), C Field guide (calm, explains after the fact). **Chosen: A, with C's rail** as a collapsible inspector (why a request failed, where it went, which secrets it used). **Widgets:** D1.5's bake-off still decides. **Name and mark:** kept for now; D2.3 and D2.4 later. **Order:** the shell comes first, on today's tokens, one PR each: **S1** a single click opens a request and the tree shows each request's method (U-008, U-009); **S2** a request's Settings tab holds the route, redirects, the certificate check and "What the browser does" (U-002, U-023); **S3** the shell is fixed panes of the window's height, each scrolling inside itself, and the environments leave the page's column (U-001, U-003, U-012); **S4** a status bar with the route, the vault and the bridge, and a toolbar that names what it holds (U-006, U-005, U-007); **S5** the run report: counts, progress, a failures filter and one diagnosis for a shared cause (U-013, U-014). D3 then rebuilds the foundations under them. **The site follows the redesign (maintainer, 2026-10-19: "at the end of the design rework exercise, the site will have to be updated as well. Go beyond the basics"):** W5.1 to W5.5, added to phase W: the site built from the app's tokens, a recording of the real app in place of a still, every picture and control name in the site and the docs taken again, the benchmark on the comparison pages, and a page of what changed in 3.0, finding by finding. They run after D4 and before D5.2's release. |
