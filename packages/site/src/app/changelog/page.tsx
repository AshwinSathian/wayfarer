import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { posts } from "../../lib/blog";
import { changelog, REPO } from "../../lib/content";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta(
  "/changelog/",
  "Changelog: Wayfarer API client",
  "What changed in each release of Wayfarer, and what is on main and not released yet.",
);

/**
 * The repository's CHANGELOG.md as a page (W2.4): an index of the versions, then each version folded in a
 * `<details>`, the latest release open. No script: the browser opens and closes them.
 */
export default function Changelog() {
  const versions = changelog();
  const latest = versions.findIndex((v) => v.date);
  const releasePosts = new Map(posts().map((post) => [post.slug, post]));
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="type-site-title-1 font-bold sm:type-site-display">Changelog</h1>
        <p className="mt-4 max-w-2xl type-site-lede text-ink-muted">
          What changed in each release, newest first. The same notes are{" "}
          <a className="text-action underline underline-offset-4" href={`${REPO}/blob/main/CHANGELOG.md`}>
            CHANGELOG.md
          </a>{" "}
          in the repository. 3.0&apos;s redesign is shown screen by screen, before and after, on{" "}
          <a className="text-action underline underline-offset-4" href="/what-changed-in-3-0/">
            What changed in 3.0
          </a>
          .
        </p>

        <nav aria-labelledby="versions" className="mt-12">
          <h2 id="versions" className="type-site-small font-semibold text-ink-muted">
            Versions
          </h2>
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {versions.map((v) => (
              <li key={v.id} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[14rem_1fr]">
                <a className="font-semibold text-ink underline-offset-4 hover:underline" href={`#${v.id}`}>
                  {v.title}
                  {v.date ? <span className="ml-2 type-site-small font-normal text-ink-muted">{v.date}</span> : null}
                </a>
                <span className="type-site-small text-ink-muted">{v.summary ?? "On main, not released yet."}</span>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-14 space-y-4">
          {versions.map((v, i) => {
            const post = releasePosts.get(`wayfarer-${v.title.replace(/\./g, "-")}`);
            return (
              <details key={v.id} id={v.id} open={i === latest} className="version border-b border-line pb-4">
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 py-2">
                  <h2 className="type-site-title-2 font-semibold">{v.title}</h2>
                  {v.date ? <span className="type-site-small text-ink-muted">{v.date}</span> : null}
                </summary>
                {post ? (
                  <p className="mt-2 type-site-small">
                    <a className="text-action underline underline-offset-4" href={`/blog/${post.slug}/`}>
                      Read the release post: {post.title}
                    </a>
                  </p>
                ) : null}
                <article className="prose mt-4" dangerouslySetInnerHTML={{ __html: v.html }} />
              </details>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
