import { Claims } from "../../components/Claims";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { REPO, roadmap } from "../../lib/content";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta(
  "/roadmap/",
  "Roadmap: Wayfarer API client",
  "What Wayfarer has shipped since 3.0, what is next (collections in Git), and what comes later for teams.",
);

const PLAN = `${REPO}/blob/main/PLAN-design.md`;

/** What shipped in 3.0 and since, Next and Later, each item what a user gets, from PLAN-design.md when the site is built (W2.4). */
export default function Roadmap() {
  const sections = roadmap();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="type-site-title-1 font-bold sm:type-site-display">Roadmap</h1>
        <p className="mt-4 max-w-2xl type-site-lede text-ink-muted">
          What shipped in 3.0 and since, what is next, and the work for teams after that. The plan behind it, task by
          task, is{" "}
          <a className="text-action underline underline-offset-4" href={PLAN}>
            PLAN-design.md
          </a>
          ; this page is read from it when the site is built.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-14 lg:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} className={section.shipped ? "lg:col-span-2" : ""}>
              <h2 className="border-b border-line pb-3 type-site-title-2 font-semibold">{section.title}</h2>
              <ul className={`mt-5 grid gap-x-12 gap-y-4 ${section.shipped ? "lg:grid-cols-2" : ""}`}>
                {section.items.map((item) => (
                  <li key={item.text} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-2 size-2.5 shrink-0 rounded-full border-2 border-action ${section.shipped ? "bg-action" : "bg-paper"}`}
                    />
                    <span>
                      {item.text}
                      {item.claims.length ? <Claims ids={item.claims} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
