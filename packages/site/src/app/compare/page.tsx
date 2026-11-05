import { Claims } from "../../components/Claims";
import { Close, Glance, Summary } from "../../components/Compare";
import { JsonLd } from "../../components/JsonLd";
import { H2, Page } from "../../components/Page";
import { pageMeta } from "../../lib/meta";
import { BEHIND, BENCHMARK_SOURCE, Cite, RIVALS } from "../../lib/rivals";
import { compareIndexGraph } from "../../lib/structured-data";

const TITLE = "Postman alternatives compared: Bruno, Yaak, Insomnia, Hoppscotch, Scalar";

export const metadata = pageMeta(
  "/compare/",
  TITLE,
  "Wayfarer, an API client in a browser tab, beside Postman, Bruno, Yaak, Hoppscotch, Insomnia and Scalar: a table at a glance, eight tasks counted, where each is ahead, every fact sourced and dated.",
);

const LINKS = "[&_a]:text-action [&_a]:underline [&_a]:underline-offset-4";

/**
 * The comparison pages' index (W2.3, W5.4): every rival at a glance, the eight tasks against the fewest actions any
 * rival documents, where Wayfarer is behind, and a page per rival.
 */
export default function Compare() {
  const pages: [string, string][] = [
    ...RIVALS.map((rival): [string, string] => [`Wayfarer vs ${rival.name}`, `/compare/${rival.id}/`]),
    ["Moving from Postman", "/compare/moving-from-postman/"],
  ];
  return (
    <Page
      title="Postman alternatives, compared"
      lede={
        <p>
          Seven API clients, each described from its own pages, with the date each page was read. Wayfarer runs in a
          browser tab with nothing to install and no account. <Claims ids={["C-001"]} /> Where it is behind is listed
          below, each point against the rivals ahead of it.
        </p>
      }
    >
      <JsonLd data={compareIndexGraph(TITLE, pages)} />
      <H2 id="glance">At a glance</H2>
      <Glance rivals={RIVALS} label="Wayfarer and its rivals at a glance" />

      <H2 id="tasks">Eight tasks, counted</H2>
      <p className={`mt-6 max-w-3xl text-ink-muted ${LINKS}`}>
        We counted the clicks, keys and values typed of eight everyday tasks in Wayfarer, and read the same tasks from
        each rival&apos;s documentation. Wayfarer takes as few actions as any rival documents, or fewer, on five of the
        eight, and is behind on adding an environment and on finding last week&apos;s request.{" "}
        <Cite source={BENCHMARK_SOURCE} /> Each rival&apos;s page sets Wayfarer&apos;s recordings beside that
        rival&apos;s documented steps.
      </p>
      <Summary />

      <H2 id="behind">Where Wayfarer is behind</H2>
      <ul className="mt-6 max-w-3xl space-y-6">
        {BEHIND.map((item) => (
          <li key={item.title}>
            <h3 className="type-site-lede font-semibold text-ink">{item.title}</h3>
            <p className={`mt-1 text-ink-muted ${LINKS}`}>
              {item.text}{" "}
              {item.sources.map((source) => (
                <Cite key={source.url} source={source} />
              ))}
            </p>
          </li>
        ))}
      </ul>

      <H2 id="pages">Each comparison</H2>
      <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {RIVALS.map((rival) => (
          <li key={rival.id} className="rounded-lg border border-line bg-paper-raised p-6">
            <h3 className="type-site-lede font-semibold text-ink">
              <a className="hover:text-action" href={`/compare/${rival.id}/`}>
                Wayfarer vs {rival.name}
              </a>
            </h3>
            <p className="mt-2 text-ink-muted">{rival.is}</p>
          </li>
        ))}
        <li className="rounded-lg border border-action bg-action-soft p-6">
          <h3 className="type-site-lede font-semibold text-ink">
            <a className="hover:text-action" href="/compare/moving-from-postman/">
              Moving from Postman
            </a>
          </h3>
          <p className="mt-2 text-ink-muted">
            Your collections, environments and scripts, step by step, and what does not come across.
          </p>
        </li>
      </ul>
      <p className={`mt-10 max-w-3xl text-ink-muted ${LINKS}`}>
        Each rival&apos;s steps for eight everyday tasks, with quotes and sources, are in{" "}
        <a href="/docs/design/benchmark/rivals/">the rival benchmark</a>; Wayfarer&apos;s own, counted and recorded, are
        in <a href="/docs/design/benchmark/">the benchmark</a>.
      </p>
      <Close />
    </Page>
  );
}
