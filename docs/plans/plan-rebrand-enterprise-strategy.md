# Plan: Rebrand & Enterprise-Grade Market Position

> **Audience:** founder/solo maintainer making brand, architecture, and business-model calls.
> **Status:** proposal, grounded in a full repo audit + live 2026 market/competitor/community research + naming-collision testing. July 2026.
> **Retire this file** once Parts D–H ship (rebrand live, hybrid architecture shipped, enterprise trust surface published). Fold anything still open into the issue tracker at that point, the same way `plan-feature-audit.md` was retired.
> **Relationship to sibling docs:** `plan-product-roadmap.md` and `plan-specimen-modernization.md` already own the feature backlog and the engineering/security/UX debt respectively — this document does not repeat their item lists. It owns three things neither of them covers: **who we are** (name, language, identity), **what shape the product takes** (browser-native vs. hybrid architecture), and **how we survive contact with the enterprise buyer** (compliance, business model, trust). Where this doc's roadmap touches theirs, it cross-references by section number instead of duplicating.

---

## Executive Summary

The underlying product is good — better than its packaging admits. It has a real, working local-first architecture (IndexedDB, an actually-encrypted secrets vault, sandboxed scripting, a response-timing waterfall no competitor ships), a security incident that was found and closed on its own initiative, and a design system with real craft in it. What it doesn't have is a brand: it is named after its own category ("API Sandbox," a description, not a name), it ships under a personal GitHub byline rather than an independent product identity, and it has zero surface area — no pricing page, no trust center, no compliance story — for anyone evaluating it past the "solo developer's side project" tier.

2026 handed this category a rare, dated opportunity: Postman's March 2026 pricing overhaul killed free-tier collaboration outright (a 3-person team went from $0/year to ~$684/year overnight), and it landed on top of lingering, well-documented trust damage from Insomnia's 2023–24 forced-account update and Thunder Client's stealth paywalling. Developers are actively searching for a replacement *right now*, and — per the community research in Part A — what they say they want is exactly this project's existing architecture: no account, no cloud requirement, real Postman-collection import, and a name and story they can trust not to pull the same move in 18 months.

This document is the rebrand-and-professionalization plan to go claim that opening. It covers: a fully-researched name change (eight candidates tested for collision, one survives cleanly), a voice/visual identity evolution (not a teardown — the existing "Obsidian" design system is already close to 2026's dominant dev-tool aesthetic), a hybrid architecture that stays browser-native everywhere except the handful of capabilities that structurally require a server (and makes every one of those opt-in, never a gate on data you already own), and an enterprise-readiness plan (SSO, SCIM, audit logging, self-hosting, SOC 2) sequenced so it never compromises the "your data never leaves your device" promise that's the actual product.

---

## Part A — Research Ledger: 2026 Market & Community Truth

This section is the evidence base. It was gathered from three independent live-web research passes (market/competitive landscape, developer community sentiment, and branding/naming precedent) conducted July 2026, plus first-hand collision testing against eight candidate names. Confidence level and sourcing gaps are flagged inline, per the research agents' own disclosures — treat unflagged claims as well-corroborated across multiple sources, and flagged ones as directional.

### A1. Market sizing

| Segment | 2026 estimate | Growth | Confidence |
|---|---|---|---|
| API testing tools market | $1.7B–$3.0B (analyst estimates disagree by ~2x) | ~20–26% CAGR | Directional only — no single authoritative primary source found; commercial market-research firms disagree by 3–4x on absolute size |
| API testing market (alt. estimate) | $8.24B by 2030 | 12.1% CAGR | Same caveat |
| Broader API management market | $6.9B–$8.9B | 16.8%–31.8% CAGR to 2030 | Same caveat |
| AI-augmented testing adoption | 80% of enterprises by 2027 (Gartner, cited secondhand) | — | Secondhand citation, not verified against the primary report |

**Read:** nobody tracks "desktop/browser API client" as its own line item — it's a rounding error inside larger API-management/testing figures. Don't build a business case on the absolute TAM number; build it on the displacement event in A3, which is concrete, dated, and independently corroborated.

### A2. Competitor state, as of mid-2026 (supersedes the market map in `plan-product-roadmap.md` §1, written May 2026 — that table predates the March 2026 Postman pricing overhaul's full community fallout and several since-confirmed funding/acquisition events below)

| Tool | Funding/status | Current pricing | 2026 development |
|---|---|---|---|
| **Postman** | ~$3.2–3.6B secondary valuation (down from $5.6B 2021 peak); acquired Fern (Dec 2025/Jan 2026) | Free (solo only, 50 AI credits) / Solo $9 / Team $19 / Enterprise $49 per user/mo | Killed free-tier collaboration (see A3); "Everything App" strategy — AI Engineer autonomous agent, full MCP support, AI Tool Builder — bundled into the same Electron app. 10–15s cold starts on mid-range hardware are now a cited complaint, on top of the pre-existing bloat criticism. |
| **Insomnia (Kong)** | — | $5–$45/user/mo, another increase scheduled Aug 2026 | 8.0's forced-login update (2024–25) triggered a documented "enshittification" backlash (GitHub Kong/insomnia#6577); partially reversed in 8.3. The backlash explicitly framed this as "the same move that made Insomnia the Postman-refugee destination, now happening to Insomnia" — direct precedent for anyone claiming the local-first mantle: the claim has to be structural, not just marketing. |
| **Bruno** | Bootstrapped, explicitly no-VC as a stated position | Free / Pro $6 / Ultimate $11 per user/mo | Widest-cited beneficiary of the Postman pricing backlash. No AI features at all — a real product gap, and arguably also a trust position some users prefer. |
| **Hoppscotch** | $3M seed (OSS Capital, 2021) | Free / Org $6 / Enterprise Cloud $45 per user/mo; separate quote-only self-hosted Enterprise Edition | MIT-licensed community edition, genuinely self-hostable. Basic free-tier AI suggestions. |
| **Yaak** | Disputed — GitHub/founder messaging says no-VC; PitchBook lists $10.6M raised. Unresolved. | Free MIT source, paid license for prebuilt binaries at 2+ commercial users | Made by Insomnia's original creator; closest philosophical peer. Its "open source but the binaries aren't" positioning drew real community confusion (Lobsters: "Why Yaak is not open source") — **the single most directly applicable lesson for our own licensing language: ambiguity about what's free/open/local gets called out fast in this exact audience.** |
| **Thunder Client** | — | Free (30 runs, non-commercial) / $49/yr solo / ~$3–7/user/mo team | Paywalled previously-free features (including SSE) after building a userbase on "free VS Code extension" — cited explicitly as a switching trigger. |
| **RapidAPI / Paw** | Acquired by **Nokia, Nov 2024, ~$106M** — ~90% down from the 2022 $1B valuation | Paw still maintained | Effectively removed as a competitor; Nokia is repurposing the marketplace for telco/5G network APIs, not developer tooling. |
| **Apidog** (new "third force") | Bootstrapped | $9–$27/mo | Free AI at every tier (direct contrast to Postman gating AI behind credits); full lifecycle (design/mock/test/docs) in one tool; explicit Postman/Swagger migration targeting. |
| **Voiden, Requestly, Keploy, HTTPBot** (emerging) | Various, early | Various | Markdown/git-native workspaces, non-Electron lightweight clients, traffic-based auto test generation. Signal: the "local-first API workspace" niche is getting crowded, not staying open — the window is now, not in 18 months. |

### A3. The Postman pricing shock — the dated opportunity

Effective **March 1, 2026**, Postman's Free tier became single-user only — team/shared-workspace collaboration on Free was removed entirely. A 3-person team's cost went from **$0 → ~$684/year** overnight. This produced an immediate, visible spike in "Postman alternative" search activity and multiple dev.to/Medium posts titled things like *"Postman's New Pricing Is a Trap."* This is a dated, named, independently-reported event — not a vague "market trend" — and it is the single strongest reason to move on this rebrand now rather than on a leisurely timeline. Every week of delay is a week competitors (Bruno, Apidog, Hoppscotch) are capturing displaced Postman users who we have a structurally better answer for (see A6/A7).

### A4. AI-native features & MCP — fast-moving, but already crowded

Postman's core 2026 bet is agentic/AI: an autonomous "AI Engineer" that generates collections/tests/specs from a PR or Slack trigger, full first-class MCP request support (STDIO + streamable HTTP transports), and an AI Tool Builder that generates MCP servers from existing specs. Apidog and Hoppscotch both ship lighter AI features free-tier.

**Important finding, not to be glossed over:** Anthropic's own **MCP Inspector** is already, in the ecosystem's own words, "Postman for MCP" — a free, official, purpose-built tool for testing MCP servers. Building generic "we can test MCP servers too" is not a differentiator; that specific ground is already covered by a free tool from the protocol's own maintainer. **The differentiated angle, if we pursue MCP/LLM-API testing at all, is the privacy axis specifically: test MCP servers and LLM API calls without prompts, tool arguments, or API keys ever transiting a third-party cloud** — combining the AI-testing use case with the thing we can uniquely claim (nothing leaves the device unless the user's own request target requires it). Any AI feature we build ourselves (see Part E3) must be BYOK (bring-your-own-key) for exactly this reason — it's not just an engineering choice, it's the only AI positioning that doesn't contradict the brand.

