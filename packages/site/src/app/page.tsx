// The landing (W2.1, rebuilt in PLAN-design 1.8, D5-e and W6.5). Each sentence that says what Wayfarer does names the
// claim that proves it (docs/claims.md), out of the reader's sight (PLAN-design row 1.74): e2e/site.spec.ts holds
// every ID named here to the ledger, and the claims page is one link, the footer's. A fact about another product
// names its source and the date it was read. The page argues in the order of the site audit's section 6
// (docs/design/site-audit-2026-11.md): the tab, why switch, the Postman collection, a day with the app, the proof,
// the rest of the app, the questions, the call.
import { pageMeta } from "../lib/meta";
import { version } from "../../../../package.json";
import type { ReactNode } from "react";
import { AskFirst } from "../components/AskFirst";
import { Claims } from "../components/Claims";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { RouteDemo } from "../components/RouteDemo";
import { JsonLd } from "../components/JsonLd";
import { claims } from "../lib/content";
import { homeGraph } from "../lib/structured-data";

const DESCRIPTION =
  "Import Postman collections, run their scripts, keep API keys encrypted and share a collection by encrypted link, in your browser. No install, no account, no server of ours between you and your API. Free and MIT-licensed.";

export const metadata = pageMeta("/", "Wayfarer: the API client that opens in a tab", DESCRIPTION);

const POSTMAN_PRICING = "https://www.postman.com/pricing/";
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

function Terminal({ label, children }: { label: string; children: ReactNode }) {
  // It scrolls sideways on a narrow window, so it takes focus: a keyboard can scroll it.
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="overflow-x-auto rounded-lg bg-code-bg p-5 font-code type-site-caption whitespace-pre text-code-ink"
    >
      {children}
    </pre>
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
          Open Wayfarer, type the address and press Enter: two actions from an empty app (
          <a href="/docs/design/benchmark/">measured</a>). The response comes back with its status, time and size, sent
          to the host you typed and nowhere else. <Claims ids={["C-001"]} />
        </p>
        <p>
          Paste a cURL command from an API&apos;s docs instead, and it becomes the request. <Claims ids={["C-056"]} />
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
          Under every response, a record says where the request went and what History kept of it, with{" "}
          <code>Authorization</code> and every vault secret masked. <Claims ids={["C-008"]} />
        </p>
        <p>
          Before you send, the composer shows where each variable&apos;s value comes from, and holds a request with an
          empty one until you choose. <Claims ids={["C-025", "C-045"]} />
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
          Put a key in the vault and only its ciphertext is stored, under a key that lives in memory and is gone when
          you reload. <Claims ids={["C-003", "C-005"]} />
        </p>
        <p>
          It goes out in clear only to the request that names it. History, exports and copies get a mask.{" "}
          <Claims ids={["C-007", "C-008", "C-014"]} />
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
          Before you send, the composer names the headers a browser will not send and whether it will ask the server
          first. After, a network failure shows the real error, never a 504 made up by the service worker.{" "}
          <Claims ids={["C-049", "C-010"]} />
        </p>
        <p>
          For what a page cannot do, the <a href="/docs/browser-limits/">Local Bridge</a>, a program you run, sends the
          request from your machine, for an origin that holds its token. <Claims ids={["C-041", "C-064"]} />
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
          Share… makes a link with the collection encrypted after its <code>#</code>, which a browser sends to no
          server, ours included. <Claims ids={["C-084"]} />
        </p>
        <p>
          Your teammate opens the link and sees what it adds and every host it sends to before anything is stored. No
          vault secret goes with it, and a typed credential is <code>***</code> unless you include it.{" "}
          <Claims ids={["C-086", "C-090", "C-087", "C-088"]} /> <a href="/docs/sharing/">How sharing works</a>
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
          Run… sends each request of a collection in order and runs its tests. <code>wayfarer-cli</code> runs the same
          collection in CI with the app&apos;s engine: the same requests in the same order, statuses, tests and errors.{" "}
          <Claims ids={["C-065"]} />
        </p>
        <p>
          It runs a file&apos;s scripts only when you pass <code>--allow-scripts</code>. <Claims ids={["C-066"]} /> See{" "}
          <a href="/docs/cli/">the command line</a>.
        </p>
        <Terminal label="The same run in a terminal">
          <span className="text-code-muted">$ </span>npx wayfarer-cli run users.json --allow-scripts{"\n"}
          <span className="text-code-string">✓</span> Get a user: 200 OK{"\n"}
          <span className="text-code-string">✓</span> Create a user: 201 Created{"\n"}
          <span className="text-code-string">✓</span> Delete a user: 204 No Content{"\n\n"}3 of 3 tests passed.
        </Terminal>
      </>
    ),
    figure: (id, title) => (
      <Clip name="run" label="Wayfarer running a collection of three requests" title={title} described={`${id}-text`} />
    ),
  },
];

