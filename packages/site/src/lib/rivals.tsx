// The comparison pages (W2.3 of PLAN-design.md). Every fact about another product here names its source and the date
// it was read; e2e/site.spec.ts holds each page to that. Every sentence about Wayfarer names its claims, or, for a
// fact about the project rather than the app (its licence, its first release), the file that says so.
//
// Read on 2026-11-04, against docs/design/research-2026.md and docs/design/benchmark/rivals.md (both of that day) and,
// where neither had re-read a page, the page itself.
import type { ReactNode } from "react";
import { Claims } from "../components/Claims";
import { SITE } from "./meta";

export interface Source {
  title: string;
  url: string;
  /** When the source was read, as YYYY-MM-DD. */
  read: string;
}

export interface Fact {
  text: string;
  source: Source;
}

export interface Rival {
  id: string;
  name: string;
  /** Its home page, for the page's structured data. */
  url: string;
  /** The page's title after "Wayfarer vs X: ": the difference in a few words. */
  title: string;
  /** One sentence: what it is. */
  is: string;
  /** What the rival's own pages say, each with its source. */
  facts: Fact[];
  /** How Wayfarer differs, each sentence with its claims (or a source, for a fact about the project). */
  differs: ReactNode[];
  /** Where the rival is ahead of Wayfarer, each with its source. */
  ahead: Fact[];
}

const READ = "2026-11-04";
const src = (title: string, url: string): Source => ({ title, url, read: READ });

// Wayfarer's own files, for what is a fact about the project and not a claim about the app.
const LICENSE = src("Wayfarer's LICENSE (MIT)", "https://github.com/AshwinSathian/wayfarer/blob/main/LICENSE");
const FIRST_RELEASE = src("Wayfarer changelog: 0.1.0, 2026-07-20", `${SITE}/changelog/#010---2026-07-20`);

