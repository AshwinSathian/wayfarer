import {
  withDeadline,
  readBody,
  readEventStream,
  type FetchFn,
  type ResolvedRequest,
  type ResponseEnvelope,
  type Transport,
  type TransportOptions,
} from "./transport";

/**
 * Sends the request from where the code runs (the page, or Node). Nothing of
 * the app's own goes with it: no cache, no cookies, no `Referer` (D23).
 */
export class FetchTransport implements Transport {
  constructor(
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
    private readonly displayCap?: number
  ) {}

  send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
    return withDeadline(options, async (signal, arrived) => {
      const response = await this.fetchFn(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "follow",
        signal,
      });
      // An event stream the caller wants as it comes (P5.6): from here the timeout is over, and a cancel is a stop.
      const { onEvent } = options;
      const events = onEvent && /^text\/event-stream\b/i.test(response.headers.get("content-type") ?? "") ? (arrived(), await readEventStream(response, signal, onEvent)) : undefined;
      const body = events?.body ?? (await readBody(response, this.displayCap));
      return {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers],
        body,
        redirected: response.redirected,
        finalUrl: response.url || request.url,
        route: "direct",
        sizes: { decoded: body instanceof Blob ? body.size : body.byteLength },
        ...(events && { stream: events.stream }),
      };
    });
  }
}
