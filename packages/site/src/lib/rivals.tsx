// The comparison pages (W2.3 of PLAN-design.md). Every fact about another product here names its source and the date
// it was read; e2e/site.spec.ts holds each page to that. Every sentence about Wayfarer names its claims, or, for a
// fact about the project rather than the app (its licence, its first release), the file that says so.
//
// Read on 2026-11-04, against docs/design/research-2026.md and docs/benchmark/rivals.md (both of that day) and,
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

/** The rows of the table at a glance, on each rival's page and on the index. */
export const GLANCE_ROWS = [
  ["runs", "Where it runs"],
  ["account", "Account"],
  ["collections", "Where your collections are kept"],
  ["secrets", "Secrets"],
  ["git", "Git"],
  ["team", "Sharing with a team"],
  ["ai", "AI"],
  ["price", "Price and licence"],
] as const;
export type GlanceRow = (typeof GLANCE_ROWS)[number][0];

export interface Rival {
  id: string;
  name: string;
  /** Its home page, for the page's structured data. */
  url: string;
  /** When the benchmark read its documentation, as YYYY-MM-DD. */
  read: string;
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
  /** The table at a glance: a row the rival's pages do not cover is left out, and shows "Not documented". */
  glance: Partial<Record<GlanceRow, Fact>>;
  /** Who should pick the rival, and who Wayfarer: the Wayfarer half names its claims. */
  pick: ReactNode;
  /** How a rival's work comes into Wayfarer. */
  moving: ReactNode;
}

const READ = "2026-11-04";
const src = (title: string, url: string): Source => ({ title, url, read: READ });

// Wayfarer's own files, for what is a fact about the project and not a claim about the app.
const LICENSE = src("Wayfarer's LICENSE (MIT)", "https://github.com/AshwinSathian/wayfarer/blob/main/LICENSE");
/** The benchmark's comparison, as a source: the site's own page, run again on 2026-11-05. */
export const BENCHMARK_SOURCE: Source = {
  title: "Wayfarer benchmark: Wayfarer against the rivals",
  url: `${SITE}/docs/benchmark/#wayfarer-against-the-rivals`,
  read: "2026-11-05",
};
const FIRST_RELEASE = src("Wayfarer changelog: 0.1.0, 2026-07-20", `${SITE}/changelog/#010---2026-07-20`);

/** The benchmark's page, where each of Wayfarer's numbers has its row and each rival's its table. */
export const BENCHMARK_PAGE = "/docs/benchmark/";

