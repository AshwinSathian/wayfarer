import { H2, Page } from "../../../components/Page";
import { pageMeta } from "../../../lib/meta";
import { Cite, RIVALS } from "../../../lib/rivals";

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

export async function generateMetadata({ params }: Props) {
  const rival = await find(params);
  return pageMeta(`/compare/${rival.id}/`, `Wayfarer and ${rival.name}: Wayfarer`, `How Wayfarer and ${rival.name} differ, with the source of each fact about ${rival.name}.`);
}

/** One comparison (W2.3): what the rival says of itself, how Wayfarer differs, and where the rival is ahead. */
export default async function Comparison({ params }: Props) {
  const rival = await find(params);
  return (
    <Page title={`Wayfarer and ${rival.name}`} lede={<p>{rival.is}</p>}>
      <H2 id="facts">What {rival.name}&apos;s pages say</H2>
      <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-ink">
        {rival.facts.map((fact) => (
          <li key={fact.text}>
            {fact.text} <Cite source={fact.source} />
          </li>
        ))}
      </ul>

      <H2 id="differs">How Wayfarer differs</H2>
      <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-ink [&_a]:text-route [&_a]:underline [&_a]:underline-offset-4">
        {rival.differs.map((sentence, i) => (
          <li key={i}>{sentence}</li>
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
      <p className="mt-10 text-ink-muted">
        All of it in one list:{" "}
        <a className="text-route underline underline-offset-4" href="/compare/#behind">
          where Wayfarer is behind
        </a>
        .
      </p>
    </Page>
  );
}
