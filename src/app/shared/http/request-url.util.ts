/**
 * Pure URL/query-param helpers for the request composer
 * (`ApiParamsComponent`). Extracted so the URL-validation logic that fixes
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
  const parsed = URL.parse(url.startsWith("http") ? url : `https://${url}`);
  if (!parsed) {
    return url;
  }
  parsed.searchParams.append(key, value);
  return parsed.toString();
}

/**
 * Adds the enabled, keyed param rows to a URL's query string, except the
 * ones it already carries. The Params tab mirrors the URL field's query
 * (parseParamsFromUrl / buildUrlFromParams), so appending every row sent each
 * parameter twice (F43). Rows still matter when the URL field couldn't be
 * parsed to mirror them, e.g. `{{baseUrl}}/users` before resolution. Matching
 * is per key=value occurrence, so a deliberate repeat beyond the URL stays.
 */
export function appendEnabledParams(baseUrl: string, params: QueryParamRow[]): string {
  if (!baseUrl) {
    return baseUrl;
  }
  const enabledParams = params.filter((p) => p.enabled && p.key);
  if (!enabledParams.length) {
    return baseUrl;
  }
  const url = URL.parse(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
  if (!url) {
    return baseUrl;
  }
  const present = new Map<string, number>();
  const pairKey = (key: string, value: string) => JSON.stringify([key, value]);
  url.searchParams.forEach((value, key) => present.set(pairKey(key, value), (present.get(pairKey(key, value)) ?? 0) + 1));
  for (const param of enabledParams) {
    const k = pairKey(param.key, param.value);
    const remaining = present.get(k) ?? 0;
    if (remaining > 0) {
      present.set(k, remaining - 1);
    } else {
      url.searchParams.append(param.key, param.value);
    }
  }
  return url.toString();
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
  const parsed = URL.parse(url.startsWith("http") ? url : `https://${url}`, browserOrigin());
  if (!parsed) {
    return null;
  }
  const entries: QueryParamRow[] = [];
  parsed.searchParams.forEach((value, key) => {
    entries.push({ key, value, enabled: true });
  });
  return entries.length ? entries : [{ key: "", value: "", enabled: true }];
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
  const base = browserOrigin();
  const url = URL.parse(endpoint.startsWith("http") ? endpoint : `https://${endpoint}`, base);
  if (!url) {
    return null;
  }
  url.search = "";
  for (const param of params) {
    if (param.enabled && param.key) {
      url.searchParams.append(param.key, param.value);
    }
  }
  const reconstructed = url.toString();
  const isAbsolute = endpoint.startsWith("http://") || endpoint.startsWith("https://");
  return isAbsolute ? reconstructed : reconstructed.replace(base + "/", "");
}
