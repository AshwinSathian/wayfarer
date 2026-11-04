import { docMarkdown, docs, indexed } from "../../lib/content";
import { SITE } from "../../lib/meta";

export const dynamic = "force-static";

/**
 * /llms-full.txt: the user docs' Markdown in one file, so an assistant asked how to do something in Wayfarer reads
 * one file instead of crawling. The design records and the operations docs are not in it: they are working notes.
 */
export function GET() {
  const text = [
    `# Wayfarer: the user docs\n\nEvery user doc of ${SITE}/docs/, as the repository has it. What Wayfarer does is in the claims ledger, ${SITE}/docs/claims/.`,
    ...docs()
      .filter((doc) => doc.group !== "Design records" && indexed(doc))
      .map((doc) => `<!-- ${SITE}/docs/${doc.id}/ -->\n\n${docMarkdown(doc.id).trim()}`),
  ].join("\n\n---\n\n");
  return new Response(`${text}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
