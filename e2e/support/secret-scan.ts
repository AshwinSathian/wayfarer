/**
 * Every way `secret` can be read out of `text`: as it is, percent-encoded,
 * as a form field, JSON-escaped, or inside base64 (each run of base64
 * characters is decoded from each of the four positions a reader could
 * start at).
 */
export function found(text: string, secret: string): string[] {
  const forms: [string, string][] = [
    ["plain", secret],
    ["percent", encodeURIComponent(secret)],
    ["form", new URLSearchParams({ k: secret }).toString().slice(2)],
    ["json", JSON.stringify(secret).slice(1, -1)],
    // As a browser writes it into a URL it sends: only the characters a URL cannot hold are escaped.
    ["url query", new URL(`http://h/?${secret}`).search.slice(1)],
    ["url path", new URL(`http://h/${secret}`).pathname.slice(1)],
  ];
  const hits = forms.filter(([, form]) => text.includes(form)).map(([name]) => name);
  const needle = Buffer.from(secret, "utf8").toString("latin1");
  for (const run of text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .split(/[^A-Za-z0-9+/]+/)) {
    for (let start = 0; start < 4 && run.length >= 8; start++) {
      // Node reads base64 without its padding, to the end of the run.
      if (Buffer.from(run.slice(start), "base64").toString("latin1").includes(needle)) hits.push("base64");
    }
  }
  return [...new Set(hits)];
}