/** Wayfarer's column of the table at a glance: each cell names its claims, or the file that says so. */
export const WAYFARER_GLANCE: Record<GlanceRow, ReactNode> = {
  runs: (
    <>
      A browser tab: nothing to install. <Claims ids={["C-001"]} />
    </>
  ),
  account: (
    <>
      None, for all of it. <Claims ids={["C-001"]} />
    </>
  ),
  collections: (
    <>
      In your browser, on your device. <Claims ids={["C-002"]} />
    </>
  ),
  secrets: (
    <>
      Only ciphertext is stored; the key is in memory and a reload locks it. <Claims ids={["C-003", "C-005"]} />
    </>
  ),
  git: (
    <>
      None yet: a collection leaves as a file or a link; Git is <a href="/roadmap/">next</a>.{" "}
      <Claims ids={["C-057", "C-084"]} />
    </>
  ),
  team: (
    <>
      A copy, as a file or an encrypted link that reaches no server; no workspace in step yet.{" "}
      <Claims ids={["C-084", "C-086"]} />
    </>
  ),
  ai: (
    <>
      Off until you add a provider; each call shown byte for byte before it goes. <Claims ids={["C-069", "C-071"]} />
    </>
  ),
  price: (
    <>
      Free, MIT, no seats. <Cite source={LICENSE} />
    </>
  ),
};

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
const POSTMAN_VAULT = src(
  "Postman docs: Manage vault secrets",
  "https://learning.postman.com/docs/use/postman-vault/manage-vault-secrets.md",
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
const YAAK_SECRETS = src("Yaak docs: Secrets and encryption", "https://yaak.app/docs/collaboration/secrets-encryption");
const YAAK_WEB = src("Yaak docs: Yaak Web", "https://yaak.app/docs/getting-started/web-proxy");
const YAAK_MIGRATION = src("Yaak docs: Migrating from Postman", "https://yaak.app/docs/migration/postman");
const HOPP_HOME = src("Hoppscotch home page", "https://hoppscotch.com/");
const HOPP_PRICING = src("Hoppscotch pricing", "https://hoppscotch.com/pricing");
const HOPP_INTERCEPTOR = src(
  "Hoppscotch docs: Interceptor",
  "https://docs.hoppscotch.io/documentation/features/interceptor",
);
const HOPP_REQUEST = src(
  "Hoppscotch docs: Creating a request",
  "https://docs.hoppscotch.io/documentation/getting-started/rest/creating-a-request",
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

const AI_LINE = (
  <>
    AI is off until you add a provider, and each call is shown byte for byte before it is sent.{" "}
    <Claims ids={["C-069", "C-071"]} />
  </>
);
const VAULT_LINE = (
  <>
    A vault secret&apos;s plaintext is never stored: what is kept is ciphertext, and the vault&apos;s key is held in
    memory only, so a reload locks it. <Claims ids={["C-003", "C-005"]} />
  </>
);
/** For a rival Wayfarer has no importer for: the ways in that there are. */
const OTHER = (name: string) => (
  <>
    There is no importer for {name}&apos;s own files. Wayfarer imports OpenAPI and Swagger descriptions, and a cURL
    command pasted into the address becomes the request. <Claims ids={["C-060", "C-056"]} />
  </>
);

// Scalar was read a day after the others, for W5.4 (site-seo-compare.md item 13): the one other API client with a
// browser version.
const SCALAR_READ = "2026-11-05";
const scalar = (title: string, url: string): Source => ({ title, url, read: SCALAR_READ });
const SCALAR_HOME = scalar("Scalar API Client", "https://scalar.com/products/api-client");
const SCALAR_CHANGELOG = scalar("Scalar API Client release notes", "https://scalar.com/resources/changelog/api-client");
const SCALAR_IMPORT = scalar("Scalar docs: Import", "https://scalar.com/products/api-client/import");
const SCALAR_AUTH = scalar("Scalar docs: Authentication", "https://scalar.com/products/api-client/authentication");
const SCALAR_SCRIPTS = scalar("Scalar docs: Testing", "https://scalar.com/products/api-client/testing");

export const RIVALS: Rival[] = [
  {
    id: "postman",
    name: "Postman",
    read: READ,
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
      VAULT_LINE,
      AI_LINE,
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
    glance: {
      runs: { text: "A desktop app, and a web app.", source: POSTMAN_DOWNLOADS },
      account: {
        text: "The web app needs a free account; signed out, the desktop app's lightweight client keeps no collections.",
        source: POSTMAN_CLIENT,
      },
      collections: {
        text: "In Postman's cloud; Native Git keeps them in a local repository, synced to that cloud.",
        source: POSTMAN_GIT,
      },
      secrets: {
        text: "Local Vault: on disk, encrypted with AES-256, its key in the system's password manager.",
        source: POSTMAN_VAULT,
      },
      git: { text: "Native Git, after you sign in.", source: POSTMAN_GIT },
      team: { text: "On the Team plan; the Free plan is one user.", source: POSTMAN_PLANS },
      ai: { text: "Agent Mode, for users who consent to AI.", source: POSTMAN_AGENT_MODE },
      price: {
        text: "Free for one user; Solo $9 and Team $19 a user a month, billed yearly.",
        source: POSTMAN_PRICING,
      },
    },
    pick: (
      <>
        Pick Postman if your team already works in its cloud, needs gRPC or MQTT, or wants its AI agent. Pick Wayfarer
        if you want the whole client without an account or a seat, in a tab, with your collection&apos;s scripts held
        until you have read them. <Claims ids={["C-001", "C-051"]} />
      </>
    ),
    moving: (
      <>
        Export each collection as Collection v2.1 and import it: its environments and globals come too, with a report of
        what could not be kept. <Claims ids={["C-058"]} /> The steps are in{" "}
        <a href="/compare/moving-from-postman/">Moving from Postman</a>, and a collection goes back as a v2.1 file.{" "}
        <Claims ids={["C-057"]} />
      </>
    ),
  },
  {
    id: "bruno",
    name: "Bruno",
    read: READ,
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
      AI_LINE,
    ],
    ahead: [
      {
        text: "Its collections are files for Git; Wayfarer's live in the browser and leave it as an export.",
        source: BRUNO_HOME,
      },
      { text: "It says it has 4 million users and an independent SOC 2 Type II audit.", source: BRUNO_HOME },
    ],
    glance: {
      runs: { text: "A desktop app for macOS, Windows and Linux.", source: BRUNO_DOWNLOAD },
      account: { text: "None: “No cloud sync. No account. No login.”", source: BRUNO_HOME },
      collections: {
        text: "Plain-text files on disk, OpenCollection YAML by default since v4.0.0.",
        source: BRUNO_CHANGELOG,
      },
      secrets: {
        text: "On disk, encrypted; held off disk only by a secret manager, on the Ultimate plan.",
        source: BRUNO_SECRET_MANAGERS,
      },
      git: { text: "Init, diffs, pull and clone free; commit and push on Pro or Ultimate.", source: BRUNO_GIT },
      team: { text: "Through the files, in Git.", source: BRUNO_GIT },
      ai: { text: "In beta, off by default, with your own key.", source: BRUNO_AI },
      price: {
        text: "Open Source free; Pro $6 and Ultimate $11 a user a month, billed yearly.",
        source: BRUNO_PRICING,
      },
    },
    pick: (
      <>
        Pick Bruno if your team reviews requests as files in Git and wants a desktop app. Pick Wayfarer if you want
        nothing to install, a vault whose key is gone when you reload, and imported scripts held until you have read
        them. <Claims ids={["C-001", "C-005", "C-051"]} />
      </>
    ),
    moving: <>{OTHER("Bruno")}</>,
  },
  {
    id: "yaak",
    name: "Yaak",
    read: READ,
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
      VAULT_LINE,
    ],
    ahead: [
      { text: "It sends gRPC requests; Wayfarer does not.", source: YAAK_DOCS },
      { text: "It keeps a workspace as files in a folder and in Git.", source: YAAK_SYNC },
      { text: "An AI agent can drive it, through its CLI or an MCP server plugin.", source: YAAK_HOME },
    ],
    glance: {
      runs: { text: "A desktop app; Yaak Web, in a browser, sends through a proxy.", source: YAAK_WEB },
      account: { text: "None for the desktop app.", source: YAAK_PRIVACY },
      collections: {
        text: "On the machine, and synced to a folder of YAML files that can be a Git repository.",
        source: YAAK_SYNC,
      },
      secrets: {
        text: "Encrypted values in a local database, the key in the system's keychain.",
        source: YAAK_SECRETS,
      },
      git: { text: "A workspace synced to a folder in Git.", source: YAAK_SYNC },
      team: { text: "Through that folder, in Git.", source: YAAK_SYNC },
      ai: { text: "None of its own; an agent drives it through its CLI or an MCP server plugin.", source: YAAK_HOME },
      price: {
        text: "Free for personal use; at work $79 a year or $399 once for one person, or $149 a user a year.",
        source: YAAK_PRICING,
      },
    },
    pick: (
      <>
        Pick Yaak if you want a fast desktop app with gRPC and files in Git, and a work licence is fine. Pick Wayfarer
        if you want nothing to install and no licence, with requests sent from your tab through no proxy.{" "}
        <Claims ids={["C-001"]} />
      </>
    ),
    moving: OTHER("Yaak"),
  },
  {
    id: "hoppscotch",
    name: "Hoppscotch",
    read: READ,
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
      VAULT_LINE,
      AI_LINE,
    ],
    ahead: [
      { text: "It has desktop apps as well as the web one.", source: HOPP_HOME },
      { text: "Teams share workspaces on its Business plan.", source: HOPP_PRICING },
      { text: "An AI agent can drive it through its MCP server.", source: HOPP_RELEASES },
    ],
    glance: {
      runs: { text: "A web app, desktop apps, a CLI, and your own server.", source: HOPP_HOME },
      account: { text: "The docs' first request, in the web app, has no sign-in.", source: HOPP_REQUEST },
      secrets: {
        text: "In the client's local store, the browser's local storage on the web, with no encryption of its own described.",
        source: HOPP_SECURITY,
      },
      team: { text: "Team workspaces, on Business.", source: HOPP_PRICING },
      ai: {
        text: "An MCP server, and an AI chat and assistant for self-hosted Enterprise.",
        source: HOPP_RELEASES,
      },
      price: {
        text: "Free; Business $6 and Enterprise $11 a user a month, billed yearly.",
        source: HOPP_PRICING,
      },
    },
    pick: (
      <>
        Pick Hoppscotch if you want a browser client and a desktop app from one project, team workspaces, or your own
        server. Pick Wayfarer if you want your secrets stored only as ciphertext, and imported scripts held until you
        have read them. <Claims ids={["C-003", "C-051"]} />
      </>
    ),
    moving: OTHER("Hoppscotch"),
  },
  {
    id: "insomnia",
    name: "Insomnia",
    read: READ,
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
      VAULT_LINE,
      <>
        Insomnia exports in format 4 and 5 import, with a report of what could not be kept. <Claims ids={["C-059"]} />
      </>,
      AI_LINE,
    ],
    ahead: [
      { text: "It keeps projects in Git, free for a team of up to 3.", source: INSOMNIA_PRICING },
      { text: "It syncs projects through a cloud of its own for a team.", source: INSOMNIA_HOME },
    ],
    glance: {
      runs: { text: "A desktop app.", source: INSOMNIA_HOME },
      account: { text: "None for the local-only Scratch Pad.", source: INSOMNIA_HOME },
      collections: {
        text: "Locally, in Git, or in its cloud, with optional end-to-end encryption.",
        source: INSOMNIA_HOME,
      },
      secrets: {
        text: "A Secret variable is encrypted under a vault key you make; other local data is not encrypted on disk.",
        source: INSOMNIA_ENVIRONMENTS,
      },
      git: { text: "Git Sync, free for up to 3 users.", source: INSOMNIA_PRICING },
      team: { text: "Its cloud, or Git Sync.", source: INSOMNIA_HOME },
      ai: { text: "Nothing runs until a model is chosen in Preferences.", source: INSOMNIA_AI },
      price: {
        text: "Essentials free; Pro $12 and Enterprise $45 a user a month.",
        source: INSOMNIA_PRICING,
      },
    },
    pick: (
      <>
        Pick Insomnia if your team syncs projects through Git or Kong&apos;s cloud and wants a desktop app. Pick
        Wayfarer if you want no account and no cloud, and every vault value stored only as ciphertext.{" "}
        <Claims ids={["C-001", "C-003"]} />
      </>
    ),
    moving: (
      <>
        Export from Insomnia in format 4 or 5 and import the file, with a report of what could not be kept.{" "}
        <Claims ids={["C-059"]} />
      </>
    ),
  },
  {
    id: "scalar",
    name: "Scalar",
    read: SCALAR_READ,
    url: "https://scalar.com/products/api-client",
    title: "two API clients in a browser tab",
    is: "An open-source API client built on OpenAPI, in the browser at client.scalar.com and as a desktop app, with team workspaces in Scalar's Registry.",
    facts: [
      { text: "It runs in the browser and on macOS, Windows and Linux.", source: SCALAR_HOME },
      {
        text: "In the browser it sends through Scalar's proxy, proxy.scalar.com, by default; the desktop app skips the proxy unless you set one.",
        source: SCALAR_CHANGELOG,
      },
      { text: "Requests and collections are stored locally, and nothing waits on a cloud sync.", source: SCALAR_HOME },
      {
        text: "Credentials are persisted in the workspace and never exported with the OpenAPI document; its pages describe no secret type or encryption.",
        source: SCALAR_AUTH,
      },
      {
        text: "A Postman collection comes across as an OpenAPI-based collection of its requests, folders and basic auth; its pages do not mention scripts.",
        source: SCALAR_IMPORT,
      },
      {
        text: "Its own scripts run in the Postman Sandbox runtime, with the pm API.",
        source: SCALAR_SCRIPTS,
      },
      {
        text: "Version 1.0 brought team workspaces, synced with the Scalar Registry, after sign-in.",
        source: SCALAR_CHANGELOG,
      },
      { text: "It is free in the browser, and its source is under the MIT licence.", source: SCALAR_HOME },
    ],
    differs: [
      <>
        A request goes from your tab to the host you name, through no server of ours, and nothing needs an account.{" "}
        <Claims ids={["C-001"]} />
      </>,
      VAULT_LINE,
      <>
        A Postman collection&apos;s scripts come across, and run once you have read them and said you trust them.{" "}
        <Claims ids={["C-051", "C-058"]} />
      </>,
      <>
        <code>wayfarer-cli</code> runs a collection in CI with the app&apos;s engine. <Claims ids={["C-065"]} />
      </>,
      AI_LINE,
    ],
    ahead: [
      { text: "It has a desktop app as well as the browser one, which sends with no proxy.", source: SCALAR_CHANGELOG },
      {
        text: "Team workspaces sync with the Scalar Registry, with conflicts between local edits and the Registry resolved in the app.",
        source: SCALAR_CHANGELOG,
      },
      {
        text: "It is built on OpenAPI, and can watch a document on disk and update the requests when it changes.",
        source: SCALAR_HOME,
      },
    ],
    glance: {
      runs: { text: "In the browser, or a desktop app for macOS, Windows and Linux.", source: SCALAR_HOME },
      collections: { text: "Stored locally; team workspaces sync with the Scalar Registry.", source: SCALAR_HOME },
      secrets: {
        text: "Credentials persisted in the workspace; no secret type or encryption described.",
        source: SCALAR_AUTH,
      },
      team: { text: "Team workspaces, after sign-in.", source: SCALAR_CHANGELOG },
      price: { text: "Free in the browser; MIT source.", source: SCALAR_HOME },
    },
    pick: (
      <>
        Pick Scalar if your APIs are OpenAPI documents and your team works in its Registry, or you want a desktop app as
        well. Pick Wayfarer if you want requests to go from your tab straight to your API, secrets stored only as
        ciphertext, and Postman collections with their scripts. <Claims ids={["C-001", "C-003", "C-058"]} />
      </>
    ),
    moving: (
      <>
        A Scalar collection is OpenAPI-based <Cite source={SCALAR_IMPORT} />: Wayfarer imports OpenAPI 3.0 and 3.1 and
        Swagger 2.0 descriptions, in JSON or YAML, with a report of what could not be kept. <Claims ids={["C-060"]} />
      </>
    ),
  },
];

