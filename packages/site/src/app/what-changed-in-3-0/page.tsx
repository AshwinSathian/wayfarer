// "What changed in 3.0": the redesign, screen by screen, each change tied to the number of its finding in the design
// audit. The words and the pictures are src/whats-new.mjs's; scripts/whats-new.test.mjs holds each finding to its
// before and after. A sentence that says what Wayfarer does names its claims.
import { Claims } from "../../components/Claims";
import { H2, Page } from "../../components/Page";
import { pageMeta } from "../../lib/meta";
import { FINDINGS, GROUPS, SCREENS, screenHtml } from "../../whats-new.mjs";
import sizes from "../../whats-new-images.mjs";

export const metadata = pageMeta(
  "/what-changed-in-3-0/",
  "What changed in 3.0: Wayfarer API client",
  "Wayfarer 3.0's redesign, screen by screen: each picture of 2.x beside today's, and each change tied to the audit finding it fixes.",
);

const LINK = "text-action underline underline-offset-4";

type Finding = { was: string; now?: string; accepted?: string; claims?: string[] };
const findings = FINDINGS as Record<string, Finding>;

function Changes({ ids }: { ids: string[] }) {
  return (
    <dl className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
      {ids.map((id) => {
        const f = findings[id];
        return (
          <div key={id} id={id} className="py-5">
            <dt className="font-code type-site-caption font-bold text-ink-muted">{id}</dt>
            <dd className="mt-2 text-ink-muted">
              <span className="font-semibold text-ink">Before:</span> {f.was}
            </dd>
            <dd className="mt-2 text-ink">
              <span className="font-semibold">{f.accepted ? "Accepted:" : "Now:"}</span> {f.accepted ?? f.now}
              {f.claims && <Claims ids={f.claims} />}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function WhatChanged() {
  return (
    <Page
      title="What changed in 3.0"
      lede={
        <p>
          Before 3.0 the app was reviewed screen by screen, in six passes, and each problem found was written down with
          a number and a severity. Here is each screen as 2.x drew it beside the same screen in 3.0, then the changes a
          picture cannot show. Every finding that blocked a task, or slowed or misled someone, is on this page. Its
          number is the one the audit gave it.
        </p>
      }
    >
      <nav aria-labelledby="contents" className="mt-10 max-w-3xl">
        <h2 id="contents" className="type-site-small font-semibold text-ink-muted">
          On this page
        </h2>
        <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {[...SCREENS, ...GROUPS].map((part) => (
            <li key={part.id}>
              <a className={LINK} href={`#${part.id}`}>
                {part.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {SCREENS.map((screen, i) => (
        <section key={screen.id} aria-labelledby={screen.id}>
          <H2 id={screen.id}>{screen.title}</H2>
          {!screen.before && (
            <p className="mt-4 max-w-2xl text-ink-muted">
              The audit has no picture of this screen in 2.x; what it showed is in the first line of each change.
            </p>
          )}
          <div className="mt-8" dangerouslySetInnerHTML={{ __html: screenHtml(screen, sizes, { lazy: i > 0 }) }} />
          <Changes ids={screen.findings} />
        </section>
      ))}

      {GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={group.id}>
          <H2 id={group.id}>{group.title}</H2>
          <Changes ids={group.findings} />
        </section>
      ))}

      <p className="mt-16 max-w-2xl text-ink-muted">
        The rest of what 3.0 changed is in{" "}
        <a className={LINK} href="/changelog/">
          the changelog
        </a>
        .{" "}
        <a className={LINK} href="/blog/the-3-0-redesign/">
          The post about the redesign
        </a>{" "}
        is the short version.
      </p>
    </Page>
  );
}
