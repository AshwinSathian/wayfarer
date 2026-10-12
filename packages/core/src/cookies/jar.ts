/**
 * A cookie jar as RFC 6265 describes it (P5.3), for requests that leave
 * through the Local Bridge: a browser keeps its own jar for a direct
 * request and shows a page nothing of it. Pure: the app stores the list.
 *
 * There is no public suffix list here. A `Domain` with no dot in it is
 * refused, which stops `Domain=com`; `Domain=co.uk` is not known to be a
 * suffix and is taken.
 */
export interface Cookie {
  name: string;
  value: string;
  /** Lower case, without a leading dot. */
  domain: string;
  /** Set without a `Domain`: sent to that host alone, not to what is under it. */
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  /** Kept as the server said it and applied to nothing: a request from this app has no site of its own. */
  sameSite?: "strict" | "lax" | "none";
  /** Milliseconds since 1970. Absent for a session cookie, which stays until it is deleted. */
  expires?: number;
  /** When the cookie of this name, domain and path was first set. */
  created: number;
}

/** The most bytes a cookie's name and value may have together (RFC 6265, 6.1). */
const MAX_COOKIE_BYTES = 4096;
/** The most cookies a jar holds; the oldest go first. */
export const MAX_COOKIES = 1000;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const isIp = (host: string) => IPV4.test(host) || host.startsWith("[");

function httpUrl(url: string): URL | undefined {
  const parsed = URL.parse(url);
  return parsed && (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed : undefined;
}

/** `host` is `domain`, or a name under it (RFC 6265, 5.1.3). An IP address is only itself. */
function domainMatches(host: string, domain: string): boolean {
  return host === domain || (!isIp(host) && host.endsWith(`.${domain}`));
}

/** The path of `url` up to its last slash (RFC 6265, 5.1.4). */
function defaultPath(pathname: string): string {
  const end = pathname.lastIndexOf("/");
  return end > 0 ? pathname.slice(0, end) : "/";
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  return requestPath === cookiePath || (requestPath.startsWith(cookiePath) && (cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/"));
}

/**
 * One `Set-Cookie` header from the response of `url`, or undefined when a
 * browser would not keep it: no name, a `Domain` the host does not belong
 * to, `Secure` without TLS, a broken `__Secure-` or `__Host-` prefix.
 */
export function parseSetCookie(header: string, url: string, now: number): Cookie | undefined {
  const from = httpUrl(url);
  if (!from) return undefined;
  const [pair, ...attributes] = header.split(";");
  const equals = pair.indexOf("=");
  const name = pair.slice(0, Math.max(equals, 0)).trim();
  const value = pair.slice(equals + 1).trim();
  // eslint-disable-next-line no-control-regex -- a control character ends a cookie (RFC 6265, 5.2)
  if (equals < 1 || !name || /[\u0000-\u001f\u007f]/.test(pair) || new TextEncoder().encode(name + value).length > MAX_COOKIE_BYTES) return undefined;

  const host = from.hostname.toLowerCase();
  const cookie: Cookie = { name, value, domain: host, hostOnly: true, path: defaultPath(from.pathname), secure: false, httpOnly: false, created: now };
  let maxAge: number | undefined;
  for (const attribute of attributes) {
    const split = attribute.indexOf("=");
    const key = (split < 0 ? attribute : attribute.slice(0, split)).trim().toLowerCase();
    const text = split < 0 ? "" : attribute.slice(split + 1).trim();
    if (key === "secure") cookie.secure = true;
    else if (key === "httponly") cookie.httpOnly = true;
    else if (key === "path" && text.startsWith("/")) cookie.path = text;
    else if (key === "samesite" && (text.toLowerCase() === "strict" || text.toLowerCase() === "lax" || text.toLowerCase() === "none")) cookie.sameSite = text.toLowerCase() as Cookie["sameSite"];
    else if (key === "max-age" && /^-?\d+$/.test(text)) maxAge = Number(text);
    else if (key === "expires" && Number.isFinite(Date.parse(text))) cookie.expires = Date.parse(text);
    else if (key === "domain" && text) {
      const domain = text.replace(/^\./, "").toLowerCase();
      if (!domainMatches(host, domain)) return undefined;
      // With no dot it is a suffix (com) or the host itself (localhost): only the host may name it, and the cookie is then the host's alone.
      const wide = domain.includes(".") && !isIp(domain);
      if (!wide && domain !== host) return undefined;
      cookie.domain = domain;
      cookie.hostOnly = !wide;
    }
  }
  if (maxAge !== undefined) cookie.expires = maxAge <= 0 ? 0 : now + maxAge * 1000;

  if (cookie.secure && from.protocol !== "https:") return undefined;
  if (name.startsWith("__Secure-") && !cookie.secure) return undefined;
  if (name.startsWith("__Host-") && !(cookie.secure && cookie.hostOnly && cookie.path === "/")) return undefined;
  return cookie;
}

const same = (a: Cookie, b: Cookie) => a.name === b.name && a.domain === b.domain && a.path === b.path;
const expired = (cookie: Cookie, now: number) => cookie.expires !== undefined && cookie.expires <= now;

/** `jar` with `cookie` in it, in place of the one of its name, domain and path. One that has expired takes that one out and is not kept. */
export function storeCookie(jar: Cookie[], cookie: Cookie, now: number): Cookie[] {
  const was = jar.find((held) => same(held, cookie));
  if (expired(cookie, now)) return jar.filter((held) => held !== was);
  // In its place: two cookies set in one millisecond are sent in the order they were set.
  const next = was ? jar.map((held) => (held === was ? { ...cookie, created: was.created } : held)) : [...jar, cookie];
  return next.length > MAX_COOKIES ? next.sort((a, b) => a.created - b.created).slice(next.length - MAX_COOKIES) : next;
}

/** The cookies of `jar` that a request to `url` carries, in the order they are sent: the longer path first, then the one set earlier. */
export function cookiesFor(jar: Cookie[], url: string, now: number): Cookie[] {
  const to = httpUrl(url);
  if (!to) return [];
  const host = to.hostname.toLowerCase();
  return jar
    .filter((cookie) => !expired(cookie, now) && (cookie.hostOnly ? host === cookie.domain : domainMatches(host, cookie.domain)) && pathMatches(to.pathname, cookie.path) && (!cookie.secure || to.protocol === "https:"))
    .sort((a, b) => b.path.length - a.path.length || a.created - b.created);
}

export function cookieHeader(cookies: Cookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * `headers` with the jar's `cookies` in the `Cookie` header. A cookie the
 * request names itself is the request's: the jar's of that name is left out.
 */
export function withJarCookies(headers: [string, string][], cookies: Cookie[]): [string, string][] {
  const at = headers.findIndex(([name]) => name.toLowerCase() === "cookie");
  if (at < 0) return cookies.length ? [...headers, ["Cookie", cookieHeader(cookies)]] : headers;
  const own = new Set(headers[at][1].split(";").map((pair) => pair.split("=")[0].trim()));
  const added = cookies.filter((cookie) => !own.has(cookie.name));
  if (!added.length) return headers;
  return headers.map((header, index) => (index === at ? [header[0], `${header[1]}; ${cookieHeader(added)}`] : header));
}
