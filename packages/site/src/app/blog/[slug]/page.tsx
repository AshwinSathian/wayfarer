import { Footer } from "../../../components/Footer";
import { Header } from "../../../components/Header";
import { longDate, postHtml, posts } from "../../../lib/blog";
import { pageMeta } from "../../../lib/meta";

export const dynamicParams = false;

export function generateStaticParams() {
  return posts().map((post) => ({ slug: post.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

const find = async (params: Props["params"]) => {
  const slug = (await params).slug;
  const post = posts().find((p) => p.slug === slug);
  if (!post) throw new Error(`no post ${slug}`);
  return post;
};

export async function generateMetadata({ params }: Props) {
  const post = await find(params);
  return pageMeta(`/blog/${post.slug}/`, `${post.title}: Wayfarer blog`, post.description);
}

export default async function BlogPost({ params }: Props) {
  const post = await find(params);
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <p className="text-sm text-ink-muted">
          <a className="underline underline-offset-4 hover:text-route" href="/blog/">
            Blog
          </a>
          , <time dateTime={post.date}>{longDate(post.date)}</time>
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl">{post.title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-muted">{post.description}</p>
        <article className="prose mt-10" dangerouslySetInnerHTML={{ __html: postHtml(post) }} />
      </main>
      <Footer />
    </>
  );
}
