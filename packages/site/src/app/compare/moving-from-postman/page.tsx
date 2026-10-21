import { pageMeta } from "../../../lib/meta";
import type { ReactNode } from "react";
import { Claims } from "../../../components/Claims";
import { H2, Page } from "../../../components/Page";
import { Cite, type Source } from "../../../lib/rivals";

export const metadata = pageMeta(
  "/compare/moving-from-postman/",
  "Moving from Postman: Wayfarer",
  "Bring your Postman collections, environments and scripts to Wayfarer, step by step, and see what does not come across.",
);

const POSTMAN_EXPORT: Source = {
  title: "Postman docs: Export data",
  url: "https://learning.postman.com/docs/getting-started/importing-and-exporting/exporting-data/",
  read: "2026-10-19",
};

/** The steps, in the order they are done. */
const STEPS: [string, ReactNode][] = [
  [
    "Export from Postman",
    <>
      For each collection: Collections, the collection&apos;s View more actions menu, More, Export collection, then
      Export JSON. For an environment, its View more actions menu and Export; for globals, the Variables pane, Globals,
      Export. <Cite source={POSTMAN_EXPORT} />
    </>,
  ],
  [
    "Import the collection",
    <>
      In Wayfarer, Import collection in the sidebar, and choose the file. You see what it will add, and what of it could
      not be kept, before anything is stored. <Claims ids={["C-054", "C-058"]} />
    </>,
  ],
  [
    "Import the environments",
    <>
      In Environments, Import environments, and choose the environment or globals file. <Claims ids={["C-058"]} />
    </>,
  ],
  [
    "Read the scripts",
    <>
      A collection&apos;s scripts from a file wait until you have read them and said you trust them: open a request and
      choose Review scripts. <Claims ids={["C-051"]} />
    </>,
  ],
  [
    "Check what scripts call",
    <>
      The parts of <code>pm</code> that Wayfarer has are listed in the{" "}
      <a href="/docs/postman-compatibility/">compatibility document</a>; a part it does not have throws an error that
      names it. <Claims ids={["C-040"]} />
    </>,
  ],
  [
    "Put secrets in the vault",
    <>
      Mark a variable that holds a token or a password as a secret: its value is then stored only as ciphertext.{" "}
      <Claims ids={["C-003"]} />
    </>,
  ],
  [
    "Run it in CI",
    <>
      Where Newman ran the collection,{" "}
      <code>npx wayfarer-cli run collection.json -e environment.json --allow-scripts --reporter cli,junit</code> runs it
      with the app&apos;s engine, to the results the app gives. <Claims ids={["C-065"]} /> See{" "}
      <a href="/docs/cli/">the command line</a>.
    </>,
  ],
];

/** "Moving from Postman" (W2.3). */
export default function MovingFromPostman() {
  return (
    <Page
      title="Moving from Postman"
      lede={
        <p>
          A collection, its environments and its scripts come across in a few minutes. Below are the steps, then what
          does not come across.
        </p>
      }
    >
      <ol className="mt-12 max-w-3xl space-y-8">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-full border-2 border-route font-display font-bold text-route"
            >
              {i + 1}
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-1 text-ink-muted [&_a]:text-route [&_a]:underline [&_a]:underline-offset-4">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <H2 id="not-across">What does not come across</H2>
      <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-ink [&_a]:text-route [&_a]:underline [&_a]:underline-offset-4">
        <li>
          What the import report lists as not kept: it names each thing, before anything is stored.{" "}
          <Claims ids={["C-054"]} />
        </li>
        <li>
          The parts of <code>pm</code> marked not supported in the{" "}
          <a href="/docs/postman-compatibility/">compatibility document</a>, such as <code>pm.cookies</code>.
        </li>
        <li>
          Requests a browser cannot make (forbidden headers, CORS, relaxed TLS) need the{" "}
          <a href="/docs/browser-limits/">Local Bridge</a>.
        </li>
        <li>
          Shared workspaces: a team shares a collection as a file today. See{" "}
          <a href="/compare/#behind">where Wayfarer is behind</a>.
        </li>
      </ul>
    </Page>
  );
}
