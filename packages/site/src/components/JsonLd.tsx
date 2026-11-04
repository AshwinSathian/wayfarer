// schema.org data in a page (lib/structured-data.ts): a data block, which the browser does not run, so the site's
// policy (no inline script) holds. `<` is escaped, so no text in it can end the block.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
