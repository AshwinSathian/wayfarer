import { Close, Glance, Tasks } from "../../../components/Compare";
import { JsonLd } from "../../../components/JsonLd";
import { H2, Page } from "../../../components/Page";
import { pageMeta } from "../../../lib/meta";
import { Cite, RIVALS, type Rival } from "../../../lib/rivals";
import { comparisonGraph } from "../../../lib/structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return RIVALS.map((rival) => ({ rival: rival.id }));
}

interface Props {
  params: Promise<{ rival: string }>;
}

const find = async (params: Props["params"]) => {
  const id = (await params).rival;
  const rival = RIVALS.find((r) => r.id === id);
  if (!rival) throw new Error(`no rival ${id}`);
  return rival;
};

const titleOf = (rival: Rival) => `Wayfarer vs ${rival.name}: ${rival.title}`;
const sourcesOf = (rival: Rival) => [...rival.facts, ...rival.ahead].map((fact) => fact.source);

export async function generateMetadata({ params }: Props) {
  const rival = await find(params);
  return pageMeta(
    `/compare/${rival.id}/`,
    titleOf(rival),
    `Wayfarer, the API client in a browser tab, beside ${rival.name}: a table at a glance, eight tasks counted, where ${rival.name} is ahead, and the source and date of every fact.`,
  );
}

/** Where to go next: the docs a reader of this comparison wants, and the other comparisons. */
function Next({ rival }: { rival: Rival }) {
  const moving: [string, string][] =
    rival.id === "postman" ? [["Moving from Postman, step by step", "/compare/moving-from-postman/"]] : [];
  const links: [string, string][] = [
    ...moving,
    ["Where Wayfarer is behind, against every rival", "/compare/#behind"],
    ["The benchmark: eight tasks, counted, with every step and source", "/docs/benchmark/"],
    ["Import: what comes across from each format", "/docs/import/"],
    ["The secrets vault", "/docs/secrets/"],
    ["What a browser cannot send, and the Local Bridge", "/docs/browser-limits/"],
    ["Running a collection from the command line", "/docs/cli/"],
    ...RIVALS.filter((other) => other.id !== rival.id).map((other): [string, string] => [
      `Wayfarer vs ${other.name}`,
      `/compare/${other.id}/`,
    ]),
  ];
  return (
    <>
      <H2 id="next">Read next</H2>
      <ul className="mt-6 max-w-3xl list-disc space-y-2 pl-5 text-ink [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4">
        {links.map(([text, href]) => (
          <li key={href}>
            <a href={href}>{text}</a>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * One comparison (W2.3, W5.4): the table at a glance, the eight tasks counted, where the rival is ahead, how Wayfarer
 * differs, who should pick which, how to move, what the rival's pages say, and the close.
 */
export default async function Comparison({ params }: Props) {
  const rival = await find(params);
  const LIST =
    "mt-6 max-w-3xl list-disc space-y-3 pl-5 text-ink [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4";
  return (
    <Page
      title={`Wayfarer vs ${rival.name}`}
      lede={
        <p>
          {rival.is} Checked against {rival.name}&apos;s own pages on <time dateTime={rival.read}>{rival.read}</time>.
        </p>
      }
    >
      <JsonLd data={comparisonGraph(rival, `Wayfarer vs ${rival.name}`, sourcesOf(rival))} />
      <H2 id="glance">At a glance</H2>
      <Glance rivals={[rival]} label={`Wayfarer and ${rival.name} at a glance`} />

      <H2 id="tasks">Eight tasks, counted</H2>
      <Tasks rival={rival} />

      <H2 id="ahead">Where {rival.name} is ahead</H2>
      <ul className={LIST}>
        {rival.ahead.map((fact) => (
          <li key={fact.text}>
            {fact.text} <Cite source={fact.source} />
          </li>
        ))}
      </ul>

      <H2 id="differs">How Wayfarer differs</H2>
      <ul className={LIST}>
        {rival.differs.map((sentence, i) => (
          <li key={i}>{sentence}</li>
        ))}
      </ul>

      <H2 id="pick">Who should pick which</H2>
      <p className="mt-6 max-w-3xl text-ink">{rival.pick}</p>

      <H2 id="moving">Moving from {rival.name}</H2>
      <p className="mt-6 max-w-3xl text-ink [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4">
        {rival.moving}
      </p>

      <H2 id="facts">What {rival.name}&apos;s pages say</H2>
      <ul className={LIST}>
        {rival.facts.map((fact) => (
          <li key={fact.text}>
            {fact.text} <Cite source={fact.source} />
          </li>
        ))}
      </ul>

      <Next rival={rival} />
      <Close rival={rival} />
    </Page>
  );
}