### A5. Enterprise procurement requirements (synthesized from B2B SaaS compliance-consultancy sources — well-corroborated across sources, no single canonical study found)

- **True federated SSO** (SAML 2.0 and/or OIDC against the buyer's own IdP — Okta, Entra ID, Google Workspace, Ping), not social login. Requires domain verification and both SP- and IdP-initiated flows.
- **SCIM 2.0** for automated provisioning/deprovisioning — buyers treat this as inseparable from SSO, not an add-on.
- **Centralized audit logging** — auth events, admin actions, 90–180 day retention *enforced*, with working alerts, not just "available."
- **SOC 2 Type II** report covering 6–12 months of control effectiveness — treated as the baseline procurement gate in North American B2B, more than any visual rebrand element.
- **Granular RBAC** beyond admin/member.
- **Self-hosted/on-prem option** — a genuinely split market (Bruno has none; Hoppscotch and Bitwarden do). **This is where a local-first architecture has a structural, not marketing, advantage** — we already have zero backend for the core product; self-hosting the *optional* sync/enterprise layer is a much smaller lift for us than it is for a cloud-native competitor re-architecting backwards into on-prem.

### A6. Local-first monetization precedent (adjacent categories)

| Tool | Free core | What's paid | Price |
|---|---|---|---|
| Obsidian | Full app, local files, no account | Sync, Publish | Sync $4/user/mo; Publish $8–10/site/mo |
| Bitwarden | Unlimited passwords/devices | Premium, Teams, Enterprise (SSO, self-host) | Premium $1.65/mo; Teams $4/user/mo; Enterprise $6/user/mo |
| Tailscale | Personal, ≤6 users, unlimited devices | Standard/Premium, SSO | $8–18/user/mo |
| Standard Notes | Full E2E-encrypted notes | Extra editors, history, cloud files | $90–120/yr |
| Cryptee | Starter tier | Storage tiers | $3/mo–… |

**Universal pattern:** the core "your data, fully functional, offline" promise is *never* the paid tier — monetization attaches only to things that cost the vendor ongoing money (sync infra, hosting, support SLA) or that only matter at team/org scale (SSO, SCIM, audit). Bitwarden's underdog pricing (25–50% below 1Password/LastPass, explicitly because it's open-source/self-hostable) proves "structurally cheaper because we don't run your cloud" is a durable competitive lever, not just a talking point. This directly informs Part G.

