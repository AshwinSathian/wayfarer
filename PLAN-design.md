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

- [x] **D0.1** Screenshot every view, dialog, menu and state (empty,
  loading, error, filled) at 360, 390, 820 and 1,440 px, both themes,
  three engines, with a Playwright spec kept under `e2e/design/`.
  - AC: `docs/design/baseline/` holds the images and an index page
    listing each state; the spec runs in CI as a job that does not fail
    the build.
- [x] **D0.2** Count each core task in input events on today's app (the
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
- [x] **D1.2** Hostile review of every screen in D0.1's index: Nielsen's
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
- [x] **D2.2** Voice and tone guide, written with `humanizing-writing`:
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
- [x] **D3.3** The widget layer of D1.5, with a catalogue page of every
  widget in every state (a route present only in development builds).
  - AC: the catalogue passes axe in both themes and three engines; each
    widget has a keyboard e2e; `controls.css` and `material-theme.scss`
    are deleted if D1.5 dropped Material. (1.34: `material-theme.scss` is
    deleted; `controls.css` stays, holding the `--ctl-*` colours the
    app's own widgets read, the skeleton and the splitter, none of it
    Material's.)
- [x] **D3.4** Motion spec: what moves, how long, and what happens with
  `prefers-reduced-motion`.
  - AC: durations and easings are tokens; an e2e with reduced motion
    finds no animation longer than 0 ms.
- [ ] **D3.5** A file field (U-059, added in row 1.39): a widget in
  `src/app/ui` for choosing a file, on the platform's hidden
  `<input type="file">`, with none of the browser's look or words. It
  names the file chosen and its size, takes a dropped file, and clears;
  every place that picks a file for a request or a store uses it.
  - AC: in the catalogue in every state (empty, chosen, dragged over,
    disabled, an error under it), axe in both themes and three engines, a
    keyboard e2e; no "No file chosen" or bare "Choose file" left in the
    app.

### Phase D4: Flows rebuilt (11 sessions, split in 1.35)

**Goal:** every view rebuilt on the foundations, in the order the
benchmark says matters most.

- [x] **D4.1** Information architecture: what the shell holds, where each
  thing lives, how the command palette, the sidebar and tabs share work.
  - AC: a map in `docs/design/ia.md`; every action of today's app has a
    place in it or a recorded reason for its removal.
- [x] **D4.2** First run: from an empty app to a first response in the
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
| 2026-10-20 | 1.24 | **D3.3, its fourth family: the accordion is Angular Aria's (D3.3d).** `uiAccordion` (`src/app/ui/accordion.ts`, styles in `accordion.css`) is `ngAccordionGroup` with the app's styles; its sections are `ngAccordionTrigger` buttons and `ngAccordionPanel`s with `ngAccordionContent` and `preserveContent`: the composer's parts on a phone, now their own component (`composer-sections`, which also takes the composer's template from 261 lines to 197, under the 250 its folder allows), and each past request on a phone. `@angular/material/expansion`, its override mixin and 57 lines of `controls.css` are gone (Material entry points 13 to 12, mixins 16 to 15, selectors into Material's classes 156 to 143). **What Aria does not do, with a unit test that fails without the fix:** its group reads every key that reaches it, with no look at where it came from: Space, Enter, the arrows, Home and End typed into a field inside a section, or pressed on a button there (a past request's Load and Delete), opened or closed the section or moved to a header, and Aria prevented the key, so the field never had it. `uiAccordionPanel`, beside each panel, keeps those six keys without a modifier to itself; Alt+T and Ctrl+Enter go on. **Held to one open by its bindings, not by Aria:** `multiExpandable="false"` closes the others first and sends their `expandedChange(false)` before the new one's `true`, the order Material's `(closed)` and `(opened)` did not have; the composer binds each section's `[expanded]` to its signal, and a closed Headers is opened again with the trigger's `expand()`, since its binding did not change. **Markup:** a header is a `<button>` now (Material's was its own element with `role="button"`), so a past request's header holds a `span` where it held a `div`: a button holds phrasing content. **Motion:** on `main` a section grew to its height (57 to 216 px over 170 ms and still growing, measured); it now opens at its height and fades in, as `docs/design/motion.md` asks of what appears in the page. **Pixels**, the composer and the history drawer at 360, 390, 820 and 1,440 px in both themes, and on a phone a section opened, a header under the pointer, one focused from the keyboard and a past request opened, against `main` in three engines (the response time and the history's durations pinned, the clock fixed, the shown selects masked): 95 of 96 screens the same; the other, at 820 px in Chromium where there is no accordion, is the response's fade-in, which `main` against itself shows too. Every phone screen is the same. A first attempt masked every `mat-select`, and on `main` the closed sections' selects were in the page, hidden, where this branch has not made them yet: a mask's own difference, 12,000 to 20,000 pixels a screen, not the page's. **Elements**, a fresh page at 390 px in Chromium: 423 where `main` has 575, 588 after a send where `main` has 759, and each past request adds 49 where it added 68 (Firefox and WebKit within 1). **The catalogue** gains an accordion of three sections, one with a field and a button: axe in both themes with a section opened by a click, a header focused from the keyboard and one under the pointer, and a field in a section focused; the keys (Tab through the headers, Enter and Space, the arrows, Home and End without wrapping), text with spaces typed in a section, Enter on a button in one, a section that keeps its field while closed; the open section's turned chevron in forced colours. The e2e in Docker: 1,321 passed, 50 skipped, 3 failed: C-065 in the three claims projects, as on `main`. **Size:** the first bundle is 1,362,009 B raw and 354,216 B gzip, 11,844 and 1,656 less than `main`; the budgets are reset to it (1430kb, 1499kb, 389,638 B). |
| 2026-10-20 | 1.25 | **D3.3, its fifth family: the segmented choice is the platform's (D3.3e), and nothing may look native (maintainer, 2026-10-20).** `ui-segmented` (`src/app/ui/segmented.ts`, styles in `segmented.css`) is a `radiogroup` of the browser's radio buttons, `appearance: none`, each under its option's text, which lets the pointer through: the theme, the device's route and the environments export's two choices. `@angular/material/button-toggle`, its override mixin and 56 lines of `controls.css` are gone (Material entry points 12 to 11, mixins 15 to 14; references to `.mat-`/`.mdc-` classes in the stylesheets 155 to 136, counted the same way on both trees). **The choice:** probed on `main`'s build in three engines, Material's group was WAI-ARIA's radio group: `radiogroup`, `role="radio"` with `aria-checked`, one tab stop on the checked option, arrows that move, choose and wrap, no Home or End. Angular Aria 22.2.3 has no radio group: its listbox says "list box" and "selected" where a screen reader said "radio button" and "checked", and its toolbar has no selection. Native radios keep every one of those. This departs from `widget-bakeoff.md`, which counted the button toggles among the composite widgets for Aria; asked, the maintainer first refused native elements, then allowed them: "You may use radio as well, if it does not look and feel like native", and of the platform families: "none should look like native elements". **What the browser did not do, each with a unit test that fails without its fix:** (1) with one radio name for every group, the export dialog's two groups were one, and choosing a format unchecked the mode: each group has a name of its own; (2) WebKit's arrows stopped at the ends, where Chromium's and Firefox's wrap (probed), and the option an arrow moved to lost its focus ring in WebKit, also after Tab into the group (`:focus-visible` false, probed): the group moves on every arrow itself, and focuses from the key's own listener, as Material did. **Narrow:** on `main` at 390 px the export's "Protected variables" ran past the dialog's edge and "Plain text" was cut off (WebKit scrolled the dialog sideways); below 480 px each choice fills its row and its options take less padding, and nothing clips an option's text (a first try that fitted by `overflow: hidden` cut 1 px off "With the vault" in WebKit at 360 px). A layout e2e checks it at 360 and 390 px, and fails on `main`. **Tests reach an option by its role:** a click on the option's text passes to its radio for a pointer, but Playwright's actionability check refuses an element under `pointer-events: none` ("intercepts pointer events"), and the five e2e helpers that clicked `.bridge-route`'s text timed out; they use `getByRole("radio")`, and the class is gone. **Pixels**, Settings' General and Local Bridge panes and the export dialog (both formats) at 390, 820 and 1,440 px in both themes, and an option under the pointer and one focused from the keyboard at 1,440 px, against `main` in three engines (`main` against itself: 0 differences): the same but the export at 390 px (the fix above), and the antialiasing of a few hundred pixels: the text in Firefox (Material's group was its own layer, `translateZ(0)`) and the focus ring's edge in WebKit. **The catalogue** gains two groups, one with icons, and a button that chooses from code: axe in both themes with an option chosen by a click, one focused from the keyboard and one under the pointer; the keys (the arrows, wrapping, Space, one tab stop a group, two groups apart, a choice from code taking the tab stop, a click on the text); the chosen option's 2 px border in forced colours. Its axe scans are a test of their own in each theme: added to the other widgets', the one test took more than its 30 s in Firefox on CI. 48 of 48 in three engines. The e2e in Docker: 1,308 passed, 50 skipped, 28 failed: C-065 in the three claims projects, as on `main`, and 25 through the helpers above; with them fixed, the eight specs they were in passed 103 of 103 (44 skipped) in the six projects. **Size:** the first bundle is 1,341,010 B raw and 349,207 B gzip, 20,999 and 5,013 less than `main`; the budgets are reset to it (1409kb, 1476kb, 384,128 B). |
| 2026-10-21 | 1.26 | **D3.3, its sixth family: the select is Angular Aria's (D3.3f).** `ui-select` (`src/app/ui/select.ts`, styles in `select.css`) is `ngCombobox` on its own element and `ngListbox` in the CDK's overlay, its options a `UiSelectOption<T>[]`; it replaces Material's select in its 18 uses (11 templates). `@angular/material/select`, `MAT_SELECT_CONFIG`, the select and option override mixins and 104 lines of `controls.css` are gone (Material entry points 11 to 10, mixins 14 to 12; references to `.mat-`/`.mdc-` classes in the stylesheets 136 to 111, counted the same way on both trees). **Probed on `main`'s build in three engines first:** a `combobox` named by `aria-labelledby` on a span, focus kept on it with `aria-activedescendant`; the null choice's label shown; Enter, Space and Alt+ArrowDown open; closed, the four arrows, Home, End and a letter choose without opening; Escape closes with nothing changed and focus kept; Tab chooses the option the list is on; Enter, End, Enter sent at once works. The new select keeps every one of those. **What Aria does not do, each with a unit test that fails without its fix:** (1) closed, Aria opens on ArrowDown and does nothing for the other keys: they choose, read in the capture phase before Aria; (2) Aria chooses nothing, and Enter on the chosen option unchose it and left the list open (the bake-off's first three workarounds): Enter and Space, handed to the list, a click on an option and Tab choose the option the list is on and close it; (3) Aria hands a key to the list at the next render, so keys sent at once after the one that opened it were lost (the bake-off's 10 ms): a key it took is drawn at once; (4) with the popup inside the overlay, as the bake-off had it, the closed select had no `aria-haspopup` and a list with no room below was placed below: the overlay is inside `ngComboboxPopup` and made with its list; (5) the option the keys are on is scrolled into a list too short for it; (6) Aria's popup reads its required input when destroyed, and `app.spec.ts` threw for a select destroyed before a render: the popup is made in that render. And one the e2e found: a press in the list moved focus into it, and focus was left on nothing when the list closed; the press is prevented. Playwright's click is too quick to show it, and the e2e holds the button 150 ms (it fails without the fix in three engines). **Changed on purpose:** the chosen option has a tick, and the option the keys are on has the hover's background: on `main` the chosen option, the one under the pointer and the one the keys had reached had one background (probed). In forced colours the option the keys are on keeps an outline and the chosen one its tick. **Pixels**, the composer's Auth and Settings panes (the toolbar's environment among them) at 390, 820 and 1,440 px in both themes, and at 1,440 px the select under the pointer, focused, open, with an option under the pointer and after a choice, against `main` in three engines (`main` against itself: 0 differences): the closed select, hover, focus and choice are the same in every screen. The open list differs by 4 to 25 pixels a screen: the tick, the rounded background of an option (the menu's), and the list's right edge a pixel short of `main`'s. On the way there the comparison found the list as wide as its text, not the select (the CDK's pane is a flex row), a pixel more an option (the tick taller than the line), and the label a subpixel off in Chromium (`main`'s 38 px line height). **The catalogue** gains a select with a null choice and a list longer than its panel with a placeholder: axe in both themes (a test of its own) closed on the null choice, open, an option under the pointer, after a choice, and a long list on its last option from the keyboard; the keys; the marks in forced colours. A second `role="status"` line in the catalogue broke the menu and accordion tests, which read that role: it is gone. On CI the catalogue's remaining axe test, every other family in one, then took 31 to 35 s in Firefox, more than its 30 s, as each whole-page scan had more to read: it is two tests now, the tree and the menus, and the tabs and the accordion (5.6 and 6.5 s each in Firefox in Docker; 72 of 72 axe tests in three engines, three runs each). The e2e in Docker: 1,342 passed, 50 skipped, 13 failed: C-065 in the three claims projects and F64 in WebKit, as on `main`, and nine catalogue tests from that status line; with it gone, the catalogue passed 180 of 180 in three engines, three runs each, and the ten specs that hold a select 345 of 345. `npm audit` then reported 2 moderate advisories, on `main` too: vite 8.3.0, which `@angular/build` 22.2.3 pins, is in GHSA-698v-4r3x-3vcv (8.3.0 to 8.3.2). Asked, the maintainer had the fix go in this PR: an override to vite 8.3.4 (`package.json`), which brings its own newer rolldown and nothing else; `npm audit` reports 0, and the build, the unit tests and the catalogue, smoke and scripts e2e (107 passed, 4 skipped, three engines) pass on it. **Size:** the first bundle is 1,300,487 B raw and 338,011 B gzip, 40,625 and 11,238 less than `main`; the budgets are reset to it (1366kb, 1431kb, 371,813 B). |
| 2026-10-21 | 1.27 | **D3.3, its seventh family: dialogs and drawers are the platform's modal `<dialog>` (D3.3g).** `UiModal` (`src/app/ui/modal.ts`, styles in `src/app/ui/dialog.css`) is a directive on a `<dialog>` shown with `showModal()`: in the top layer, the page outside it inert. `ui-dialog`, `Confirm` (centred, and the one placed under a button) and both of the shell's drawers are built on it; `@angular/material/dialog`, `@angular/material/sidenav`, `@angular/cdk/dialog`, their two override mixins and 126 lines of `controls.css` are gone (Material entry points 10 to 8, mixins 12 to 10; references to `.mat-`/`.mdc-` classes in the stylesheets 111 to 87, counted the same way on both trees). **Probed on `main`'s build in three engines first:** a dialog and a drawer are `role="dialog"` with `aria-modal`, named by the title (`aria-labelledby`) or `aria-label`; focus starts on the first element Tab reaches (a dialog's Close, a confirmation's Cancel); Tab and Shift+Tab wrap; Escape closes the topmost and focus goes back to the opener; a click on the backdrop closes a dismissable dialog, a confirmation and a drawer; Escape on a select's open list in a dialog closes the list and the dialog stays; Escape with a tooltip showing closes the dialog and the tooltip; with a drawer open, nothing hid the page beside it (no `aria-hidden`, no `inert`). The new dialogs keep every one of those, and the page is inert now. **The drawer is a `<dialog>`:** it was a modal already (role, `aria-modal`, a focus trap, Escape, a backdrop), only the top layer makes the page behind it inert, and what opens from it (a confirmation) is then over it without a z-index. **The rules of the Material section, each kept or retired:** `delayFocusTrap` and the 0 ms enter and exit are retired with Material's dialog: focus is in a dialog in the task that opened it (`showModal`), its entrance is drawn on the `<dialog>` (`dialog.css`) and it closes at once; `ariaModal` is kept, on every `UiModal`; Escape read from the dialog's own element is kept, now always, so a Material tooltip (which takes Escape on the body) does not keep a dialog open; the editor under `@if` is kept (a dialog's body is in the page only while open, but projected content is made with the page); the drawer's focus moves and the shell's own closing (`disableClose`, `openedChange`) are retired: the shell calls the drawer's `show()` and `close()` in the task that asked, and the binding finds it as it is (a test opens, closes and opens it in one task); the small confirmation leaves the CDK's dialog: in the CDK's container it would be inert under the drawer, where a past request's Delete opens it; it is placed where the CDK put it (under, against the end, above). **What the platform does not do, each with a unit test that fails without its fix:** focus on the first element Tab reaches, or on `cdkFocusInitial` (the linter refuses `autofocus`); Tab and Shift+Tab wrap (Option+Tab too, Safari's key for every button: the keyboard e2e found it in WebKit); Escape cancels the browser's own close and asks the owner, and a key a popup inside took is left to it; Escape with focus on the body (a field blurred) is the topmost dialog's: C-005, C-042 and two more e2e found it, the CDK had listened on the body; a click on the backdrop only when the press began there; a dialog closed by its owner's destruction; focus that fell to the page after a close goes to the dialog under it. **Found on the way, each with a test:** the page outside a modal is inert, the CDK's overlay container too: a row's menu at the pointer in the navigation drawer, the hover card of a past request and the copy command's fallback textarea were there; the menu is drawn in its own element, the card beside its host, the textarea in the dialog that has focus. `hide` came with the browser's `close` event, a task late, and closed an import reopened at once (`import.spec.ts`): `UiModal.closed` comes in the task. The page was inert until the render after Escape, and a key typed straight after it went nowhere (`bridge-pairing.spec.ts`): a close request is drawn at once. The shell put focus in the address before closing the navigation drawer, into the inert page: it closes it first. **Retired after measuring:** an explicit return of focus to the opener: the browser does it in all three engines (the keyboard, keyboard-flow, catalogue and dialog-focus e2e, 171 tests, pass without it). **Changed on purpose:** a dialog's title is `type-title-3` (15 px, the drawers' headings) where Material's was 16 px with no token; the drawer no longer slides out (`docs/design/motion.md`); the page under a dialog keeps its scroll position and does not scroll. **Left as the engines do it:** WebKit draws a focus ring on any element focused in a dialog just shown, after a click too (probed: `focusVisible: false`, a later task and `show()` change nothing); on main its Material dialog drew none there. In WebKit with classic scrollbars, at 390 px, the page's scrollbar goes while a dialog locks it (`scrollbar-gutter` added one in Chromium where there was none). A select opened in the 300 ms a dialog grows in is placed against where it was then, as on main. **Pixels**, Settings (open, Close under the pointer, a section focused from the keyboard), a confirmation over it, the environments and a dialog over them, the history drawer, a confirmation from it, a past request's confirmation and the navigation drawer, at 390, 820 and 1,440 px in both themes, and a collection's menu in the pinned sidebar and in the drawer, against `main` in three engines (`main` against itself: the row menu at 820 px, and the navigation drawer at 390 px in WebKit, differ by themselves): in Chromium and Firefox every difference is the dialog titles' 1 px; on the way the comparison found the footer's buttons 8 px closer than `main`'s (Material's margin had beaten `controls.css`'s 0 there; kept at `main`'s 16 px). WebKit adds the ring and the scrollbar above. **The catalogue** gains a dialog (a field, a select, a menu, a tooltip, a confirmation), a confirmation under a button and a drawer (a confirmation, a menu at the pointer, a card on hover): axe in both themes (a test of its own) open and with a field focused; the keys, Escape through a popup and a tooltip, the backdrop, the scroll lock, popups that take the pointer inside the drawer and are placed where they belong; the edges in forced colours. The e2e in Docker: 1,381 passed, 50 skipped, 3 failed: C-065 in the three claims projects, as on `main` (19 tests that read `dist/` met a stale copy of it in the container and passed on the rerun, 21 of 21). Unit tests: 739 passed. **Size:** the first bundle is 1,234,615 B raw and 323,599 B gzip, 65,872 and 14,416 less than `main`; the budgets are reset to it (1297kb, 1359kb, 355,959 B). |
| 2026-10-21 | 1.28 | **D3.3, its eighth family: tooltips are the platform's `popover`, and the hover card is one of them (D3.3h).** `UiTooltip` (`src/app/ui/tooltip.ts`, styles in `src/app/ui/tooltip.css`) is a directive: `uiTooltip="…"` or a `TemplateRef`, `popover="manual"` with `role="tooltip"`, placed against its host by `placeTooltip`. `@angular/material/tooltip`, its override mixin and its rules, `uiHoverCard` (`hover-card.ts`) and the `.ui-popover` rules of `controls.css` and `animations.css` are gone (Material entry points 8 to 7, mixins 10 to 9; references to `.mat-`/`.mdc-` classes in the stylesheets 87 to 85, counted the same way on both trees). **Probed on `main`'s build in three engines first:** the shown tooltip had no role; its text was in the CDK's hidden container at the end of the body (`role="tooltip"`) and described its host from the start, only when it differed from the host's `aria-label` (Chromium's tree kept that description with a drawer open, the container in the inert page); it showed at once on hover and on keyboard focus, not for a click's focus, focus set by code, a disabled button or a tap; it stayed while the pointer was on it; it grew from 80% over 150 ms and left in about 75 ms; Escape hid it and was stopped on the document (a window listener never heard it), and in a dialog or the drawer Escape closed both; it sat 8 px from its host, centred, flipped from below to above at the window's bottom, and was kept about 16 px inside the window (15.4 px measured); 12 px text at a normal line height, `--canvas-overlay`, `--label-secondary-on-fill`, a 1 px `--separator` border, `--radius-sm`, 6 px by 10 px, at most 222 px wide. **The hover card is the same family:** it was WAI-ARIA's tooltip already (the role, `aria-describedby`, nothing in it to operate, hover and keyboard focus, closed on leave, blur and Escape, kept while the pointer is on it), and its show, hide, Escape and placement were a second copy of the tooltip's; a `TemplateRef` makes a card (`.ui-tooltip-card`, the old card's look), which describes its host while shown and starts at its host's start edge. **Where it is drawn:** a child of the body, moved into the dialog its host is in when it shows, so in a modal dialog it takes the pointer; not beside its host, where the first build put it and where it took the separators off the response's facts (`.response-fact + .response-fact`) and would have moved Tailwind's `space-y-*` margins; not at first render only, where a `ui-dialog`'s projected content (made with the page) put the dialog's tooltip in the inert body (the catalogue's e2e found it). Until it first shows, the text of a host in a dialog is in the body, where Material's was: a description, which Chromium's tree keeps from the inert page (probed on `main`). **The rules of the Material section, each kept or retired, with a test:** focus on the host only is kept (put it on the focusable element); keyboard focus only is kept, as the CDK's `FocusMonitor` tells it, not `:focus-visible`: WebKit draws a ring on the first element of a dialog a click opened, and a tooltip popped up there; the e2e's move of the pointer off (0, 0) is retired: nothing of the tooltip is ever drawn there, and the keyboard e2e no longer move it; the cURL button's own `(keydown.escape)="tip.hide(0)"` is retired: Escape is heard on the document in the capture phase, before Aria's trigger stops it; Material's stopping of Escape is retired: the key goes on to the page, and a dialog the tooltip is in closes too, as on `main`; the hover card's capture-phase Escape and its pointer-on-the-card are kept, now for every tooltip. **What the platform does not do, each with a unit test in `tooltip.spec.ts` that fails without its fix (20 mutations, 20 failed):** no touch; keyboard focus only, and blur hides; the pointer may travel onto it (80 ms); Escape in the capture phase and not stopped; a press on the host hides it (a menu or a dialog opened from it); it follows its host on a scroll (Tab scrolls a host into view after it showed; hiding there hid it at once); in its host's dialog, also one that took the host after it was made; not beside its host; no description that repeats `aria-label`; empty text is none, and hides one shown; a card describes while shown, starts at its host's edge; measured by its layout box (its entrance scales it); removed with its host; the other side when only that has room; inside the window by 8 px. **No `title` is left:** 25 `title` tooltips (the toolbar, the status bar, the environments' and collections' headers, Save, a past request's time, a method tag, the response's facts) were the browser's own look, after a wait (U-006 of the audit): each is a `uiTooltip`; the two on the Timings' bars repeated the time printed beside them and are gone; an `<iframe>`'s `title` is its name and stays. **Found on the way:** the six info icons of the Timings and the "TLS verification off" pill had their tooltip on an element the keyboard never reached, and the icons were `aria-hidden`: each icon is a `span.info-tip` tab stop, `role="img"`, named by its text, and the pill a tab stop; `CONTRIBUTING.md` still said the widgets were Material's. **Found by CI:** in WebKit on GitHub's runner the card closed while the pointer crossed the 8 px to it, three runs of three: the moves took longer than the 80 ms; the gap is now the tooltip's (a `::before` 8 px each way), and an e2e finds the tooltip at a point of the gap (it fails, three engines of three, without the rule). The confirmation's 10 px gap is read within a pixel: the catalogue's new section left its button at a fraction of one, and WebKit measured 9.5. **Changed on purpose:** the text is the footnote token (12 px on 16 px, +0.024 px) where Material's was 12 px at a normal line height and -0.024 px; it appears as a small popover does (`--dur-quick`, 97%) and goes at once (`docs/design/motion.md`); it keeps 8 px from the window's edge, where Material kept about 16; the card is 8 px under its host, where it was 10, and no longer runs to the window's edge. **Pixels**, a tooltip by hover (New tab, the disabled cURL button, the environments' Use for requests in a dialog, Clear all history at the drawer's edge, a Timings icon, a past request's card) and by the keyboard (Copy as cURL), at 390, 820 and 1,440 px in both themes, against `main` in three engines (`main` against itself: 5 of 90 differ, all in the drawer's two scenes): every difference is inside a tooltip's box, its text's new size and tracking, and the card's place. **The catalogue** gains a Tooltips section (text that adds a key to a name, above and below, a long text on an info icon, a menu button with one, a card, one at the row's end) and one in the drawer: axe in both themes (a test of its own) with a tooltip under the pointer, a long one from the keyboard, a card, one in the drawer and one in a dialog; the keys (Tab shows and moves it, the description or none, above and below, Escape before a menu trigger with the menu closed, Escape going on to the page), the pointer (resting on it, a press, a card), a tap, the window's edge (clamped, flipped both ways), the drawer opened by a key and by a click, reduced motion, and its edge in forced colours: 10 tests, 90 of 90 in three engines, three runs each. The e2e in Docker: 1,408 passed, 50 skipped, 3 failed: C-065 in the three claims projects, as on `main`. Unit tests: 750 passed. **Size:** the first bundle is 1,208,803 B raw and 316,342 B gzip, 25,812 and 7,254 less than `main`; the budgets are reset to it (1270kb, 1330kb, 347,977 B). |
| 2026-10-21 | 1.29 | **D3.3, its ninth family: the spinner is the app's own (D3.3i).** `ui-spinner` (`src/app/ui/spinner.ts`, styles in `spinner.css`) is an SVG ring of three quarters in `currentColor`, 1.8 px wide at 18 px as Material's was, turning once in `--dur-shimmer` on a new token, `--ease-linear` (`packages/tokens`; the token test refuses a `linear` of a stylesheet's own). Its 12 uses in 10 components move; `@angular/material/progress-spinner` and its override mixin are gone (Material entry points 7 to 6, mixins 9 to 8; references to `.mat-`/`.mdc-` classes in the stylesheets stay at 85: the mixin named none). **Probed on `main`'s build in three engines first:** `<mat-spinner>` was `role="progressbar"` with `tabindex="-1"`, `aria-valuemin`/`aria-valuemax` and `mode="indeterminate"`; every one in a button had `aria-hidden="true"` (none was in Chromium's tree), and two on their own were named ("Loading secrets", 28 px; "Reading the file"); `display: block`, 18 by 18 px; four infinite animations (1,568, 5,332 and twice 1,333 ms) grew and shrank its arc; with reduced motion `animations.css` ran each once for 0.001 ms and left the arc a dot of about 2 px, in all three engines and both themes, which does not read as busy; in forced colours its stroke followed the system's text. **What it does, each with a unit test in `spinner.spec.ts` that fails without it (7 mutations, 7 failed):** a `progressbar` named by `label` on its own and `aria-hidden` with no role in a button, whose text says it; as wide and tall as `diameter`; no `tabindex` (Material's `-1` made it focusable by a click); the text's colour, a gap in the ring and a turn. **Changed on purpose:** a constant arc that turns, where Material's grew and shrank, and with reduced motion that ring standing still (`docs/design/motion.md`). **Pixels**, the event list's live row (the spinner and its text) at 390, 820 and 1,440 px in both themes, with and without reduced motion, against `main` in three engines (`main` against itself: 0 of 36 differ): every difference is inside the spinner's 18 px box (7 to 27 pixels), and the spinner's box and the text beside it are where they were in all 36. **The catalogue** gains a spinner in a filled and an outlined button and a named one at 28 px: axe in both themes (a test of its own); one progressbar named, the button's spinner hidden and not focused by a click; the button's colour; standing still as a ring with reduced motion; the text's colour in forced colours. 126 of 126 catalogue tests in three engines. The e2e in Docker: 1,420 passed, 50 skipped, 3 failed: C-065 in the three claims projects, as on `main`. Unit tests: 754 passed. **Size:** the first bundle is 1,200,527 B raw and 314,968 B gzip, 8,276 and 1,370 less than `main`; the budgets are reset to it (1261kb, 1321kb, 346,465 B). |
| 2026-10-21 | 1.30 | **D3.3, its tenth family: buttons are the platform's `<button>` (D3.3j).** `uiButton` (`src/app/ui/button.ts`, styles in `button.css`, imported by `src/styles.css`) is a directive on a `<button>` or an `<a>` that names its variant in a class: `uiButton="filled"`, `"outlined"`, `uiButton` (text) or `"icon"`, with the tones and sizes of before (`btn-secondary`, `btn-danger`, `btn-success`, `btn-sm`, `btn-square`, `btn-plain`, `send-btn`). Its 161 uses in 36 components move; `@angular/material/button`, its two override mixins and the button section of `controls.css` are gone (Material entry points 6 to 5, `@include mat.` lines 9 to 4; references to `.mat-`/`.mdc-` classes in the stylesheets 85 to 27, counted the same way on both trees). **Probed on `main`'s build in three engines first:** the computed style of 79 buttons (the shell, a sent request and each of the composer's seven panes, every Settings section, Environments and History at 1,440 px, the shell and Settings at 390 px) at rest, under the pointer and focused from the keyboard: no role, `tabindex` or `aria-disabled` of Material's own; a disabled button `pointer-events: none` at 0.6 (Send and Copy as cURL 0.4); an icon alone `flex-shrink: 0`, weight 400, no letter spacing; a label 500 at -0.004em; the ring 2 px of the accent 2 px out, with the button's own corners. The same probe on the new build differs only where it should: the icon of a `btn-square` sits in its middle (it sat 4 px left on `main`: Material's label kept its 8 px gap after the icon, before the zero-width character that sets the line's height), the pointer at rest (it was the pointer on hover already) and the colour of borders that are not drawn. On the way it found the small icon buttons (`uiButton="icon" class="btn-sm"`, the response's search arrows) given 10 px of padding by a rule that outranked the icon's: fixed. **What the directive does, each with a unit test in `button.spec.ts` that fails without it (3 mutations, 3 failed):** a class for each variant, text when none is named, beside the element's own classes; nothing of a role, `tabindex` or `aria-disabled` of its own; `disabled` the element's. **What `button.css` does, in the catalogue's e2e:** `appearance: none` in each variant; the ring keeps the button's radius (`--btn-radius`: the global `:focus-visible` rule sets another, later); pressed, it is drawn smaller; disabled, faded, and a press goes through; an icon alone centred, square or not. **Changed on purpose:** the square buttons' icons centred; in forced colours Send, whose fill is taken away, has a border (every other button keeps its own, `btn-plain` has none). **Pixels**, the shell, three of the composer's panes with a response, four Settings sections and Environments at 390, 820 and 1,440 px in both themes, against `main` in three engines, 150 screens a build (`main` against itself twice: 0 differ): with the `btn-square` buttons masked, the only differences are the Diagnostics pane's service worker hash and storage size, which each build has its own. **The catalogue** gains every variant in the tones the app uses, small, square, icon and plain, disabled, Send and a link drawn as a button: axe in both themes (a test of its own) at rest, under the pointer and focused from the keyboard; Enter and Space, Tab past a disabled one, Enter on the link; the states; the centred icons; the edges in forced colours. 144 catalogue tests in three engines. The confirmation's Tab test fails in macOS WebKit, on `main`'s catalogue too: Safari's Tab reaches no button. The e2e in Docker: 1,438 passed, 50 skipped, 3 failed: C-065 in the three claims projects, as on `main`. Unit tests: 757 passed. Found and left as it was, on `main` too: the status bar's Local Bridge and lock buttons take `text-status-success`, and the toolbar's History `bg-accent-fill`, which neither build shows. **Size:** the first bundle is 1,156,487 B raw and 309,291 B gzip, 44,040 and 5,677 less than `main`; the budgets are reset to it (1215kb, 1273kb, 340,221 B). |
| 2026-10-21 | 1.31 | **D3.3, its eleventh family: text fields are the platform's `<input>` and `<textarea>` (D3.3k).** `uiInput` (`src/app/ui/input.ts`, styles in `input.css`, imported by `src/styles.css` before the type classes and the utilities) is a directive that names the field in a class; the element is the box, and the layout classes of its `mat-form-field` move onto it. Its 59 uses in 21 components move; `@angular/material/form-field`, `@angular/material/input`, `MAT_FORM_FIELD_DEFAULT_OPTIONS`, the form field's override mixin and the text input section of `controls.css` are gone (Material entry points 5 to 3, `@include mat.` lines 4 to 3; references to `.mat-`/`.mdc-` classes in the stylesheets 27 to 11, counted the same way on both trees). **Probed on `main`'s build in three engines first:** the computed style of every visible field in 20 scenes (each composer pane with a field, a response's search and filter, History, Environments, three Settings sections, the sidebar's dialogs and rename, the vault's unlock, a WebSocket closed and open, the runner, the address at 390 px) at rest, under the pointer after 220 ms and focused, 260 records an engine (`main` against itself: 0 differ): the box 40 px, 1 px `--separator`, `--fill-primary` under the pointer, `--accent-border` and `--glow-accent` focused, no outline; 14 px at 20 px, the caret `--accent`, the placeholder `--label-placeholder`; disabled, the same text and border, its placeholder at 38%; a text area resizable up and down with `overflow: auto`; a search field without its clear button, a number with its arrows; the address bar's halves 41 px in Chromium, 40.5 in Firefox and 40.8 in WebKit (the method's 12 px text in Material's line box); Material's own `id`, `aria-invalid` and `aria-required` on each. The same probe on the new build differs only in what is listed under changed on purpose. **What the directive does, with a unit test in `input.spec.ts` that fails without it (4 mutations, 4 failed):** a class on an input and a text area and nothing else; no `id`, `aria-invalid`, `aria-required` or role of its own; the model's value and `disabled` the element's. **What `input.css` does, in the catalogue's e2e:** `appearance: none` and a solid edge; the pointer's border; focused, the border and glow with its own corners (the global `:focus-visible` rule sets another radius); disabled, an enabled field's colour, also WebKit's text fill, and no change under the pointer; the address bar's halves draw no box; in forced colours, which take the glow away, a focused field has an outline in `Highlight` (Material's was dotted; without it the first build showed no focus there at all). Retired: Material's iOS-only caret nudge on `keyup`, which no engine here runs. **Changed on purpose:** the address bar is 41 px in all three engines; a text area's resize handle is in its corner, not inside the padding; a field focused in a scrolled pane comes into view whole, not only its text (10 px more in the Local Bridge pane); the bulk headers keep 14 px through `font-mono` (their `type-mono-body` had lost to Material's font). **Found by the e2e, then by attacking the fix:** C-067's focus check looked for Material's `.mat-focused`; the address bar's halves show their focus on the bar, and the check now reads it. Its ring was any outline or any `box-shadow`, and a field's and a select's resting drop shadow is one: with the glow taken off `.ui-input:focus` or `.ui-select:focus` in the built CSS, the check still passed, 6 of 6 (the select's hole since row 1.27). A ring is now an outline or a shadow with a spread, and the check waits for it with the claims' timeout: in Linux WebKit, short of frames while the app starts, the glow's transition ended more than 1 s late (the element matched `:focus`, `document.hasFocus()` was true, and 3 s later the glow was there; it did with reduced motion too). With the glow off the field, the address bar or the select, it fails 6 of 6 in three engines; on the real build it passes 60 of 60. **Pixels**, 16 scenes at 390, 820 and 1,440 px in both themes, 78 screens an engine, against `main` (`main` against itself: 20 of 234 differ, button corners and masked rows): in Chromium every difference is a field's text or edge moved at most 1 px where the field sits at a fraction of a pixel (Chromium now snaps the edge and the text as one element) and the text areas' handles; in Firefox and WebKit everything under the address bar moved the half and fifth of a pixel. **The catalogue** gains Text fields (a name, a value, a placeholder, a password, a number, a search, disabled, several lines, a rename, the address bar), and its own fields in the tabs, the accordion, the dialog and the drawer are `uiInput`: axe in both themes at rest, under the pointer, focused and typed in; Tab through each and past the disabled one, Enter in a text area, the arrows in a number; the states; forced colours. In Docker: 1,447 passed, 50 skipped, 9 failed before the C-067 fix (C-065 in the three claims projects, as on `main`); after it the catalogue and keyboard flow 174 of 174 three times. Unit tests: 760 passed. **Size:** the first bundle is 1,078,254 B raw and 294,297 B gzip, 78,345 and 15,022 less than `main`; the budgets are reset to it (1133kb, 1187kb, 323,727 B). |
| 2026-10-21 | 1.32 | **D3.3, its twelfth family: checkboxes are the platform's `<input type="checkbox">` (D3.3l).** `uiCheckbox` (`src/app/ui/checkbox.ts`, styles in `checkbox.css`, imported by `src/styles.css`) is a directive that names the checkbox in a class and gives it `tabindex="0"`; its text is a `<label class="ui-checkbox-label">` around it or a `<label for>` that names its id, and one without text keeps its `aria-label` (now `[attr.aria-label]` on the element itself). Its 17 uses in 12 components move; the `<label for="…-input">` of five of them now names the input's own id, and the three whose `<label>` holds a title and a note keep `aria-label`, so their names are what they were. `@angular/material/checkbox`, the checkbox's override mixin and the checkbox section of `controls.css` are gone (Material entry points 3 to 2, `@include mat.` lines 3 to 2, references to `.mat-`/`.mdc-` classes in the stylesheets 11 to 2). **Probed on `main`'s build in three engines first:** the computed style of every visible checkbox in 15 scenes (Params at 1,440 and 390 px, Headers, a multipart and a URL-encoded body, the request's Settings tab, OAuth 2.0, Settings' Requests (also at 390 px), History and Data sections, the history drawer, Export as HAR, the runner after a run, a WebSocket) in both themes, at rest, under the pointer after 220 ms, focused from the keyboard and checked by Space: 388 records, `main` against itself 0 differ. Material drew a 16 px box with a 3 px radius, 1 px `--separator` unchecked, `--accent-border` under the pointer and focused, `--accent` fill and edge checked, a white tick, the global 2 px ring 2 px off the box; its text 14 px on 20 with its own tracking (0.256 px), 24 px from the box's left; its host 22 px, the box in the top left corner of its slot. The same probe on the new build differs only in what is listed under changed on purpose. **What the directive does, with a unit test in `checkbox.spec.ts` that fails without it (4 mutations, 4 failed):** the class on a checkbox only, not on another input; `tabindex="0"`; the element's own label, name, `checked`, model and `disabled`. **Found by the probe:** WebKit's plain Tab (Safari's default) passes over a native checkbox; Material's input had `tabindex="0"` and was reached. The engines differ, so it is the directive's, with a unit test and the catalogue's e2e, which tabs through with plain Tab in all three. **What `checkbox.css` does, in the catalogue's e2e:** `appearance: none`; the edge, fill and tick (`::before`, Material's path as a mask) of each state; the ring with the box's own corners (the global `:focus-visible` rule sets another radius); disabled, the box and its text at 38%, as Material's, and no pointer; in forced colours, an edge in `CanvasText`, and a checked box in `Highlight` with its tick in `HighlightText` (`forced-color-adjust: none`: without it the fill and the tick go). Checked by eye on both builds first: Material outlined a checked box and drew its tick in the text's colour; both mark the state in three engines. **Changed on purpose:** the box is in the middle of its 22 px slot, 1 px lower and further right than Material's; the text is the body type (`--type-body-*`, tracking -0.042 px), about 3% narrower; the slot is 22 px, where Material's block host was 22.66 px, so what follows "With history" and the OAuth retry sits 0.66 px higher. **C-067:** `focusShown` read Material's `.mdc-checkbox__background`; the checkbox draws its own ring, and the check reads the element. With `.ui-checkbox:focus-visible { outline: none }` added to the built CSS it fails 6 of 6 ("Send headers row 1" has focus and shows no ring); on the real build it passes 75 of 75. **Pixels**, 15 scenes at 390, 820 and 1,440 px in both themes, 58 screens an engine that each width reaches (`main` against itself: 12 of 174 differ, the HAR preview, the runner's duration and the sidebar of one Firefox scene): every screen with a checkbox differs, and the diff images show only the box's 1 px move, the narrower text and what sits beside it on its row (the runner's Data file… button), and the 0.66 px under the two labelled checkboxes in a block. **The catalogue** gains Checkboxes (checked and not, disabled checked and not, a row's named without text, one a label points at) and one in its dialog: axe in both themes at rest, under the pointer, focused and unchecked by Space; Tab through each and past the disabled ones; Space, Enter (nothing), a click on the text or the pointing label; the states; forced colours. In Docker: 1,465 passed, 50 skipped, 6 failed: C-065 in the three claims projects, as on `main`, and the catalogue's tabs test, whose `getByLabel("Header name")` found the new row too (renamed); then the catalogue and keyboard flow three times, 566 passed and 1 failed: the look test in WebKit read the focused border before a transition's frame, and now polls it. In the next 150 runs of the checkbox tests that test failed once more in WebKit, its error not kept; in 570 runs since, none failed. Unit tests: 764 passed. **VoiceOver:** the maintainer's pass by hand on 2026-10-21 found nothing. **Size:** the first bundle is 1,046,934 B raw and 288,699 B gzip, 31,320 and 5,600 less than `main`; the budgets are reset to it (1100kb, 1152kb, 317,569 B). Left in D3.3: the toolbar. |
| 2026-10-22 | 1.33 | **A checkbox's tick reads on its box in the dark theme (maintainer, 2026-10-22).** Found while moving the checkboxes (1.32): the tick was white, as Material's, and on the dark theme's `--accent` it was 2.62:1, under WCAG 1.4.11's 3:1. It is now `--ctl-on-primary` (`src/app/ui/checkbox.css`): white on the light theme's accent, 5.88:1 as before, and `--canvas-app` on the dark one's, 6.97:1. Tested first: the catalogue's e2e computes the tick against its box in both themes and failed in the dark one (2.62:1), and `scripts/contrast.test.mjs` holds the token pair at 3:1 (it had tested `--ctl-on-primary` on `--ctl-primary`, which no checkbox draws). |
| 2026-10-22 | 1.34 | **D3.3, its last family: the toolbar is the platform's `<header>`, and Material leaves the app (D3.3m).** The top bar is `<header class="ds-toolbar">` in the shell, the page's banner by its element (the explicit `role="banner"` went with `mat-toolbar`); its rules are `.ds-toolbar` in `components.css`, with what Material's toolbar gave it written there: `display: flex`, `align-items: center`, 56 px, `white-space: nowrap`, `--surface-toolbar` and `--label-primary`, and in forced colours a 1 px outline. No wrapper in `src/app/ui` and no catalogue state: it has one use and no behaviour of its own. Gone: `@angular/material` (the dependency), `@angular/material/core` and `/toolbar`, `MAT_RIPPLE_GLOBAL_OPTIONS`, `src/design-system/material-theme.scss` and its `styles` entry, and the last two `.mat-` rules in the stylesheets. That theme only defined `--mat-*` variables (169), read by nothing but Material's own styles; every token and `--ctl-*` colour it fed is read elsewhere, and `--surface-toolbar` is now read by `.ds-toolbar`. The licences list names no Material (Angular's list is the direct dependencies). `npm audit` 0, knip clean. CLAUDE.md's "Angular Material" section is now history; CONTRIBUTING.md likewise. **Probed on `main`'s build in three engines first:** the computed style and box of the toolbar and every element in it at 390, 820 and 1,440 px in both themes, at rest, each control under the pointer after 220 ms, focused by plain Tab from the page's start, and the toolbar in forced colours: 36,564 values, `main` against itself 12 differ (the select's focus glow caught mid-transition in WebKit). The branch differs in those and in the `role` attribute alone; what Tab reaches is the same in each engine. **Tested, in `e2e/layout.spec.ts` ("the toolbar"):** one banner, a `HEADER`, 56 px, sticky at 0, each control on its centre line, at 390 and 1,440 px, and the outline in forced colours. Mutations on the built stylesheet: without the height, `position: sticky` or the forced-colours outline, the tests fail; without `align-items` or `white-space` they pass (the groups inside centre their controls and nothing wraps: each changes geometry, not pixels; kept). **Pixels:** 25 scenes of the app at 1,440 and 820 px and 19 at 390 px (the empty and the seeded request, each composer tab, a response, history, Environments, the environment list, Settings and each of its 11 sections, the sidebar or the palette) and the catalogue at 390 and 1,440 px, both themes, three engines, in Docker: 438 screens, `main` against itself 3 differ, the branch 20, each read: Diagnostics' build hash, the storage used, a Monaco editor masked in one run and not mounted yet in the other, and WebKit's noise of `main` against itself. The full suite in Docker: 1,483 passed; C-065 fails in the three claims projects, as on `main`. The first bundle is 18,045 B smaller (4,986 B gzip): budgets reset to 1081kb, 1132kb and 312,080 B. |
| 2026-10-22 | 1.35 | **Phase D4 split into sessions, read against `main` at `37efea9` (D3 done).** State: the audit (`docs/design/audit.md`, U-001 to U-036) records findings but no status; fixed since are U-008 and U-009 (S1), U-002 and U-023 (S2), U-001, U-003 and U-012 (S3), U-005, U-006 and U-007 (S4), U-013 and U-014 (S5), U-030 and U-033 (D3.3, row 1.34); U-020, U-021 and U-036 by what D3a and D3.2 changed, which D4-a confirms on the screen. D1's exit criterion (findings triaged) is not met; D1.2's second pass (Firefox, WebKit, five screens) is not done; D0.1's spec and D0.2's counts do not exist (no `e2e/design/`); D1.4 needs the rivals on the maintainer's machine (section 8, DQ3); D1.6 and D1.7 are undecided. **The split**, each session one PR or more, each view session closing with the AC below D4.10: **D4-a** triage and D4.1: every finding of the audit gets a status (fixed, with its PR; open, with the session below that takes it; or accepted, with a reason), which meets D1's exit criterion for D1.2; then `docs/design/ia.md`, every action of today's app (from the templates, the palette's list and the shortcuts) with its place, which decides U-010, U-011, U-016, U-027 and U-032's places. Documents only. **D4-b** measurement: D0.1's spec under `e2e/design/` in three engines, a CI job that does not fail the build, and the `toHaveScreenshot` baseline of section 10; D1.2's second pass on what it captures (findings into the audit); D0.2, Wayfarer's eight tasks of D1.4 as scripts that count input events, three runs, median, in `docs/design/baseline.md`. The rivals' half of D1.4 is the maintainer's (owner step); until it runs, a view's benchmark is Wayfarer's before and after. **D4-c** D2.2's voice guide (`docs/design/voice.md`) and D4.2, first run (U-022, U-032). **D4-d** D4.3, the composer (U-004, U-017, U-018, U-019, U-028; the second pass's script review dialog, OAuth flow and GraphQL explorer). **D4-e** D4.3, the response (U-031, the WebSocket view) and D3.2's compact density, decided where it is used. **D4-f** D4.4, collections, folders, tabs and history (U-010, U-011, U-016, U-024, U-027, U-035, as D4-a placed them). **D4-g** D4.5, environments, variables and the vault (U-026, the environment editor with rows). **D4-h** D4.7, settings, the Local Bridge and routes, import and export (U-015, U-025). **D4-i** D4.6 and D4.9 together: the runner's report and the CLI's terminal, HTML and JUnit reports share one design. **D4-j** D1.6 (Git), its decision approved by the maintainer, then D4.8's team flows. **D4-k** D1.7 (AI), its decision approved, then D4.10. D4-j and D4-k wait for their decisions; the rest run in order. Strings written from D4-d on follow D2.2's guide. |
| 2026-10-22 | 1.36 | **D4-a: the audit triaged, and D4.1 done.** Read against `main` at `fe1ba6b`. **Triage:** every finding of [`docs/design/audit.md`](docs/design/audit.md) has a status line, checked on a production build in Chromium at 1,440 × 900 (both themes), 840 and 390 px. Fixed, with the PR: U-001, U-002, U-005 to U-009, U-012, U-013, U-019, U-021, U-023, U-030, U-033, U-036 (15). Open, with the session of row 1.35 that takes it: the other 19, and two found while checking, U-037 (two link buttons in the composer draw the browser's border, D4-d) and U-038 (Monaco's bracket colours are Monaco's, D4-e). None is accepted. Row 1.35 was wrong on four: U-003 is open (the response is still 432 px wide at 1,440 px, D4-e), U-014 is open (the run's diagnosis offers no action, D4-i), U-020 is open ("COLLECTIONS" and "ENVIRONMENTS" are still uppercase, D4-f and D4-g), and U-019 was fixed by D3a (#389), so D4-d has nothing of it. This meets D1's exit criterion for D1.2's first pass; D1.2 stays open for its second pass (D4-b). **D4.1:** [`docs/design/ia.md`](docs/design/ia.md), the map of the shell's regions, the four rules by which the palette, the sidebar and the tabs share work (one road opens a request; one list of commands, which the palette, the tooltips and Settings, Shortcuts read; the palette offers what a context menu offers; the palette is never the only road), and an inventory of 271 actions, each with its place and session. `scripts/ia.test.mjs` (in `test:scripts`) reads the actions from the templates (with Angular's own template parser), the palette, Settings' shortcuts and the menus built in code, and fails on an action without a row or a row without an action. **The maintainer's decisions (2026-10-22), asked in the session:** the address row's + and "Start a new request instead" are removed, and a new request is a new tab; each tab gets its own close, + follows the last tab, and Duplicate moves to a tab's context menu and the palette (U-027); the palette is the shell's, opened from a labelled field in the toolbar, and finds requests, collections, environments and history as well as commands, while the sidebar's header keeps New and Import menus (U-010, U-011); one Export… with the format and the credentials in its dialog (U-016). U-032: every shortcut is shown where it works; which keys Send and Save get is D4-c's. The audit and the map are pages of the site's docs (`/docs/design/audit/`, `/docs/design/ia/`), so `CHANGELOG.md` has an entry, and the README links the map. |
| 2026-10-22 | 1.37 | **D4-b: measurement; D0.1, D0.2 and D1.2 done.** Read against `main` at `204379e`. **D0.1** (#422): `e2e/design/screens.spec.ts` captures the 49 screens of `e2e/design/screens.ts` at 360, 390, 820 and 1,440 px in both themes as a `toHaveScreenshot` baseline, in projects of its own (`design-<engine>`) that the default and claims runs ignore. [`docs/design/baseline/index.md`](docs/design/baseline/index.md) is the index, and `scripts/design-index.test.mjs` holds it equal to the spec's list. **The maintainer's decisions (2026-10-22), asked in the session:** only Chromium's snapshots are committed (`docs/design/baseline/design-chromium/`, 392 images, 19 MB; the three engines' are about 57 MB, against 4.5 MB of images in the docs before); Firefox's and WebKit's are taken fresh in CI and uploaded as artifacts. The "Design capture" job runs after the build inside Playwright's Linux image, with `continue-on-error`; Chromium and Firefox on every pull request and on `main`, WebKit on `main` only, since its capture took 11.4 minutes in the image against under 3 for the others. Section 10's visual baseline is this job. **D1.2's second pass** (#423): U-039 to U-058 in [`docs/design/audit.md`](docs/design/audit.md), the five screens the first pass skipped and what Firefox and WebKit draw differently (each capture compared with Chromium's pixel by pixel, the 40 that differ most read by eye); every finding has a status, all 20 open with their session of row 1.35, none accepted; and a table of every screen of D0.1 with its findings or "no finding", which meets D1.2's AC. **D0.2** (#424): [`docs/design/baseline.md`](docs/design/baseline.md), the eight tasks of D1.4 as `e2e/design/tasks.spec.ts`, inputs and seconds, three runs each, median, with the method and the build. Task 5 is three (CORS, DNS, 401), so ten rows. The scripts found U-039, U-044 and U-049 to U-051. The rivals' half of D1.4 stays the maintainer's (section 8, DQ3). |
| 2026-10-22 | 1.38 | **D4-c: the voice guide, the keys for Send and Save, and the first run; D2.2 and D4.2 done.** Read against `main` at `89cac7c`. **D2.2** (#425): [`docs/design/voice.md`](docs/design/voice.md), what the app calls each thing, how it says an error, asks a question and explains a limit, and how an empty place offers its next step; sentence case for every label, which decides U-054 (each view's session applies it); and shortcuts shown in the keys of the reader's own system only (⌘↵ on a Mac, Ctrl+Enter elsewhere; the docs write both). Its AC's twenty strings are the ones drawn on the most of D0.1's 49 screens at 1,440 px, counted by screen, seeded data and undrawn accessible names left out; the page says how. **U-032** (#426): Send is ⌘↵ or Ctrl+Enter and Save ⌘S or Ctrl+S, Postman's keys (Hoppscotch's too; Insomnia sends with Ctrl+Enter), read before Monaco and not under a dialog; Enter in the address sends. The choice was clear from Postman's and what the browser takes (only Ctrl+S, its Save page), so the maintainer was not asked. `src/app/shared/shortcuts.ts` is the one list; the tooltips (`uiTooltipKeys`, with `aria-keyshortcuts`), the palette's rows and Settings, Shortcuts read it. C and N get their keycaps with D4-f's New menu. **D4.2** (#427, U-022): the caret starts in the address of an empty request (not on a phone, and not past a dialog), the empty response offers a cURL command and an import, the empty sidebar a collection and an import, the empty environments list a new environment, and no empty state draws a dashed box. No example request (accepted in the audit: it would send to a server the person did not choose). Task 1 measured again: 35 inputs (0 clicks, 1 key, 34 characters), 0.06 s median, against 36 at D0.2 ([`docs/design/baseline.md`](docs/design/baseline.md)). The rivals' half of D1.4 has not run (DQ3), so the aim was fewer than today's 36; when it runs, D4.2 is read again against it. Each view closed with the AC below D4.10: U-022 and U-032 fixed in the audit; axe and widths in three engines; the Chromium captures the change moved taken again in Playwright's Linux image. |
| 2026-10-22 | 1.39 | **D3.5 added: a file field (U-059).** The maintainer found that the app's file pickers look native. Read against `main` at `cd02088`: no `<input type="file">` is drawn (all nine are hidden behind a button), but three places redraw the browser's control around it, an outlined "Choose file" beside "No file chosen", Chrome's own words: the request's binary body, a multipart part and the vault's import. None takes a dropped file or clears. D3.3 gave the app no widget for it, so each drew its own. The audit gets U-059, and D3 gets D3.5, a file field in `src/app/ui` with its catalogue states and keyboard e2e. D4-d takes it, since two of the three places are the composer's; the vault's import adopts it in the same PR, as a widget's swap. The row that closes D4-d is 1.40. |