const POSTMAN_HOME = src("Postman home page", "https://www.postman.com/");
const POSTMAN_PRICING = src("Postman pricing", "https://www.postman.com/pricing/");
const POSTMAN_PLANS = src(
  "Postman docs: About plans",
  "https://learning.postman.com/latest-v-12/docs/billing/about-plans",
);
const POSTMAN_CLIENT = src(
  "Postman docs: the lightweight API Client",
  "https://learning.postman.com/docs/getting-started/basics/using-api-client/",
);
const POSTMAN_DOWNLOADS = src("Postman downloads", "https://www.postman.com/downloads/");
const POSTMAN_AGENT = src(
  "Postman docs: About the Postman agent",
  "https://learning.postman.com/latest-v-12/docs/getting-started/basics/about-postman-agent",
);
const POSTMAN_GIT = src(
  "Postman docs: Native Git",
  "https://learning.postman.com/latest-v-12/docs/use/native-git/overview",
);
const POSTMAN_AGENT_MODE = src(
  "Postman docs: Agent Mode",
  "https://learning.postman.com/latest-v-12/docs/use/agent-mode/overview",
);
const BRUNO_HOME = src("Bruno home page", "https://www.usebruno.com/");
const BRUNO_PRICING = src("Bruno pricing", "https://www.usebruno.com/pricing");
const BRUNO_DOWNLOAD = src("Bruno docs: Download", "https://docs.usebruno.com/get-started/bruno-basics/download");
const BRUNO_CHANGELOG = src("Bruno changelog", "https://www.usebruno.com/changelog");
const BRUNO_GIT = src("Bruno docs: Git integration", "https://docs.usebruno.com/git-integration/overview");
const BRUNO_SECRETS = src(
  "Bruno docs: Secret variables",
  "https://docs.usebruno.com/secrets-management/secret-variables",
);
const BRUNO_SECRET_MANAGERS = src(
  "Bruno docs: Secret managers",
  "https://docs.usebruno.com/secrets-management/secret-managers/overview",
);
const BRUNO_MIGRATION = src(
  "Bruno docs: Postman migration",
  "https://docs.usebruno.com/get-started/import-export-data/postman-migration",
);
const BRUNO_AI = src("Bruno docs: Bruno AI", "https://docs.usebruno.com/ai/bruno-ai/introduction");
const BRUNO_REPO = src("usebruno/bruno on GitHub", "https://github.com/usebruno/bruno");
const YAAK_HOME = src("Yaak home page", "https://yaak.app/");
const YAAK_PRICING = src("Yaak pricing", "https://yaak.app/pricing");
const YAAK_DOCS = src("Yaak docs", "https://yaak.app/docs");
const YAAK_PRIVACY = src(
  "Yaak docs: Security and privacy",
  "https://yaak.app/docs/getting-started/security-and-privacy",
);
const YAAK_SYNC = src(
  "Yaak docs: Local directory and Git sync",
  "https://yaak.app/docs/collaboration/local-directory-git-sync",
);
const YAAK_WEB = src("Yaak docs: Yaak Web", "https://yaak.app/docs/getting-started/web-proxy");
const YAAK_MIGRATION = src("Yaak docs: Migrating from Postman", "https://yaak.app/docs/migration/postman");
const HOPP_HOME = src("Hoppscotch home page", "https://hoppscotch.com/");
const HOPP_PRICING = src("Hoppscotch pricing", "https://hoppscotch.com/pricing");
const HOPP_INTERCEPTOR = src(
  "Hoppscotch docs: Interceptor",
  "https://docs.hoppscotch.io/documentation/features/interceptor",
);
const HOPP_SECURITY = src("Hoppscotch security policy", "https://docs.hoppscotch.io/support/security-policy");
const HOPP_IMPORTER = src("Hoppscotch docs: Importer", "https://docs.hoppscotch.io/documentation/features/importer");
const HOPP_RELEASES = src("Hoppscotch releases on GitHub", "https://github.com/hoppscotch/hoppscotch/releases");
const HOPP_REPO = src("hoppscotch/hoppscotch on GitHub", "https://github.com/hoppscotch/hoppscotch");
const INSOMNIA_HOME = src("Insomnia home page", "https://insomnia.rest/");
const INSOMNIA_PRICING = src("Insomnia pricing", "https://insomnia.rest/pricing");
const INSOMNIA_DATA = src("Insomnia docs: Data security", "https://developer.konghq.com/insomnia/data-security/");
const INSOMNIA_ENVIRONMENTS = src("Insomnia docs: Environments", "https://developer.konghq.com/insomnia/environments/");
const INSOMNIA_AI = src("Insomnia docs: AI in Insomnia", "https://developer.konghq.com/insomnia/ai-in-insomnia/");
const INSOMNIA_REPO = src("Kong/insomnia on GitHub", "https://github.com/Kong/insomnia");

