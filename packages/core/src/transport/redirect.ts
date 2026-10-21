import type { RedirectStop, ResolvedRequest } from "./transport";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Not sent on to another origin: they were written for the first one.
const OTHER_ORIGIN_DROPPED = new Set(["authorization", "cookie"]);
// Gone with the body when a redirect turns the request into a GET.
const BODY_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-encoding",
  "content-language",
  "content-location",
]);

/**
 * The request a redirect asks for (P5.4), as a browser would make it: 303
 * makes a GET of anything but GET and HEAD, 301 and 302 of a POST, 307 and
 * 308 repeat the request; a hop to another origin goes without
 * `Authorization` and `Cookie`.
 *
 * Undefined when the response is no redirect. `stopped` when it is one
 * that is not to be followed: its `Location` is no http or https address,
 * or `stayOnHost` and the hop leaves the host (another name or port, or
 * the same host without TLS).
 *
 * `location` is the server's text and is read as an address only: it is
 * never a template (a `{{variable}}` in it is not replaced).
 */
export function nextHop(
  request: ResolvedRequest,
  status: number,
  location: string | undefined,
  stayOnHost: boolean,
): { request: ResolvedRequest } | { stopped: RedirectStop } | undefined {
  if (!REDIRECT_STATUSES.has(status) || location === undefined) return undefined;
  const from = URL.parse(request.url);
  const to = URL.parse(location, request.url);
  if (!from || !to || (to.protocol !== "http:" && to.protocol !== "https:")) return { stopped: "location" };
  if (stayOnHost && (from.host !== to.host || (from.protocol === "https:" && to.protocol === "http:")))
    return { stopped: "other-host" };

  const toGet =
    (status === 303 && request.method !== "GET" && request.method !== "HEAD") ||
    ((status === 301 || status === 302) && request.method === "POST");
  const dropped = (name: string) =>
    (toGet && BODY_HEADERS.has(name)) || (from.origin !== to.origin && OTHER_ORIGIN_DROPPED.has(name));
  const { body, ...rest } = request;
  return {
    request: {
      ...rest,
      method: toGet ? "GET" : request.method,
      url: to.href,
      headers: request.headers.filter(([name]) => !dropped(name.toLowerCase())),
      ...(!toGet && body !== undefined && { body }),
    },
  };
}
