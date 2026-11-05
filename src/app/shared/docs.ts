/**
 * The site's docs, which the app links to (U-166). The docs are pages beside the app (`/docs/<name>/` next to
 * `/app/`), so each address is relative and read against `document.baseURI`, as every address of the app's own is.
 * `scripts/app-doc-links.test.mjs` holds each one to a file of `docs/` and a heading in it.
 */
export const DOCS = {
  index: "../docs/",
  scriptTrust: "../docs/scripts/#which-scripts-may-run",
  variableScopes: "../docs/variables/#where-a-value-comes-from",
  importWarnings: "../docs/import/#what-the-report-warns-about",
} as const;
