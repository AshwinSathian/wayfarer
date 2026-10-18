import { docs } from "../../lib/content";

export const metadata = {
  title: "Docs: Wayfarer",
  description: "Wayfarer's documentation: variables, auth, scripts, import and export, the vault, storage, the Local Bridge, the command line and the claims ledger.",
};

export default function DocsIndex() {
  return (
    <article className="prose">
      <h1>Docs</h1>
      <p>Each page is a file of the repository&apos;s docs folder, as it was when this site was built.</p>
      <ul>
        {docs().map((doc) => (
          <li key={doc.id}>
            <a href={`/docs/${doc.id}/`}>{doc.title}</a>
          </li>
        ))}
      </ul>
    </article>
  );
}
