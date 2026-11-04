// The landing's "What the others ask of you first" (D5-e): five questions a person asks before switching, Wayfarer's
// answer with its claims, and each rival's from its own documentation, every cell with its source and the date it was
// read. The rivals' cells are docs/design/benchmark.md's (read on 2026-11-04) and Postman's price is the compare
// page's (read on 2026-10-19). The last row is where Wayfarer is behind, and says so.
import type { ReactNode } from "react";
import { Claims } from "./Claims";

const RIVALS = ["Postman", "Bruno", "Yaak", "Insomnia", "Hoppscotch"] as const;
type RivalName = (typeof RIVALS)[number];

interface Cell {
  text: string;
  /** Whose page it is, as the link says it. */
  source: string;
  url: string;
  /** When it was read, YYYY-MM-DD. */
  read: string;
}

const READ = "2026-11-04";
const cell = (text: string, source: string, url: string, read = READ): Cell => ({ text, source, url, read });

const BENCHMARK = "/docs/design/benchmark/";

const ROWS: { question: string; wayfarer: ReactNode; rivals: Record<RivalName, Cell> }[] = [
  {
    question: "What to install before the first request",
    wayfarer: (
      <>
        Nothing: type an address and press Enter (<a href={BENCHMARK}>measured</a>).
      </>
    ),
    rivals: {
      Postman: cell(
        "A desktop app, or an agent for the web app",
        "Postman docs",
        "https://learning.postman.com/docs/getting-started/first-steps/sending-the-first-request/",
      ),
      Bruno: cell("A desktop app", "Bruno docs", "https://docs.usebruno.com/get-started/bruno-basics/create-a-request"),
      Yaak: cell("A desktop app", "Yaak docs", "https://yaak.app/docs/request-types/http-requests"),
      Insomnia: cell("A desktop app", "Insomnia docs", "https://developer.konghq.com/insomnia/requests/"),
      Hoppscotch: cell(
        "Nothing, for an API that allows CORS; otherwise an agent, an extension or a proxy",
        "Hoppscotch docs",
        "https://docs.hoppscotch.io/documentation/getting-started/rest/creating-a-request",
      ),
    },
  },
  {
    question: "An account, to keep a collection",
    wayfarer: (
      <>
        No. Your work stays in this browser. <Claims ids={["C-001", "C-002"]} />
      </>
    ),
    rivals: {
      Postman: cell(
        "Yes: signed out, there are no collections",
        "Postman docs",
        "https://learning.postman.com/docs/getting-started/basics/using-api-client/",
      ),
      Bruno: cell("No", "Bruno changelog", "https://www.usebruno.com/changelog"),
      Yaak: cell("No", "Yaak changelog", "https://yaak.app/changelog/2026.9.0"),
      Insomnia: cell("No, in the local Scratch Pad", "Insomnia docs", "https://developer.konghq.com/insomnia/storage/"),
      Hoppscotch: cell(
        "No, in the web app",
        "Hoppscotch docs",
        "https://docs.hoppscotch.io/documentation/getting-started/rest/creating-a-request",
      ),
    },
  },
  {
    question: "A secret only your passphrase opens, free",
    wayfarer: (
      <>
        Yes. Only its ciphertext is stored, under a key held in memory. <Claims ids={["C-003", "C-004", "C-005"]} />
      </>
    ),
    rivals: {
      Postman: cell(
        "No: the key is in the system's password manager",
        "Postman docs",
        "https://learning.postman.com/docs/use/postman-vault/postman-vault-key.md",
      ),
      Bruno: cell(
        "No: encrypted on disk; kept off disk only in the paid Ultimate",
        "Bruno docs",
        "https://docs.usebruno.com/secrets-management/secret-variables",
      ),
      Yaak: cell(
        "No: the key is in the system's keychain",
        "Yaak docs",
        "https://yaak.app/docs/collaboration/secrets-encryption",
      ),
      Insomnia: cell(
        "No: encrypted on disk, with no passphrase documented",
        "Insomnia docs",
        "https://developer.konghq.com/insomnia/environments/",
      ),
      Hoppscotch: cell(
        "No: kept in the browser's localStorage",
        "Hoppscotch security policy",
        "https://docs.hoppscotch.io/support/security-policy",
      ),
    },
  },
  {
    question: "Why a request failed (CORS, DNS, a 401)",
    wayfarer: (
      <>
        Named on screen, before and after you send (<a href={BENCHMARK}>measured</a>).{" "}
        <Claims ids={["C-049", "C-010"]} />
      </>
    ),
    rivals: {
      Postman: cell(
        "Not documented",
        "Postman docs",
        "https://learning.postman.com/docs/use/send-requests/response-data/troubleshooting-api-requests.md",
      ),
      Bruno: cell("Not documented", "Bruno docs", "https://docs.usebruno.com/debugging/timeline"),
      Yaak: cell("Not documented", "Yaak docs", "https://yaak.app/docs/troubleshooting/troubleshooting"),
      Insomnia: cell("Not documented", "Insomnia docs", "https://developer.konghq.com/insomnia/requests.md"),
      Hoppscotch: cell(
        "Not documented",
        "Hoppscotch docs",
        "https://docs.hoppscotch.io/documentation/getting-started/troubleshooting.md",
      ),
    },
  },
  {
    question: "A workspace your team shares",
    wayfarer: (
      <>
        <strong>Not yet.</strong> Today a collection goes to a teammate as a file, and its scripts wait for their
        review. <Claims ids={["C-054", "C-051"]} /> Sharing is on the <a href="/roadmap/">roadmap</a>.
      </>
    ),
    rivals: {
      Postman: cell(
        "The Team plan, $19 a user a month, billed yearly",
        "Postman pricing",
        "https://www.postman.com/pricing/",
        "2026-10-19",
      ),
      Bruno: cell(
        "Through Git; pushing from the app needs Pro or Ultimate",
        "Bruno docs",
        "https://docs.usebruno.com/git-integration/using-gui/provider",
      ),
      Yaak: cell("Through Git", "Yaak docs", "https://yaak.app/docs/collaboration/local-directory-git-sync"),
      Insomnia: cell(
        "An organisation, with an account",
        "Insomnia docs",
        "https://developer.konghq.com/insomnia/organizations.md",
      ),
      Hoppscotch: cell(
        "Workspaces, with sign-in",
        "Hoppscotch docs",
        "https://docs.hoppscotch.io/documentation/features/workspaces.md",
      ),
    },
  },
];

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

