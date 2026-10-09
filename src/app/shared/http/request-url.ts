/**
 * Pure URL/query-param helpers for the request composer
 * (`WorkspaceStore`). Extracted so the URL-validation logic that fixes
 * "an unparseable URL silently fetches the app's own index.html" is unit
 * testable without an Angular TestBed, and so the composer component itself
 * isn't the only place this logic can be exercised from.
 */

export interface QueryParamRow {
  key: string;
  value: string;
  enabled: boolean;
}

function hasExplicitScheme(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

/**
 * Prefixes a scheme-less endpoint with `https://` so it's always sent to
 * `fetch` as an absolute URL. Without this, a scheme-less string like
 * "not-a-url" is a *relative* URL as far as the browser is concerned, and
 * `fetch` silently resolves it against the app's own origin — fetching
 * the app's own index.html and reporting it back as a misleading "200 OK".
 */
export function normalizeUrl(text: string): string {
  return hasExplicitScheme(text) ? text : `https://${text}`;
}

export function validateUrl(text: string): boolean {
  if (!text) return false;
  const schemePresent = hasExplicitScheme(text);
  const parsed = URL.parse(normalizeUrl(text));
  if (!parsed) {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (!parsed.hostname) {
    return false;
  }
  if (schemePresent) {
    // The user typed a scheme explicitly — that's deliberate intent, so trust
    // whatever host shape they gave us (including bare internal hostnames).
    return true;
  }
  // No scheme was typed, so we're the ones guessing "https://". Reject bare,
  // single-label input (e.g. "not a valid url at all") that technically parses
  // as *some* hostname but was never actually a URL — that's exactly the input
  // that used to slip through and resolve against the app's own origin.
  const hostname = parsed.hostname;
  return (
    hostname === "localhost" ||
    hostname.includes(".") ||
    hostname.includes(":") ||
    !!parsed.port
  );
}

/** Appends a single key/value pair onto a URL's query string, tolerating an unparseable base URL by returning it unchanged. */
export function appendQueryParam(url: string, key: string, value: string): string {
  const parsed = URL.parse(normalizeUrl(url));
  if (!parsed) {
    return url;
  }
  parsed.searchParams.append(key, value);
  return parsed.toString();
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
 * mirrors whatever `?a=b&c=d` is in the URL field). A single blank row when
 * there is no query.
 */
export function parseParamsFromUrl(url: string): QueryParamRow[] {
  const entries = [...new URLSearchParams(splitEndpoint(url).query)].map(([key, value]) => ({ key, value, enabled: true }));
  return entries.length ? entries : [{ key: "", value: "", enabled: true }];
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
