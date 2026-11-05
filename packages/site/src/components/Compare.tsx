// The parts the comparison pages share (W5.4 of PLAN-design.md): the table at a glance, the benchmark's eight tasks
// and the close. Wayfarer's numbers are measured and link to their recordings; a rival's are the steps its
// documentation gives, with the source and the date, and no seconds (row 1.64).
import type { ReactNode } from "react";
import { benchmark } from "../lib/content";
import { Claims } from "./Claims";
import { BENCHMARK_PAGE, Cite, GLANCE_ROWS, WAYFARER_GLANCE, type Rival, type Source } from "../lib/rivals";

const LINKS = "[&_a]:text-action [&_a]:underline [&_a]:underline-offset-4";

/** A table that scrolls sideways in a narrow window, which a keyboard can reach and a screen reader names. */
function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="compare-scroll mt-6" role="region" aria-label={label} tabIndex={0}>
      <table className={`compare-table ${LINKS}`}>{children}</table>
    </div>
  );
}

const NOT_DOCUMENTED = <span className="text-ink-muted">Not documented</span>;

/** Where each product stands on the rows of GLANCE_ROWS: Wayfarer's cells name claims, a rival's cite its page. */
export function Glance({ rivals, label }: { rivals: Rival[]; label: string }) {
  return (
    <Scroll label={label}>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Question</span>
          </th>
          <th scope="col">Wayfarer</th>
          {rivals.map((rival) => (
            <th key={rival.id} scope="col">
              {rival.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {GLANCE_ROWS.map(([row, question]) => (
          <tr key={row}>
            <th scope="row">{question}</th>
            <td>{WAYFARER_GLANCE[row]}</td>
            {rivals.map((rival) => {
              const fact = rival.glance[row];
              return (
                <td key={rival.id}>
                  {fact ? (
                    <>
                      {fact.text} <Cite source={fact.source} />
                    </>
                  ) : (
                    NOT_DOCUMENTED
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </Scroll>
  );
}

/** A source cell's first address, as a citation: the page's host and path, and the day the benchmark read it. */
function sourceOf(url: string, read: string): Source {
  const { host, pathname } = new URL(url);
  return { title: `${host}${pathname.replace(/\/$/, "")}`, url, read };
}

const LABELS: Record<string, string> = { "5a": "CORS", "5b": "DNS", "5c": "401" };

/** Wayfarer against one rival on the benchmark's eight tasks. */
export function Tasks({ rival }: { rival: Rival }) {
  const { tasks, versions } = benchmark();
  return (
    <>
      <p className={`mt-6 max-w-3xl text-ink-muted ${LINKS}`}>
        An action is a click, a key press or a value typed. Wayfarer&apos;s are measured: a script ran each task three
        times on the v3.0.0 release candidate in Chromium, and each number links to its recording. {rival.name}&apos;s
        are the steps its own documentation gives, read on <time dateTime={rival.read}>{rival.read}</time> (version:{" "}
        {versions[rival.name]}
        ). {rival.name} was not run, so it has no seconds, and Wayfarer&apos;s seconds are the script&apos;s, not a
        person&apos;s. Method, every step and every source: <a href={BENCHMARK_PAGE}>the benchmark</a>.
      </p>
      <Scroll label={`Eight tasks, Wayfarer and ${rival.name}`}>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Wayfarer, measured</th>
            <th scope="col">{rival.name}, documented</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const row = task.documented.find((documented) => documented.rival === rival.name);
            return (
              <tr key={task.n} data-task={task.n}>
                <th scope="row">
                  {task.n}. {task.name}
                </th>
                <td className="wayfarer-measured">
                  {task.measured.map((measured) => (
                    <p key={measured.id}>
                      {LABELS[measured.id] ? `${LABELS[measured.id]}: ` : ""}
                      <a href={measured.recording}>{measured.actions}</a>{" "}
                      <span className="text-ink-muted">
                        (recording; {measured.seconds} s in the script;{" "}
                        <a href={`${BENCHMARK_PAGE}#wayfarer-measured`}>row</a>)
                      </span>
                    </p>
                  ))}
                </td>
                <td className="rival-documented">
                  {row ? (
                    <>
                      <p>
                        {task.n === "5" ? "No page says the cause is named." : row.inputs}{" "}
                        <span className="text-ink-muted">(documented)</span>
                      </p>
                      {row.steps && <p className="text-ink-muted">{row.steps}</p>}
                      {row.note && <p className="text-ink-muted">{row.note}</p>}
                      <p>
                        <Cite source={sourceOf(row.sources[0], rival.read)} />{" "}
                        <a href={`${BENCHMARK_PAGE}#${task.anchor}`}>all of its steps</a>
                      </p>
                    </>
                  ) : (
                    <span className="text-ink-muted">Not counted</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Scroll>
    </>
  );
}

/** Every task against the fewest actions any rival documents: the benchmark's own summary. */
export function Summary() {
  const { summary } = benchmark();
  return (
    <Scroll label="Eight tasks, Wayfarer against the fewest any rival documents">
      <thead>
        <tr>
          <th scope="col">Task</th>
          <th scope="col">Wayfarer, measured</th>
          <th scope="col">Fewest any rival documents</th>
          <th scope="col">Wayfarer is</th>
        </tr>
      </thead>
      <tbody>
        {summary.map((row) => (
          <tr key={row.n}>
            <th scope="row">
              {row.n}. {row.task}
            </th>
            <td>
              <a href={`${BENCHMARK_PAGE}#wayfarer-measured`}>{row.wayfarer}</a>
            </td>
            <td>{row.fewest}</td>
            <td>{row.is}</td>
          </tr>
        ))}
      </tbody>
    </Scroll>
  );
}

/** The close of every comparison page: the app, and the way in from Postman. */
export function Close({ rival }: { rival?: Rival }) {
  return (
    <section aria-labelledby="try" className="mt-16 rounded-lg border border-line bg-paper-raised p-8">
      <h2 id="try" className="type-site-title-2 font-semibold text-ink">
        {rival ? `Try it with your ${rival.name} work` : "Try it with your own requests"}
      </h2>
      <p className="mt-3 max-w-2xl text-ink-muted">
        It opens in this tab, with nothing to install and no account. <Claims ids={["C-001"]} />
      </p>
      <p className="mt-6 flex flex-wrap gap-4">
        <a
          className="rounded-sm bg-action px-6 py-3.5 type-site-lede font-bold whitespace-nowrap text-on-action hover:opacity-90"
          href="/app/"
        >
          Open Wayfarer
        </a>
        <a
          className="rounded-sm border border-line-strong bg-paper px-6 py-3.5 type-site-lede font-bold whitespace-nowrap text-ink hover:border-action"
          href="/compare/moving-from-postman/"
        >
          Moving from Postman
        </a>
      </p>
    </section>
  );
}
