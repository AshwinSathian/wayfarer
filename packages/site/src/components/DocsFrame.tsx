import type { ReactNode } from "react";
import { docs } from "../lib/content";

/**
 * A docs page: every doc listed beside the open one, and the search. Pagefind fills #search before React takes the page
 * over; the element is given as HTML, which React does not compare.
 */
export function DocsFrame({ current, children }: { current?: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <nav aria-label="Docs">
          <h2 className="font-display text-sm font-semibold text-ink">
            <a href="/docs/" aria-current={current === undefined ? "page" : undefined}>
              Docs
            </a>
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted lg:flex-col">
            {docs().map((doc) => (
              <li key={doc.id}>
                <a
                  href={`/docs/${doc.id}/`}
                  aria-current={doc.id === current ? "page" : undefined}
                  className="hover:text-route aria-[current=page]:font-bold aria-[current=page]:text-route"
                >
                  {doc.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="min-w-0">
        <div id="search" className="mb-10" dangerouslySetInnerHTML={{ __html: "" }} />
        {children}
      </main>
    </div>
  );
}
