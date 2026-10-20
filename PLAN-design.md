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
| Widget layer | Decided (D1.5, built D3.3) | Angular Aria with our own styles for the composite widgets, the platform (`<dialog>`, `popover`, native controls) for the rest, the CDK kept; Material removed. |
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
| Rebuild, widgets on Angular Aria | Headless accessible patterns, our own styles | No override layer; Angular's own; stable in v22 | Fewer ready parts than Material (no dialog, tooltip, input or data table); we own the look of every state | **Chosen for the composite widgets (D1.5)** |
| Rebuild, widgets on the platform | `<dialog>`, popover, anchor positioning, native select | No dependency; fastest | Customizable select is not Baseline; some keyboard patterns are ours to write | **Chosen for the rest (D1.5)** |
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
- [x] **D1.5** Decide the widget layer. Build a tree with drag and
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

- [x] **D3.1** `packages/tokens`: DTCG 2025.10 JSON for colour (OKLCH,
  with sRGB fallbacks), type, space, radius, elevation, motion; a build
  that writes CSS for the app and the site.
  - AC: the build runs in CI; `scripts/contrast.test.mjs` reads the
    tokens from the package; every pair it checks passes 4.5:1 for text
    and 3:1 for controls in both themes.
- [x] **D3.2** Type scale and density: one scale for the app (with a
  compact and a regular density) and one for the site; monospace for
  every value a user typed or a server sent.
  - AC: `typography.css` is generated from tokens; the number of type
    classes in use is reported before and after; no text below 12 px.
- [ ] **D3.3** The widget layer of D1.5, with a catalogue page of every
  widget in every state (a route present only in development builds).
  - AC: the catalogue passes axe in both themes and three engines; each
    widget has a keyboard e2e; `controls.css` and `material-theme.scss`
    are deleted if D1.5 dropped Material.
- [x] **D3.4** Motion spec: what moves, how long, and what happens with
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
- [x] **W2.3** Comparison pages: Wayfarer and Postman, Bruno, Yaak,
  Hoppscotch, Insomnia; plus "Moving from Postman".
  - AC: each fact about a rival has a source and a date; a page lists
    where Wayfarer is behind.
- [x] **W2.4** Trust center, claims ledger with each claim's last CI
  result, changelog and roadmap as pages.
  - AC: the ledger page is generated from `docs/claims.md` and the last
    CI run on `main`.
- [x] **W2.5** Blog with release notes and engineering write-ups.
  - AC: an RSS feed; the first three posts published.
