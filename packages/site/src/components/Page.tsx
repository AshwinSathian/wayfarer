import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

/** A page of the site with a title and a lede: the comparison pages and the like. */
export function Page({ title, lede, children }: { title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="max-w-4xl type-site-title-1 font-bold text-ink sm:type-site-display">{title}</h1>
        <div className="mt-5 max-w-2xl type-site-lede text-ink-muted [&_a]:text-action [&_a]:underline [&_a]:underline-offset-4">
          {lede}
        </div>
        {children}
      </main>
      <Footer />
    </>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-16 border-t border-line pt-10 type-site-title-2 font-semibold text-ink sm:type-site-title-1"
    >
      {children}
    </h2>
  );
}
