import type { ReactNode } from "react";
import { docs } from "../lib/content";

/**
 * A docs page: the user docs listed beside the open one (the design records are one link to their list on /docs/,
 * or the open one when it is a record), and the search, which Pagefind draws into #search.
 */
export function DocsFrame({ current, children }: { current?: string; children: ReactNode }) {
  const listed = docs().filter((doc) => doc.group !== "Design records" || doc.id === current);
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <nav aria-label="Docs">
          <h2 className="type-site-small font-semibold text-ink">
            <a href="/docs/" aria-current={current === undefined ? "page" : undefined}>
              Docs
            </a>
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 type-site-small text-ink-muted lg:flex-col">
            {listed.map((doc) => (
              <li key={doc.id}>
                <a
                  href={`/docs/${doc.id}/`}
                  aria-current={doc.id === current ? "page" : undefined}
                  className="hover:text-action aria-[current=page]:font-bold aria-[current=page]:text-action"
                >
                  {doc.title}
                </a>
              </li>
            ))}
            <li>
              <a href="/docs/#design-records" className="hover:text-action">
                Design records
              </a>
            </li>
          </ul>
        </nav>
      </aside>
      <main className="min-w-0">
        <div id="search" className="mb-10" />
        {children}
      </main>
    </div>
  );
}
