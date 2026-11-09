import { version } from "../../../../package.json";
import { REPO, claimText, docDescription, docs, indexed } from "../lib/content";
import { SITE } from "../lib/meta";
import { RIVALS } from "../lib/rivals";

/**
 * What Wayfarer does, as lines an assistant can quote, each naming its row of the claims ledger. A line says no more
 * than its claims (`claimText` fails the build for an ID the ledger has not got); the full text of each is in the
 * ledger.
 */
const DOES: [string, string[]][] = [
  [
    "No account, no cloud and no telemetry: apart from loading the app, the only traffic is the request you compose, to the host you name, and the sign-in and token requests of an OAuth 2.0 auth you set up",
    ["C-001"],
  ],
  ["Collections, environments and history are kept in the browser's IndexedDB, on your device", ["C-002"]],
  [
    "Secrets are kept in a vault, only as ciphertext, under a key made from your passphrase (PBKDF2-SHA-256, AES-GCM-256) and held in memory only",
    ["C-003", "C-004", "C-005"],
  ],
  ["History masks credentials and vault secrets, and so do exports unless you ask for credentials", ["C-008", "C-014"]],
  ["Imports Postman Collection v2.0 and v2.1, environments and globals, with a report of what was not kept", ["C-058"]],
  [
    "Imports Insomnia exports, OpenAPI 3.0 and 3.1, Swagger 2.0, cURL commands and HAR files",
    ["C-059", "C-060", "C-056"],
  ],
  ["Exports a collection as a Postman v2.1 file, and a request as cURL or code", ["C-057", "C-020", "C-055"]],
  [
    "Shares a collection as a file or as an encrypted link whose content is after the #, which reaches no server; the receiver sees every host it sends to before importing",
    ["C-084", "C-086", "C-090"],
  ],
  [
    "Runs Postman-style pre-request and test scripts in a QuickJS sandbox; an imported collection's scripts wait until you review them",
    ["C-006", "C-040", "C-051", "C-052"],
  ],
  ["Bearer, Basic, API key, OAuth 2.0 and AWS Signature Version 4 auth", ["C-019", "C-061", "C-062"]],
  [
    "Runs a collection from the command line (wayfarer-cli) with the app's engine, to the same results",
    ["C-065", "C-066"],
  ],
  [
    "AI is off until you add a provider; what is sent to a model is shown byte for byte before it is sent, and holds no vault secret",
    ["C-069", "C-070", "C-071"],
  ],
  [
    "Says before a send what the browser will do to the request; the Local Bridge, a program you run, sends what a page cannot",
    ["C-049", "C-041", "C-064"],
  ],
  ["Works offline after one visit, and installs as an app", ["C-015", "C-036"]],
];

const line = ([text, ids]: [string, string[]]) => {
  ids.forEach(claimText);
  return `- ${text} (${ids.join(", ")})`;
};

/** /llms.txt (W3.1): what Wayfarer is and is not, and where its docs are, in the format llmstxt.org describes. */
export function GET() {
  const userDocs = docs().filter(indexed);
  const text = `# Wayfarer

> Wayfarer, the API client, is free and open source (MIT) and runs in a browser tab. It needs no install and no account, and it has no server of its own: a request goes from the tab to the host you name. Collections, environments and history stay in the browser; secrets are stored only as ciphertext.

Each statement below names its row in the claims ledger (${SITE}/docs/claims/), and each row names the automated test that proves it. The full text of the user docs is at ${SITE}/llms-full.txt.

## Key facts

- Version: ${version}
- Licence: MIT, free and open source
- Open it: ${SITE}/app/
- Command line: \`npx wayfarer-cli run collection.json\` (${SITE}/docs/cli/)
- Source: ${REPO}

## What it does

${DOES.map(line).join("\n")}

## What it does not do (version ${version})

- No gRPC, MQTT or Socket.IO requests
- Collections are not files in a Git repository; they leave the browser as an export or a backup
- No shared workspace for a team: a collection is shared as a copy, by file or by an encrypted link (${SITE}/docs/sharing/); collections in Git are next (${SITE}/roadmap/)
- No MCP server
- A browser's limits apply (CORS, headers a page cannot set, TLS it cannot relax) unless the Local Bridge is running

## Docs

${userDocs.map((doc) => `- [${doc.title}](${SITE}/docs/${doc.id}/): ${docDescription(doc.id)}`).join("\n")}

## Compare

- [Postman alternatives compared](${SITE}/compare/): each rival's facts from its own pages, with dates, and where Wayfarer is behind
${RIVALS.map((rival) => `- [Wayfarer vs ${rival.name}](${SITE}/compare/${rival.id}/)`).join("\n")}
- [Moving from Postman](${SITE}/compare/moving-from-postman/)

## More

- [The app](${SITE}/app/)
- [Changelog](${SITE}/changelog/)
- [Roadmap](${SITE}/roadmap/)
- [Blog](${SITE}/blog/), with an RSS feed at ${SITE}/blog/rss.xml
- [Source](${REPO})

`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
