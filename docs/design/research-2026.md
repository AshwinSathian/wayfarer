# Design research, October 2026

Input to [`PLAN-design.md`](../../PLAN-design.md). Gathered on 2026-10-14
by web search and by reading competitors' home pages, before the design
phase starts. It is a starting point, not the phase's research: phase D1
repeats and extends it with measurements of its own.

Most sources below are vendor or agency blogs. Where a fact comes from
one secondary source, the text says so. A figure with no primary study
behind it is marked unverified and is not used to decide anything.

## 1. The market moved in March 2026

Postman's free plan has been limited to one user since 1 March 2026.
Collaboration of any kind needs the Team plan, reported at $19 per user
per month ([zapro.ai, prices said to be checked 2026-09-21](https://zapro.ai/vendor/postman-pricing/);
[Yaak's write-up](https://yaak.app/blog/postman-free-plan-one-user)). A
competitor's blog gives $14 billed yearly; the two figures disagree.
Legacy plans convert at renewal, so teams meet the change one renewal at
a time through 2027.

That is the opening the maintainer named: small teams that collaborated
for free in Postman until this year and now pay per seat.

## 2. What the rivals say and do

Read from their own home pages on 2026-10-14.

| Product | Hero line | Main call to action | Shape |
|---|---|---|---|
| [Bruno](https://www.usebruno.com/) | "The Git-native API client" | Download | Desktop app. Collections are files in your repository. Logo wall, 4M users, 46K stars, SOC 2 Type II. No demo. |
| [Yaak](https://yaak.app/) | "The local-first API client" | Download | Tauri desktop app by Insomnia's creator. Git mirroring, a CLI and MCP: a section is titled "Built for agents, without built-in AI". Per-seat licence for work use. |
| [Postman](https://www.postman.com/) | "API engineering for your agents" | `npm install -g postman-cli`, then desktop | The page is about AI agents from top to bottom: skills, a "Context Graph", a credential proxy. 40M developers claimed. |
| Hoppscotch | (the root is the app) | none | The app is the page; a PWA, desktop and self-hosted. |
| Insomnia | n/a | n/a | Git Sync free up to 3 users, optional end-to-end encrypted cloud ([scalar.com comparison](https://scalar.com/alternatives/insomnia)). |
| Scalar Client 1.0 | n/a | n/a | Released May 2026: team workspaces with real-time sync and conflict resolution; local workspaces need an explicit save before changes go upstream ([API Evangelist](https://blogs.apievangelist.com/blogs/scalar-api-2026-05-14-1-0-13-2026-05-14/), one source). |

What follows for Wayfarer:

- Every rival asks for an install before the first request. Wayfarer is
  the only one in this list that sends a request from a browser tab with
  no account and no install, and the only one with a public claims
  ledger where each statement has a test.
- Bruno and Yaak won the "your files, your Git" argument. Wayfarer keeps
  its data in IndexedDB and has no folder of files. Phase D1 has to
  answer this, not hide it.
- Postman went all in on agents. Yaak took the opposite line on purpose.
  Wayfarer's answer (bring your own key or a local model, off by default)
  sits between them and has to be explained in one sentence.
- None of the rivals' pages shows the product working. They show
  screenshots.

## 3. Design direction in 2026

Linear's refresh of 12 March 2026 is the clearest primary source on dense
professional tools ([changelog](https://linear.app/changelog/2026-03-12-ui-refresh),
[the design write-up](https://linear.app/now/behind-the-latest-design-refresh)).
Headers, navigation and view controls were made the same across every
view, icons were redrawn, and the sidebar was dimmed so the content area
stands out. The stated principle: in a dense product, not every element
should carry equal visual weight. Linear's 2024 redesign had already moved
its theme generation from HSL to LCH.

Trend round-ups for 2026 agree on a few points, with no study behind them
([Envato](https://elements.envato.com/learn/ux-ui-design-trends),
[UXPin](https://www.uxpin.com/studio/blog/ui-ux-design-trends/),
[TesterYou](https://testeryou.com/ui-ux-in-2026-4-major-trends-shaping-enterprise-software-and-interfaces/)):
quieter interfaces with a clear hierarchy, motion that reports state
instead of decorating, dark themes with depth from layered shades in
developer tools, and AI that says what it did and how sure it is. Nothing
credible was found about 2027.

## 4. The platform caught up with the widget libraries

- **Anchor positioning** reached Baseline in early 2026, with Firefox 147
  ([summary](https://www.refontelearning.com/blog/css-anchor-positioning-reaches-baseline)).
  `@position-try` needs Safari 18.4 or later. With the Popover API this
  covers tooltips, menus and the confirmation placed under a button,
  which today are the CDK's overlays.
- **Customizable `<select>`** (`appearance: base-select`) is not Baseline
  yet and falls back to the native select where unsupported
  ([nerdy.dev](https://nerdy.dev/nice-select)).
- **View transitions** within one document are established; across
  documents they are the 2026 addition. Scroll-driven animations are
  uneven between engines. Both are in [Interop 2026](https://webkit.org/blog/17818/announcing-interop-2026/),
  which has twenty focus areas.

Each of these must be checked in the three test engines before the plan
relies on it, as this repository does for everything else.

## 5. Angular's component options

[Angular Aria](https://angular.dev/guide/aria/overview) is stable in
Angular 22: accessible, unstyled patterns. The Angular team has said
Material will not be rebuilt on Aria; the two are parallel choices, with
the CDK as a third ([roadmap](https://angular.dev/roadmap)). Google's
Material Web components are in maintenance, and Material 3 Expressive is
not implemented for the web; a community library restyles Angular
Material with it.

Today Wayfarer imports 16 Angular Material packages (`button` in 34
files, `form-field` in 22, `input` in 21). `controls.css` (1,079 lines)
and `material-theme.scss` (403 lines, 20 `overrides` mixins) exist to make
Material look like the design tokens, and `CLAUDE.md` lists the fights:
`!` utilities where Material wins, tokens that cannot be `inherit`, the
tree's three workarounds. That cost is the case for re-deciding the
widget layer, which the maintainer opened ("truly everything").

## 6. Tokens, colour, type

The [Design Tokens format](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
reached its first stable version, 2025.10, on 28 October 2025: themes,
aliases, OKLCH and Display P3 colour, with Style Dictionary, Tokens Studio
and Terrazzo as reference tools. It is a community group report, not a W3C
standard.

Wayfarer's tokens are hand-written CSS (`src/design-system/tokens.css`,
157 declarations) with Apple's naming (`--label-*`, `--canvas-*`,
`--separator`), and contrast is checked by `scripts/contrast.test.mjs`.

## 7. Accessibility

WCAG 2.2 AA is the enforceable standard. WCAG 3 is still a draft, and
APCA was removed from it in 2023 and has not returned
([Adrian Roselli, April 2026](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)).
The plan keeps 2.2 AA as the bar (maintainer, 2026-10-14) and may report
APCA values as information only.

## 8. AI in a local-first tool

Patterns that recur in 2026 writing on agent interfaces: show the plan
before acting, ask permission per action, show the change as a diff with
one-step undo, and keep a log of what the agent did
([AYDesign](https://www.aydesign.ai/blog/ai-agent-ux-design-patterns-2026),
[agentic-design.ai](https://agentic-design.ai/patterns/ui-ux-patterns)).
None of the sources is a usability study.

Two browser routes exist besides a user's own API key:

- **Chrome's Prompt API** runs Gemini Nano on the device. Secondary
  sources say web pages may use it from Chrome 148; Chrome's own page
  lists 138 and 148 without saying so plainly
  ([Chrome docs](https://developer.chrome.com/docs/ai/prompt-api)).
  Reported requirements: desktop Chrome, 22 GB of free disk, a GPU with
  more than 4 GB of memory. One report says the 4 GB model downloads
  without asking, which may matter to the privacy-bound user.
- **WebMCP** lets a page offer tools to an agent in the browser. It is a
  proposal with an early preview in Chrome and an origin trial reported
  from Chrome 149 ([Chrome docs](https://developer.chrome.com/docs/ai/webmcp)).
  For an API client this is the reverse direction: the user's agent could
  drive Wayfarer.

Nielsen Norman Group's findings on AI features, as reported second-hand:
people overlooked Google's AI Mode or did not know it was there, and got
lost in blocks of generated prose. Discoverability is the open problem.

## 9. Teams without a server

The maintainer chose all four ways to share: Git, peer-to-peer sync, a
self-hosted server, and files and links. Facts that bound them:

- `showDirectoryPicker` (a folder on disk) is in Chromium only; Firefox
  and Safari have none ([web.dev](https://web.dev/articles/files/open-a-directory)).
  Git as the store therefore needs Chromium, the Local Bridge, or a
  desktop shell. Phase D1 decides (maintainer, 2026-10-14).
- CRDTs make copies converge; they do not keep what each person meant
  ([Ink & Switch, 2019](https://www.repository.cam.ac.uk/handle/1810/297581)).
  A request edited in two places needs a conflict screen even when the
  data merged cleanly.

## 10. The website

The rivals' pages share one layout: hero line, Download, a screenshot,
logos, a feature list, testimonials, a second Download, a FAQ. The one
analysis of developer-tool home pages found ([Hackmamba](https://hackmamba.io/developer-marketing/developer-tool-homepage-examples/))
credits Linear for showing the product in the hero instead of describing
it. Claims that interactive demos double engagement come from vendors of
demo tools and are unverified.

`llms.txt` is cheap to add. Google has said it does not use it, and no
primary study shows it brings citations.

For hosting, Cloudflare Workers static assets can serve one directory
under a path (`/app/*`) with its own single-page fallback; it needs
Wrangler 3.98 or later ([Cloudflare docs](https://developers.cloudflare.com/workers/static-assets/)).

## 11. Wayfarer today, as measured

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
