// The claims a sentence makes, each a link to the ledger (docs/claims.md). e2e/site.spec.ts holds every ID named on
// the landing to a row of it.
export function Claims({ ids }: { ids: string[] }) {
  return (
    <span className="claims ml-1 inline-flex flex-wrap gap-1 align-[0.1em]" data-claims={ids.join(" ")}>
      {ids.map((id) => (
        <a
          key={id}
          href="/docs/claims/"
          className="rounded-xs border border-line-strong px-1 font-code type-site-caption text-ink-muted no-underline hover:border-action hover:text-action"
        >
          {id}
        </a>
      ))}
    </span>
  );
}
