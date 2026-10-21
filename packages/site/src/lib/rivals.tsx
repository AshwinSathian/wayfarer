// The comparison pages (W2.3 of PLAN-design.md). Every fact about another product here names its source and the date
// it was read; e2e/site.spec.ts holds each page to that. What is said of Wayfarer names its claims, as on the landing.
import type { ReactNode } from "react";
import { Claims } from "../components/Claims";

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
  /** One sentence: what it is. */
  is: string;
  /** What the rival's own pages say, each with its source. */
  facts: Fact[];
  /** How Wayfarer differs, each sentence with its claims. */
  differs: ReactNode[];
  /** Where the rival is ahead of Wayfarer, each with its source. */
  ahead: Fact[];
}

const READ = "2026-10-19";
const src = (title: string, url: string): Source => ({ title, url, read: READ });

const POSTMAN_PRICING = src("Postman pricing", "https://www.postman.com/pricing/");
const POSTMAN_CLIENT = src(
  "Postman docs: the lightweight API Client",
  "https://learning.postman.com/docs/getting-started/basics/using-api-client/",
);
const YAAK_POST = src("Yaak blog: Postman's free plan is one user", "https://yaak.app/blog/postman-free-plan-one-user");
const BRUNO_PRICING = src("Bruno pricing", "https://www.usebruno.com/pricing");
const BRUNO_DOCS = src("Bruno docs: What is Bruno", "https://docs.usebruno.com/introduction/what-is-bruno");
const BRUNO_REPO = src("usebruno/bruno on GitHub", "https://github.com/usebruno/bruno");
const YAAK_PRICING = src("Yaak pricing", "https://yaak.app/pricing");
const YAAK_DOCS = src("Yaak docs", "https://yaak.app/docs");
const HOPP_PRICING = src("Hoppscotch pricing", "https://hoppscotch.com/pricing");
const HOPP_INTRO = src(
  "Hoppscotch docs: Introduction",
  "https://docs.hoppscotch.io/documentation/getting-started/introduction",
);
const HOPP_INTERCEPTOR = src(
  "Hoppscotch docs: Interceptor",
  "https://docs.hoppscotch.io/documentation/features/interceptor",
);
const HOPP_REPO = src("hoppscotch/hoppscotch on GitHub", "https://github.com/hoppscotch/hoppscotch");
const INSOMNIA_PRICING = src("Insomnia pricing", "https://insomnia.rest/pricing");
const INSOMNIA_STORAGE = src("Insomnia docs: Storage", "https://developer.konghq.com/insomnia/storage/");
const INSOMNIA_REPO = src("Kong/insomnia on GitHub", "https://github.com/Kong/insomnia");

