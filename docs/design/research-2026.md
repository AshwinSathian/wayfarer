# Design research, October 2026

Input to [`PLAN-design.md`](../../PLAN-design.md). Gathered on 2026-10-14
by web search and by reading competitors' home pages, before the design
phase started. Revised on 2026-11-04 for task D1.1: each point now cites a
primary source (the vendor's own page, docs, changelog or release notes, a
standards body, a browser vendor's docs or data) or is marked
"(unverified)". The changelog at the end says what changed.

How to read the sources. A link with no other note is a primary source,
read on 2026-11-04 unless a date is given; where the page carries its own
date, that date is given. "[S]" marks a second-hand source, kept only
beside a primary one or for a point marked unverified. A point marked
"(unverified)" backs no decision. Baseline statuses are from the
[web-features](https://web-platform-dx.github.io/web-features-explorer/)
data, package version 3.45.0, read on 2026-11-04.

## 1. The market moved in March 2026

Postman's plans changed in March 2026. Under the new plans "the Free plan
is limited to one user and can't create a team", and "the new Team plan
replaces the Basic plan" ([Postman, About plans](https://learning.postman.com/latest-v-12/docs/billing/about-plans)).
Team is $19 per user per month, billed annually; the pricing page gives no
monthly-billed figure ([Postman pricing](https://www.postman.com/pricing/)).
Yaak's write-up dates the change to 1 March 2026 and says the free plan
went from three users to one
([Yaak, 2026-09-12](https://yaak.app/blog/postman-free-plan-one-user) [S]:
a rival's blog). The exact day is not on Postman's pages (unverified).

The 2026-10-14 text gave a second price, "$14 billed yearly", from a
competitor's blog. Postman's own page does not show it; it is dropped.

Legacy plans: "You will stay on your legacy plan until renewal", and
"Only Professional plans are able to renew on their existing plan"
([Postman, About plans](https://learning.postman.com/latest-v-12/docs/billing/about-plans)).
That teams therefore meet the change one renewal at a time "through 2027"
is Yaak's reading [S], not Postman's (unverified).

That is the opening the maintainer named: small teams that collaborated
for free in Postman until this year and now pay per seat.

## 2. What the rivals say and do

The hero lines, calls to action and figures were read from each home page
on 2026-11-04; onboarding, sharing and AI from each rival's docs,
changelog or release notes. Versions are the latest each changelog lists
on that day.

### Home pages

| Product | Hero line | Main call to action | Shape |
|---|---|---|---|
| [Bruno](https://www.usebruno.com/) v4.3.0 (2026-10-22) | "The Git-native API client" | Download | Desktop app. Collections are plain-text files in your repository. 4M users, 46K stars, SOC 2 Type II "Independently audited". "No cloud sync, no account, no login"; "Your data never leaves your machine." No demo (unverified, not rechecked). |
| [Yaak](https://yaak.app/) 2026.9.0 (2026-10-10) | "The local-first API client" | Download | Desktop app "Built for speed using Rust and Tauri", by Greg Schier, who writes "I created Insomnia and sold it in 2019". One YAML file per request, folder and environment; a Git UI; a CLI and an MCP server plugin; "Built for agents, without built-in AI". No account, no automatic cloud sync, "Zero telemetry from the desktop app". Free for personal use; work use needs a licence after a 30-day trial: $79 or $149 per user per year, or $399 once. |
| [Postman](https://www.postman.com/) v12 | "API engineering for your agents" | "Install for your agents" (the Postman CLI from npm) | The page is about AI agents: Agent Mode, a "Context Graph" of your APIs, and Passport, "The credential proxy that lets developers and agents call approved APIs without holding the secret". "Trusted by over 50 million developers" (the 2026-10-14 text said 40M). Lists "Native Git". |
| [Hoppscotch](https://hoppscotch.com/) 2026.10.0 (2026-10-30) | "Make Better APIs" | "Get Started on Cloud", "Self-Host from GitHub" | Web app at hoppscotch.io, plus apps for Mac, Windows, Linux and a CLI, and self-hosting. "Local-first data storage." "No tracking. No analytics. No ads." Cloud sync across devices and team workspaces. (The 2026-10-14 text said the root is the app; the root is now a home page.) |
| [Insomnia](https://insomnia.rest/) 13.4.0 (2026-10-29) | "AI-ready APIs Built Smarter. Tested Faster. Governed Better." | "Get Started for Free" | Desktop app by Kong. "No login ever required for Scratch Pad." Store data "locally, via Git, or in the cloud"; cloud sync has "optional end-to-end encryption". Free tier: "Git Sync for 3" ([pricing](https://insomnia.rest/pricing): "Unlimited Git Sync projects for up to 3 users"); Pro $12 and Enterprise $45 per user per month. A native MCP client. |
| Scalar Client 1.0 (2026-05-14), now v1.1.43 (2026-10-23) | n/a | n/a | Desktop app or the browser version at client.scalar.com ([Scalar docs](https://scalar.com/products/api-client/getting-started)); whether an account is needed is not stated. 1.0 brought "First-class team workspaces", "Live sync with the Scalar Registry", "Conflict detection and resolution when local edits and registry changes disagree" and "Save and revert flows for local-only drafts" ([Scalar changelog](https://scalar.com/changelog/api-client)). |
| [Requestly](https://requestly.com/) (BrowserStack), adjacent | "AI-first API Platform designed for Enterprises" | n/a | Desktop app and browser extensions. Local projects are files on your machine and in Git; secrets stay on the device; one-click Postman import; an AI test-case generator. Account need not stated. |

### Onboarding, sharing and AI, from each rival's docs

**Postman.**
- First request: without signing in, the desktop app offers "the
  lightweight API Client": New, pick a type, enter the address, Send. It
  holds no collections, environments or variables, is stored locally and
  not synced, and is described for the desktop app only
  ([Postman docs](https://learning.postman.com/docs/getting-started/basics/using-api-client/)).
- Sharing: a team needs the Team plan (section 1). Native Git "lets you
  develop APIs in a local Git repository and sync them to Postman Cloud",
  through the desktop app or the Postman CLI after `postman login`; the
  file format is not named on that page
  ([Native Git](https://learning.postman.com/latest-v-12/docs/use/native-git/overview)).
  That it is YAML Collection 3.0 rests on a press report
  ([heise, 2026-03-04](https://heise.de/-11198271) [S]; unverified).
- AI: Agent Mode is built into the app, and Agent Mode on Cloud runs longer
  tasks "in an isolated sandbox with a full audit trail for every run". It
  is "available to users who consent to using AI"; you may bring your own
  OpenAI or Anthropic account and choose the model. The page describes no
  approval per action and does not say what data is sent to a model
  ([Agent Mode](https://learning.postman.com/latest-v-12/docs/use/agent-mode/overview)).
  The Free plan's AI credits are given as both 100 and 50 on one page;
  Team includes 400 per user per month ([pricing](https://www.postman.com/pricing/)).

**Bruno.**
- First request: since v3.2.0 (2026-03-18) "Send requests without creating
  a Collection" ([changelog](https://www.usebruno.com/changelog)): the "+"
  in Workspace Home's tab area opens an unsaved request, which may be saved
  into a collection later ([docs](https://docs.usebruno.com/get-started/bruno-basics/create-a-request)).
- Import from Postman: "+", Import Collection, choose the file, Options,
  Show Advanced Options, optionally Preserve scripts (off by default),
  Import ([docs](https://docs.usebruno.com/get-started/import-export-data/postman-migration)).
- Sharing: by Git only. "Core Git UI features (init, view diffs, check for
  updates, pull, clone) are now available in the free version" from
  3.0.0; commit, push, branches and conflict resolution need Pro or
  Ultimate ([Git integration](https://docs.usebruno.com/git-integration/overview)).
  v3.0.0 (2026-01-05) was a redesign with workspaces and workspace-level
  Git; v4.0.0 (2026-07-23) made OpenCollection YAML the default format
  ([changelog](https://www.usebruno.com/changelog)).
- AI: v4.0.0 added bring-your-own-key AI and an AI sidebar. Providers are
  OpenAI, Anthropic and any OpenAI-compatible endpoint, a self-hosted model
  included; "No data is routed through Bruno servers"; it is in Beta
  ([Bruno AI](https://docs.usebruno.com/ai/bruno-ai/introduction.md)).
  "Bruno's AI is off by default." Authorization, cookie and key headers are
  replaced with a placeholder, a response body is sent as its shape and
  value types, a secret variable's name is sent and its value is not, and
  output is a proposed diff: "Nothing is applied to your files without your
  click" ([Bruno's blog, 2026-08-31](https://blog.usebruno.com/bruno-ai-assistant)).
  Neither page describes a preview of the exact payload sent.
- Secrets: v4.3.0 (2026-10-22): "External secrets are now fetched on
  demand and held in memory, and are no longer written to disk"
  ([changelog](https://www.usebruno.com/changelog)).

**Yaak.**
- First request: Cmd+N for a new request, Cmd+Enter to send; Cmd+K is the
  command palette and Cmd+P the request switcher
  ([shortcuts](https://yaak.app/docs/getting-started/keyboard-shortcuts)).
  Whether Cmd+N asks for a name first is not stated (unverified).
- Import from Postman: Import Data, drop or choose the file, New Workspace,
  Preview Import, Apply Changes, Done. "Pre-request and test scripts ...
  aren't imported." Re-importing merges instead of duplicating
  ([migration](https://yaak.app/docs/migration/postman); 2026.8.0,
  [changelog](https://yaak.app/changelog)).
- Sharing: a workspace syncs to a folder, one YAML file per resource, which
  may be a Git repository with branch, commit, push and pull in the app.
  Environments are left out of sync by default, "because they usually
  contain sensitive values", until marked sharable
  ([Git sync](https://yaak.app/docs/using-yaak/local-directory-git-sync)).
  2026.4.0 (2026-05-18) shows Git changes in the sidebar
  ([changelog](https://yaak.app/changelog)).
- AI: none built in. Agents connect through the CLI or MCP; `yaak agent
  install` adds a skill (2026.6.0, 2026-08-14); streamed LLM responses are
  shown as they build (2026.5.0, 2026-07-21)
  ([home page](https://yaak.app/), [changelog](https://yaak.app/changelog)).

**Hoppscotch.**
- First request: open hoppscotch.io, enter the address, choose the method,
  Send ([docs](https://docs.hoppscotch.io/documentation/getting-started/rest/creating-a-request));
  the web app can be used "right away for free"
  ([setup](https://docs.hoppscotch.io/documentation/getting-started/setup)).
  Neither page says whether an account is needed; that none is needed for
  a first request is (unverified) on a primary page. A target that does
  not allow CORS needs an interceptor first: the Agent (a local app,
  paired with a one-time code, "Recommended"), a proxy, or a browser
  extension. The page says nothing of the interface showing which route a
  request took ([interceptor](https://docs.hoppscotch.io/documentation/features/interceptor)).
- Import from Postman: Import, the "Import from Postman" tab, Choose file,
  Import; scripts are experimental and asked for consent
  ([importer](https://docs.hoppscotch.io/documentation/features/importer)).
- Sharing: "Once you are logged into Hoppscotch, you can toggle between
  multiple workspaces": a personal one and shared team workspaces, with
  members invited by e-mail; shared workspaces hold REST requests only
  ([features](https://docs.hoppscotch.io/documentation/features)). Cloud
  sync across devices ([home page](https://hoppscotch.com/)).
- Secrets: secret variables "are kept in the client's local store"
  (browser local storage on the web) and "excluded from server sync"; no
  application-level encryption is stated
  ([security policy](https://docs.hoppscotch.io/support/security-policy)).
- AI: 2026.8.0 (2026-08-28) "Introducing the Hoppscotch MCP server" and
  data-driven collection runs from CSV or JSON; 2026.9.0 (2026-09-30) an
  AI chat bot and "an AI Assistant for Enterprise Self-Host that can edit
  and run requests, manage collections and environments"
  ([releases](https://github.com/hoppscotch/hoppscotch/releases)).

**Insomnia.**
- First request: the Scratch Pad, "Use the local Scratch Pad" at the foot
  of the login screen, stores everything on the device
  ([storage](https://developer.konghq.com/insomnia/storage/)); the steps
  are not counted on a primary page (unverified).
- Sharing: four storage choices per project, changeable later: Local Vault,
  Scratch Pad, Cloud Sync (an account; "encrypted during transmission and
  storage") and Git Sync (a third-party repository, "independent of cloud
  access"; on the free plan up to 3 users per organisation)
  ([storage](https://developer.konghq.com/insomnia/storage/)). 13.4.0
  (2026-10-29) added an entity-level Git diff and environments marked
  confidential, masked in the timeline
  ([releases](https://www.github.com/Kong/insomnia/releases)).
- AI: mock servers from a prompt, commit suggestions and an MCP client.
  Providers are Claude, OpenAI, Gemini, a custom URL, or a local `.gguf`
  model: "Local models keep processing fully on your machine". Nothing
  runs until an LLM is activated in Preferences; "AI features are free to
  use" as of v12. The page does not say what data is sent to a hosted
  provider ([AI in Insomnia](https://developer.konghq.com/insomnia/ai-in-insomnia/)).

**Chrome DevTools, Network panel (adjacent).** Chrome 152's DevTools
(2026-08-25) renamed Replay XHR to Resend, for any fetchable request, and
decodes binary payloads as Base64, Hex or UTF-8; its MCP server is v1.7.0
([Chrome blog](https://developer.chrome.com/blog/new-in-devtools-152)).

### What follows for Wayfarer

- **Corrected.** The 2026-10-14 text said Wayfarer was "the only one in
  this list that sends a request from a browser tab with no account and no
  install". That does not hold: Hoppscotch's web app sends from a tab with
  no install (its account need is unstated), and Scalar has a browser
  version. What is left is narrower: a browser tab, no account, an
  encrypted on-device vault, sends past CORS through the Local Bridge, and
  a public claims ledger where each statement has a test. Whether any
  rival has such a ledger was not checked on every page (unverified).
- "Local-first, no account" no longer sets anyone apart: Bruno, Yaak,
  Hoppscotch, Insomnia's Scratch Pad and Postman's lightweight client all
  offer it (sources above).
- Bruno and Yaak hold "your files, your Git", and Postman (Native Git),
  Insomnia (Git Sync) and Requestly (local projects in Git) now offer it
  too. Wayfarer keeps its data in IndexedDB with no folder of files; D1.6
  took that decision (plan row 1.55).
- **Corrected.** The 2026-10-14 text placed Wayfarer's AI (a user's own key
  or a local model, off by default) between Postman and Yaak, as if that
  place were empty. Bruno v4 holds it: off by default, its own key,
  redacted context and edits as a diff. Insomnia offers a local model, and
  Postman's Agent Mode takes the user's own OpenAI or Anthropic account.
  No rival's docs describe a preview of the exact bytes an AI request
  sends.
- None of the rivals' pages shows the product working; they show
  screenshots (unverified: not rechecked on 2026-11-04).

## 3. Design direction in 2026

Linear's refresh of 12 March 2026 is the clearest primary source on dense
professional tools ([changelog](https://linear.app/changelog/2026-03-12-ui-refresh),
[the design write-up](https://linear.app/now/behind-the-latest-design-refresh)).
"Headers, navigation, and view controls are now consistent across
projects, issues, reviews, and documents"; icons were redrawn and resized,
fewer used and smaller; "Navigation sidebars are slightly dimmer"; borders
softer and fewer ("Structure should be felt not seen"); the greys moved
from cool towards a warmer, less saturated grey. The stated principle: not
every element should carry equal weight. Linear's 2024 redesign had moved
its main themes to an LCH generator, replacing HSL, defined by three
inputs: base colour, accent and contrast
([Linear, 2024-03-28](https://linear.app/now/how-we-redesigned-the-linear-ui)).

Trend round-ups for 2026 agree on a few points, with no study behind them
([Envato](https://elements.envato.com/learn/ux-ui-design-trends),
[UXPin](https://www.uxpin.com/studio/blog/ui-ux-design-trends/),
[TesterYou](https://testeryou.com/ui-ux-in-2026-4-major-trends-shaping-enterprise-software-and-interfaces/)
[S]): quieter interfaces with a clear hierarchy, motion that reports state
instead of decorating, dark themes with depth from layered shades in
developer tools, and AI that says what it did and how sure it is
(unverified: opinion, not measured; not re-read on 2026-11-04). Nothing
credible was found about 2027.

## 4. The platform caught up with the widget libraries

Statuses from web-features 3.45.0; "newly" is Baseline newly available,
with the date it became so.

- **Anchor positioning.** **Corrected.** The 2026-10-14 text said it
  "reached Baseline in early 2026, with Firefox 147", from a training
  site's summary. The core did: `anchor-name`, `@position-try` and
  `position-area` are newly Baseline since 2026-01-13 (Chrome 125 to 129,
  Firefox 147, Safari 26), and `position-anchor` since 2026-09-14 (Chrome
  and Firefox 151, Safari 27). The feature as a whole is listed as Limited
  ([explorer](https://web-platform-dx.github.io/web-features-explorer/features/anchor-positioning/)),
  because `position-visibility: anchor-valid` and `anchor-visible` are in
  Safari 27 only. The old "`@position-try` needs Safari 18.4" is wrong: the
  data give Safari 26. With the Popover API this covers tooltips, menus and
  the confirmation placed under a button, which today are the CDK's
  overlays; avoid `position-visibility` until it is Baseline.
- **Popover API**, newly since 2025-01-27; **invoker commands**
  (`command`/`commandfor`), newly since 2025-12-12 (Firefox 144, Safari
  26.2); **`@starting-style`**, newly since 2024-08-06.
- **Customizable `<select>`** (`appearance: base-select`) is Limited:
  Chrome 135, Safari 27, no Firefox ("Baseline availability blocked since
  September 2026 by Firefox"); it falls back to the native select where
  unsupported
  ([explorer](https://web-platform-dx.github.io/web-features-explorer/features/customizable-select/)).
- **View transitions** in one document are newly Baseline since
  2025-10-14 (Firefox 144). Across documents they are Limited: Chrome 126
  and Safari 18.2, no Firefox
  ([explorer](https://web-platform-dx.github.io/web-features-explorer/features/cross-document-view-transitions/)).
- **Corrected.** **Scroll-driven animations** were "uneven between
  engines" on 2026-10-14; they became newly Baseline on 2026-10-27 with
  Firefox 159 (Chrome 115, Safari 26).
- **`field-sizing: content`**, newly since 2026-06-16; **`light-dark()`**,
  newly since 2024-05-13; **`contrast-color()`**, newly since 2026-04-10;
  the **Navigation API**, newly since 2026-01-13.
- Anchor positioning, view transitions (now across documents too) and
  scroll-driven animations are focus areas of
  [Interop 2026](https://webkit.org/blog/17818/announcing-interop-2026/)
  (WebKit, 2026-02-12), which has twenty. Customizable `<select>` is not
  among those the post names.

Each of these must be checked in the three test engines before the plan
relies on it, as this repository does for everything else.

## 5. Angular's component options

Angular Aria became stable in v22 ([roadmap](https://angular.dev/roadmap)):
"a collection of headless, accessible directives" (autocomplete, listbox,
select, multiselect, combobox, menu, menubar, toolbar, accordion, tabs,
tree, grid), where you bring "the HTML structure, CSS styling, and
business logic" ([Angular Aria](https://angular.dev/guide/aria/overview),
docs at v22.2.4). The roadmap offers three paths side by side: components
of your own on Aria, "interaction patterns from the CDK", or "ready-made
styled Material Components". That the Angular team said Material will not
be rebuilt on Aria is not on the roadmap today (unverified). Google's
Material Web components are "in maintenance mode pending new maintainers"
([GitHub](https://github.com/material-components/material-web)). That
Material 3 Expressive is not implemented for the web, and that a community
library restyles Angular Material with it, are (unverified).

The rest of this section was measured on 2026-10-14 and is history now.
Wayfarer then imported 16 Angular Material packages (`button` in 34
files, `form-field` in 22, `input` in 21), and `controls.css` (1,079
lines) and `material-theme.scss` (403 lines, 20 `overrides` mixins)
existed to make Material look like the design tokens. That cost was the
case for re-deciding the widget layer, which the maintainer opened
("truly everything"). Since then the widgets moved to Angular Aria and the
platform, and Material left the app (D3.3, plan row 1.34; `CLAUDE.md`).

## 6. Tokens, colour, type

The [Design Tokens format](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
reached its first stable version, 2025.10, on 28 October 2025: themes,
aliases, Display P3 and OKLCH colour, with Style Dictionary, Tokens
Studio and Terrazzo as reference implementations. It is the work of a W3C
Community Group, not a W3C standard.

On 2026-10-14 Wayfarer's tokens were hand-written CSS
(`src/design-system/tokens.css`, 157 declarations) with Apple's naming
(`--label-*`, `--canvas-*`, `--separator`), and contrast was checked by
`scripts/contrast.test.mjs`. Since D3.1 the tokens are DTCG 2025.10 files
in `packages/tokens`, and `tokens.css` is generated from them
(`CLAUDE.md`).

## 7. Accessibility

WCAG 2.2 is a W3C Recommendation of 12 December 2024
([W3C](https://www.w3.org/TR/WCAG22/)). WCAG 3 is a Working Draft (10
September 2026), and "The contrast algorithm used in WCAG 3 is yet to be
determined" ([W3C](https://www.w3.org/TR/wcag-3.0/)). APCA was dropped
from the working draft in July 2023 and has not returned
([Adrian Roselli, 2026-04-10](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)
[S]; the draft's own words above are the primary half). The 2026-10-14
text called 2.2 AA "the enforceable standard"; which laws enforce which
version was not checked (unverified). The plan keeps 2.2 AA as the bar
(maintainer, 2026-10-14) and may report APCA values as information only.

## 8. AI in a local-first tool

Patterns that recur in 2026 writing on agent interfaces: show the plan
before acting, ask permission for risky actions (one source warns that
"Gating every action" tires people), show the change as a diff with
undo, and log what was approved
([AYDesign](https://www.aydesign.ai/blog/ai-agent-ux-design-patterns-2026)
[S]; [agentic-design.ai](https://agentic-design.ai/patterns/ui-ux-patterns)
[S], not re-read). None of the sources is a usability study: (unverified)
as findings. The rivals now ship some of them (section 2): Bruno's edits
arrive as a diff, Postman's cloud agent keeps an audit trail, Insomnia
runs nothing until a model is chosen.

Two browser routes exist besides a user's own API key:

- **Chrome's Prompt API** runs Gemini Nano on the device
  ([Chrome docs](https://developer.chrome.com/docs/ai/prompt-api), last
  updated 2026-10-21). **Corrected.** Web pages may use it from Chrome 148
  without an origin trial, extensions from 138; the page now says so
  plainly. Desktop only (Windows 10 or 11, macOS 13 or later, Linux,
  ChromeOS on Chromebook Plus). It needs 22 GB free on the profile's
  volume and either a GPU with more than 4 GB of memory or, on the CPU
  path the 2026-10-14 text missed, 16 GB of RAM and 4 cores. The model's
  size is not fixed ("significantly smaller" than 22 GB; see
  `chrome://on-device-internals`), so the old "4 GB" is dropped. The model
  downloads the first time a page calls `LanguageModel.create()` after a
  user activation; neither that page nor
  [Get started](https://developer.chrome.com/docs/ai/get-started)
  describes a consent prompt from Chrome, and developers are told to tell
  users while it downloads. For the privacy-bound user, Wayfarer has to
  ask first.
- **WebMCP** lets a page offer tools to an agent in the browser, as
  annotated forms (declarative) or JavaScript (imperative), with JSON
  Schemas; sensitive actions may ask the user to confirm. It is "a
  proposed web standard" in an origin trial from Chrome 149, behind the
  `tools` Permissions Policy, default `self`
  ([Chrome docs](https://developer.chrome.com/docs/ai/webmcp), updated
  2026-10-07). The specification is a Draft Community Group Report of the
  W3C's Web Machine Learning Community Group (2 November 2026), not a W3C
  standard, and its entry point is `document.modelContext`
  ([spec](https://webmachinelearning.github.io/webmcp)). For an API client
  this is the reverse direction: the user's agent could drive Wayfarer.

Nielsen Norman Group's study of Google's AI Mode (2025-10-17, seven
participants; was cited second-hand on 2026-10-14): four of seven had not
noticed or used AI Mode until shown it, and long answers with little
formatting overwhelmed people, who skimmed for a summary or went back to
search ([NN/g](https://www.nngroup.com/articles/google-ai-mode/)).
Discoverability is the open problem.

## 9. Teams without a server

The maintainer chose all four ways to share: Git, peer-to-peer sync, a
self-hosted server, and files and links. Facts that bound them:

- `showDirectoryPicker` (a folder on disk) is in Chromium only (Chrome and
  Edge 86, web-features `file-system-access`); Firefox and Safari have
  none, and MDN lists it as Limited and experimental
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)).
  Git as the store therefore needs Chromium, the Local Bridge, or a
  desktop shell. Phase D1 decided (D1.6, plan row 1.55).
- CRDTs make copies converge; they do not keep what each person meant. For
  two edits of the same field "the CRDT keeps track of the conflicting
  values, and leaves it to be resolved by the application or the user",
  and how such conflicts are resolved "is often arbitrary"
  ([Ink & Switch, "Local-first software", 2019](https://www.inkandswitch.com/essay/local-first/);
  [paper](https://www.repository.cam.ac.uk/handle/1810/297581)). A request
  edited in two places needs a conflict screen even when the data merged
  cleanly.

## 10. The website

The rivals' pages share one layout: hero line, Download, a screenshot,
logos, a feature list, testimonials, a second Download, a FAQ
(unverified: not rechecked on 2026-11-04). The one analysis of
developer-tool home pages found
([Hackmamba, 2026-07-13](https://hackmamba.io/developer-marketing/developer-tool-homepage-examples/)
[S]) credits Linear for showing the product in the hero instead of
describing it: "Linear shows you what using it feels like." Claims that
interactive demos double engagement come from vendors of demo tools and
are unverified.

`llms.txt` is cheap to add. Google Search does not use it: "Google Search
ignores them", and making one "will neither harm nor help"
([Google Search Central](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)).
No primary study shows it brings citations (unverified either way).

For hosting, Cloudflare Workers static assets answer a missing path with
the nearest `404.html` and a 404 (`404-page`), or with `index.html` and a
200 (`single-page-application`)
([Cloudflare docs](https://developers.cloudflare.com/workers/static-assets/)).
**Corrected.** The 2026-10-14 text said serving one directory under a path
(`/app/*`) needs Wrangler 3.98 or later. The page on serving a
subdirectory now describes `assets.base_path`, which needs Wrangler
4.148.0 (changelog of 2026-10-28)
([subdirectory](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/),
[changelog](https://developers.cloudflare.com/changelog/post/2026-10-28-static-assets-base-path/));
the 3.98 figure appears only in a search summary (unverified). Wayfarer's
deploy places the app in an `app/` folder of one assets directory instead
(`CLAUDE.md`), which needs neither.

## 11. Wayfarer today, as measured

Measured in this repository on 2026-10-14 and not measured again; these
are records, not research claims, and several are out of date (sections 5
and 6).

- 15 component folders, 41 component files, 3,971 lines of templates.
- Six design-system files and `src/styles.css`: 2,456 lines.
- 13 type classes in use. `type-footnote` (77 uses), `type-caption` (61)
  and `type-callout` (59) carry most of the interface; `type-title-2` and
  `type-headline` are used once each.
- Two breakpoints decide the layout (`App.updateViewportFlags`): below
  1,200 px the sidebar is a drawer, below 768 px the composer stacks.
  Beside the pinned 352 px sidebar, a 1,200 px window leaves the composer
  391 px.
- A collection's settings dialog closes when the window narrows past
  1,200 px: open at 1,300 px, gone at 1,100 px (measured 2026-10-14,
  Chromium).
- No icon, logo or wordmark system beyond inline SVG icons
  (`src/app/shared/icon/icon-paths.ts`, 44 glyphs).

## Changelog

### 2026-10-14

- First version, gathered by web search and from the rivals' home pages
  before the design phase. Most sources were vendor or agency blogs; a
  figure with no primary study was marked unverified.

### 2026-11-04 (D1.1)

- **Sourced.** Each point was checked against a primary page read on this
  day: Postman's plans and pricing pages; each rival's home page, docs,
  changelog or release notes on onboarding, sharing and AI (Postman,
  Bruno, Yaak, Hoppscotch, Insomnia, Scalar, Requestly, Chrome DevTools);
  web-features 3.45.0 and its explorer for every Baseline status;
  WebKit's Interop 2026 post; Chrome's Prompt API and WebMCP pages and the
  WebMCP draft; Angular's roadmap and Aria guide; W3C's WCAG 2.2 and 3
  pages and the DTCG announcement; Linear's 2024 and 2026 write-ups;
  NN/g's AI Mode study; MDN; Ink & Switch; Google Search Central;
  Cloudflare's docs and changelog. Second-hand sources that remain are
  marked [S].
- **Section 2 rewritten** from the fourth pass's landscape
  (`docs/design/hig-review-2026-10-26.md`, section 4) and the docs: each
  rival's version, first request, sharing and AI, with a source. Postman's
  developer count is now 50M; Hoppscotch's root is a home page, not the
  app.
- **Corrected, changing a conclusion:** Wayfarer is not the only client
  that sends from a browser tab with no install (Hoppscotch, Scalar); the
  AI position between Postman and Yaak is Bruno v4's, with Insomnia's
  local model beside it; anchor positioning's core is Baseline (since
  2026-01-13) but the feature is Limited, and `@position-try` needs Safari
  26, not 18.4; scroll-driven animations became Baseline on 2026-10-27;
  the Prompt API's web version is plainly Chrome 148, has a CPU path, has
  no fixed model size, and no consent prompt is described; Wayfarer's
  serving of `/app/` does not rest on the Wrangler 3.98 figure, which no
  primary page gives.
- **Corrected, not changing a conclusion:** Postman's "$14 billed yearly"
  dropped; NN/g's AI Mode study now cited first-hand; the CRDT point
  quoted from the essay; sections 5, 6 and 11 marked as history where the
  app has since changed (Material gone, tokens in `packages/tokens`).
- **Marked unverified:** the exact day of Postman's change and "through
  2027"; Postman Native Git's file format; that no rival page shows the
  product working, and the rivals' shared page layout; Yaak's Cmd+N
  naming step; that Hoppscotch needs no account for a first request;
  Insomnia's step count; Angular's "Material will not be rebuilt on Aria",
  Material 3 Expressive on the web and the community library; the 2026
  trend round-ups and the agent-pattern writing; which laws enforce WCAG
  2.2; that `llms.txt` brings no citations; whether any rival has a claims
  ledger.
