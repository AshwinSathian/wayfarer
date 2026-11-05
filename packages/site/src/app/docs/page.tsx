import { pageMeta } from "../../lib/meta";
import { DocsFrame } from "../../components/DocsFrame";
import { DOC_GROUPS, docs, type DocGroup } from "../../lib/content";

export const metadata = pageMeta(
  "/docs/",
  "Wayfarer API client docs",
  "Wayfarer's documentation: variables, auth, scripts, import and export, the vault, storage, the Local Bridge, the command line and the claims ledger.",
);

const NOTES: Partial<Record<DocGroup, string>> = {
  Operations: "How the site and the app are deployed and run. For the maintainer, not for using Wayfarer.",
  "Design records":
    "Working notes, audits and plans for the design, some for things not built yet. They are not user documentation: what Wayfarer does is in the guides and the claims ledger.",
};

/** The docs, grouped: the guides and the reference first, the design records last (they are working notes). */
export default function DocsIndex() {
  const all = docs();
  return (
    <DocsFrame>
      <article className="prose">
        <h1>Docs</h1>
        <p>Each page is a file of the repository&apos;s docs folder, as it was when this site was built.</p>
        {DOC_GROUPS.map((group) => (
          <section key={group} aria-labelledby={slug(group)}>
            <h2 id={slug(group)}>{group}</h2>
            {NOTES[group] && <p>{NOTES[group]}</p>}
            {group === "Design records" && (
              <p>
                What the design audit changed, as you see it in the app:{" "}
                <a href="/what-changed-in-3-0/">What changed in 3.0</a>.
              </p>
            )}
            <ul>
              {all
                .filter((doc) => doc.group === group)
                .map((doc) => (
                  <li key={doc.id}>
                    <a href={`/docs/${doc.id}/`}>{doc.title}</a>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </article>
    </DocsFrame>
  );
}

const slug = (group: string) => group.toLowerCase().replace(/ /g, "-");
