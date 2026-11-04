// The claims a sentence makes, each a link to its row of the ledger (docs/claims.md), named by the claim's text.
// Each chip is at least 24 px tall, a target of WCAG 2.5.8's size beside any link, in a narrow table cell too.
// e2e/site.spec.ts holds every ID named on the site to a row of it, and an ID the ledger does not have fails the build.
import { claimText } from "../lib/content";

export function Claims({ ids }: { ids: string[] }) {
  return (
    <span className="claims ml-1 inline-flex flex-wrap gap-1 align-[0.1em]" data-claims={ids.join(" ")}>
      {ids.map((id) => (
        <a
          key={id}
          href={`/docs/claims/#${id}`}
          aria-label={`Claim ${id}: ${claimText(id)}`}
          className="inline-flex min-h-6 items-center rounded-xs border border-line-strong px-1 font-code type-site-caption text-ink-muted no-underline hover:border-action hover:text-action"
        >
          {id}
        </a>
      ))}
    </span>
  );
}
