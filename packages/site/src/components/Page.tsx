import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

/** A page of the site with a title and a lede: the comparison pages and the like. */
export function Page({ title, lede, children }: { title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="max-w-4xl font-display text-4xl leading-[1.05] font-bold tracking-tight text-ink sm:text-5xl">{title}</h1>
        <div className="mt-5 max-w-2xl text-lg text-ink-muted [&_a]:text-route [&_a]:underline [&_a]:underline-offset-4">{lede}</div>
        {children}
      </main>
      <Footer />
    </>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-16 border-t border-line pt-10 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
      {children}
    </h2>
  );
}
