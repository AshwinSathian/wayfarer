import type { ReactNode } from "react";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { docs } from "../../lib/content";

/**
 * The docs (W2.2): every doc listed beside the open one, and the search, Pagefind from the site's own files (/docs/*
 * has a CSP of its own, security/csp-docs.json). Pagefind fills #search before React starts: the element is given as
 * HTML, which React does not compare when it takes the page over.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/pagefind/pagefind-ui.css" />
      <Header />
      <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav aria-label="Docs">
            <h2 className="font-display text-sm font-semibold text-ink">
              <a href="/docs/">Docs</a>
            </h2>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted lg:flex-col">
              {docs().map((doc) => (
                <li key={doc.id}>
                  <a href={`/docs/${doc.id}/`} className="hover:text-route">
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
      <Footer />
      <script src="/pagefind/pagefind-ui.js" />
      <script src="/docs-search.js" />
    </>
  );
}
