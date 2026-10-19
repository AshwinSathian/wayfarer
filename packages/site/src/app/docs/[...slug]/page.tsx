import { DocsFrame } from "../../../components/DocsFrame";
import { REPO, docDescription, docHtml, docs } from "../../../lib/content";
import { pageMeta } from "../../../lib/meta";

export const dynamicParams = false;

export function generateStaticParams() {
  return docs().map((doc) => ({ slug: doc.id.split("/") }));
}

interface Props { params: Promise<{ slug: string[] }> }

export async function generateMetadata({ params }: Props) {
  const id = (await params).slug.join("/");
  const title = docs().find((doc) => doc.id === id)?.title ?? id;
  return pageMeta(`/docs/${id}/`, `${title}: Wayfarer docs`, docDescription(id) || `Wayfarer's documentation: ${title}.`);
}

/** A doc of the repository's docs/ as a page (W2.2). Pagefind indexes the article. */
export default async function DocPage({ params }: Props) {
  const id = (await params).slug.join("/");
  return (
    <DocsFrame current={id}>
      <article className="prose" data-pagefind-body dangerouslySetInnerHTML={{ __html: docHtml(id) }} />
      <p className="mt-12 text-sm text-ink-muted">
        <a className="underline underline-offset-4 hover:text-route" href={`${REPO}/blob/main/docs/${id}.md`}>
          This page on GitHub
        </a>
      </p>
      {/* The ledger's last CI result (W2.4): a file of the site's own, which adds a column to the table. */}
      {id === "claims" && <script src="/claims-ci.js" />}
    </DocsFrame>
  );
}