export const RIVALS: Rival[] = [
  {
    id: "postman",
    name: "Postman",
    is: "An API platform: a desktop and web app, with team workspaces in Postman's cloud.",
    facts: [
      {
        text: "The Free plan is for one user. Team costs $19 a user a month, billed yearly; Solo $9 a month, billed yearly.",
        source: POSTMAN_PRICING,
      },
      { text: "The one-user limit on the free plan started in March 2026.", source: YAAK_POST },
      {
        text: "Signed out, the desktop app has a lightweight client that sends requests and keeps history on the machine; workspaces, collections, environments and variables need an account.",
        source: POSTMAN_CLIENT,
      },
    ],
    differs: [
      <>
        Collections, environments and history are kept without an account, in your browser.{" "}
        <Claims ids={["C-001", "C-002"]} />
      </>,
      <>
        A Postman collection (v2.0 or v2.1), its environments and globals import with a report of what could not be
        kept. <Claims ids={["C-058"]} />
      </>,
      <>
        Scripts run with the parts of the <code>pm</code> API the compatibility document lists, each part a test.{" "}
        <Claims ids={["C-040"]} />
      </>,
      <>Wayfarer is free under the MIT licence, for a team too: there are no seats.</>,
    ],
    ahead: [
      {
        text: "Even signed out, it sends gRPC, MQTT and Socket.IO requests, which Wayfarer does not.",
        source: POSTMAN_CLIENT,
      },
      { text: "Teams share workspaces and collections in its cloud, on the Team plan.", source: POSTMAN_PRICING },
    ],
  },
  {
    id: "bruno",
    name: "Bruno",
    is: "An open-source desktop API client whose collections are plain-text files, for a Git repository.",
    facts: [
      { text: "Collections are stored as files, in plain text, so they can be versioned.", source: BRUNO_DOCS },
      {
        text: "It needs no account and works offline; an email is asked for only to buy a licence.",
        source: BRUNO_DOCS,
      },
      { text: "Open Source is free; Pro is $6 and Ultimate $11 a user a month, billed yearly.", source: BRUNO_PRICING },
      { text: "Its source is under the MIT licence.", source: BRUNO_REPO },
    ],
    differs: [
      <>
        Wayfarer runs in a browser tab: nothing to install. <Claims ids={["C-001"]} />
      </>,
      <>
        Values in its vault are stored only as ciphertext, under a passphrase. <Claims ids={["C-003", "C-004"]} />
      </>,
      <>
        A collection&apos;s scripts from a file run only after you have read them. <Claims ids={["C-051"]} />
      </>,
    ],
    ahead: [
      {
        text: "Its collections are files for Git; Wayfarer's live in the browser and leave it as an export.",
        source: BRUNO_DOCS,
      },
    ],
  },
  {
    id: "yaak",
    name: "Yaak",
    is: "A local-first desktop API client by Insomnia's creator, free for personal use and licensed for work.",
    facts: [
      {
        text: "Free for personal use; a licence is required at work: $79 a year for one person, or $149 a user a year for a business.",
        source: YAAK_PRICING,
      },
      {
        text: "Its source code is under the MIT licence; the prebuilt app is licensed as above.",
        source: YAAK_PRICING,
      },
      {
        text: "It sends HTTP, GraphQL, gRPC and WebSocket requests, and syncs a workspace to a local folder or Git.",
        source: YAAK_DOCS,
      },
    ],
    differs: [
      <>Wayfarer needs no licence at work: MIT, for the app as you use it.</>,
      <>
        It runs in a browser tab, with nothing to install and no account. <Claims ids={["C-001"]} />
      </>,
      <>
        Each thing it says it does is a row of its <a href="/docs/claims/">claims ledger</a>, with the test that proves
        it.
      </>,
    ],
    ahead: [
      { text: "It sends gRPC requests; Wayfarer does not.", source: YAAK_DOCS },
      { text: "It keeps a workspace in a folder and in Git.", source: YAAK_DOCS },
    ],
  },
  {
    id: "hoppscotch",
    name: "Hoppscotch",
    is: "An open-source API client on the web, the desktop and the command line, which teams can self-host.",
    facts: [
      {
        text: "It works on the web, Mac, Windows, Linux and a CLI, and can be hosted on your own server.",
        source: HOPP_INTRO,
      },
      {
        text: "Free costs nothing; Business is $6 and Enterprise $11 a user a month, billed yearly.",
        source: HOPP_PRICING,
      },
      {
        text: "For a request CORS blocks, it offers a local agent, a browser extension, or a proxy server that forwards the request.",
        source: HOPP_INTERCEPTOR,
      },
      { text: "Its source is under the MIT licence.", source: HOPP_REPO },
    ],
    differs: [
      <>
        A request goes from your tab to its host and nowhere else; for what a browser cannot send, the Local Bridge runs
        on your machine, never on a server. <Claims ids={["C-001", "C-041"]} />
      </>,
      <>
        Before you send, the composer says what the browser will do to the request. <Claims ids={["C-049"]} />
      </>,
      <>
        Values in its vault are stored only as ciphertext. <Claims ids={["C-003"]} />
      </>,
    ],
    ahead: [
      { text: "It has a desktop app as well as the web one.", source: HOPP_INTRO },
      { text: "Teams share workspaces on its Business plan.", source: HOPP_PRICING },
    ],
  },
  {
    id: "insomnia",
    name: "Insomnia",
    is: "Kong's open-source desktop API client, with local, Git and cloud storage.",
    facts: [
      {
        text: "Essentials is free, Pro $12 and Enterprise $45 a user a month. Git Sync is free for up to 3 users.",
        source: INSOMNIA_PRICING,
      },
      { text: "A local-only Scratch Pad works without logging in.", source: INSOMNIA_PRICING },
      {
        text: "Projects are stored locally, in a Git repository, or in its cloud, where they are end-to-end encrypted.",
        source: INSOMNIA_STORAGE,
      },
      { text: "Its source is under the Apache 2.0 licence.", source: INSOMNIA_REPO },
    ],
    differs: [
      <>
        Wayfarer keeps collections and environments in your browser, with no account and no cloud.{" "}
        <Claims ids={["C-001", "C-002"]} />
      </>,
      <>
        Insomnia exports in format 4 and 5 import, with a report of what could not be kept. <Claims ids={["C-059"]} />
      </>,
    ],
    ahead: [{ text: "It keeps projects in Git, and in a cloud of its own for a team.", source: INSOMNIA_STORAGE }],
  },
];

/** Where Wayfarer is behind, for the comparison index (W2.3's AC). Each names what it is measured against. */
export const BEHIND: { title: string; text: ReactNode; sources: Source[] }[] = [
  {
    title: "No gRPC, MQTT or Socket.IO",
    text: (
      <>
        Wayfarer sends HTTP, GraphQL, event streams and WebSockets. Postman&apos;s signed-out client and Yaak send gRPC
        too.
      </>
    ),
    sources: [POSTMAN_CLIENT, YAAK_DOCS],
  },
  {
    title: "Collections are not files in Git",
    text: (
      <>
        They live in your browser and leave it as an export or a backup. Bruno keeps them as plain-text files; Yaak and
        Insomnia sync to Git.
      </>
    ),
    sources: [BRUNO_DOCS, YAAK_DOCS, INSOMNIA_STORAGE],
  },
  {
    title: "No shared workspace for a team",
    text: (
      <>
        A team shares a collection as a file today; sharing without a server is on the <a href="/roadmap/">roadmap</a>.
        Postman, Hoppscotch and Insomnia have shared workspaces on their paid plans.
      </>
    ),
    sources: [POSTMAN_PRICING, HOPP_PRICING, INSOMNIA_PRICING],
  },
  {
    title: "A browser's limits",
    text: (
      <>
        A page cannot set some headers, is subject to CORS and cannot relax TLS. The{" "}
        <a href="/docs/browser-limits/">Local Bridge</a> sends what a page cannot, but it is a program you run; a
        desktop client needs none.
      </>
    ),
    sources: [],
  },
  {
    title: "A young project",
    text: <>Its first release was on 20 July 2026, and it has no user count to show.</>,
    sources: [],
  },
];

/** A source, as the pages cite it: its title as a link, and the date it was read. */
export function Cite({ source }: { source: Source }) {
  return (
    <span className="cite text-sm text-ink-muted">
      (
      <a className="underline underline-offset-4 hover:text-route" href={source.url}>
        {source.title}
      </a>
      , read <time dateTime={source.read}>{source.read}</time>)
    </span>
  );
}
