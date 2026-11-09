import { DocsFrame } from "../../../components/DocsFrame";
import { JsonLd } from "../../../components/JsonLd";
import { REPO, docDescription, docHtml, docs, indexed, lastChanged } from "../../../lib/content";
import { pageMeta } from "../../../lib/meta";
import { docGraph } from "../../../lib/structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return docs().map((doc) => ({ slug: doc.id.split("/") }));
}

const find = async (params: Props["params"]) => {
  const id = (await params).slug.join("/");
  const doc = docs().find((d) => d.id === id);
  if (!doc) throw new Error(`no doc ${id}`);
  return doc;
};

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: Props) {
  const doc = await find(params);
  // A working note (an operations doc) is not listed by search engines; they follow its links.
  return pageMeta(
    `/docs/${doc.id}/`,
    `${doc.title}: Wayfarer API client docs`,
    docDescription(doc.id) || `Wayfarer's documentation: ${doc.title}.`,
    { noindex: !indexed(doc) },
  );
}

/** A doc of the repository's docs/ as a page (W2.2). Pagefind indexes the article of a doc search engines may list:
 * a working note (an operations doc) is not a search result (W6.8). */
export default async function DocPage({ params }: Props) {
  const doc = await find(params);
  const id = doc.id;
  return (
    <DocsFrame current={id}>
      {doc.group !== "Operations" && <JsonLd data={docGraph(doc, docDescription(id), lastChanged(`docs/${id}.md`))} />}
      <article
        className={id === "claims" ? "prose claims-ledger" : "prose"}
        {...(indexed(doc) ? { "data-pagefind-body": "" } : {})}
        dangerouslySetInnerHTML={{ __html: docHtml(id) }}
      />
      <p className="mt-12 type-site-small text-ink-muted">
        <a className="underline underline-offset-4 hover:text-action" href={`${REPO}/blob/main/docs/${id}.md`}>
          This page on GitHub
        </a>
      </p>
      {/* The ledger's last CI result (W2.4): a file of the site's own, which adds a column to the table. */}
      {id === "claims" && <script src="/claims-ci.js" />}
    </DocsFrame>
  );
}
