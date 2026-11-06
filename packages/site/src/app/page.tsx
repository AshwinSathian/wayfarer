// The landing (W2.1, rebuilt in PLAN-design 1.8 and D5-e). Each sentence that says what Wayfarer does names the claim
// that proves it (docs/claims.md), out of the reader's sight (PLAN-design row 1.74): e2e/site.spec.ts holds every ID
// named here to the ledger, and the claims page is one link, the footer's. A fact about another product names its
// source and the date it was read.
import { pageMeta } from "../lib/meta";
import { version } from "../../../../package.json";
import type { ReactNode } from "react";
import { AskFirst } from "../components/AskFirst";
import { Claims } from "../components/Claims";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { RouteDemo } from "../components/RouteDemo";
import { JsonLd } from "../components/JsonLd";
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
}: {
  id: string;
  title: string;
  children: ReactNode;
  figure: ReactNode;
  sunk?: boolean;
  flip?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={sunk ? "bg-paper-sunk" : undefined}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-16">
        <div className={flip ? "lg:order-2" : undefined}>
          <h2 id={id} className="type-site-title-1 font-bold text-ink">
            {title}
          </h2>
          <div className="mt-5 space-y-4 type-site-lede text-ink-muted [&_a]:underline [&_a]:underline-offset-4">
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
      In your browser&apos;s IndexedDB, on the device you use. <Claims ids={["C-002"]} /> Export a collection or back up
      the whole workspace whenever you want; a backup is one file.
    </>,
  ],
  [
    "What if my browser clears its storage?",
    <>
      Your work is in this browser&apos;s IndexedDB, which a browser may clear. <Claims ids={["C-002"]} /> Back up the
      whole workspace to one file whenever you want; the vault&apos;s secrets stay encrypted inside it.{" "}
      <Claims ids={["C-046"]} />
    </>,
  ],
  [
    "Does it work offline?",
    <>
      After one visit it loads without a network, and its service worker keeps only the app&apos;s own files.{" "}
      <Claims ids={["C-015"]} />
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
    "Can my team share collections?",
    <>
      Yes, as a copy: Share… sends a collection as a file, or as a link whose encrypted content is after the{" "}
      <code>#</code>, which a browser sends to no server, and holds no vault secret. <Claims ids={["C-084", "C-087"]} />{" "}
      Your teammate sees what it adds and every host it sends to before anything is stored.{" "}
      <Claims ids={["C-086", "C-090"]} /> A workspace that stays in step, through Git, is <a href="/roadmap/">next</a>.{" "}
      See <a href="/docs/sharing/">sharing</a>.
    </>,
  ],
];

/**
 * The landing's recordings of the app as built (scripts/site-record.mjs, `npm run gen:recordings`), at a phone's
 * width, so that the app's text is its own size on a phone. One per theme, the page's shown: a <picture> per theme
 * would not follow the toggle. Nothing plays until asked, so the poster, the clip's last frame, is the still a reader
 * who asked for reduced motion sees; the steps beside it say what it shows without playing it.
 */
const RECORDINGS: { name: string; title: string; label: string; steps: ReactNode[] }[] = [
  {
    name: "first-request",
    title: "The first request",
    label: "Wayfarer sending its first request",
    steps: [
      <>Type the address in an empty tab.</>,
      <>Press Send.</>,
      <>
        The response comes back with its status, time and size, sent to the host you typed and nowhere else.{" "}
        <Claims ids={["C-001"]} />
      </>,
    ],
  },
  {
    name: "record",
    title: "Where it went",
    label: "Wayfarer's exchange record of a request sent with a token",
    steps: [
      <>Open a saved request whose Authorization header holds a token from the environment, and send it.</>,
      <>Open the line that says where it went: Direct to api.example.com.</>,
      <>
        The record says it was sent from this page, and that History keeps Authorization masked.{" "}
        <Claims ids={["C-008"]} />
      </>,
    ],
  },
  {
    name: "run",
    title: "A run's report",
    label: "Wayfarer running a collection of three requests",
    steps: [
      <>Choose Run… on a collection of three requests.</>,
      <>Press Run.</>,
      <>
        Each request is sent in order and its tests run; the report counts what passed, as <code>wayfarer-cli</code>{" "}
        would in CI. <Claims ids={["C-065"]} />
      </>,
    ],
  },
];

