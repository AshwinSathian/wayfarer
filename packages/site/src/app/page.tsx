// The landing (W2.1, rebuilt in PLAN-design 1.8, D5-e and W6.5). Each sentence that says what Wayfarer does names the
// claim that proves it (docs/claims.md), out of the reader's sight (PLAN-design row 1.74): e2e/site.spec.ts holds
// every ID named here to the ledger, and the claims page is one link, the footer's. A fact about another product
// names its source and the date it was read. The page argues in the order of the site audit's section 6
// (site audit, November 2026), reworked for the launch after the rivals' pages: the tab and a picture of the app, the
// figures, what leaves the tab, the Postman collection in three pictures, a day with the app as a gallery, why switch,
// the proof, the rest of the app, the questions, the call. One idea a section, each with a picture of its own.
import { pageMeta } from "../lib/meta";
import { version } from "../../../../package.json";
import type { ReactNode } from "react";
import { AskFirst } from "../components/AskFirst";
import { Claims } from "../components/Claims";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { RouteDemo } from "../components/RouteDemo";
import { JsonLd } from "../components/JsonLd";
import { claims, iconPath } from "../lib/content";
import { homeGraph } from "../lib/structured-data";

const DESCRIPTION =
  "Import Postman collections, run their scripts, keep API keys encrypted and share a collection by encrypted link, in your browser. No install, no account, no server of ours between you and your API. Free and MIT-licensed.";

export const metadata = pageMeta("/", "Wayfarer: the API client that opens in a tab", DESCRIPTION);

const POSTMAN_PLANS = "https://learning.postman.com/docs/billing/about-plans";
const LINK = "text-action underline underline-offset-4";