- [x] **W3.1** Search and sharing: titles, descriptions, canonical URLs,
  `sitemap.xml`, `robots.txt`, Open Graph and social images per page,
  `SoftwareApplication` structured data, `llms.txt`.
  - AC: each validates (Google's Rich Results test, an OG checker);
    recorded in the PR.
- [x] **W3.2** Organic reach plan: the listings and directories where
  Postman alternatives are compared (openalternative.co, AlternativeTo
  and others found in W0), the launch posts, the comparison pages as
  search landing pages.
  - AC: `docs/design/reach.md` with each channel, what is posted there
    and when; the maintainer approves before anything is posted.
- [x] **W3.6** Decide whether the site measures visits, and how, without
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
| DQ2 | Does the site measure visits (W3.6)? | **Answered 2026-10-16: no.** The site measures nothing; the trust center says so (section 14, 1.7) | Maintainer | W3.6 |
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
| 2026-10-16 | 1.7 | **W3.6 done: the site measures no visits (maintainer, 2026-10-16; DQ2 answered).** Asked between no measurement, the counts Cloudflare keeps on its side (no script, no cookie), and Cloudflare's Web Analytics beacon (a script from another origin, against W1.2): no measurement. The trust center, which is the site's privacy page, has a section "The website" that says so, and names the two scripts the site runs from its own files (the docs' search and the claims page's CI column). Nothing in the build changes: `e2e/site.spec.ts` already holds every page to its own origin and no cookie. A change needs a decision first, and the page says what is measured before it is. |
| 2026-10-19 | 1.8 | **The site is rebuilt with Next.js and Tailwind, with a design of its own (maintainer, 2026-10-19; this reverses W0.2's Astro).** The maintainer found the W2.1 landing ugly and asked for the site to be re-implemented, not restyled, after a look at the rivals' sites (Yaak, Bruno) and the maintainer's own (Booklet, Weir): each leads with the product working, then says what problem it answers, shows evidence, and ends with questions and a full footer. Asked: **CSP** (Next's static export writes inline scripts, and a nonce needs a server): no `'unsafe-inline'`; the site's pages may run script from the site's own files (this replaces "the site runs no script"). **Direction:** an identity of Wayfarer's own in the same family as Booklet and Weir. **Scope:** everything at once (landing, docs and their search, changelog, roadmap, the ledger's CI column, 404); Astro goes. **Order:** this comes before the rest of W-c, whose pages are then built in Next. W3.6 stands: no measurement. |
| 2026-10-19 | 1.9 | **D1.2's first pass, D2.1's direction, and the shell moved ahead of D3 (maintainer, 2026-10-19).** The maintainer found the app "old, legacy and not modern" and asked for an adversarial review, research and an overhaul. **Audit:** [`docs/design/audit.md`](docs/design/audit.md), 36 findings (U-001 to U-036) from Chromium at 1,440, 820 and 390 px in both themes, with the screenshots it cites in `docs/design/baseline/`; the two of severity 1 are the page that scrolls as a document with the response below the fold (U-001) and the run report (U-013). Firefox, WebKit and five screens are its second pass. **Research (D1.1, added to):** Postman 12 has Native Git, desktop only ([Postman's docs](https://learning.postman.com/latest-v-12/docs/use/native-git/overview)); Linear's 2026 refresh: a dimmer sidebar, fewer and smaller icons, softer separators, warmer greys ([Linear](https://linear.app/now/behind-the-latest-design-refresh)). **Direction (D2.1):** three directions were shown as static mockups, not branches (`docs/design/directions/`): A Workbench (a native professional tool), B Console (dense, monospace, keyboard first), C Field guide (calm, explains after the fact). **Chosen: A, with C's rail** as a collapsible inspector (why a request failed, where it went, which secrets it used). **Widgets:** D1.5's bake-off still decides. **Name and mark:** kept for now; D2.3 and D2.4 later. **Order:** the shell comes first, on today's tokens, one PR each: **S1** a single click opens a request and the tree shows each request's method (U-008, U-009); **S2** a request's Settings tab holds the route, redirects, the certificate check and "What the browser does" (U-002, U-023); **S3** the shell is fixed panes of the window's height, each scrolling inside itself, and the environments leave the page's column (U-001, U-003, U-012); **S4** a status bar with the route, the vault and the bridge, and a toolbar that names what it holds (U-006, U-005, U-007); **S5** the run report: counts, progress, a failures filter and one diagnosis for a shared cause (U-013, U-014). D3 then rebuilds the foundations under them. **The site follows the redesign (maintainer, 2026-10-19: "at the end of the design rework exercise, the site will have to be updated as well. Go beyond the basics"):** W5.1 to W5.5, added to phase W: the site built from the app's tokens, a recording of the real app in place of a still, every picture and control name in the site and the docs taken again, the benchmark on the comparison pages, and a page of what changed in 3.0, finding by finding. They run after D4 and before D5.2's release. |
| 2026-10-19 | 1.10 | **React stays on the build machine (maintainer, 2026-10-19).** Measured on the rebuilt landing, Lighthouse mobile, median of three: with React in the browser, performance 97 locally and 93 on CI (the gate is 95; LCP 2.8 s); with Next's scripts taken out, 100 (LCP 1.7 s), also with the CPU slowed twelve times. Asked between React on the server only, keeping it and looking for smaller gains, and lowering the gate: server only. `strip-scripts.mjs` takes Next's scripts and their files out of the export; the theme toggle and the demo are `public/site.js`. The site's policy keeps `script-src 'self'` for the site's own files. Also found by CodeQL on #368 and fixed: a heading's slug text was taken by stripping tags with a regular expression (now from marked's tokens), and two script-matching expressions missed upper case and `</script >`. |
| 2026-10-19 | 1.11 | **W2.3 done: the comparison pages.** `/compare/` and a page each for Postman, Bruno, Yaak, Hoppscotch and Insomnia, plus `/compare/moving-from-postman/`. Every fact about a rival is from its own pricing page, docs or repository, with the date it was read (2026-10-19), in one file (`packages/site/src/lib/rivals.tsx`, where a fact cannot be written without a source); an e2e test holds every page to it. Each page says how Wayfarer differs, naming claims, and where the rival is ahead; the index lists where Wayfarer is behind (gRPC and other protocols, Git, team workspaces, a browser's limits, its age). Two lines were taken out in review because their source did not say them (that Bruno and Insomnia, as desktop apps, have no browser limits), and "best-known" with them. W5.4 adds D5.1's benchmark to these pages. |
| 2026-10-19 | 1.12 | **W2.5 done: the blog and its feed.** A post is a Markdown file in `packages/site/content/blog`, named for its date and slug, with its title, date and description at the top; `/blog/` lists them newest first, each is `/blog/<slug>/`, and `/blog/rss.xml` is RSS 2.0, linked from every page's head. The first two: the 2.5.0 release and how the claims ledger works. A third, on the site's rebuild, was written and taken out: the maintainer did not want a post about it (2026-10-19), so W2.5 ends with two posts, not the three its AC named. A post links to a doc as its file, as the docs do; `doc-links.mjs` now makes a link to `CHANGELOG.md` the changelog's page. The header folds its seven links into the menu below 1,024 px. |
| 2026-10-19 | 1.13 | **W3.2 done: the reach plan, for the maintainer's approval.** [`docs/design/reach.md`](docs/design/reach.md): Show HN (its rules read: something to try without a sign-up, which the app is), AlternativeTo (its Postman page lists Bruno, Insomnia, Hoppscotch and Yaak first), OpenAlternative, the comparison pages and the blog as pages people find, and the repository's topics (add `postman-alternative` and `offline-first`, take out `primeng`). For each: what is posted, when (after the v2.6.0 deploy) and its status, all "not posted". Paid listings are left out: the site measures nothing, so one could not be judged. Nothing is posted by an agent; the maintainer approves each entry. |
| 2026-10-19 | 1.14 | **W3.1 done, but for its AC's outside validators.** Every page has its title, description (a doc's is its first paragraph), canonical address, Open Graph and Twitter cards (`packages/site/src/lib/meta.ts`), and an image of its own: `social-images.mjs` draws each page's title and description on the site's paper after `next build`, with next/og's ImageResponse in Node (Atkinson Hyperlegible Next: Satori reads no WOFF2 and no variable font, so not Bricolage). `sitemap.xml` lists every page and `/app/`; `robots.txt` names it; the front page carries schema.org `SoftwareApplication` as JSON-LD (data, which the site's policy does not run and `strip-scripts.mjs` keeps), with no rating or review since there are none; `/llms.txt` lists the docs with their first lines. An e2e test holds every page to its cards and a 1200 by 630 PNG of its own. **Not done:** Google's Rich Results test and an Open Graph checker need the site on its address, so they run after the v2.6.0 deploy (the AC's record goes in that session's row). Google shows a `SoftwareApplication` rich result only with a rating or review; the data is valid without one, and none will be made up. |
| 2026-10-19 | 1.15 | **D1.5 done: Aria and the platform, approved by the maintainer (2026-10-19).** The tree (drag, Alt+Arrow, typeahead), a select with a null choice and a row's context menu, in Material, Angular Aria 22.2.3 and the platform, over one model: branch `proto/d1.5-widgets` (`682af6c`), never merged. The same 20 checks per candidate in three engines (axe in both themes and with each popup open, WAI-ARIA's tree keys, Tab in and back, menu focus and return, the select's null choice): 513 passed, 0 failed, three runs each. What differs is the work and the cost: Aria needed six workarounds (one in Angular's own select example) and drops a key sent within 10 ms of opening its select in Chromium; the platform needed every key written and two bugs fixed; Material nothing new. Bundle over an empty app: Material 290 kB raw (67 kB transfer, the app's icon set taken off), Aria 184 kB (42 kB), platform 44 kB (13 kB); a 1,000-row tree's last row: Material 303, 642 and 465 ms (its tree's SVG chevrons made text, as the others draw them), Aria 357, 462 and 321 ms, platform 143, 157 and 198 ms (Chromium, Firefox, WebKit). **Chosen (maintainer, 2026-10-19):** Aria for the composite widgets, the platform for the rest, the CDK kept, Material removed family by family in D3.3; no upstream reports of the Aria defects. In all three, forced colours hide the selected row: D3.3 fixes it whatever is chosen. [`docs/design/widget-bakeoff.md`](docs/design/widget-bakeoff.md) has the record. |
| 2026-10-19 | 1.16 | **v2.6.0 is released, the release that carries the site (remediation v1.2.119).** Tag `v2.6.0`, with its tarball, SBOM and checksums. Before the release, the site's pictures of the app were taken again: they showed the app before S1 to S5. D3a and U-030 came after it, as agreed between the two sessions, and D3a's PR took the pictures again. **Not done yet:** the deploy, which the maintainer runs by hand from the tag; after it, Google's Rich Results test and an Open Graph checker on the live site (W3.1's AC, row 1.14). `docs/design/reach.md`: no entry approved; the maintainer posts after the redesign is done too. |
| 2026-10-19 | 1.17 | **D3.1 done: `packages/tokens`.** DTCG 2025.10 files (`base`, `dark`, `light`), 88 tokens, colours in OKLCH; `npm run gen:tokens` writes `src/design-system/tokens.css` and `tokens.ts` (the colours as hex, which Monaco's themes now read instead of a copy). The sRGB fallback is the value written: every colour is inside sRGB, the build refuses one that is not, and an `oklch()` line is written beside it only once a wider colour is wanted. Every value came across exactly (each colour round-trips OKLCH to the same 8-bit sRGB), and before/after screenshots differ only as two runs of `main` do. CI runs `check:tokens`; `scripts/contrast.test.mjs` reads the package and gained two pairs: selected text on its highlight (the light theme had none of its own, white on pale green at 1.37:1) and the primary colour's tick. A test fails on a token the app does not read. Removed: `--glass-blur` (always `none`), `--gradient-accent` (one colour), `--dur-spring` (unread), and `@theme`'s own radius, easing and font values (dead behind the tokens, and its radii were not theirs); the `--glass-*` names are `--surface-*` and `--border-*`. Space has no tokens yet (Tailwind's scale; D3.2), and **the site's CSS moves to W5.1**, when the site takes the app's tokens: written now, nothing would import it. |
| 2026-10-19 | 1.18 | **D3.2, its first half: the type scale is tokens, and nothing is under 12 px.** The scale is DTCG `typography` tokens in `base.tokens.json`; `npm run gen:tokens` now also writes `typography.css` (its font rendering and font stacks moved to the top of `components.css`, its icon sizes to its end). Type classes: 10 names before (9 defined, and `type-headline`, used by the run view's title and defined nowhere), 8 after; `type-caption` (10 px, 62 uses) is `type-footnote`, since both became 12 px. Literal font sizes in the stylesheets: 43 uses of 19 values before, 24 of 15 after, 5 of them icons, none under 12 px; the 10 and 11 px ones read the scale's custom properties. A token test fails on a `font-size` under 12 px in any stylesheet or a Tailwind `text-[Npx]` under it, and `e2e/type-floor.spec.ts` on any text drawn under 12 px in the composer with a response, every Settings section and the environments, at 1,440 and 390 px (on `main` it found 10 and 11 px text). **Left of D3.2:** monospace for every value a user typed or a server sent (D3.2b, next); the compact density, which waits for D4's views to say where it is used (written now, nothing would switch to it); the site's scale, with W5.1. |
| 2026-10-20 | 1.19 | **D3.2 done: monospace for every value a user typed or a server sent (D3.2b).** Every Material input now says whether it holds a value (`font-mono`, 38) or words (`font-sans`, 21: names, descriptions, passphrases, numbers, the history search, the command palette); `scripts/input-fonts.test.mjs` fails on one that says neither. On `main` the class did not work on a Material input: its `font: inherit` loads after the global sheet, so the address and the path filter, which asked for monospace, were Inter; a rule in `controls.css` with the form field's class wins now, and an e2e checks the font the browser draws (the address, the method, the path filter, a header's name and value, against an environment's name). The response's header values and an event's id and name are monospace too. A bare form control now takes the text around it (`font: inherit`, preflight's rule): a plain `<button>` was the engine's own font, 11 px in macOS WebKit (found by `type-floor.spec.ts` in remediation session 14's local run; Linux's WebKit draws it larger, so CI passed), and an e2e inserts each control to check it. D3.2's AC holds with D3.2a (row 1.18); its compact density waits for D4's views and its site scale for W5.1, as that row says. |
| 2026-10-20 | 1.20 | **D3.4 done: the motion spec, `docs/design/motion.md`.** The `motion` tokens gain `--dur-pulse`, `--dur-shimmer`, `--ease-in-out` and `--dur-none`, and no stylesheet or template writes a duration or an easing of its own (a token test, which found a literal transition in `controls.css` that a grep had missed). Tailwind's `--default-transition-duration` and `-timing-function` are the tokens, so `transition-colors` and `transition-all` take them, and the app's own `!important` `.transition-colors` is gone: with a class's specificity it beat the reduced-motion rule, and those elements still faded for 0.12 s under reduced motion (`e2e/motion.spec.ts` found it). Reduced motion now also zeroes delays; the address field's script scroll asks `prefers-reduced-motion`; the missing variable's chip pulses twice instead of forever (WCAG 2.2.2); a theme change is instant (every element had a 0.2 s colour transition). **Judgement on the AC:** 'no animation longer than 0 ms' is held as no longer than 0.001 ms (`--dur-none`), the length the reduced-motion rule always used, so that the end events Material waits for are still sent; the e2e checks that bound, no delay and one run. |
| 2026-10-20 | 1.21 | **D3.3, its first family: the tree is Angular Aria's (D3.3a).** `ui-tree` is `ngTree` (`@angular/aria` 22.2.3) with the app's own styles in `src/app/ui/tree.css`; Material's tree, its 13-line override mixin and its rules in `controls.css` are gone. The bake-off's tree workarounds became: flat rows with `role="none"` groups that indent the rows under them (`level()` throws in a row's own binding at first render), and `[wrap]="false"` (Aria wraps; WAI-ARIA's tree does not). Three the bake-off did not meet, each with a unit test that fails without it: Aria does not follow focus, so a row focused by code (the menu giving focus back, a rename ending) is made its active row, or ArrowDown moved on from the row focused before; Aria reads every key that reaches the tree, so a letter typed into the rename field jumped to another row; and Aria stops the propagation of every key it handles, letters included, so the sidebar's "c" and "n" on a focused row never reached its `window` listener (C-024's e2e found it in three engines); the sidebar now reads them in the capture phase. A click on a row with children now opens or closes it, as Aria does. **Forced colours (from D1.5):** the selected row gets a 4 px bar at its start. **The catalogue:** `/app/?catalogue`, in development builds only (`src/main.ts`, behind `ngDevMode`; the production build holds none of it); CI builds it (`npm run build:catalogue`, `dist/catalogue`, never deployed) and serves it on port 4201 under the app's `_headers`. `e2e/catalogue.spec.ts`: axe in both themes on the tree as drawn, with a folder opened and selected, a request selected, a row focused from the keyboard and one under the pointer; the tree's keys (arrows, Home, End, no wrap, typeahead, one tab stop); the forced-colours mark. 12 passed in Chromium, Firefox and WebKit. **Pixels**, the collections list at 390, 820 and 1,440 px in both themes against `main` in three engines: the row's label now takes the row's room (`flex: 1; min-width: 0`), so a long name ends in its ellipsis at the sidebar's edge; on `main` it ran under the edge, cut mid-letter, and in WebKit the selected row's "Second" showed as "Se…". Nothing else moved. The app's own keyboard e2e of the tree (`e2e/keyboard.spec.ts`) runs unchanged. |
| 2026-10-20 | 1.22 | **D3.3, its second family: the menus are Angular Aria's (D3.3b).** `ui-menu` (`src/app/ui/menu.ts`) is `ngMenu` in the CDK's overlay with the app's styles in `menu.css`, its items `UiMenuItem[]`; it replaces Material's menu in the method list, Copy as cURL, the response's export and the collections tree's row menu, and `@angular/material/menu`, its override mixin, the pointer-events rule for its animation and its `controls.css` rules are gone. A button opens it through Aria's `ngMenuTrigger`; a row at the pointer through `openAt` from its `contextmenu`, which a right-click and Shift+F10 both send. **What Aria does not do, each with a test:** (1) `ngMenuContent` draws the items a render after the panel, which the CDK had placed by then as empty: a menu below a button that did not fit there was not moved above it (found by the catalogue's axe scan, whose hover found its item outside the window); the items are drawn with the panel instead, which is itself made when the menu opens. (2) Tab: Firefox kept focus in the menu, Chromium moved it to the button; Tab now closes it from its opener, and the key goes on from there. (3) Opened at the pointer: the right button's release is not a click outside (the bake-off's), and Escape, a choice and Tab give focus back to the row. (4) The trigger's default `softDisabled` writes no `disabled` attribute, against `matButton`'s; the cURL button's trigger sets it false. (5) An empty `ui-menu` in the address row's flex took a gap and moved the buttons beside it by a pixel: its host is `display: contents`. (6) A menu drawn under a pointer that has not moved gets a `mouseover` from the browser, and Aria moved focus to the item there: Shift+F10 right after choosing Duplicate in the same row's menu opened the next at Duplicate, not its first item (`runner.spec.ts`, the folder copy, in Chromium and Firefox); Aria hears `mouseover` only after the pointer moves in the menu, as Material's did. (7) Aria's trigger takes Escape on its button and stops it, so the cURL button's Material tooltip stayed up (`features.spec.ts`, in three engines): the button hides its own. **Pixels**, the four menus at 390, 820 and 1,440 px in both themes against `main` in three engines: the method, cURL and export menus are the same but for the response time's digits. The row menu's items now have the 2 px gap `controls.css` asks for: measured on `main`, the method menu's items are 32 px a step of 34, the row menu's (made in `matMenuContent`) 34 px a step of 34, flush. A click outside the row menu no longer sends focus back to the row (Material's `menuClosed` did, after the click had moved it). **The catalogue** gains a menu button and the tree's row menu: axe in both themes with each open and an item under the pointer, the menu button's keys (Enter, Space, ArrowDown and ArrowUp open, arrows, Home, End, typeahead, Enter, Escape and Tab), and the row menu at the pointer and by Shift+F10. Its forced-colours test now waits for the selected row's class, which comes with the next render (it failed once locally, in Chromium; then 30 of 30 in three engines). `e2e/FLAKES.md`: #228's mark is the document's 200 while that page's `goto` never ends, not a connection with one request (a passing test made one in run 39322735706). |
| 2026-10-20 | 1.23 | **D3.3, its third family: the tabs are Angular Aria's (D3.3c).** `uiTabList` (`src/app/ui/tabs.ts`, styles in `tabs.css`) is `ngTabList` with what Aria leaves to its user; every tab bar is an `ngTabs` of `ngTab`s and one `ngTabPanel` per tab: the open requests, a request's parts, the response, an environment's editor, a collection's or folder's settings. `@angular/material/tabs`, its override mixin and 121 lines of `controls.css` are gone (Material entry points 14 to 13, mixins 17 to 16, selectors into Material's classes 172 to 156). The composer's request tabs are one `ngTabs` on `app-composer` (a host directive): the open tab's panel is the composer, and the strip gives each other tab an empty, hidden panel, so that every tab controls a panel (`aria-controls`, an e2e in `tabs.spec.ts`). **Panes:** Aria needs `ngTabContent`, so a pane is made the first time its tab is chosen and kept (`preserveContent`, whose default is false in 22.2.3 although Angular's guide says the content stays). A fresh page holds 424 elements where `main` holds 616, 715 after a send where `main` holds 1,069 (Chromium; Firefox and WebKit within 20). A shown pane is in the tab order, Aria's `tabindex="0"` as WAI-ARIA asks; Material's was not, so a pane's first field is one Tab further. **What Aria does not do, each with a unit test that fails without its fix:** (1) a tab chosen by code (Alt+T, the composer opening Body) left the tab stop and the arrows on the tab chosen before; (2) a tab focused by code was neither the one the keys moved from nor chosen, where Material chose a tab on any focus (`keyboard.spec.ts` found it); (3) a chosen value with no tab (Body, for a GET) is sent back as `undefined` and forgotten, so the tab was not chosen when it came back; (4) the list does not scroll; the chosen tab is brought into a bar too narrow for it; (5) a choice is drawn at the next render, and Chromium took a Tab before it, into the pane shown before: a click or a key Aria took is drawn at once. Aria shows a panel whose tab is missing (its code: hidden only when its tab is not chosen), so a pane is under the same `@if` as its tab. The response's body pane had a rule on `:not([hidden])` that beat `[inert]`'s `display: none`, and two panes showed (`keyboard.spec.ts`); it reads `:not([inert])` now. **A bug of this PR, caught by the e2e:** `(keydown)="a && b()"` returns false for every other key, and Angular prevents the default of an event whose listener returns false: Escape no longer closed a dialog from a tab, and Tab did not leave it. `CLAUDE.md` now says so under Angular. **Pixels**, the composer, the response, its headers, the environments editor and a collection's settings at 390, 820 and 1,440 px in both themes, and a tab under the pointer and one focused from the keyboard at 1,440 px, against `main` in three engines (the response time's text pinned, the selects masked): 94 of 96 screens the same; the other two at 390 px in Chromium, 28 and 32 pixels in the accordion's Body label as it fades in, which `main` against itself shows too. **The catalogue** gains the tabs (a part with a count, a pane with a field) and a bar of open requests too narrow for them: axe in both themes with a tab chosen by a click, focused from the keyboard, under the pointer, with a pane focused and with the narrow bar scrolled; the keys (arrows that wrap, Home, End, one tab stop, a pane labelled by its tab, a field kept while another pane shows); the tab stop following a choice made by code; the chosen tab's line in forced colours. The e2e in Docker: 1,311 passed, 50 skipped, 4 failed: C-065 in the three claims projects (as on `main`) and a WebKit step of the new catalogue test, Shift+Tab from a button a script had focused, which WebKit left where it was; the step now focuses the tab. The catalogue and `tabs.spec.ts` then passed 243 of 243 in three engines, three runs each. **Size:** the first bundle is 1,373,853 B raw and 355,869 B gzip, 21,440 and 3,886 less than `main`; the budgets are reset to it (1443kb, 1512kb, 391,456 B). |