### A7. Community truth — what actually breaks trust, what triggers switching

Well-corroborated across HN, Lobsters, GitHub issue threads, G2/Capterra, and dev.to/Substack coverage:

- **The trigger is always a dated, specific event**, not gradual annoyance: Postman removing Scratch Pad (2023), Insomnia 8.0's lockout (2024–25), Thunder Client's paywall, Postman's March 2026 free-tier collaboration removal. In every case it's *previously-free/local functionality retroactively gated*, not a slow accumulation of gripes.
- **Losing access to your own already-created local data is the single most viscerally angering trigger** found in the research — more than price itself.
- **Compliance-driven exits are real and organizational, not individual**: regulated teams (fintech, healthcare) describe being *institutionally blocked* from a tool the moment cloud sync stopped being optional — a security-review failure, not a preference.
- **Git-workflow mismatch** is a recurring structural complaint: teams living in PR-review culture find proprietary workspace formats a friction point; Bruno's plain-text `.bru` format is repeatedly cited as solving this specifically. (We store in IndexedDB, the functional opposite of this — flagged again in Part C as our single biggest structural gap versus our closest philosophical peer, consistent with `plan-specimen-modernization.md` Part C's P0 finding.)
- **Enterprise/team language vs. solo/indie language is a clean bifurcation**: enterprise buyers talk governance and recurring cost (per-seat pricing, RBAC, compliance docs, cancellation friction); solo/indie users talk autonomy and trust (speed, no account, "structurally cannot rug-pull me," explicit rejection of VC-backed tools as a category). Messaging must speak both languages without contradicting either — see Part C2.
- **Ambiguous open-source claims get called out fast** (the Yaak precedent, A2) — our own language must be exact about what's free-forever, what's open-source (and under which license), and what's a paid add-on, every time, everywhere.
- **Naming reactions specifically:** the research could not find direct developer commentary on tool *names* themselves (a genuine gap, flagged by the research agent, not a null result to trust blindly) — treat Part D's naming decision as evidence-informed on *category patterns*, not on measured reaction to specific candidate words.

---

## Part B — Strategic Diagnosis: Where We Actually Stand

Cross-referencing the codebase audit already on file (`plan-specimen-modernization.md` Parts A–D) against the research above:

1. **The architecture is already the right answer to a dated market event we didn't know was coming.** No-account, no-cloud, encrypted-local-secrets, sandboxed scripting — this is almost exactly what displaced Postman users say they want (A3, A7). We are not behind on philosophy; we're behind on **everyone knowing this exists and trusting it enough to switch.**
2. **The name is the single biggest thing actively working against us.** "API Sandbox" is a literal category descriptor (Part D1's naming research: this is the specific failure mode that caps a brand's growth — see the Stripe/Vercel case studies). It also reads as a personal utility ("a sandbox to try things in"), not a serious tool an engineering org would run a security review on.
3. **There is no brand-independent identity at all.** The README, `package.json`, LICENSE, and every doc byline read "Ashwin Sathian" as the product, not as the maintainer of a product. Every competitor we're being compared against (even bootstrapped ones like Bruno) presents as a product with its own name, its own site, its own visual identity — ours currently does not clear that bar.
4. **We have zero enterprise trust surface.** No pricing page (because there's no business model at all yet), no trust/security center, no self-hosting story, no compliance roadmap — meaning even though the *architecture* has a structural self-hosting advantage (A5), nobody evaluating us for procurement would currently find that fact anywhere.
5. **The IndexedDB storage model is the one place our architecture is philosophically behind our closest peer, not ahead** — Bruno's git-native plain-text format is the single most-cited love-driver in the entire category (A7), and it's the opposite of what we do today. This is already tracked as a P0 item in `plan-specimen-modernization.md` Part C — this document does not re-litigate it, but the rebrand's messaging must not overclaim "git-friendly" until that ships.

None of this is a reason for a from-scratch rewrite. It's a reason to give a genuinely good product the identity, trust surface, and (very selectively) the server-side pieces it currently lacks — without touching the thing that makes it worth rebranding in the first place.

---

## Part C — Positioning: The New Thesis

### C1. Updated positioning statement

The existing statement in `plan-product-roadmap.md` §2 (*"the beautiful, privacy-first API client for developers who refuse to compromise between UX quality and local data ownership"*) is still directionally right but was written before the market handed us a sharper, more urgent frame. Replace it with:

> **[Working name] is the API client that cannot rug-pull you.** Everything you build — requests, collections, environments, secrets — lives on your device by construction, not by policy, so there's no update, acquisition, or pricing page that can lock you out of your own work. When you do need a team, sync, or compliance story, it's an optional layer you turn on, self-host, or ignore — never a gate on data you already own.

The shift from "beautiful, privacy-first" to "cannot rug-pull you" matters: it converts a vague quality claim into a specific, falsifiable, *structural* promise, directly answering the exact trigger events (A7) that have driven the last three years of switching in this category. It also gives the enterprise story a clean entry point ("optional layer you turn on or self-host") that the old statement didn't have room for.

### C2. Speaking to both audiences without contradiction

Per A7's bifurcation finding, messaging needs two entry points into the same architecture, not two different products:

| Audience | Leads with | Proof point |
|---|---|---|
| Solo / indie developer | Autonomy, speed, no account, no telemetry | Open-source core, works fully offline, exportable data in an open format |
| Team / enterprise buyer | Governance, compliance, predictable cost | Self-hostable control plane, SSO/SCIM/audit (Part F), SOC 2 roadmap, per-seat pricing that undercuts Postman by design (Part G) |

### C3. Anti-goals (extends `plan-product-roadmap.md` §2 and the anti-goal already logged in `plan-specimen-modernization.md` Part C)

- ❌ Mandatory account or cloud sync, ever, for any feature that works today without one.
- ❌ Any telemetry, "anonymous" or otherwise.
- ❌ AI features that proxy user data through our infrastructure — BYOK only (A4).
- ❌ Ambiguous "open source" language covering only part of the product (the Yaak lesson, A2/A7) — every doc and pricing page states plainly what's AGPL/MIT/source-available/proprietary, per component.
- ❌ Electron. Still browser-native by default (Part E).
- ❌ A rebrand that erases personality to "look enterprise" — Postman's own brand-refresh precedent (Part D) was to mature its mascot, not delete it. Enterprise credibility here comes from compliance proof points and self-host options, not from a boring visual identity.

---

## Part D — The Rebrand

### D1. Naming

**Framework applied** (synthesized from the Vercel/Stripe/Linear/Postman/Hoppscotch case studies in the research): short (1–3 syllables), passes as both a spoken word and a typed CLI command, avoids literal category words (*API*, *sandbox*, *client*, *tool* — Stripe's lesson: a literal name caps how the brand can grow), and — specific to this category — avoids the now-crowded cute-animal-mascot lane (Bruno, Yaak, Hoppscotch's playground metaphor already own that register; a fourth entrant blends in rather than standing out).

**Eight candidates were tested against live web search for existing product/trademark collisions before converging on a recommendation** — this is reported in full rather than presenting a single name as if it emerged cleanly, because the collision-testing process itself is the diligence:

| Candidate | Finding | Verdict |
|---|---|---|
| Outpost | Direct collision: **Outpost24**, an established API security testing SaaS company — same category | Reject |
| Latch | Direct collision: **Latch Inc.**, NYSE-listed smart-building/access-control company | Reject |
| Signet | Direct collision: an existing identity-verification API product (getsignet.xyz) — same dev-tool/API space | Reject |
| Quill | Heavy collision: QuillJS (editor), Quill.co (reporting API), getquill.dev (dev tools) — multiple, same space | Reject |
| Waypost | Collision: an existing small OSS feature-flag tool with near-identical "local-first, data never leaves your hands" positioning | Reject |
| Truss | Collision: Baseten's `truss` (well-known OSS ML-deployment tool) and truss.works — same broad dev-tool category | Reject |
| Wayforge | Collision: **Wayforge™**, an actively-marketed, trademarked AI GTM platform | Reject |
| **Wayfarer** | Soft collisions only, **none in developer tools/API testing**: Ray-Ban's eyewear product line (unrelated goods class), Niantic's community-moderation tool for AR landmarks (unrelated market), a couple of tiny unaffiliated student/hobby GitHub projects | **Recommended, pending formal clearance** |

**Recommendation: Wayfarer** (working name for the rest of this document). Reasoning: it's a real English word, not a coined one, which makes it immediately pronounceable and warm rather than sterile — but its only collisions are in industries far enough from developer tooling that likelihood-of-confusion is low. It also carries a metaphor that fits the product without repeating an already-used one: a wayfarer travels *routes* — API *routes/endpoints* — deliberately, prepared, checking the path ahead. That reads as capable and calm rather than cute, which is the register the branding research flags as the right one for a dev tool courting enterprise buyers without losing its indie credibility: mature the personality, don't sterilize it.

**This is a recommendation, not a cleared name.** Before any public commitment:
1. Run a formal search on **USPTO TESS** (tmsearch.uspto.gov) for "Wayfarer" and close phonetic neighbors, in software/SaaS classes (Class 9 and 42) specifically — a casual web search is not a substitute for this, and international classes matter if there's any EU/UK go-to-market intent.
2. Confirm simultaneous availability of: the GitHub org name, the npm scope, `wayfarer.dev` and `wayfarer.com` (or an acceptable alternate TLD pairing), and the primary social handles — per the research, securing all of these together (not just the domain) is what prevents a later name-squatting dispute.
3. Have a **backup name ready before locking a launch date**: if Wayfarer fails clearance, the next candidate to test with the same framework is a genuinely coined (not dictionary) word in the Stripe/Vercel mold — coined words carry inherently lower collision risk because they have no prior meaning to collide with, at the cost of needing more marketing effort to imbue meaning. Do not default back to another dictionary word under time pressure; the eight-candidate exercise above shows how fast those collide.

### D2. Tagline & elevator pitch

- **Tagline:** *"The API client that can't rug-pull you."*
- **One-line:** *"Wayfarer is a local-first API client — no account, no cloud, no catch. Everything lives on your device; sync and team features are optional, self-hostable, and never a gate on data you already own."*
- **Elevator pitch (for a landing page hero):** *"Postman needs your login. Insomnia needed one too, until it didn't need to. Wayfarer never will. Compose requests, chain them with scripts, encrypt your secrets, and own every byte — all in your browser, all offline-capable, all yours."*

### D3. Voice & tone guide

Grounded in A7's clearest lesson (precision about what's free/open/local prevents the exact confusion that damaged Yaak) and the "technical but warm" tension the visual-trends research names explicitly:

| Do | Don't | Why |
|---|---|---|
| State exactly what's free, forever, and why ("free because it costs us nothing to run — it's on your device") | Say "free" without qualifying scope | Yaak precedent (A2) — ambiguity here is the fastest way to lose this specific audience's trust |
| Use plain, declarative sentences about data location ("stored in your browser's IndexedDB, never transmitted") | Use marketing euphemisms ("your data, your way") | Precision reads as engineering credibility (Linear's lesson) |
| Let error messages be specific and calm ("Request failed: DNS lookup for api.example.com did not resolve") | Ship generic or leaky messages (the current `{"isTrusted": true}` bug logged in `plan-specimen-modernization.md` Part D is the anti-example) | Trust is rebuilt in the small moments, not just the marketing copy |
| Keep a little personality in empty states and onboarding copy | Strip all voice out to "look enterprise" | Postman's own brand refresh matured its mascot rather than deleting it — sterilizing personality is not what enterprise credibility actually requires (SOC 2 + self-host does that work instead) |

**Before/after example** (README opening line):

- *Before:* "A focused, fast, and friendly web app for trying APIs without the overhead of a full‑blown client."
- *After:* "Wayfarer is a local-first API client. No account. No cloud. No telemetry. Everything — requests, collections, secrets — lives in your browser, encrypted at rest, exportable any time. When you outgrow solo use, sync and team features are opt-in and self-hostable, never a requirement."

### D4. Visual identity — evolve, don't discard

The existing "Obsidian" design system (`src/design-system/tokens.css`) is closer to 2026's dominant dev-tool aesthetic than a from-scratch redesign would be — dark-mode-first, OLED-true-black elevation stack, restrained fills — and the research confirms dark-first + tinted neutrals + a vivid accent is exactly the current standard, not something to abandon. Three specific changes, not a teardown:

1. **Replace the literal Apple System Blue accent (`--accent: #0A84FF`) with an ownable hue.** The current token comment reads *"more premium than indigo, immediately reads as native Apple quality"* — that's precisely the problem: it reads as *Apple's* quality, not ours. Linear and Warp's lessons both point the same direction: a distinctive, owned accent is part of what makes a brand feel like its own thing rather than a well-executed clone. Recommend prototyping a signature hue adjacent to blue but not identical to iOS system blue (a deeper cyan-leaning or violet-leaning blue tests well against the "technical but warm" 2026 trend the research names).
2. **Introduce a functional monospace pairing for technical surfaces** (request/response chrome, code, timings) distinct from the existing Inter-for-everything approach — the research names this specifically as a 2026 signal ("a return to monospaced or mono-inspired type to align visual rhythm with data logic... function-forward, not retro-kitsch"). `JetBrains Mono` is already referenced in the codebase per the typography header comment; formalize it as a deliberate second type voice, not an afterthought.
3. **Design one unifying visual motif**, per the OpenAI 2025 rebrand lesson the research cites (a single device — their "the point" — built out into a full system, specifically to fix a previously ad hoc identity). For Wayfarer, a route/waypoint mark (a simple dot-on-a-line glyph) is the natural candidate: it works as a favicon, a loading-state animation, an empty-state illustration anchor, and a wordmark lockup, and it reinforces the naming metaphor instead of introducing a second, unrelated one.

Keep: the OLED-true elevation stack, the restrained fill/label system, the intentionally-separate (not inverted) light theme, the spring-easing motion tokens already in `animations.css`. These are real assets, not baggage.

### D5. Rename migration checklist

A repo-wide scan (`grep -ril "api.sandbox"`, excluding build/dependency output) found the current name embedded in **30 files**. Sequencing matters — some of these are cosmetic strings, some are live data contracts:

**Low-risk (string/copy changes only):**
`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/*.yml`, `docs/*.md`, `src/index.html` (`<title>`, meta description), `public/manifest.webmanifest` (`name`/`short_name`), favicon/app icons (regenerate from the new mark, Part D4). Also: `src/app/components/app-shell/app-shell.component.{ts,html}`, which renders the product name in the on-screen toolbar/header — this is the single most user-visible occurrence in the whole list and should be verified by eye in the running app, not just grepped. The five `src/design-system/*.css` files carry the old name only in file-header comments (design-system authorship notes) — update for accuracy but they carry no runtime/user-facing effect.

**Build/infra identifiers (mechanical, but touch CI and deploy — do in one PR, verify build+deploy end-to-end):**
`package.json` (`name`, `homepage`, `repository`, `bugs`), `package-lock.json` (regenerate), `angular.json` (project name `api-sandbox` → new, `dist/api-sandbox` output path), `karma.conf.js` (coverage dir path), `wrangler.jsonc` (Worker `name`, custom domain — **requires a new domain purchase + DNS cutover + a 301 redirect from `api-sandbox.ashwinsathian.com`, not a silent swap**), GitHub repo rename (GitHub auto-forwards the old URL, but update every doc link regardless — don't rely on the forward long-term).

**Data-contract identifiers — handle with care, these are either live user data or versioned external contracts:**
- `src/app/data/idb-core.service.ts`: `DB_NAME = "api-sandbox"`. **Recommendation: do not rename the physical IndexedDB database.** It's an internal implementation detail invisible to users; renaming it means writing and testing a data-migration path (copy every store to a new DB name) for zero user-facing benefit and real risk of data loss during the copy. Change only user-facing strings; leave the physical DB name as a documented historical artifact (a one-line code comment explaining why is enough).
- `src/app/services/theme.service.ts`: `STORAGE_KEY = "api-sandbox:theme"`. Same reasoning — internal key, not user-facing, leave it or migrate trivially (read old key once, write new, since it's a single scalar with no loss risk if this one *is* changed).
- `src/app/shared/collections/collection.schema.ts`: `$id: "https://api-sandbox.dev/schemas/..."`. These are **public, versioned JSON Schema identifiers referenced by exported collection/environment files already in the wild.** Do not silently change the `$id` of the existing schema version — mint a *new* `$id` under the new domain for the next schema version, and keep the old `$id` resolvable (even as a static redirect) so previously-exported files still validate against a live schema reference.
- `src/app/shared/inspect/export.util.ts`: `HAR_CREATOR = { name: "API Sandbox", version: "0" }`. Safe to update — this is metadata written into *newly generated* HAR exports going forward, not a reference to existing ones.

**Sequencing:** low-risk copy changes and the visual identity (D4) should ship together as the public "launch day" commit. Build/infra identifiers should land in a separate, quiet PR beforehand (verified against a full CI + preview-deploy cycle) so the launch-day PR is pure brand, not also debugging a broken Worker deploy. Data-contract identifiers are handled as their own reviewed change, per the notes above, ideally *before* launch day so there's no window where exported files reference a dead domain.

### D6. Launch sequencing

1. Name clearance + domain/org/npm acquisition (D1, blocking everything else).
2. Infra rename PR (quiet, verified end-to-end).
3. Visual identity production (logo, icon set, updated design tokens, social preview/OG images, updated screenshots in every doc).
4. Copy rewrite across README/docs/site to the new voice (D3).
5. A short, honest changelog/announcement post explaining the rename **and explicitly naming the Postman/Insomnia precedent** ("we're changing our name, never our storage model — here's what that means and why we're saying it out loud") — turning the rename itself into a trust-building moment rather than a cosmetic footnote, directly answering A7's finding that this exact audience rewards structural, dated, specific claims over vague reassurance.

---

## Part E — Architecture Vision: Browser-Native, Hybrid Only Where It Must Be

The mandate ("browser-native as much as possible, except obvious cloud/server cases") maps cleanly onto what already differentiates this product. This section draws the line explicitly rather than leaving it implicit.

### E1. Stays 100% client-only — no exceptions, no roadmap item changes this

Request composer, response viewer, collections, environments, history, the secrets vault, pre/post-request scripting, and test assertions all continue to run entirely in-browser (IndexedDB + Web Crypto + Web Workers), exactly as today. This is the non-negotiable core of the brand promise in Part C1 — none of what follows touches it.

### E2. The one structural, non-cloud exception: CORS, and the Local Bridge

Browsers cannot bypass CORS by policy — this is not a gap in our engineering, it's a browser platform constraint that *every* pure-browser API client hits, and it's the specific, obvious reason a fully browser-native tool sometimes cannot reach an intranet-only or CORS-restrictive API. Electron-based competitors (Insomnia, Postman desktop, Bruno desktop) sidestep this simply by not being sandboxed like a web page; a PWA does not get that for free.

**Answer: an optional, thin, open-source "Local Bridge"** — a small companion process (not a browser extension necessarily; could be a tiny native binary or a browser extension, evaluated during design) that the user runs only if they need to reach a CORS-restrictive or intranet-only target, acting as a local relay between the browser app and that target. This extends the "Browser Extension" idea already sketched in `plan-product-roadmap.md` §5.4 into a first-class, explicitly-named architectural component rather than a someday idea — it's the literal "obvious case where we need something beyond the browser" the vision statement anticipates, and it stays local (runs on the user's own machine/network), not cloud. Enterprise buyers testing internal, non-public APIs will need this specifically; call it out by name in the enterprise sales story (Part F), not just the roadmap.

### E3. What requires a server — and why each is opt-in, never a gate

| Capability | Why it needs a server | How it stays true to Part C1's promise |
|---|---|---|
| **Sync Relay** (cross-device sync of collections/environments) | Two browsers on two devices cannot talk to each other directly | End-to-end encrypted, zero-knowledge (server relays ciphertext only, same posture as Standard Notes/Bitwarden per A6) — self-hostable Docker image for anyone who doesn't want us holding even encrypted blobs, plus a hosted convenience option for those who do |
| **Team/Enterprise control plane** (SSO/SAML/OIDC, SCIM, centralized RBAC, audit log aggregation, admin console) | Coordinating multiple users/devices/policies is inherently a multi-tenant server concern | Self-hostable for the strictest enterprises (this is where our zero-existing-backend starting point is a genuine advantage over cloud-native competitors re-architecting backwards into on-prem, per A5); never required to use the core product solo |
| **AI features, if built** | Any LLM call leaves the device by definition | **BYOK only** (A4) — we never proxy or retain a user's prompts, tool arguments, or API keys; this is the only AI positioning that doesn't contradict the brand |
| **Billing/license server** | Standard SaaS necessity for paid tiers | Not a "feature," pure business infrastructure; explicitly zero product telemetry attached to it |
| **Marketing/docs site** | Needs public hosting | No functional coupling to the app itself |

**Explicit rule carried forward from `plan-specimen-modernization.md` Part C's existing anti-goal:** any sync/sharing feature must be opt-in *per collection*, never an account gate that blocks access to data that was previously local-only. Every item in this table is designed against that rule from day one, not retrofitted later.

---

## Part F — Enterprise-Grade Product Requirements

Directly answering A5's procurement checklist, sequenced so each item is buildable on top of Part E's control plane without touching Part E1's client-only core:

| Requirement | Detail | Priority |
|---|---|---|
| SSO (SAML 2.0 + OIDC) | Federated against buyer's IdP; domain verification; SP- and IdP-initiated flows | P0 — table stakes for any team-tier sale |
| SCIM 2.0 provisioning | Ships alongside SSO, not after it | P0 |
| Centralized audit log | Auth events, admin actions, config changes; 90–180 day retention enforced; exportable | P0 |
| Granular RBAC | Beyond admin/member — collection-level and environment-level permission scoping | P1 |
| Self-hosted control-plane image | Docker + docs; the sync relay and team control plane both ship as self-hostable, not just cloud-hosted | P0 (this is our structural differentiator per A5 — do not ship cloud-only and add self-host "later") |
| SOC 2 Type II | Begin the audit clock early — a 6–12 month observation period means this needs to start well before the first enterprise deal is expected to close | P1, start early despite lower urgency ranking |
| Public trust/security center page | Publishes the encryption model (already documented in `docs/secrets.md`), the script sandbox model (`docs/scripts.md`), data-residency facts, and (once available) the SOC 2 report | P1 |
| `security.txt` + responsible disclosure | `SECURITY.md` already exists — add the standard `/.well-known/security.txt` for automated scanner discovery | P2, low effort |
| Pre-answered security questionnaire / procurement packet | A standing doc answering the CAIQ-lite questions enterprise security reviewers always ask (data residency, encryption at rest/in transit, subprocessor list, incident history) | P1 |
| Support SLA tiers | Tied to Part G's pricing tiers, not offered free | P2 |

---

## Part G — Business Model & Pricing

Applying A6's universal local-first pattern (core never paywalled; pricing attaches to sync infra and org-scale features) and the Bitwarden lesson (structurally cheaper because there's no cloud-hosting cost baked into the core product):

| Tier | Price | Includes | Never included in a paid tier (the trust contract) |
|---|---|---|---|
| **Core** (free, forever, no account) | $0 | Everything that exists today: composer, collections, environments, secrets vault, scripting, tests, HAR export — full feature set, single device | — |
| **Sync** (individual) | ~$4–5/mo | E2E-encrypted cross-device sync via the relay (hosted or self-hosted) | The core feature set above never moves behind this tier |
| **Team** | ~$6–8/user/mo | Shared collections via the relay (opt-in per collection, per Part E's rule), basic roles | Solo use of the full product remains entirely free regardless of team size elsewhere in the org |
| **Enterprise** | Custom | SSO/SCIM, audit log, self-hosted control plane, SOC 2 packet, support SLA | — |

Positioned to undercut Postman ($19 Team / $49 Enterprise) and land at or below Bruno ($6/$11) and Hoppscotch ($6/$45) — deliberately, per A6's Bitwarden precedent that "cheaper because we don't run your core-product cloud" is a real, sustainable lever, not just a launch promo.

---

## Part H — Itemized Execution Plan

Phases are ordered by dependency, not by calendar necessity — R0 blocks everything; R1–R3 can run in parallel; R4–R6 depend on R0–R3 being live. This sequencing assumes the engineering stabilization work already tracked in `plan-specimen-modernization.md` Phase 0 (script sandbox fix, CI, license) is complete before **R7 (public launch)** — confirmed done per `CHANGELOG.md`'s `[Unreleased]` entry as of this writing, so R7 is not currently blocked on it, but re-verify at launch time rather than assuming it stays true.

> **Status note (2026-07-21):** `CHANGELOG.md` records a `[1.0.0]` release dated 2026-07-21 titled
> "renamed from API Sandbox to Wayfarer," and the checkmarks below were re-verified directly against
> source rather than carried forward. **R0's own checkboxes are still unchecked as of this writing** —
> there is no in-repo evidence the formal USPTO/domain/org/npm clearance steps were actually run before
> the rename shipped. That may be true and simply undocumented, or the rename may have shipped ahead of
> full clearance; either way, **do not assume R0 is satisfied — confirm directly with whoever ran it**
> before treating the name as locked for anything beyond internal use (this is exactly the kind of gap
> a future trademark dispute would turn on).

### Phase R0 — Name & legal clearance (blocking, target: 1–2 weeks)
- [ ] Run formal USPTO TESS search on "Wayfarer" + phonetic neighbors, Classes 9 & 42 — **unverified, likely still open** (see status note above)
- [ ] Confirm simultaneous domain (.dev + .com or equivalent pairing), GitHub org, npm scope, and social-handle availability — **open**: no new domain is live yet (see R2 below), the app still serves from `api-sandbox.ashwinsathian.com`
- [ ] Have the coined-word backup path (D1) ready in case of clearance failure
- [ ] Final go/no-go on the name before any asset production begins — asset production (R1) has already happened, so this is retroactive if not yet done

### Phase R1 — Brand identity production (parallel with R2/R3, target: 2–3 weeks)
- [x] Logo/glyph system built around the one unifying motif (D4.3) — route/waypoint glyph shipped, replacing the old mark (`CHANGELOG.md` [1.0.0])
- [x] Updated design tokens: new accent hue (D4.1) — "Wayfarer Indigo" replaced iOS System Blue in both themes, per `CHANGELOG.md` [1.0.0]
- [ ] Formalized monospace pairing (D4.2) — not confirmed as a deliberate, documented second type voice; re-verify against `src/design-system/tokens.css`
- [x] Full icon set, favicon, OG/social preview images regenerated — confirmed, `CHANGELOG.md` [1.0.0] plus `apple-touch-icon`
- [ ] Voice & tone guide (D3) written up as a living doc, not just this section — still only exists as D3 in this file
- [ ] Marketing/docs site skeleton reflecting the new name and positioning (C1) — no separate marketing site exists; the repo/README is the only public surface today

### Phase R2 — Codebase & infra rename migration (parallel with R1, target: 1 week)
- [x] Low-risk copy changes (D5) across README/docs/CONTRIBUTING/SECURITY/CODE_OF_CONDUCT/issue templates — confirmed
- [x] Build/infra identifier rename PR (`package.json`, `angular.json`, `wrangler.jsonc`, `karma.conf.js`) — confirmed, all read `"wayfarer"` now; CI is green against this config
- [x] Data-contract handling per D5 — confirmed exactly as specified: `DB_NAME = "api-sandbox"` left unchanged in `idb-core.service.ts` (documented in `docs/storage.md`); `theme.service.ts` reads the new `wayfarer:theme` key with a fallback read from the legacy `api-sandbox:theme` key; `HAR_CREATOR` updated to `"Wayfarer"`. **One item not yet done:** `collection.schema.ts`'s two JSON Schema `$id`s still point at `https://api-sandbox.dev/schemas/...` — this is arguably correct as-is until a real `wayfarer.dev`-class domain exists to version forward to (see R0), but it means this sub-item is blocked on R0/domain acquisition, not forgotten.
- [x] Domain cutover: `wayfarer.ashwinsathian.com` is live (`wrangler.jsonc`'s route updated, deployed as a Worker with static assets — see `docs/plans/plan-specimen-modernization.md`-adjacent note below on why Workers-with-assets rather than the legacy Pages product). **No 301 redirect from `api-sandbox.ashwinsathian.com` was added**: that route was never actually deployed (confirmed directly against the account — no Worker existed at all before this cutover), so there was no live traffic to redirect away from. GitHub repo rename to match — still unverified from within the repo, confirm directly.

### Phase R3 — Trust & compliance foundation (parallel with R1/R2, target: ongoing, starts now)
- [x] Publish trust/security center page (F) — [`docs/trust-center.md`](../trust-center.md)
- [x] Add `/.well-known/security.txt` — [`public/.well-known/security.txt`](../../public/.well-known/security.txt)
- [x] Draft the pre-answered procurement security questionnaire — [`docs/security-questionnaire.md`](../security-questionnaire.md)
- [ ] Start the SOC 2 Type II observation clock (F) — this is the longest-lead item in the entire document; starting late is the single most common reason enterprise deals stall a year later. Not an engineering task — requires selecting an auditor and is intentionally left for the maintainer's follow-up, same as R0's trademark clearance.

### Phase R4 — Sync Relay + individual/Team tiers (depends on R0–R2, target: 1–2 quarters)
- [ ] Build the E2E-encrypted sync relay (self-hostable Docker image + hosted option)
- [ ] Wire opt-in, per-collection sharing (never account-gated, per the standing anti-goal)
- [ ] Ship billing (Part G tiers)

### Phase R5 — Enterprise control plane (depends on R4, target: 1–2 quarters after R4)
- [ ] SSO (SAML/OIDC) + SCIM
- [ ] Centralized audit log with enforced retention
- [ ] Granular RBAC
- [ ] Self-hosted control-plane image + docs

### Phase R6 — Local Bridge companion (can run parallel to R4/R5, target: 1 sprint once designed)
- [x] Design decision: native binary vs. browser extension (E2) — shipped as a
      zero-runtime-dependency Node CLI (`local-bridge/`) instead of either;
      avoids both a native-toolchain build matrix and a browser-extension-store
      publishing/review dependency, while staying trivially auditable (no
      third-party packages in the dependency tree at all).
- [x] Ship as its own small, separately-versioned, open-source component —
      [`local-bridge/`](../../local-bridge) (own `package.json`, MIT via the
      root [`LICENSE`](../../LICENSE), own `node --test` suite, own CI job).
- [x] Document explicitly as the answer to CORS/intranet API testing in
      enterprise sales material (F) — referenced from
      [`docs/trust-center.md`](../trust-center.md) and
      [`local-bridge/README.md`](../../local-bridge/README.md); app-side
      settings UI ships in this same change so it's usable, not just
      documented.

### Phase R7 — Go-to-market launch
- [ ] Re-verify `plan-specimen-modernization.md` Phase 0 items are still green (security fix, CI, license) — don't launch attention on top of a regression
- [ ] Publish the rename/announcement post (D6.5)
- [ ] Coordinated launch across the new domain, repo, and social presence

---

## Part I — Risks & Anti-Goals

Each entry maps directly to a dated precedent from Part A, so "why we won't do this" has a name and a date attached, not just a principle:

| Risk | Precedent it echoes | Mitigation |
|---|---|---|
| Making any sync feature account-mandatory later | Insomnia 8.0 (2024–25), Postman's Scratch Pad removal (2023) | Structural: the standing anti-goal (Part E3) is enforced by the sync relay's own design (opt-in per collection), not just a policy |
| Ambiguous "open source" claims on paid components | Yaak's licensing confusion (A2) | Every doc and pricing page states license per component, explicitly, every time |
| Paywalling something that was previously free | Thunder Client's SSE paywall, Postman's March 2026 collaboration removal | Part G's tiers are designed so nothing in Core ever moves to a paid tier — this is a one-way door, document it as such publicly |
| AI features that proxy user data | Postman's "AI Engineer" and MCP support (A4) are the direct comparison point once we ship anything AI-adjacent | BYOK-only, stated in Part E3, no exceptions |
| Rebrand that sterilizes personality to look "enterprise" | Contradicts Postman's own brand-refresh precedent (matured the mascot, didn't delete it) | Voice guide (D3) explicitly preserves personality in non-compliance-facing copy |
| Launching the rebrand before engineering stabilization is verified | N/A — self-inflicted risk | R7's explicit re-verification step against `plan-specimen-modernization.md` Phase 0 |
| Treating self-hosting as a "someday" enterprise feature | Every cloud-native competitor's slower, costlier retrofit | Self-hosted control-plane image ships in R5, not deferred to a later phase |

---

## Part J — Success Metrics

Qualitative, consistent with this project's existing no-telemetry stance (`plan-product-roadmap.md` §9 sets the same precedent):

- **Rebrand:** the new name clears formal trademark search with no unresolved conflicts; every touchpoint in D5's checklist is verified against the live site/repo, not just the plan.
- **Trust:** a security-conscious developer can find the encryption model, the script-sandbox model, and (once published) the SOC 2 report from a single trust-center page without asking a question in a DM — the same bar `plan-specimen-modernization.md` Part H already sets for OSS contribution.
- **Architecture:** a self-hosted deployment of the sync relay + control plane, run by someone who is not the maintainer, succeeds using only published docs.
- **Business model:** the Core tier's feature set has not shrunk from what ships today, one year after monetization launches — the one-way-door promise in Part I holds.
- **Market:** a developer migrating from Postman in direct response to the March 2026 pricing change (A3) can complete that migration — including a Postman-collection import — in one sitting.

---

## Definition of Done

- [ ] Part D shipped: name cleared and live, identity system in production, every D5 touchpoint verified
- [ ] Part E shipped: hybrid architecture live (Sync Relay + Local Bridge), Part E1's client-only core unchanged
- [ ] Part F shipped: SSO/SCIM/audit/self-host/SOC 2 report published
- [ ] Part G live: pricing public, Core tier unshrunk
- [ ] This file retired; any remaining open items moved to the issue tracker, the same pattern used to retire `plan-feature-audit.md`