/** Where Wayfarer is behind, for the comparison index (W2.3's AC). Each names what it is measured against. */
export const BEHIND: { title: string; text: ReactNode; sources: Source[] }[] = [
  {
    title: "More actions on two of eight everyday tasks",
    text: (
      <>
        Adding an environment takes 8 actions in Wayfarer and 5 in Insomnia&apos;s documentation, 2 of them inferred;
        finding last week&apos;s request takes 4, against Hoppscotch&apos;s 2 and some scrolling. A data-file run takes
        5 in the app, and 2 with Bruno&apos;s or Hoppscotch&apos;s command line, as with Wayfarer&apos;s own (
        <a href="/docs/cli/">wayfarer-cli</a> <code>-d</code>).
      </>
    ),
    sources: [BENCHMARK_SOURCE],
  },
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
        A team shares a collection as a copy, by file or by an encrypted link that reaches no server, and no copy
        follows the other&apos;s changes. <Claims ids={["C-084"]} /> Collections in Git are <a href="/roadmap/">next</a>
        . Postman shares on its Team plan, Hoppscotch on Business, Scalar in team workspaces after sign-in, and Insomnia
        through its cloud or Git Sync, which is free for up to 3 users.
      </>
    ),
    sources: [POSTMAN_PLANS, HOPP_PRICING, SCALAR_CHANGELOG, INSOMNIA_PRICING],
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
