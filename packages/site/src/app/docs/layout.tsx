import type { ReactNode } from "react";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";

/** The docs (W2.2) and their search: Pagefind, from the site's own files (/docs/* has a CSP of its own, security/csp-docs.json). */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/pagefind/pagefind-ui.css" />
      <Header />
      {children}
      <Footer />
      <script src="/pagefind/pagefind-ui.js" />
      <script src="/docs-search.js" />
    </>
  );
}
