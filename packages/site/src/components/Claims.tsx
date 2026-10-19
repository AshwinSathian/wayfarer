// The claims a sentence makes, each a link to the ledger (docs/claims.md). e2e/site.spec.ts holds every ID named on
// the landing to a row of it.
export function Claims({ ids }: { ids: string[] }) {
  return (
    <span className="claims ml-1 inline-flex flex-wrap gap-1 align-[0.1em]" data-claims={ids.join(" ")}>
      {ids.map((id) => (
        <a
          key={id}
          href="/docs/claims/"
          className="rounded border border-line-strong px-1 font-mono text-[0.7rem] leading-[1.35] text-ink-muted no-underline hover:border-route hover:text-route"
        >
          {id}
        </a>
      ))}
    </span>
  );
}