/** What the day did not show, each with its claims and its page. */
const MORE: { title: string; text: ReactNode; href: string }[] = [
  {
    title: "Auth",
    text: (
      <>
        Bearer, Basic, API key, OAuth 2.0 (authorization code with PKCE, client credentials, password) and AWS Signature
        Version 4, set on a request or inherited from its collection and folders.{" "}
        <Claims ids={["C-019", "C-061", "C-062"]} />
      </>
    ),
    href: "/docs/auth/",
  },
  {
    title: "Import",
    text: (
      <>
        Postman collections, environments and globals; Insomnia exports; OpenAPI 3 and Swagger 2; HAR files and cURL
        commands, each with a report before anything is stored. <Claims ids={["C-058", "C-059", "C-060", "C-056"]} />
      </>
    ),
    href: "/docs/import/",
  },
  {
    title: "Export",
    text: (
      <>
        Copy as cURL, JavaScript fetch, Python requests or HTTPie, masked; a HAR file; a Postman v2.1 collection.{" "}
        <Claims ids={["C-020", "C-055", "C-035", "C-057"]} />
      </>
    ),
    href: "/docs/export/",
  },
  {
    title: "Bodies and responses",
    text: (
      <>
        Raw, form, multipart, binary and GraphQL bodies. A response shown by its type, an HTML one in a frame that runs
        none of its scripts. <Claims ids={["C-039", "C-009", "C-048"]} />
      </>
    ),
    href: "/docs/graphql/",
  },
  {
    title: "AI that asks before it sends",
    text: (
      <>
        Off until you add a provider. Then it writes tests, drafts a request or explains a failure, and shows every byte
        before it goes, masked. Nothing changes until you accept it.{" "}
        <Claims ids={["C-069", "C-071", "C-070", "C-073"]} />
      </>
    ),
    href: "/docs/ai/",
  },
  {
    title: "Offline, installed, by keyboard",
    text: (
      <>
        It loads offline after one visit and installs as an app. The core flow needs no pointer, and the main views pass
        an automated WCAG 2.2 AA scan. <Claims ids={["C-015", "C-036", "C-067", "C-038"]} />
      </>
    ),
    href: "/docs/getting-started/",
  },
];

/** The ledger rows the trust section quotes, as the ledger words them, with the tests that hold them. */
const QUOTED = ["C-084", "C-003", "C-001"];