/** A block of the page on its own field: the fields alternate, and space, not a rule, sets them apart. */
function Section({
  id,
  title,
  intro,
  sunk = false,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  sunk?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={sunk ? "bg-paper-sunk" : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 id={id} className="max-w-3xl type-site-title-1 font-bold text-ink">
          {title}
        </h2>
        {intro && <div className="mt-5 max-w-2xl type-site-lede text-ink-muted">{intro}</div>}
        {children}
      </div>
    </section>
  );
}

/** One thing Wayfarer does: what it is, beside a piece of the app that shows it. `flip` puts the piece first. */
function Feature({
  id,
  title,
  children,
  figure,
  sunk = false,
  flip = false,
  level = 2,
}: {
  id: string;
  title: string;
  children: ReactNode;
  figure: ReactNode;
  sunk?: boolean;
  flip?: boolean;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={sunk ? "bg-paper-sunk" : undefined}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className={flip ? "lg:order-2" : undefined}>
          <Heading id={id} className="type-site-title-1 font-bold text-ink">
            {title}
          </Heading>
          <div
            id={`${id}-text`}
            className="mt-5 space-y-4 type-site-lede text-ink-muted [&_a]:underline [&_a]:underline-offset-4"
          >
            {children}
          </div>
        </div>
        <div className="min-w-0">{figure}</div>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-raised">
      <div className="border-b border-line bg-paper-sunk px-4 py-2 type-site-small font-bold text-ink">{title}</div>
      <div className="p-4 type-site-small">{children}</div>
    </div>
  );
}

/**
 * A recording of the app as built (scripts/site-record.mjs, `npm run gen:recordings`), at a phone's width, so that
 * the app's text is its own size on a phone. One per theme, the page's shown: a <picture> per theme would not follow
 * the toggle. Nothing plays until asked, so the poster, the clip's last frame, is the still a reader who asked for
 * reduced motion sees; the text beside it (`described`) says what it shows without playing it. site.js takes the
 * browser's controls off until the clip is asked for, and shows the Play button instead.
 */
function Clip({ name, label, title, described }: { name: string; label: string; title: string; described: string }) {
  return (
    <figure className="mx-auto w-full max-w-[390px] lg:max-w-[340px]">
      {(["dark", "light"] as const).map((theme) => (
        <div key={theme} className={`shot-${theme} relative`}>
          <video
            className="block h-auto w-full rounded-lg border border-line-strong"
            poster={`/recordings/${name}-${theme}.avif`}
            width={390}
            height={720}
            controls
            muted
            playsInline
            preload="none"
            aria-label={label}
            aria-describedby={described}
          >
            <source src={`/recordings/${name}-${theme}.webm`} type="video/webm" />
            <source src={`/recordings/${name}-${theme}.mp4`} type="video/mp4" />
          </video>
          <button
            type="button"
            data-play
            hidden
            className="absolute bottom-4 left-4 rounded-full bg-action px-4 py-2 type-site-small font-bold text-on-action hover:opacity-90"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className="mr-2 inline-block size-3 fill-current align-[-0.05em]"
            >
              <path d="M3 1.5v9l7.5-4.5z" />
            </svg>
            Play<span className="sr-only">: {title}</span>
          </button>
        </div>
      ))}
    </figure>
  );
}

/** A step of the day: a heading, what happens, and the recording or the piece of the app that shows it. */
const DAY: { id: string; title: string; text: ReactNode; figure: (id: string, title: string) => ReactNode }[] = [
  {
    id: "first-request",
    title: "A first request, one click from here",
    text: (
      <>
        <p>
          Type an address and press Enter. It goes to the host you typed and nowhere else. <Claims ids={["C-001"]} /> A
          cURL command pasted from an API&apos;s docs becomes the request. <Claims ids={["C-056"]} />
        </p>
      </>
    ),
    figure: (id, title) => (
      <Clip name="first-request" label="Wayfarer sending its first request" title={title} described={`${id}-text`} />
    ),
  },
  {
    id: "where-it-went",
    title: "Where each request went",
    text: (
      <>
        <p>
          Under every response, a record of where it went and what History kept, with every secret masked.{" "}
          <Claims ids={["C-008"]} /> Each variable says where its value came from. <Claims ids={["C-025"]} />
        </p>
      </>
    ),
    figure: (id, title) => (
      <Clip
        name="record"
        label="Wayfarer's exchange record of a request sent with a token"
        title={title}
        described={`${id}-text`}
      />
    ),
  },
  {
    id: "secrets",
    title: "API keys that are never stored in clear",
    text: (
      <>
        <p>
          Only the ciphertext is stored, under a key that lives in memory. <Claims ids={["C-003", "C-005"]} /> History,
          exports and copies get a mask. <Claims ids={["C-008", "C-014"]} />
        </p>
      </>
    ),
    figure: () => (
      <div data-ui>
        <Panel title="Environment: Production">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-3 font-code type-site-caption">
            <span className="text-ink-muted">base_url</span>
            <span className="truncate text-ink">https://api.example.com</span>
            <span className="text-ink-muted">API_TOKEN</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-xs border border-line-strong px-1.5 font-text type-site-caption font-bold text-ink">
                Secret stored
              </span>
              <span className="truncate text-ink-muted">{"{{$secret.…}}"}</span>
            </span>
            <span className="text-ink-muted">History keeps</span>
            <span className="text-ink">Authorization: ***</span>
          </div>
          <p className="mt-4 border-t border-line pt-3 text-ink-muted">
            PBKDF2-SHA-256 at 600,000 iterations wraps an AES-GCM-256 key. <Claims ids={["C-004"]} />
          </p>
        </Panel>
      </div>
    ),
  },
  {
    id: "failure",
    title: "When the browser stops a request",
    text: (
      <>
        <p>
          The composer says what the browser will do before you send. <Claims ids={["C-049"]} /> For what a page cannot
          do, the <a href="/docs/browser-limits/">Local Bridge</a> sends it from your machine.{" "}
          <Claims ids={["C-041", "C-064"]} />
        </p>
      </>
    ),
    figure: () => (
      <div data-ui>
        <Panel title="PUT api.example.com/v1/users/42: what the browser does">
          <div className="space-y-3 text-ink-muted">
            <p>
              The browser will not send <code className="text-ink">Cookie</code>: a page is not allowed to set this
              header.
            </p>
            <p>
              The browser asks the server first, with an <code className="text-ink">OPTIONS</code> request, because of
              the method PUT, the header Authorization. The request is sent only if the server&apos;s answer allows it.
            </p>
          </div>
        </Panel>
      </div>
    ),
  },
  {
    id: "share",
    title: "A collection for a teammate",
    text: (
      <>
        <p>
          The collection travels encrypted after the link&apos;s <code>#</code>, which a browser sends to no server.{" "}
          <Claims ids={["C-084"]} /> Your teammate sees every host it calls before anything is stored.{" "}
          <Claims ids={["C-086", "C-090"]} />
        </p>
      </>
    ),
    figure: (id, title) => (
      <Clip
        name="share"
        label="Wayfarer sharing a collection by link, and a teammate opening it"
        title={title}
        described={`${id}-text`}
      />
    ),
  },
  {
    id: "run",
    title: "The same run, here and in CI",
    text: (
      <>
        <p>
          Run a collection here, or in CI with <code>wayfarer-cli</code>: the same requests, in the same order, to the
          same results. <Claims ids={["C-065"]} />
        </p>
      </>
    ),
    figure: (id, title) => (
      <Clip name="run" label="Wayfarer running a collection of three requests" title={title} described={`${id}-text`} />
    ),
  },
];

/** What the day did not show, each with its icon, its claims and its page. */
const MORE: { title: string; icon: string; text: ReactNode; href: string }[] = [
  {
    title: "Auth",
    icon: "key",
    text: (
      <>
        Bearer, Basic, API key, OAuth 2.0 and AWS Signature, inherited from a folder.{" "}
        <Claims ids={["C-019", "C-061", "C-062"]} />
      </>
    ),
    href: "/docs/auth/",
  },
  {
    title: "Import",
    icon: "upload_file",
    text: (
      <>
        Postman, Insomnia, OpenAPI, HAR and cURL, with a report first. <Claims ids={["C-058", "C-059", "C-060"]} />
      </>
    ),
    href: "/docs/import/",
  },
  {
    title: "Export",
    icon: "download",
    text: (
      <>
        cURL, fetch, Python, HTTPie, HAR and Postman v2.1, masked. <Claims ids={["C-020", "C-055", "C-035", "C-057"]} />
      </>
    ),
    href: "/docs/export/",
  },
  {
    title: "GraphQL, WebSocket, streams",
    icon: "bolt",
    text: (
      <>
        A schema from the server, sockets logged message by message, events as they arrive.{" "}
        <Claims ids={["C-093", "C-091", "C-092"]} />
      </>
    ),
    href: "/docs/graphql/",
  },
  {
    title: "AI that asks before it sends",
    icon: "visibility",
    text: (
      <>
        Off until you add a provider, and every byte shown before it goes. <Claims ids={["C-069", "C-071"]} />
      </>
    ),
    href: "/docs/ai/",
  },
  {
    title: "Offline and installable",
    icon: "dns",
    text: (
      <>
        Loads offline after one visit, installs as an app, works by keyboard alone.{" "}
        <Claims ids={["C-015", "C-036", "C-067"]} />
      </>
    ),
    href: "/docs/getting-started/",
  },
];

/** One of the app's icons, drawn as the app draws it. */
function Icon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
    >
      <path d={iconPath(name)} />
    </svg>
  );
}

