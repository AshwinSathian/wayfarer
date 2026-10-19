import { pageMeta } from "../../lib/meta";
import { H2, Page } from "../../components/Page";
import { BEHIND, Cite, RIVALS } from "../../lib/rivals";

export const metadata = pageMeta("/compare/", "Compare: Wayfarer", "Wayfarer beside Postman, Bruno, Yaak, Hoppscotch and Insomnia, with each fact's source, and where Wayfarer is behind.");

/** The comparison pages' index (W2.3): each rival in a line, and where Wayfarer is behind. */
export default function Compare() {
  return (
    <Page
      title="Wayfarer beside the others"
      lede={
        <p>
          What each API client says of itself, from its own pages, with the date each page was read. What Wayfarer says of itself names its test in the{" "}
          <a href="/docs/claims/">claims ledger</a>.
        </p>
      }
    >
      <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
        {RIVALS.map((rival) => (
          <li key={rival.id} className="rounded-xl border border-line bg-paper-raised p-6">
            <h2 className="font-display text-xl font-semibold text-ink">
              <a className="hover:text-route" href={`/compare/${rival.id}/`}>
                Wayfarer and {rival.name}
              </a>
            </h2>
            <p className="mt-2 text-ink-muted">{rival.is}</p>
          </li>
        ))}
        <li className="rounded-xl border border-route bg-route-soft p-6">
          <h2 className="font-display text-xl font-semibold text-ink">
            <a className="hover:text-route" href="/compare/moving-from-postman/">
              Moving from Postman
            </a>
          </h2>
          <p className="mt-2 text-ink-muted">Your collections, environments and scripts, step by step, and what does not come across.</p>
        </li>
      </ul>

      <H2 id="behind">Where Wayfarer is behind</H2>
      <ul className="mt-6 max-w-3xl space-y-6">
        {BEHIND.map((item) => (
          <li key={item.title}>
            <h3 className="font-display text-lg font-semibold text-ink">{item.title}</h3>
            <p className="mt-1 text-ink-muted [&_a]:text-route [&_a]:underline [&_a]:underline-offset-4">
              {item.text}{" "}
              {item.sources.map((source) => (
                <Cite key={source.url} source={source} />
              ))}
            </p>
          </li>
        ))}
      </ul>
    </Page>
  );
}
