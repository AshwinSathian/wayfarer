import { pageMeta } from "../../lib/meta";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { roadmap } from "../../lib/content";

export const metadata = pageMeta("/roadmap/", "Roadmap: Wayfarer", "What is being built next for Wayfarer: the design rebuild, the website and sharing for teams, task by task.");

const PLAN = "https://github.com/AshwinSathian/wayfarer/blob/main/PLAN-design.md";

/** The phases and tasks of PLAN-design.md, each done or not, read when the site is built (W2.4). */
export default function Roadmap() {
  const phases = roadmap();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Roadmap</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">
          The plan for the design rebuild, this website and sharing for teams, task by task, as{" "}
          <a className="text-route underline underline-offset-4" href={PLAN}>
            PLAN-design.md
          </a>{" "}
          had it when this page was built.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2">
          {phases.map((phase) => {
            const done = phase.tasks.filter((task) => task.done).length;
            return (
              <section key={phase.title}>
                <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                  <h2 className="font-display text-2xl font-semibold">{phase.title}</h2>
                  <span className="text-sm text-ink-muted">
                    {done} of {phase.tasks.length} done
                  </span>
                </div>
                <ul className="mt-4 space-y-3">
                  {phase.tasks.map((task) => (
                    <li key={task.id} className={`flex gap-3 ${task.done ? "task-done" : "task-open"}`}>
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 size-3 shrink-0 rounded-full border-2 border-route ${task.done ? "bg-route" : "bg-paper"}`}
                      />
                      <span>
                        <span className="sr-only">{task.done ? "Done: " : "To do: "}</span>
                        <strong className="font-mono text-sm">{task.id}</strong> <span className={task.done ? "text-ink-muted" : "text-ink"}>{task.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