function Recording({ name, title, label, steps }: (typeof RECORDINGS)[number]) {
  return (
    <figure className="min-w-0 md:max-lg:grid md:max-lg:grid-cols-2 md:max-lg:items-center md:max-lg:gap-10">
      {(["dark", "light"] as const).map((theme) => (
        <video
          key={theme}
          className={`shot-${theme} mx-auto h-auto w-full max-w-[390px] rounded-lg border border-line-strong`}
          poster={`/recordings/${name}-${theme}.avif`}
          width={390}
          height={720}
          controls
          muted
          playsInline
          preload="none"
          aria-label={label}
          aria-describedby={`${name}-steps`}
        >
          <source src={`/recordings/${name}-${theme}.webm`} type="video/webm" />
          <source src={`/recordings/${name}-${theme}.mp4`} type="video/mp4" />
        </video>
      ))}
      <figcaption className="mx-auto mt-6 max-w-[390px] md:max-lg:mt-0">
        <h3 className="type-site-title-2 font-bold text-ink">{title}</h3>
        <ol id={`${name}-steps`} className="mt-3 list-decimal space-y-2 pl-5 text-ink-muted">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <Header />
      <JsonLd data={homeGraph(version, DESCRIPTION)} />
      <main>
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
                  Import a Postman collection, run its scripts and keep your API keys encrypted, all in your browser.
                  Nothing to install, no account, and no server of ours between you and your API.{" "}
                  <Claims ids={["C-058", "C-040", "C-003", "C-001"]} />
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
          title="Bring your Postman collection, scripts and all"
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
            Insomnia exports, OpenAPI and Swagger, HAR files and pasted cURL commands import too.{" "}
            <Claims ids={["C-059", "C-060", "C-056"]} />
          </p>
          <p>
            <a className={`font-bold ${LINK}`} href="/compare/moving-from-postman/">
              Moving from Postman, step by step
            </a>
          </p>
        </Feature>

        <Feature
          id="secrets"
          sunk
          flip
          title="API keys that are never stored in clear"
          figure={
            <Panel title="Environment: Production">
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-3 font-code type-site-caption">
                <span className="text-ink-muted">base_url</span>
                <span className="truncate text-ink">https://api.example.com</span>
                <span className="text-ink-muted">API_TOKEN</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded-xs border border-ok/50 px-1.5 font-text type-site-caption font-bold text-ok">
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
          }
        >
          <p>
            Put a key in the vault and only its ciphertext is stored, under a key that lives in memory and is gone when
            you reload. <Claims ids={["C-003", "C-005"]} />
          </p>
          <p>
            It goes out in clear only to the request that names it. History, exports and copies get a mask.{" "}
            <Claims ids={["C-007", "C-008", "C-014"]} />
          </p>
        </Feature>

        <Feature
          id="failure"
          title="When a request fails, it says why"
          figure={
            <Panel title="PUT api.example.com/v1/users/42: what the browser does">
              <div className="space-y-3 text-ink-muted">
                <p>
                  The browser will not send <code className="text-ink">Cookie</code>: a page is not allowed to set this
                  header.
                </p>
                <p>
                  The browser asks the server first, with an <code className="text-ink">OPTIONS</code> request, because
                  of the method PUT, the header Authorization. The request is sent only if the server&apos;s answer
                  allows it.
                </p>
              </div>
            </Panel>
          }
        >
          <p>
            Before you send, the composer names the headers a browser will not send and whether it will ask the server
            first. <Claims ids={["C-049"]} />
          </p>
          <p>
            A network failure shows the real error, never a 504 made up by the service worker.{" "}
            <Claims ids={["C-010"]} />
          </p>
          <p>
            When the page cannot reach a server, the Local Bridge sends the request from your machine, for an origin
            that holds its token. <Claims ids={["C-041", "C-064"]} />
          </p>
        </Feature>

        <Feature
          id="ai"
          sunk
          flip
          title="AI that asks before it sends"
          figure={
            <Panel title="Write tests: what is sent">
              <p className="text-ink-muted">
                Sends to <code className="text-ink">http://localhost:11434/v1</code>. No key is sent.
              </p>
              <pre className="mt-3 rounded-sm bg-code-bg p-3 font-code type-site-caption whitespace-pre-wrap wrap-anywhere text-code-ink">
                {
                  "GET https://api.example.com/v1/users/42\nAuthorization: ***\n\n200 OK, application/json\n(response body: not ticked, not sent)"
                }
              </pre>
              <div className="mt-3 flex justify-end gap-2" aria-hidden="true">
                <span className="rounded-sm px-3 py-1.5 font-bold text-ink">Cancel</span>
                <span className="rounded-sm bg-action px-3 py-1.5 font-bold text-on-action">Send to model</span>
              </div>
            </Panel>
          }
        >
          <p>
            AI is off until you add a provider: until then there is no AI button and no request to a model.{" "}
            <Claims ids={["C-069"]} />
          </p>
          <p>
            Then it can write tests for a response, draft a request from a description or explain a failed response.
            Before each call you see every byte it will send, with secrets and credentials masked, and a response body
            goes only when you tick it. <Claims ids={["C-071", "C-070", "C-072"]} />
          </p>
          <p>
            Nothing it proposes changes your request until you accept it, and Undo puts it back.{" "}
            <Claims ids={["C-073"]} /> <a href="/docs/ai/">How AI works in Wayfarer</a>
          </p>
        </Feature>

        <Feature
          id="ci"
          title="The same run in CI"
          figure={
            <Terminal label="A collection run in a terminal">
              <span className="text-code-muted">$ </span>npx wayfarer-cli run users.postman.json --allow-scripts
              {"\n"}
              <span className="text-code-string">✓</span> Get a user: 200 OK, 17 ms{"\n"}
              {"    "}
              <span className="text-code-string">✓</span> status is 200{"\n"}
              <span className="text-code-string">✓</span> Create a user: 201 Created, 2 ms{"\n"}
              {"    "}
              <span className="text-code-string">✓</span> created{"\n"}
              <span className="text-code-string">✓</span> Delete a user: 204 No Content, 2 ms{"\n"}
              {"    "}
              <span className="text-code-string">✓</span> no content{"\n\n"}3 results in 1 iteration; 0 failed; 3 of 3
              tests passed.
            </Terminal>
          }
        >
          <p>
            <code>wayfarer-cli</code> runs a collection with the app&apos;s engine: the same requests in the same order,
            statuses, tests and errors. <Claims ids={["C-065"]} />
          </p>
          <p>
            It runs a file&apos;s scripts only when you pass <code>--allow-scripts</code>. <Claims ids={["C-066"]} /> It
            writes JSON and JUnit reports for the CI to keep. See{" "}
            <a className={LINK} href="/docs/cli/">
              the command line
            </a>
            .
          </p>
        </Feature>

        <Section
          id="app"
          sunk
          title="See it work"
          intro={
            <>
              <p>
                Recorded from the app as it is built, at a phone&apos;s width. Collections, environments and history are
                kept in your browser, and the vault&apos;s secrets only as ciphertext.{" "}
                <Claims ids={["C-002", "C-003"]} />
              </p>
              <p className="mt-4">
                Version 3.0 redesigned every screen.{" "}
                <a className={LINK} href="/what-changed-in-3-0/">
                  See what changed, before and after
                </a>
                .
              </p>
            </>
          }
        >
          <div className="mt-12 grid grid-cols-1 gap-16 lg:grid-cols-3 lg:gap-10">
            {RECORDINGS.map((recording) => (
              <Recording key={recording.name} {...recording} />
            ))}
          </div>
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