export const RIVALS: Rival[] = [
  {
    id: "postman",
    name: "Postman",
    url: "https://www.postman.com/",
    title: "a free API client with no account",
    is: "An API platform with a desktop app and a web app, where a team works in Postman's cloud.",
    facts: [
      {
        text: "The Free plan is limited to one user and can't create a team.",
        source: POSTMAN_PLANS,
      },
      {
        text: "Solo is $9 a month and Team $19 a user a month, both billed yearly.",
        source: POSTMAN_PRICING,
      },
      {
        text: "Signed out, the desktop app has a lightweight client whose work is stored on the machine; collections, environments and variables need an account.",
        source: POSTMAN_CLIENT,
      },
      { text: "The web app needs a free account.", source: POSTMAN_DOWNLOADS },
      {
        text: "From the web app a request leaves through an agent: the desktop app, a browser extension, the browser itself, or the Cloud Agent, which is Postman's servers.",
        source: POSTMAN_AGENT,
      },
      {
        text: "Agent Mode, its AI, works for users who consent to AI, with Postman's model or their own OpenAI or Anthropic account.",
        source: POSTMAN_AGENT_MODE,
      },
    ],
    differs: [
      <>
        Everything works without an account, in a browser tab, and a request goes from the tab to the host you name.{" "}
        <Claims ids={["C-001", "C-002"]} />
      </>,
      <>
        A Postman collection (v2.0 or v2.1), its environments and globals import with a report of what could not be
        kept. <Claims ids={["C-058"]} />
      </>,
      <>
        A collection&apos;s scripts from a file do not run until you have read them and said you trust them.{" "}
        <Claims ids={["C-051"]} />
      </>,
      <>
        Scripts run with the parts of the <code>pm</code> API the compatibility document lists, each part a test, and{" "}
        <code>wayfarer-cli</code> runs the collection in CI with the app&apos;s engine.{" "}
        <Claims ids={["C-040", "C-065"]} />
      </>,
      <>
        A collection goes back out as a Postman v2.1 file, so you are not locked in. <Claims ids={["C-057"]} />
      </>,
      <>
        Wayfarer is free under the MIT licence, for a team too: there are no seats. <Cite source={LICENSE} />
      </>,
    ],
    ahead: [
      {
        text: "Even signed out, it sends gRPC, MQTT and Socket.IO requests, which Wayfarer does not.",
        source: POSTMAN_CLIENT,
      },
      { text: "Teams share workspaces in its cloud, on the Team plan.", source: POSTMAN_PLANS },
      {
        text: "Native Git keeps your work in a local Git repository, synced to Postman's cloud after you sign in.",
        source: POSTMAN_GIT,
      },
      { text: "It says it is trusted by over 50 million developers.", source: POSTMAN_HOME },
    ],
  },
  {
    id: "bruno",
    name: "Bruno",
    url: "https://www.usebruno.com/",
    title: "a browser tab or a Git-native desktop app",
    is: "An open-source desktop API client whose collections are plain-text files, for a Git repository.",
    facts: [
      { text: "It is a desktop app for macOS, Windows and Linux.", source: BRUNO_DOWNLOAD },
      { text: "It needs no account: “No cloud sync. No account. No login.”", source: BRUNO_HOME },
      {
        text: "A collection is a folder of plain-text files on disk, in OpenCollection YAML by default since v4.0.0.",
        source: BRUNO_CHANGELOG,
      },
      { text: "Open Source is free; Pro is $6 and Ultimate $11 a user a month, billed yearly.", source: BRUNO_PRICING },
      {
        text: "Git init, diffs, pull and clone are in the free app; commit, push and branches need Pro or Ultimate.",
        source: BRUNO_GIT,
      },
      {
        text: "A secret variable is kept on disk, encrypted by the operating system or with AES-256, and not in the environment's file.",
        source: BRUNO_SECRETS,
      },
      {
        text: "A secret held only in memory, never on disk, comes from a secret manager, on the Ultimate plan.",
        source: BRUNO_SECRET_MANAGERS,
      },
      {
        text: "A Postman collection's scripts come across only when Preserve scripts is ticked; it is off by default.",
        source: BRUNO_MIGRATION,
      },
      {
        text: "Its AI, in beta, is off by default and uses your own key for OpenAI, Anthropic or a compatible server.",
        source: BRUNO_AI,
      },
      { text: "Its source is under the MIT licence.", source: BRUNO_REPO },
    ],
    differs: [
      <>
        Wayfarer runs in a browser tab: nothing to install. <Claims ids={["C-001"]} />
      </>,
      <>
        The vault&apos;s key is made from your passphrase and held in memory only: a reload locks the vault, and what is
        stored holds only ciphertext. <Claims ids={["C-003", "C-004", "C-005"]} />
      </>,
      <>
        A Postman collection&apos;s scripts come across, and run once you have read them and said you trust them.{" "}
        <Claims ids={["C-051", "C-058"]} />
      </>,
    ],
    ahead: [
      {
        text: "Its collections are files for Git; Wayfarer's live in the browser and leave it as an export.",
        source: BRUNO_HOME,
      },
      { text: "It says it has 4 million users and an independent SOC 2 Type II audit.", source: BRUNO_HOME },
    ],
  },
  {
    id: "yaak",
    name: "Yaak",
    url: "https://yaak.app/",
    title: "no install and no licence for work",
    is: "A local-first desktop API client by Insomnia's creator, with a web version, free for personal use and licensed for work.",
    facts: [
      {
        text: "Free for personal use; a licence is required at work after a 30-day trial with no sign-up: $79 a year or $399 once for one person, or $149 a user a year for a business.",
        source: YAAK_PRICING,
      },
      {
        text: "Its source code is under the MIT licence; the licence above covers the prebuilt app.",
        source: YAAK_PRICING,
      },
      { text: "The desktop app needs no account.", source: YAAK_PRIVACY },
      { text: "It sends HTTP, GraphQL, gRPC, WebSocket and other request types.", source: YAAK_DOCS },
      {
        text: "A workspace syncs to a folder, one YAML file per request, folder and environment, which can be a Git repository.",
        source: YAAK_SYNC,
      },
      { text: "Yaak Web, in a browser, sends every request through a proxy.", source: YAAK_WEB },
      { text: "A Postman collection's pre-request and test scripts are not imported.", source: YAAK_MIGRATION },
      {
        text: "It has no AI of its own: an agent drives it through its CLI or an MCP server plugin.",
        source: YAAK_HOME,
      },
    ],
    differs: [
      <>
        Wayfarer needs no licence at work: MIT, for the app as you use it. <Cite source={LICENSE} />
      </>,
      <>
        It runs in a browser tab with nothing to install and no account, and a request goes from the tab to the host you
        name, through no proxy. <Claims ids={["C-001"]} />
      </>,
      <>
        A Postman collection&apos;s scripts come across, and run once you have read them and said you trust them.{" "}
        <Claims ids={["C-051", "C-058"]} />
      </>,
    ],
    ahead: [
      { text: "It sends gRPC requests; Wayfarer does not.", source: YAAK_DOCS },
      { text: "It keeps a workspace as files in a folder and in Git.", source: YAAK_SYNC },
      { text: "An AI agent can drive it, through its CLI or an MCP server plugin.", source: YAAK_HOME },
    ],
  },
  {
    id: "hoppscotch",
    name: "Hoppscotch",
    url: "https://hoppscotch.com/",
    title: "two browser API clients",
    is: "An open-source API client with a web app, desktop apps and a CLI, which teams can self-host.",
    facts: [
      {
        text: "It has a web app at hoppscotch.io, apps for Mac, Windows and Linux, and a CLI, and can be hosted on your own server.",
        source: HOPP_HOME,
      },
      {
        text: "Free costs nothing; Business is $6 and Enterprise $11 a user a month, billed yearly. Team workspaces are on Business.",
        source: HOPP_PRICING,
      },
      {
        text: "For a request CORS blocks, it offers a local agent, a browser extension, or a proxy server that forwards the request.",
        source: HOPP_INTERCEPTOR,
      },
      {
        text: "Secret variables are kept in the client's local store (the browser's local storage, on the web) and never synced; the policy describes no encryption of its own.",
        source: HOPP_SECURITY,
      },
      {
        text: "A Postman collection's scripts can come across, as an experimental feature, after you consent.",
        source: HOPP_IMPORTER,
      },
      {
        text: "It has an MCP server (2026.8.0), and an AI chat and an AI assistant for self-hosted Enterprise (2026.9.0).",
        source: HOPP_RELEASES,
      },
      { text: "Its source is under the MIT licence.", source: HOPP_REPO },
    ],
    differs: [
      <>
        Like Hoppscotch&apos;s web app, Wayfarer runs in a browser tab with nothing to install, and it needs no account.{" "}
        <Claims ids={["C-001"]} />
      </>,
      <>
        A request goes from your tab to its host and nowhere else; for what a browser cannot send, the Local Bridge runs
        on your machine, never on a server. <Claims ids={["C-001", "C-041"]} />
      </>,
      <>
        Before you send, the composer says what the browser will do to the request. <Claims ids={["C-049"]} />
      </>,
      <>
        Values in its vault are stored only as ciphertext, under a passphrase. <Claims ids={["C-003", "C-004"]} />
      </>,
    ],
    ahead: [
      { text: "It has desktop apps as well as the web one.", source: HOPP_HOME },
      { text: "Teams share workspaces on its Business plan.", source: HOPP_PRICING },
      { text: "An AI agent can drive it through its MCP server.", source: HOPP_RELEASES },
    ],
  },
  {
    id: "insomnia",
    name: "Insomnia",
    url: "https://insomnia.rest/",
    title: "no account and no cloud",
    is: "Kong's open-source desktop API client, with local, Git and cloud storage.",
    facts: [
      {
        text: "Essentials is free, Pro $12 and Enterprise $45 a user a month. Essentials has Git Sync for up to 3 users.",
        source: INSOMNIA_PRICING,
      },
      { text: "No login is ever required for the local-only Scratch Pad.", source: INSOMNIA_HOME },
      {
        text: "Data is stored locally, in Git, or in its cloud, with optional end-to-end encryption.",
        source: INSOMNIA_HOME,
      },
      { text: "Local data is not encrypted on disk.", source: INSOMNIA_DATA },
      {
        text: "A Secret variable, in a private global environment, is stored encrypted under a vault key you generate.",
        source: INSOMNIA_ENVIRONMENTS,
      },
      {
        text: "Its AI runs nothing until a model is chosen in Preferences: Claude, OpenAI, Gemini, a URL of your own, or a local model.",
        source: INSOMNIA_AI,
      },
      { text: "Its source is under the Apache 2.0 licence.", source: INSOMNIA_REPO },
    ],
    differs: [
      <>
        Wayfarer keeps collections and environments in your browser, with no account and no cloud.{" "}
        <Claims ids={["C-001", "C-002"]} />
      </>,
      <>
        Every value in its vault is stored only as ciphertext, under a passphrase. <Claims ids={["C-003", "C-004"]} />
      </>,
      <>
        Insomnia exports in format 4 and 5 import, with a report of what could not be kept. <Claims ids={["C-059"]} />
      </>,
    ],
    ahead: [
      { text: "It keeps projects in Git, free for a team of up to 3.", source: INSOMNIA_PRICING },
      { text: "It syncs projects through a cloud of its own for a team.", source: INSOMNIA_HOME },
    ],
  },
];