/** The ledger rows the trust section quotes, as the ledger words them, with the tests that hold them. */
const QUOTED = ["C-084", "C-003", "C-001"];

function Ledger() {
  const rows = claims();
  const quoted = QUOTED.map((id) => rows.find((row) => row.id === id)).filter((row) => row !== undefined);
  // The ledger's check, as it prints, and three rows: each claim's first clause and the test that holds it.
  return (
    <pre
      aria-label="The claims ledger's check in a terminal"
      className="rounded-lg border border-line-strong bg-code-bg p-5 font-code type-site-caption whitespace-pre-wrap text-code-ink"
    >
      <span className="text-code-muted">$ </span>npm run check:claims{"\n"}
      Claims ledger OK: {rows.length} claims, each with a doc marker and a test.{"\n\n"}
      {quoted.map((row) => (
        <span key={row.id}>
          <span className="text-code-string">✓</span> {row.text.split(/[:;]/)[0]}
          {"\n"}
          {"  "}
          <span className="text-code-muted">{row.tests[0]}</span>
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

const QUESTIONS: [string, ReactNode][] = [
  [
    "What does it cost?",
    <>
      Nothing. Wayfarer is open source under the MIT licence, and there is no paid plan and no account to make. You can
      also <a href="/docs/self-hosting/">host it yourself</a>: it is a folder of files and a set of headers.
    </>,
  ],
  [
    "Is it safe to put API keys into a website?",
    <>
      The page runs no script it did not ship: its policy forbids <code>eval</code> and inline script, and only its own
      script addresses pass. <Claims ids={["C-011", "C-016"]} /> A key in the vault is stored only as ciphertext, under
      a key held in memory. <Claims ids={["C-003", "C-005"]} /> The <a href="/docs/threat-model/">threat model</a> says
      what this protects against and what it does not.
    </>,
  ],
  [
    "Where are my collections kept?",
    <>
      In your browser&apos;s IndexedDB, on the device you use. <Claims ids={["C-002"]} /> Back up the whole workspace to
      one file whenever you want; the vault&apos;s secrets stay encrypted inside it. <Claims ids={["C-046"]} />
    </>,
  ],
  [
    "Can my team share collections?",
    <>
      Yes, as a copy: Share… sends a collection as a file, or as a link whose encrypted content is after the{" "}
      <code>#</code>, which a browser sends to no server, and holds no vault secret. <Claims ids={["C-084", "C-087"]} />{" "}
      Your teammate sees what it adds and every host it sends to before anything is stored.{" "}
      <Claims ids={["C-086", "C-090"]} /> A workspace that stays in step, through Git, is <a href="/roadmap/">next</a>.{" "}
      See <a href="/docs/sharing/">sharing</a>.
    </>,
  ],
  [
    "A request works in Postman and fails here. Why?",
    <>
      A page in a browser has rules a desktop app does not: CORS, headers it may not set, no relaxed TLS. The composer
      says before you send what the browser will do. <Claims ids={["C-049"]} /> For what a browser cannot do, the{" "}
      <a href="/docs/browser-limits/">Local Bridge</a> sends the request from your machine.{" "}
      <Claims ids={["C-041", "C-064"]} />
    </>,
  ],
  [
    "What does it not do yet?",
    <>
      No gRPC, MQTT or Socket.IO, no MCP server, and collections are not files in a Git repository; Git is{" "}
      <a href="/roadmap/">next</a>. The comparisons list <a href="/compare/#behind">where Wayfarer is behind</a>.
    </>,
  ],
];

/**
 * A still of the app as built (scripts/site-screenshot.mjs, `npm run gen:shots`), one per theme, the page's shown, as
 * a recording is. The hidden one is lazy, so it is not fetched; the hero's are eager, the first thing drawn.
 */
function Shot({
  name,
  alt,
  width,
  height,
  sizes,
  hero = false,
  className = "",
}: {
  name: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  hero?: boolean;
  className?: string;
}) {
  return (
    <>
      {(["dark", "light"] as const).map((theme) => (
        <img
          key={theme}
          className={`shot-${theme} block w-full ${className || "h-auto"}`}
          src={hero ? `/shots/${name}-${theme}.1x.avif` : `/shots/${name}-${theme}.avif`}
          srcSet={hero ? `/shots/${name}-${theme}.1x.avif 1440w, /shots/${name}-${theme}.2x.avif 2880w` : undefined}
          sizes={sizes}
          width={width}
          height={height}
          alt={alt}
          loading={hero ? "eager" : "lazy"}
          decoding="async"
        />
      ))}
    </>
  );
}

/** What the hero's picture points out: a number on the picture, at a place in it, and the line under it. */
const MARKS: { at: string; text: ReactNode }[] = [
  {
    at: "left-[21%] top-[14%]",
    text: (
      <>
        A Postman collection, imported, scripts and all. <Claims ids={["C-058"]} />
      </>
    ),
  },
  {
    at: "left-[56.4%] top-[26.6%]",
    text: (
      <>
        Each variable says where its value came from. <Claims ids={["C-025"]} />
      </>
    ),
  },
  {
    at: "left-[77%] top-[37%]",
    text: (
      <>
        The answer, straight from api.example.com. <Claims ids={["C-001"]} />
      </>
    ),
  },
  {
    at: "left-[24.3%] top-[98.4%]",
    text: (
      <>
        Sent from this tab: no server of ours in between. <Claims ids={["C-064"]} />
      </>
    ),
  },
];

/** The Postman move, a picture a step. */
const STEPS: { title: string; shot: string; width: number; height: number; alt: string; text: ReactNode }[] = [
  {
    title: "Import it",
    shot: "import",
    width: 960,
    height: 720,
    alt: "Wayfarer's import report for a Postman collection: what it adds, its scripts held, and the one host it calls",
    text: (
      <>
        You see what it adds and every host it calls before anything is stored. <Claims ids={["C-054", "C-090"]} />
      </>
    ),
  },
  {
    title: "Read its scripts",
    shot: "review",
    width: 1100,
    height: 825,
    alt: "Wayfarer's review of the collection's scripts, each shown as it will run, before they are trusted",
    text: (
      <>
        They wait until you have read them, then run in a sandbox. <Claims ids={["C-051", "C-052"]} />
      </>
    ),
  },
  {
    title: "Run it",
    shot: "run",
    width: 1100,
    height: 825,
    alt: "Wayfarer's run of the collection: six requests, each with its status, time and passing test",
    text: (
      <>
        Here, or in CI with <code>wayfarer-cli</code>, to the same results. <Claims ids={["C-065"]} />
      </>
    ),
  },
];

export default function Home() {
  const ledger = claims();
  const clips = DAY.filter((step) => ["first-request", "where-it-went", "share", "run"].includes(step.id));
  const panels = DAY.filter((step) => !clips.includes(step));
  return (
    <>
      <Header />
      <JsonLd data={homeGraph(version, DESCRIPTION)} />
      <main id="main">
        <section aria-labelledby="hero">
          <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
            <h1
              id="hero"
              className="max-w-[12em] type-site-title-1 font-bold text-balance text-ink sm:type-site-display lg:type-site-hero"
            >
              The API client that opens in a tab
            </h1>
            <p className="mt-6 max-w-2xl type-site-lede text-ink-muted">
              Import a Postman collection, run its scripts and share it as an encrypted link. No install, no account,
              and no server of ours in between. <Claims ids={["C-058", "C-040", "C-084", "C-001"]} />
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/app/"
                className="rounded-sm bg-action px-6 py-3.5 type-site-lede font-bold whitespace-nowrap text-on-action hover:opacity-90"
              >
                Open Wayfarer
              </a>
              <a
                href="/compare/moving-from-postman/"
                className="rounded-sm border border-line-strong bg-paper px-6 py-3.5 type-site-lede font-bold whitespace-nowrap text-ink hover:border-action"
              >
                Moving from Postman
              </a>
              <span className="type-site-small text-ink-muted">Free and MIT-licensed.</span>
            </div>
          </div>
          <div className="mx-auto max-w-7xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
            <figure>
              {/* On a phone the picture is drawn twice its width and shows the request and its answer, at a size that
                  reads; from 768 px it is the whole app. */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-line-strong shadow-2xl shadow-ink/10 md:aspect-auto">
                <Shot
                  hero
                  className="h-full object-cover object-[80%_40%] md:h-auto md:object-fill"
                  name="hero"
                  width={1440}
                  height={900}
                  sizes="(min-width: 80rem) 78rem, (min-width: 48rem) 100vw, 230vw"
                  alt="Wayfarer with a Postman collection imported: a POST request built from its variables, and the JSON answer, 201 Created"
                />
                {MARKS.map((mark, i) => (
                  <span
                    key={mark.at}
                    aria-hidden="true"
                    className={`absolute ${mark.at} hidden size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-paper bg-action font-code type-site-caption font-bold text-on-action md:grid`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
              <figcaption>
                <ol className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 type-site-small text-ink-muted sm:grid-cols-2 lg:grid-cols-4">
                  {MARKS.map((mark, i) => (
                    <li key={mark.at} className="flex gap-3">
                      <span className="hidden font-code font-bold text-ink md:inline">{i + 1}</span>
                      <span>{mark.text}</span>
                    </li>
                  ))}
                </ol>
              </figcaption>
            </figure>
          </div>
        </section>

        <section aria-label="Wayfarer in figures" className="border-y border-line">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 lg:grid-cols-4">
            {[
              ["0", "accounts to make", ["C-001"]],
              ["0", "servers of ours between you and your API", ["C-001"]],
              [String(ledger.length), "public claims, each with its own test", []],
              ["3", "browser engines that run those tests", []],
            ].map(([figure, label, ids]) => (
              <div key={String(label)} className="flex flex-col-reverse gap-1">
                <dt className="type-site-small text-ink-muted">
                  {label} {ids.length > 0 && <Claims ids={ids as string[]} />}
                </dt>
                <dd className="type-site-display font-bold text-ink">{figure}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="leaves" className="bg-paper-sunk">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
            <div>
              <h2 id="leaves" className="type-site-title-1 font-bold text-ink">
                What leaves the tab
              </h2>
              <p className="mt-5 type-site-lede text-ink-muted">
                The app&apos;s own files, once. Then your request, to the host you typed. That is the whole list.{" "}
                <Claims ids={["C-001", "C-015"]} />
              </p>
              <p className="mt-4 type-site-lede text-ink-muted">
                Your work stays in this browser, and a secret is stored only as ciphertext.{" "}
                <Claims ids={["C-002", "C-003"]} />
              </p>
            </div>
            <RouteDemo />
          </div>
        </section>

        <Section
          id="postman"
          title="Bring your Postman collection"
          intro={
            <p>
              Postman Free has been one user since March 2026 (
              <a className={LINK} href={POSTMAN_PLANS}>
                Postman&apos;s plans
              </a>
              , read on 7 November 2026). Wayfarer has no plans and no seats.
            </p>
          }
        >
          <ol className="mt-12 space-y-12 lg:space-y-16">
            {STEPS.map((step, i) => (
              <li
                key={step.shot}
                className={`grid grid-cols-1 items-center gap-6 lg:gap-14 ${i % 2 === 1 ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"}`}
              >
                <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                  <h3 className="type-site-title-2 font-bold text-ink">
                    <span className="mr-3 font-code text-ink-muted">{i + 1}</span>
                    {step.title}
                  </h3>
                  <p className="mt-3 type-site-lede text-ink-muted [&_code]:text-ink">{step.text}</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-line-strong bg-paper p-3 shadow-xl shadow-ink/5 sm:p-4">
                  <Shot
                    name={step.shot}
                    width={step.width}
                    height={step.height}
                    sizes="(min-width: 64rem) 36rem, 100vw"
                    alt={step.alt}
                  />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8">
            <a className={`font-bold ${LINK}`} href="/compare/moving-from-postman/">
              Moving from Postman, step by step
            </a>
          </p>
        </Section>

        <Section
          id="day"
          sunk
          title="A day with Wayfarer"
          intro={<p>Recorded from the app as it is built, at a phone&apos;s width, against made-up answers.</p>}
        >
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {clips.map((step) => (
              <section
                key={step.id}
                aria-labelledby={step.id}
                className="flex flex-col rounded-lg border border-line bg-paper p-5"
              >
                <h3 id={step.id} className="type-site-title-3 font-bold text-ink">
                  {step.title}
                </h3>
                <div
                  id={`${step.id}-text`}
                  className="mt-2 mb-5 flex-1 type-site-small text-ink-muted [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-ink"
                >
                  {step.text}
                </div>
                {step.figure(step.id, step.title)}
              </section>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {panels.map((step) => (
              <section key={step.id} aria-labelledby={step.id} className="rounded-lg border border-line bg-paper p-5">
                <h3 id={step.id} className="type-site-title-3 font-bold text-ink">
                  {step.title}
                </h3>
                <div
                  id={`${step.id}-text`}
                  className="mt-2 mb-5 type-site-small text-ink-muted [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-ink"
                >
                  {step.text}
                </div>
                {step.figure(step.id, step.title)}
              </section>
            ))}
          </div>
        </Section>

        <Section
          id="ask-first"
          title="What the others ask of you first"
          intro={
            <p>
              From each one&apos;s own documentation, read on the date in its cell. The last row is where Wayfarer is
              behind.
            </p>
          }
        >
          <AskFirst />
          <p className="mt-10">
            <a href="/compare/" className={`font-bold ${LINK}`}>
              See every comparison
            </a>
          </p>
        </Section>

        <Feature id="trust" title="Every sentence here names its test" sunk flip figure={<Ledger />}>
          <p>
            What this page says Wayfarer does is a row of a public ledger, and each row names the test that proves it,
            run in three browsers before a release ships (<a href="/blog/the-claims-ledger/">how it works</a>).
          </p>
          <p>
            The <a href="/docs/threat-model/">threat model</a> says what this protects against and what it does not. The{" "}
            <a href="https://github.com/AshwinSathian/wayfarer">source</a> is MIT.
          </p>
        </Feature>

        <Section id="more" title="Also in the app">
          <ul className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {MORE.map((item) => (
              <li key={item.title} className="bg-paper">
                <a href={item.href} className="group flex h-full gap-4 p-6 hover:bg-paper-sunk">
                  <span className="mt-0.5 text-ink">
                    <Icon name={item.icon} />
                  </span>
                  <span>
                    <span className="block type-site-title-3 font-bold text-ink group-hover:underline group-hover:underline-offset-4">
                      {item.title}
                    </span>
                    <span className="mt-1 block type-site-small text-ink-muted">{item.text}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="questions" sunk title="Questions">
          <div className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
            {QUESTIONS.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 type-site-lede font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {question}
                  <span
                    aria-hidden="true"
                    className="type-site-title-2 text-action transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-ink-muted [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </Section>

        <section aria-labelledby="start" className="bg-action text-on-action">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="start" className="type-site-title-1 font-bold">
                Send your first request.
              </h2>
              <p className="mt-2 type-site-lede opacity-90">
                It opens in this tab. Nothing to install, no account to make.
              </p>
            </div>
            <a
              href="/app/"
              className="rounded-sm bg-paper px-6 py-3.5 type-site-lede font-bold text-ink hover:opacity-90"
            >
              Open Wayfarer
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
