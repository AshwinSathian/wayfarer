import { Page } from "../../components/Page";
import { longDate, posts } from "../../lib/blog";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta(
  "/blog/",
  "Blog: Wayfarer",
  "Release notes and write-ups about how Wayfarer is built and tested.",
);

export default function Blog() {
  return (
    <Page
      title="Blog"
      lede={
        <p>
          Release notes and write-ups about how Wayfarer is built and tested. Follow it with{" "}
          <a href="/blog/rss.xml">the RSS feed</a>.
        </p>
      }
    >
      <ul className="mt-12 max-w-3xl divide-y divide-line border-y border-line">
        {posts().map((post) => (
          <li key={post.slug} className="py-7">
            <p className="text-sm text-ink-muted">
              <time dateTime={post.date}>{longDate(post.date)}</time>
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
              <a className="text-ink hover:text-route" href={`/blog/${post.slug}/`}>
                {post.title}
              </a>
            </h2>
            <p className="mt-2 text-ink-muted">{post.description}</p>
          </li>
        ))}
      </ul>
    </Page>
  );
}
