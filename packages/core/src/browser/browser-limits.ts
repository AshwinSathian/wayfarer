/** The request as it would be sent: what `browserLimits` reads of it. */
export interface LimitsRequest {
  method: string;
  url: string;
  /** In order, as the user wrote the names. */
  headers: [string, string][];
}

/** What a browser does to a request a page sends, worked out before it is sent. */
export interface BrowserLimits {
  route: "direct" | "bridge";
  /** Headers of the request that a browser does not let a page set: they are not sent. */
  dropped: string[];
  /** The target is not the page's own origin. */
  crossOrigin: boolean;
  /** Why the browser asks the server first (an `OPTIONS` preflight); empty when it does not. */
  preflight: string[];
  /**
   * An `http://` target from an HTTPS page: "blocked", or "loopback" for this
   * machine, which Chromium and Firefox allow and WebKit blocks. Null otherwise.
   */
  mixedContent: "blocked" | "loopback" | null;
  /** Headers the browser adds on its own. */
  adds: string[];
  /** What Wayfarer tells the browser not to send (plan D23). */
  suppresses: string[];
}

// Fetch, "forbidden request-header".
const FORBIDDEN = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);
const METHOD_OVERRIDES = new Set(["x-http-method", "x-http-method-override", "x-method-override"]);
const FORBIDDEN_METHOD = /\b(connect|trace|track)\b/i;

function isForbidden(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  return (
    FORBIDDEN.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-") || (METHOD_OVERRIDES.has(lower) && FORBIDDEN_METHOD.test(value))
  );
}

// Fetch, "CORS-safelisted request-header".
const SAFE_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
// A "CORS-unsafe request-header byte": a control other than tab, or one of "():<>?@[\]{} and DEL.
// eslint-disable-next-line no-control-regex -- the standard names these bytes
const UNSAFE_BYTE = /[\u0000-\u0008\u000a-\u001f"():<>?@[\\\]{}\u007f]/;
const LANGUAGE_VALUE = /^[0-9A-Za-z *,\-.;=]*$/;
const SIMPLE_RANGE = /^bytes=\d+-\d*$/;

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/** Why this header makes the request need a preflight, or null when it is safelisted. */
function unsafeHeader(name: string, value: string): string | null {
  const lower = name.toLowerCase();
  const badValue = `the value of ${name}`;
  switch (lower) {
    case "accept":
      return UNSAFE_BYTE.test(value) || byteLength(value) > 128 ? badValue : null;
    case "accept-language":
    case "content-language":
      return !LANGUAGE_VALUE.test(value) || byteLength(value) > 128 ? badValue : null;
    case "content-type": {
      const essence = value.split(";")[0].trim().toLowerCase();
      if (UNSAFE_BYTE.test(value) || byteLength(value) > 128) return badValue;
      return SAFE_CONTENT_TYPES.includes(essence) ? null : `Content-Type: ${value}`;
    }
    case "range":
      return SIMPLE_RANGE.test(value) ? null : badValue;
    default:
      return `the header ${name}`;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(hostname);
}

const BRIDGED: BrowserLimits = { route: "bridge", dropped: [], crossOrigin: false, preflight: [], mixedContent: null, adds: [], suppresses: [] };

/**
 * What the browser will do to this request when the page at `origin` sends
 * it with `fetch`: which headers it drops, whether it asks the server first,
 * whether it blocks the request as mixed content, and what it adds. Through
 * the Local Bridge none of it applies, since Node sends the request.
 *
 * It reads the request as text: a URL it cannot parse (a `{{variable}}` left
 * in it) gets no statement about origins.
 */
export function browserLimits(request: LimitsRequest, page: { origin: string; route: "direct" | "bridge" }): BrowserLimits {
  if (page.route === "bridge") {
    return BRIDGED;
  }
  const dropped = request.headers.filter(([name, value]) => isForbidden(name, value)).map(([name]) => name);
  const sent = request.headers.filter(([name, value]) => !isForbidden(name, value));
  const has = (name: string) => sent.some(([key]) => key.toLowerCase() === name);
  const method = request.method.toUpperCase();

  const target = URL.canParse(request.url) ? new URL(request.url) : null;
  const crossOrigin = !!target && target.origin !== page.origin;

  const preflight: string[] = [];
  if (crossOrigin) {
    if (!["GET", "HEAD", "POST"].includes(method)) preflight.push(`the method ${method}`);
    let safelistedBytes = 0;
    for (const [name, value] of sent) {
      const reason = unsafeHeader(name, value);
      if (reason) preflight.push(reason);
      else safelistedBytes += byteLength(value);
    }
    if (safelistedBytes > 1024) preflight.push("safelisted headers over 1024 bytes together");
  }

  const mixedContent =
    target && page.origin.startsWith("https:") && target.protocol === "http:" ? (isLoopback(target.hostname) ? "loopback" : "blocked") : null;

  return {
    route: "direct",
    dropped,
    crossOrigin,
    preflight,
    mixedContent,
    adds: [
      ...(crossOrigin || (method !== "GET" && method !== "HEAD") ? ["Origin"] : []),
      "Sec-Fetch-Dest",
      "Sec-Fetch-Mode",
      "Sec-Fetch-Site",
      ...(has("accept") ? [] : ["Accept"]),
      "Accept-Encoding",
      ...(has("accept-language") ? [] : ["Accept-Language"]),
      ...(has("user-agent") ? [] : ["User-Agent"]),
    ],
    suppresses: ["Referer", "Cookie"],
  };
}