function Rival({ value }: { value: Cell }) {
  return (
    <>
      <span className="text-ink-muted">{value.text}</span>
      <span className="cite mt-1 block type-site-caption text-ink-muted">
        <a className="underline underline-offset-4 hover:text-ink" href={value.url}>
          {value.source}
        </a>
        ,{" "}
        <time className="whitespace-nowrap" dateTime={value.read}>
          {day(value.read)}
        </time>
      </span>
    </>
  );
}

const LINKS = "[&_a]:underline [&_a]:underline-offset-4";

export function AskFirst() {
  return (
    <>
      {/* From 48 em, a table: a question a row, a product a column. */}
      <div className="mt-12 hidden md:block">
        <table className="w-full table-fixed border-collapse text-left type-site-small">
          <caption className="sr-only">
            What Wayfarer and five other API clients ask of you first, with each answer&apos;s source
          </caption>
          <thead>
            <tr className="align-bottom">
              <td className="w-[16%]" />
              <th scope="col" className="w-[19%] rounded-t-lg bg-action-soft px-4 pt-4 pb-3 type-site-body font-bold">
                Wayfarer
              </th>
              {RIVALS.map((name) => (
                <th key={name} scope="col" className="px-3 pt-4 pb-3 font-bold text-ink">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={row.question} className="border-t border-line align-top">
                <th scope="row" className="py-4 pr-4 font-bold text-ink">
                  {row.question}
                </th>
                <td
                  className={`bg-action-soft px-4 py-4 text-ink ${LINKS} ${i === ROWS.length - 1 ? "rounded-b-lg" : ""}`}
                >
                  {row.wayfarer}
                </td>
                {RIVALS.map((name) => (
                  <td key={name} className="px-3 py-4">
                    <Rival value={row.rivals[name]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below 48 em six columns do not fit: a question a block, Wayfarer's answer, then the others'. */}
      <div className="mt-10 space-y-10 md:hidden">
        {ROWS.map((row) => (
          <div key={row.question}>
            <h3 className="type-site-lede font-bold text-ink">{row.question}</h3>
            <p className={`mt-3 rounded-lg bg-action-soft p-4 text-ink ${LINKS}`}>
              <span className="font-bold">Wayfarer: </span>
              {row.wayfarer}
            </p>
            <dl className="mt-4 space-y-3 type-site-small">
              {RIVALS.map((name) => (
                <div key={name} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                  <dt className="font-bold text-ink">{name}</dt>
                  <dd>
                    <Rival value={row.rivals[name]} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
