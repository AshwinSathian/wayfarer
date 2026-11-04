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
    `Wayfarer, the API client in a browser tab, beside ${rival.name}: what each does, where ${rival.name} is ahead, and the source and date of every fact.`,
  );
}

/** Where to go next: the docs a reader of this comparison wants, and the other comparisons. */
function Next({ rival }: { rival: Rival }) {
  const moving: [string, string][] =
    rival.id === "postman" ? [["Moving from Postman, step by step", "/compare/moving-from-postman/"]] : [];
  const links: [string, string][] = [
    ...moving,
    ["Where Wayfarer is behind, against every rival", "/compare/#behind"],
    ["The benchmark: eight tasks, counted", "/docs/design/benchmark/"],
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

/** One comparison (W2.3): what the rival says of itself, how Wayfarer differs, and where the rival is ahead. */
export default async function Comparison({ params }: Props) {
  const rival = await find(params);
  return (
    <Page title={`Wayfarer vs ${rival.name}`} lede={<p>{rival.is}</p>}>
      <JsonLd data={comparisonGraph(rival, `Wayfarer vs ${rival.name}`, sourcesOf(rival))} />
      <H2 id="facts">What {rival.name}&apos;s pages say</H2>
      <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-ink">
        {rival.facts.map((fact) => (
          <li key={fact.text}>
            {fact.text} <Cite source={fact.source} />
          </li>
        ))}
      </ul>

      <H2 id="ahead">Where {rival.name} is ahead</H2>
      <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-ink">
        {rival.ahead.map((fact) => (
          <li key={fact.text}>
            {fact.text} <Cite source={fact.source} />
          </li>
        ))}
      </ul>

      <H2 id="differs">How Wayfarer differs</H2>
      <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-ink [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4">
        {rival.differs.map((sentence, i) => (
          <li key={i}>{sentence}</li>
        ))}
      </ul>

      <Next rival={rival} />
    </Page>
  );
}
