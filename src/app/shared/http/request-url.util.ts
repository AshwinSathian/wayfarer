/**
 * Pure URL/query-param helpers for the request composer
 * (`ApiParamsComponent`). Extracted so the URL-validation logic that fixes
 * "an unparseable URL silently fetches the app's own index.html" (see
 * `docs/plans/plan-specimen-modernization.md` Part D bug #1) is unit
 * testable without an Angular TestBed, and so the composer component itself
 * isn't the only place this logic can be exercised from.
 */

export interface QueryParamRow {
  key: string;
  value: string;
  enabled: boolean;
}

export function hasExplicitScheme(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

/**
 * Prefixes a scheme-less endpoint with `https://` so it's always sent to
 * HttpClient as an absolute URL. Without this, a scheme-less string like
 * "not-a-url" is a *relative* URL as far as the browser is concerned, and
 * HttpClient silently resolves it against the app's own origin — fetching
 * the app's own index.html and reporting it back as a misleading "200 OK".
 */
export function normalizeUrl(text: string): string {
  return hasExplicitScheme(text) ? text : `https://${text}`;
}

export function validateUrl(text: string): boolean {
  if (!text) return false;
  const schemePresent = hasExplicitScheme(text);
  let parsed: URL;
  try {
    parsed = new URL(normalizeUrl(text));
  } catch {
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
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    parsed.searchParams.append(key, value);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Appends every enabled, keyed param row onto a URL's query string. */
export function appendEnabledParams(baseUrl: string, params: QueryParamRow[]): string {
  if (!baseUrl) {
    return baseUrl;
  }
  const enabledParams = params.filter((p) => p.enabled && p.key);
  if (!enabledParams.length) {
    return baseUrl;
  }
  try {
    const url = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
    for (const param of enabledParams) {
      url.searchParams.append(param.key, param.value);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

const browserOrigin = (): string =>
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://localhost";

/**
 * Derives the query-param row list from an endpoint string (the composer's
 * Params tab mirrors whatever `?a=b&c=d` is currently in the URL field).
 * Returns `null` when the URL can't be parsed at all, meaning "leave the
 * current param rows alone" — distinct from a successfully-parsed URL with
 * zero params, which returns a single blank row.
 */
export function parseParamsFromUrl(url: string): QueryParamRow[] | null {
  if (!url) {
    return [{ key: "", value: "", enabled: true }];
  }
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`, browserOrigin());
    const entries: QueryParamRow[] = [];
    parsed.searchParams.forEach((value, key) => {
      entries.push({ key, value, enabled: true });
    });
    return entries.length ? entries : [{ key: "", value: "", enabled: true }];
  } catch {
    return null;
  }
}

/**
 * The inverse of `parseParamsFromUrl`: rewrites an endpoint string's query
 * string from the current param rows (the Params tab editing a row updates
 * the URL field). Returns `null` when there's no endpoint to rewrite or it
 * can't be parsed, meaning "no-op — leave the endpoint field alone".
 */
export function buildUrlFromParams(endpoint: string, params: QueryParamRow[]): string | null {
  if (!endpoint) {
    return null;
  }
  try {
    const base = browserOrigin();
    const url = new URL(endpoint.startsWith("http") ? endpoint : `https://${endpoint}`, base);
    url.search = "";
    for (const param of params) {
      if (param.enabled && param.key) {
        url.searchParams.append(param.key, param.value);
      }
    }
    const reconstructed = url.toString();
    const isAbsolute = endpoint.startsWith("http://") || endpoint.startsWith("https://");
    return isAbsolute ? reconstructed : reconstructed.replace(base + "/", "");
  } catch {
    return null;
  }
}
