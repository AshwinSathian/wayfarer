import { Claims } from "../../components/Claims";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { REPO, roadmap } from "../../lib/content";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta(
  "/roadmap/",
  "Roadmap: Wayfarer",
  "What Wayfarer 3.0 brings, what comes next, and later: sharing collections with a team without a Wayfarer server.",
);

const PLAN = `${REPO}/blob/main/PLAN-design.md`;

/** What 3.0 brings, Next and Later, each item what a user gets, from PLAN-design.md when the site is built (W2.4). */
export default function Roadmap() {
  const sections = roadmap();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="type-site-title-1 font-bold sm:type-site-display">Roadmap</h1>
        <p className="mt-4 max-w-2xl type-site-lede text-ink-muted">
          What 3.0 brings, what comes after it, and the work for teams after that. The plan behind it, task by task, is{" "}
          <a className="text-action underline underline-offset-4" href={PLAN}>
            PLAN-design.md
          </a>
          ; this page is read from it when the site is built.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-14 lg:grid-cols-2">
          {sections.map((section, i) => (
            <section key={section.title} className={i === 0 ? "lg:col-span-2" : ""}>
              <h2 className="border-b border-line pb-3 type-site-title-2 font-semibold">{section.title}</h2>
              <ul className={`mt-5 grid gap-x-12 gap-y-4 ${i === 0 ? "lg:grid-cols-2" : ""}`}>
                {section.items.map((item) => (
                  <li key={item.text} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-2 size-2.5 shrink-0 rounded-full border-2 border-action ${i === 0 || item.done ? "bg-action" : "bg-paper"}`}
                    />
                    <span>
                      {item.text}
                      {item.done ? <span className="ml-2 type-site-small text-ink-muted">Done</span> : null}
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
