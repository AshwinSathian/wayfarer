import { browserLimits, type LimitsRequest } from "../browser/browser-limits";
import type { Route } from "../model/request";

/** The route a request is sent by: its own, else its collection's, else the device's. Absent is "inherit". */
export function routeOf(request: Route | undefined, collection: Route | undefined, device: Route): Route {
  return request ?? collection ?? device;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * What the `auto` route does after the page sent `request` itself (D7). A
 * response is the answer ("keep"). After a network failure the request is
 * sent again through the bridge only when it cannot have reached the server,
 * since the browser's preflight failed first, or when sending it twice does
 * no harm; otherwise the browser may have sent it, and the user is asked.
 */
export function afterDirectSend(request: LimitsRequest, pageOrigin: string, failed: boolean): "keep" | "retry" | "ask" {
  if (!failed) return "keep";
  if (SAFE.has(request.method.toUpperCase())) return "retry";
  return browserLimits(request, { origin: pageOrigin, route: "direct" }).preflight.length ? "retry" : "ask";
}