function Ledger() {
  const rows = claims();
  const quoted = QUOTED.map((id) => rows.find((row) => row.id === id)).filter((row) => row !== undefined);
  return (
    <div data-ui className="overflow-hidden rounded-lg border border-line-strong bg-paper-raised">
      <div className="border-b border-line bg-paper-sunk px-4 py-2 type-site-small font-bold text-ink">
        The claims ledger, {rows.length} rows
      </div>
      <ul className="divide-y divide-line">
        {quoted.map((row) => (
          <li key={row.id} className="px-4 py-3 type-site-small">
            <p className="text-ink">{row.text}</p>
            <p className="mt-1.5 text-ink-muted">
              Tested by{" "}
              {row.tests.map((test, i) => (
                <span key={test}>
                  {i ? ", " : ""}
                  <code className="type-site-caption">{test}</code>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </div>
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

export default function Home() {
  return (
    <>
      <Header />
      <JsonLd data={homeGraph(version, DESCRIPTION)} />
      <main id="main">
        <section aria-labelledby="hero">
          <div className="mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:pb-28">
            <h1
              id="hero"
              className="max-w-[12em] type-site-title-1 font-bold text-balance text-ink sm:type-site-display lg:type-site-hero"
            >
              The API client that opens in a tab
            </h1>
            <div className="mt-8 grid grid-cols-1 items-start gap-14 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
              <div>
                <p className="max-w-xl type-site-lede text-ink">
                  Import a Postman collection, run its scripts, and send it to a teammate as an encrypted link, all from
                  this browser tab. Nothing to install, no account, and no server of ours between you and your API.{" "}
                  <Claims ids={["C-058", "C-040", "C-084", "C-001"]} />
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-3">
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
                </div>
                <p className="mt-5 type-site-small text-ink-muted">Free and MIT-licensed. It opens in this tab.</p>
              </div>
              <RouteDemo />
            </div>
          </div>
        </section>

        <Section
          id="ask-first"
          sunk
          title="What the others ask of you first"
          intro={
            <p>
              From each one&apos;s own documentation, read on the date in its cell. Wayfarer&apos;s answers name their
              tests. The last row is where Wayfarer is behind.
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

        <Feature
          id="postman"
          title="Bring your Postman collection"
          figure={
            <ol className="space-y-8 lg:pt-2">
              {[
                [
                  "Import it.",
                  <>
                    Collections v2.0 and v2.1, environments and globals. You see what the file adds, and what could not
                    be kept, before anything is stored. <Claims ids={["C-058", "C-054"]} />
                  </>,
                ],
                [
                  "Read its scripts.",
                  <>
                    They stay held until you have read them and said you trust them. Then they run with the parts of{" "}
                    <code>pm</code> the <a href="/docs/postman-compatibility/">compatibility page</a> lists.{" "}
                    <Claims ids={["C-051", "C-040"]} />
                  </>,
                ],
                [
                  "Run it.",
                  <>
                    Here, or in CI with <code>wayfarer-cli</code>, to the same results. <Claims ids={["C-065"]} />
                  </>,
                ],
              ].map(([title, text]) => (
                <li key={String(title)}>
                  <h3 className="type-site-title-2 font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-ink-muted [&_a]:underline [&_a]:underline-offset-4">{text}</p>
                </li>
              ))}
            </ol>
          }
        >
          <p>
            Postman Free has been one user since March 2026 (
            <a className={LINK} href={POSTMAN_PLANS}>
              Postman&apos;s plans
            </a>
            ), and its Team plan is $19 a user a month, billed yearly (
            <a className={LINK} href={POSTMAN_PRICING}>
              Postman&apos;s pricing
            </a>
            , both read on 7 November 2026). Wayfarer has no plans and no seats, and a collection goes to a teammate as
            a file or an encrypted link. <Claims ids={["C-084"]} />
          </p>
          <p>
            <a className={`font-bold ${LINK}`} href="/compare/moving-from-postman/">
              Moving from Postman, step by step
            </a>
          </p>
        </Feature>

        <section aria-labelledby="day" className="bg-paper-sunk">
          <div className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
            <h2 id="day" className="max-w-3xl type-site-title-1 font-bold text-ink">
              A day with Wayfarer
            </h2>
            <p className="mt-5 max-w-2xl type-site-lede text-ink-muted">
              Recorded from the app as it is built, at a phone&apos;s width, against made-up answers. Version 3.0
              redesigned every screen:{" "}
              <a className={LINK} href="/what-changed-in-3-0/">
                see what changed
              </a>
              .
            </p>
          </div>
          {DAY.map((step, i) => (
            <Feature
              key={step.id}
              id={step.id}
              title={step.title}
              level={3}
              flip={i % 2 === 1}
              figure={step.figure(step.id, step.title)}
            >
              {step.text}
            </Feature>
          ))}
        </section>

        <Feature id="trust" title="Every sentence here names its test" flip figure={<Ledger />}>
          <p>
            Each sentence on this page that says what Wayfarer does is a row of its claims ledger, and each row names
            the automated test that proves it. A claim test is never retried, and the browser tests run in Chromium,
            Firefox and WebKit before a release is deployed (<a href="/blog/the-claims-ledger/">how the ledger works</a>
            ).
          </p>
          <p>
            The <a href="/docs/threat-model/">threat model</a> says what this protects against and what it does not; the{" "}
            <a href="/docs/trust-center/">trust center</a> answers a security review; the{" "}
            <a href="https://github.com/AshwinSathian/wayfarer">source</a> is MIT.
          </p>
        </Feature>

        <Section id="more" sunk title="Also in the app">
          <dl className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {MORE.map((item) => (
              <div key={item.title}>
                <dt className="type-site-title-2 font-bold text-ink">
                  <a href={item.href} className="hover:text-action">
                    {item.title}
                  </a>
                </dt>
                <dd className="mt-2 text-ink-muted">{item.text}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="questions" title="Questions">
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
