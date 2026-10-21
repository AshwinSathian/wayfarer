// The landing (W2.1, rebuilt in PLAN-design 1.8). Each sentence that says what Wayfarer does names the claim that
// proves it (docs/claims.md): e2e/site.spec.ts holds every ID named here to the ledger. A fact about another product
// names its source and the date it was read.
import { SITE, pageMeta } from "../lib/meta";
import { version } from "../../../../package.json";
import type { ReactNode } from "react";
import { Claims } from "../components/Claims";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { RouteDemo } from "../components/RouteDemo";
import { claims } from "../lib/content";

export const metadata = pageMeta(
  "/",
  "Wayfarer: an API client in your browser",
  "An API client that runs in your browser and keeps your work on your device. No install, no account, no server of its own.",
);

/**
 * What search engines read about the app (W3.1): schema.org's SoftwareApplication, as data in the page, which the
 * site's policy does not run. No rating or review: there are none to give.
 */
const SOFTWARE = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wayfarer",
  description:
    "An API client that runs in your browser and keeps your work on your device. No install, no account, no server of its own.",
  url: `${SITE}/app/`,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any, in a web browser",
  softwareVersion: version,
  license: "https://opensource.org/license/mit",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const POSTMAN_PRICING = "https://www.postman.com/pricing/";
const YAAK_POST = "https://yaak.app/blog/postman-free-plan-one-user";
/** The ledger's rows shown as evidence: the ones a reader of this page asks about first. */
const EVIDENCE = ["C-001", "C-003", "C-007", "C-011", "C-052"];

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <h2
          id={id}
          className="max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight text-ink sm:text-[2.6rem]"
        >
          {title}
        </h2>
        {intro && <div className="mt-5 max-w-2xl text-lg text-ink-muted">{intro}</div>}
        {children}
      </div>
    </section>
  );
}

/** One thing Wayfarer does: what it is, beside a piece of the app that shows it. */
function Feature({ title, children, figure }: { title: string; children: ReactNode; figure: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-8 border-t border-line py-12 first:border-t-0 first:pt-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <h3 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h3>
        <div className="mt-3 space-y-3 text-ink-muted">{children}</div>
      </div>
      <div className="min-w-0">{figure}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line-strong bg-paper-raised">
      <div className="border-b border-line bg-paper-sunk px-4 py-2 text-sm font-bold text-ink">{title}</div>
      <div className="p-4 text-sm">{children}</div>
    </div>
  );
}

function Terminal({ label, children }: { label: string; children: ReactNode }) {
  // It scrolls sideways on a narrow window, so it takes focus: a keyboard can scroll it.
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="overflow-x-auto rounded-xl bg-code-bg p-5 font-mono text-[0.8rem] leading-6 whitespace-pre text-code-ink"
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
    "Where are my collections kept?",
    <>
      In your browser&apos;s IndexedDB, on the device you use. <Claims ids={["C-002"]} /> Export a collection or back up
      the whole workspace whenever you want; a backup is one file.
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
      Today, as files: export a collection, send it, and the other person sees what it adds before it is stored, with
      its scripts held until they have read them. <Claims ids={["C-054", "C-051"]} /> Sharing without a server of
      anyone&apos;s is on the <a href="/roadmap/">roadmap</a>.
    </>,
  ],
];

