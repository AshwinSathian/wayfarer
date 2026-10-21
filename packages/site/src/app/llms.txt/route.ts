import { docDescription, docs } from "../../lib/content";
import { SITE } from "../../lib/meta";

export const dynamic = "force-static";

/** /llms.txt (W3.1): what Wayfarer is, and where its docs are, in the format llmstxt.org describes. */
export function GET() {
  const text = `# Wayfarer

> An API client that runs in a browser tab: no install, no account, and no server of its own. Collections, environments and history stay in the browser; secrets are encrypted in a vault. Open source under the MIT licence.

Each thing Wayfarer says it does is a row of the claims ledger, with the test that proves it.

## Docs

${docs()
  .map(
    (doc) => `- [${doc.title}](${SITE}/docs/${doc.id}/)${docDescription(doc.id) ? `: ${docDescription(doc.id)}` : ""}`,
  )
  .join("\n")}

## More

- [The app](${SITE}/app/)
- [Compare with Postman, Bruno, Yaak, Hoppscotch and Insomnia](${SITE}/compare/)
- [Changelog](${SITE}/changelog/)
- [Source](https://github.com/AshwinSathian/wayfarer)
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
