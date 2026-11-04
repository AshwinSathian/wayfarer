import { Claims } from "../../components/Claims";
import { JsonLd } from "../../components/JsonLd";
import { H2, Page } from "../../components/Page";
import { pageMeta } from "../../lib/meta";
import { BEHIND, Cite, RIVALS } from "../../lib/rivals";
import { compareIndexGraph } from "../../lib/structured-data";

const TITLE = "Postman alternatives compared: Bruno, Yaak, Insomnia, Hoppscotch";

export const metadata = pageMeta(
  "/compare/",
  TITLE,
  "Wayfarer, an API client in a browser tab, beside Postman, Bruno, Yaak, Hoppscotch and Insomnia: what each does, where each is ahead, every fact sourced and dated.",
);

/** The comparison pages' index (W2.3): each rival in a line, and where Wayfarer is behind. */
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
          Six API clients, each described from its own pages, with the date each page was read. Wayfarer runs in a
          browser tab with nothing to install and no account. <Claims ids={["C-001"]} /> Where it is behind is listed
          below, each point against the rivals ahead of it.
        </p>
      }
    >
      <JsonLd data={compareIndexGraph(TITLE, pages)} />
      <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
        {RIVALS.map((rival) => (
          <li key={rival.id} className="rounded-lg border border-line bg-paper-raised p-6">
            <h2 className="type-site-lede font-semibold text-ink">
              <a className="hover:text-action" href={`/compare/${rival.id}/`}>
                Wayfarer vs {rival.name}
              </a>
            </h2>
            <p className="mt-2 text-ink-muted">{rival.is}</p>
          </li>
        ))}
        <li className="rounded-lg border border-action bg-action-soft p-6">
          <h2 className="type-site-lede font-semibold text-ink">
            <a className="hover:text-action" href="/compare/moving-from-postman/">
              Moving from Postman
            </a>
          </h2>
          <p className="mt-2 text-ink-muted">
            Your collections, environments and scripts, step by step, and what does not come across.
          </p>
        </li>
      </ul>

      <H2 id="behind">Where Wayfarer is behind</H2>
      <ul className="mt-6 max-w-3xl space-y-6">
        {BEHIND.map((item) => (
          <li key={item.title}>
            <h3 className="type-site-lede font-semibold text-ink">{item.title}</h3>
            <p className="mt-1 text-ink-muted [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4">
              {item.text}{" "}
              {item.sources.map((source) => (
                <Cite key={source.url} source={source} />
              ))}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-10 max-w-3xl text-ink-muted [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4">
        Each rival&apos;s steps for eight everyday tasks, with quotes and sources, are in{" "}
        <a href="/docs/design/benchmark/rivals/">the rival benchmark</a>; Wayfarer&apos;s own, counted and recorded, are
        in <a href="/docs/design/benchmark/">the benchmark</a>.
      </p>
    </Page>
  );
}