export default function Home() {
  const ledger = claims();
  const evidence = EVIDENCE.map((id) => ledger.find((claim) => claim.id === id)).filter((claim) => claim !== undefined);
  return (
    <>
      <Header />
      {/* Data, not script: "<" is written as \u003c so no text can end the element. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE).replace(/</g, "\\u003c") }}
      />
      <main>
        <section aria-labelledby="hero" className="contours">
          <div className="mx-auto grid grid-cols-1 max-w-6xl items-start gap-14 px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
            <div className="lg:pt-6">
              <h1
                id="hero"
                className="font-display text-[2.6rem] leading-[1.02] font-bold tracking-[-0.03em] text-ink sm:text-6xl lg:text-[4.4rem]"
              >
                Your requests go to your API. Nowhere else.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-muted sm:text-xl">
                Wayfarer is an API client that runs in a browser tab, with nothing to install and no account to make. It
                has no server of its own: a request goes from your tab to the host you name. <Claims ids={["C-001"]} />
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="/app/"
                  className="rounded-xl bg-route px-6 py-3.5 text-lg font-bold text-route-ink hover:opacity-90"
                >
                  Open Wayfarer
                </a>
                <a
                  href="/docs/"
                  className="rounded-xl border border-line-strong bg-paper px-6 py-3.5 text-lg font-bold text-ink hover:border-route"
                >
                  Read the docs
                </a>
              </div>
              <p className="mt-5 text-sm text-ink-muted">
                Free and open source, MIT licence. Tested in Chromium, Firefox and WebKit.
              </p>
            </div>
            <RouteDemo />
          </div>
        </section>

        <section aria-labelledby="app" className="border-t border-line bg-paper-sunk">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <h2
              id="app"
              className="max-w-3xl font-display text-3xl leading-[1.1] font-bold tracking-tight text-ink sm:text-[2.6rem]"
            >
              The rest of the app is in the same tab.
            </h2>
            <p className="mt-5 max-w-2xl text-lg text-ink-muted">
              Collections, environments, history, the vault and scripts, kept in your browser.{" "}
              <Claims ids={["C-002"]} />
            </p>
            <img
              className="mt-12 w-full rounded-xl border border-line-strong shadow-[0_30px_80px_-40px_rgb(18_22_32/0.6)]"
              src="/app.jpg"
              srcSet="/app-720.jpg 720w, /app.jpg 1440w"
              sizes="(max-width: 1200px) 100vw, 1152px"
              width={1440}
              height={900}
              loading="lazy"
              alt="Wayfarer with a GET request to api.example.com/v1/users/42 and its JSON response, status 200"
            />
          </div>
        </section>

        <Section
          id="postman"
          title="Postman's free plan is one person now."
          intro={
            <p>
              Postman Free has one user, and a team needs the Team plan, at $19 a user a month billed yearly (
              <a className="text-route underline underline-offset-4" href={POSTMAN_PRICING}>
                Postman&apos;s pricing
              </a>
              , read on 19 October 2026). The limit started in March 2026 (
              <a className="text-route underline underline-offset-4" href={YAAK_POST}>
                Yaak&apos;s write-up
              </a>
              ). Wayfarer has no plans, because it has no accounts and no server to keep your work on.
            </p>
          }
        >
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              [
                "Bring a Postman collection",
                <>
                  Collections v2.0 and v2.1, environments and globals import, with a report of anything that could not
                  be kept. <Claims ids={["C-058"]} />
                </>,
              ],
              [
                "Keep its scripts",
                <>
                  Scripts run with the parts of Postman&apos;s <code>pm</code> API the compatibility document lists,
                  each part a test. <Claims ids={["C-040"]} />
                </>,
              ],
              [
                "Run it the same way in CI",
                <>
                  The command line runs a collection with the app&apos;s engine, to the same results.{" "}
                  <Claims ids={["C-065"]} />
                </>,
              ],
            ].map(([title, text]) => (
              <div key={String(title)} className="rounded-xl border border-line bg-paper-raised p-6">
                <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-ink-muted">{text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="features" title="What else it does">
          <div className="mt-10">
            <Feature
              title="Secrets are encrypted before they are stored"
              figure={
                <Panel title="Environment: Production">
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-3 font-mono text-[0.8rem]">
                    <span className="text-ink-muted">base_url</span>
                    <span className="truncate text-ink">https://api.example.com</span>
                    <span className="text-ink-muted">API_TOKEN</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-ok/50 px-1.5 font-sans text-xs font-bold text-ok">
                        Secret stored
                      </span>
                      <span className="truncate text-ink-muted">{"{{$secret.…}}"}</span>
                    </span>
                  </div>
                  <p className="mt-4 border-t border-line pt-3 text-ink-muted">
                    PBKDF2-SHA-256 at 600,000 iterations wraps an AES-GCM-256 key. <Claims ids={["C-004"]} />
                  </p>
                </Panel>
              }
            >
              <p>
                A value in the vault is stored only as ciphertext, under a key held in memory and gone when you reload.{" "}
                <Claims ids={["C-003", "C-005"]} />
              </p>
              <p>
                It is sent as its plaintext only to the request that names it, and nothing the app stores, exports or
                copies holds it. <Claims ids={["C-007"]} />
              </p>
            </Feature>

            <Feature
              title="Bring what you already have"
              figure={
                <Panel title="Import reads">
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      "Postman collections, v2.0 and v2.1",
                      "Postman environments and globals",
                      "Insomnia exports, formats 4 and 5",
                      "OpenAPI 3.0 and 3.1, Swagger 2.0",
                      "HAR 1.2 files",
                      "cURL commands, pasted",
                    ].map((format) => (
                      <li key={format} className="rounded-lg border border-line px-3 py-2 text-ink">
                        {format}
                      </li>
                    ))}
                  </ul>
                </Panel>
              }
            >
              <p>
                An import shows what the file will add, and what of it could not be kept, before anything is stored.{" "}
                <Claims ids={["C-054", "C-056", "C-059", "C-060"]} />
              </p>
              <p>
                The scripts of a file do not run until you have read them and said you trust them.{" "}
                <Claims ids={["C-051"]} />
              </p>
            </Feature>

            <Feature
              title="It says what the browser will do, before you send"
              figure={
                <Panel title="PUT api.example.com/v1/users/42: what the browser does">
                  <div className="space-y-3 text-ink-muted">
                    <p>
                      The browser will not send <code className="text-ink">Cookie</code>: a page is not allowed to set
                      this header.
                    </p>
                    <p>
                      The browser asks the server first, with an <code className="text-ink">OPTIONS</code> request,
                      because of the method PUT, the header Authorization. The request is sent only if the server&apos;s
                      answer allows it.
                    </p>
                  </div>
                </Panel>
              }
            >
              <p>
                The composer names the headers a browser will not send and why it will ask the server first.{" "}
                <Claims ids={["C-049"]} />
              </p>
              <p>
                For a request a page cannot make, the Local Bridge sends it from your machine, for an allowed origin
                that holds its token. <Claims ids={["C-041", "C-064"]} />
              </p>
            </Feature>

            <Feature
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
                  <span className="text-code-string">✓</span> no content{"\n\n"}3 results in 1 iteration; 0 failed; 3 of
                  3 tests passed.
                </Terminal>
              }
            >
              <p>
                <code>wayfarer-cli</code> runs a collection with the app&apos;s engine: the same requests in the same
                order, statuses, tests and errors. <Claims ids={["C-065"]} />
              </p>
              <p>
                It writes JSON and JUnit reports for the CI to keep. See{" "}
                <a className="text-route underline underline-offset-4" href="/docs/cli/">
                  the command line
                </a>
                .
              </p>
            </Feature>
          </div>
        </Section>

        <Section
          id="evidence"
          title="Each claim on this page names its test."
          intro={
            <p>
              The small IDs above are rows of the claims ledger, and each row names the automated test that proves it.
              CI runs those tests on every change, and a claim without a test fails the build. The ledger has{" "}
              {ledger.length} claims; here are five.
            </p>
          }
        >
          <div className="mt-10 overflow-hidden rounded-xl border border-line-strong">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Five rows of the claims ledger</caption>
              <thead className="bg-paper-sunk text-ink">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Claim
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-bold md:table-cell">
                    Proved by
                  </th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((claim) => (
                  <tr key={claim.id} className="border-t border-line align-top">
                    <td className="px-4 py-4 text-ink">
                      <span className="mr-2 font-mono text-xs font-bold text-route">{claim.id}</span>
                      {claim.text}
                      <span className="mt-2 block font-mono text-xs break-all text-ink-muted md:hidden">
                        {claim.tests.join(", ")}
                      </span>
                    </td>
                    <td className="hidden px-4 py-4 font-mono text-xs break-all text-ink-muted md:table-cell">
                      {claim.tests.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6">
            <a href="/docs/claims/" className="font-bold text-route underline underline-offset-4">
              Read all {ledger.length} claims, with the CI run this site passed
            </a>
          </p>
        </Section>

        <Section id="questions" title="Questions">
          <div className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
            {QUESTIONS.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {question}
                  <span
                    aria-hidden="true"
                    className="text-2xl leading-none text-route transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-ink-muted [&_a]:text-route [&_a]:underline [&_a]:underline-offset-4">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </Section>

        <section aria-labelledby="start" className="bg-route text-route-ink">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="start" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Send your first request.
              </h2>
              <p className="mt-2 text-lg opacity-90">It opens in this tab. Nothing to install, no account to make.</p>
            </div>
            <a href="/app/" className="rounded-xl bg-paper px-6 py-3.5 text-lg font-bold text-ink hover:opacity-90">
              Open Wayfarer
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