/** Where Wayfarer is behind, for the comparison index (W2.3's AC). Each names what it is measured against. */
export const BEHIND: { title: string; text: ReactNode; sources: Source[] }[] = [
  {
    title: "No gRPC, MQTT or Socket.IO",
    text: <>Postman&apos;s signed-out client sends all three, and Yaak sends gRPC.</>,
    sources: [POSTMAN_CLIENT, YAAK_DOCS],
  },
  {
    title: "Collections are not files in Git",
    text: (
      <>
        They live in your browser and leave it as an export or a backup. <Claims ids={["C-002", "C-046"]} /> Bruno and
        Yaak keep them as files for Git; Postman (Native Git, after you sign in) and Insomnia (Git Sync) sync with a
        repository.
      </>
    ),
    sources: [BRUNO_HOME, YAAK_SYNC, POSTMAN_GIT, INSOMNIA_PRICING],
  },
  {
    title: "No shared workspace for a team",
    text: (
      <>
        A team shares a collection as a file today; sharing without a server is on the <a href="/roadmap/">roadmap</a>.
        Postman shares on its Team plan, Hoppscotch on Business, and Insomnia through its cloud or Git Sync, which is
        free for up to 3 users.
      </>
    ),
    sources: [POSTMAN_PLANS, HOPP_PRICING, INSOMNIA_PRICING],
  },
  {
    title: "No MCP server",
    text: <>Yaak and Hoppscotch have MCP servers an agent can use; Wayfarer has none.</>,
    sources: [YAAK_HOME, HOPP_RELEASES],
  },
  {
    title: "A browser's limits",
    text: (
      <>
        A page cannot set some headers, is subject to CORS and cannot relax TLS; the composer says which before you
        send. <Claims ids={["C-049"]} /> The <a href="/docs/browser-limits/">Local Bridge</a> sends what a page cannot,
        but it is a program you run; a desktop client needs none. <Claims ids={["C-064"]} />
      </>
    ),
    sources: [],
  },
  {
    title: "A young project",
    text: <>Its first release was on 20 July 2026, and it has no user count to show.</>,
    sources: [FIRST_RELEASE],
  },
];

/** A source, as the pages cite it: its title as a link, and the date it was read. */
export function Cite({ source }: { source: Source }) {
  return (
    <span className="cite type-site-small text-ink-muted">
      (
      <a className="underline underline-offset-4 hover:text-action" href={source.url}>
        {source.title}
      </a>
      , read <time dateTime={source.read}>{source.read}</time>)
    </span>
  );
}
