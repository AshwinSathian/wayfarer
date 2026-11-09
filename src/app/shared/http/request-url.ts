/** The query-param helpers of the request composer (`WorkspaceStore`). Whether an address is one is `validateUrl` (`@wayfarer/core`). */

export interface QueryParamRow {
  key: string;
  value: string;
  enabled: boolean;
}

/** `base?query#hash`, split as text: the endpoint field may hold `{{variables}}` and need not parse as a URL. */
function splitEndpoint(text: string): { base: string; query: string; hash: string } {
  const hashAt = text.indexOf("#");
  const hash = hashAt === -1 ? "" : text.slice(hashAt);
  const beforeHash = hashAt === -1 ? text : text.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  return queryAt === -1
    ? { base: beforeHash, query: "", hash }
    : { base: beforeHash.slice(0, queryAt), query: beforeHash.slice(queryAt + 1), hash };
}

/** Percent-encodes a query key or value, leaving each `{{variable}}` as typed so it still resolves at send. */
function encodeQueryPart(text: string): string {
  return text
    .split(/({{[^{}]*}})/)
    .map((part, index) => (index % 2 ? part : encodeURIComponent(part)))
    .join("");
}

/**
 * The query-param rows of an endpoint string (the composer's Params tab
 * mirrors whatever `?a=b&c=d` is in the URL field). A single blank row,
 * switched off, when there is no query.
 */
export function parseParamsFromUrl(url: string, previous: QueryParamRow[] = []): QueryParamRow[] {
  const entries = [...new URLSearchParams(splitEndpoint(url).query)].map(([key, value]) => ({
    key,
    value,
    enabled: true,
  }));
  // A switched-off row is not in the address: it is kept from the rows before, in its place among them (U-139).
  // A blank row is the editor's, unchecked until named (L-17), not one of them.
  const rows = previous.flatMap((row) => (row.enabled ? entries.splice(0, 1) : row.key ? [{ ...row }] : []));
  rows.push(...entries);
  return rows.length ? rows : [{ key: "", value: "", enabled: false }];
}

/**
 * The inverse of `parseParamsFromUrl`: rewrites the endpoint's query from
 * the enabled, keyed rows. Everything else stays exactly as typed: the URL
 * parser would lower-case a `{{baseUrl}}` host and percent-encode a
 * `{{token}}` value, and neither would resolve afterwards. `null` when
 * there is no endpoint to rewrite.
 */
export function buildUrlFromParams(endpoint: string, params: QueryParamRow[]): string | null {
  if (!endpoint) {
    return null;
  }
  const { base, hash } = splitEndpoint(endpoint);
  const query = params
    .filter((param) => param.enabled && param.key)
    .map((param) => `${encodeQueryPart(param.key)}=${encodeQueryPart(param.value)}`)
    .join("&");
  return `${base}${query ? `?${query}` : ""}${hash}`;
}
