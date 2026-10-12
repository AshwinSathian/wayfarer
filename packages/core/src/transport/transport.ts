import { SseParser, type SseEvent } from "./sse";

/** A request with every variable resolved, as it goes on the wire. */
export interface ResolvedRequest {
  method: string;
  url: string;
  /** In order; a name may repeat. */
  headers: [string, string][];
  /** Text, bytes, or a form: `fetch` writes a form as multipart and sets its boundary. */
  body?: string | ArrayBuffer | Blob | FormData;
}

/** What either route returns. An HTTP error status is a response, not an error. */
export interface ResponseEnvelope {
  status: number;
  statusText: string;
  headers: [string, string][];
  /** A `Blob` above the display cap: offered as a download, never decoded. */
  body: ArrayBuffer | Blob;
  redirected: boolean;
  finalUrl: string;
  route: "direct" | "bridge";
  sizes: { encoded?: number; decoded: number };
  /**
   * Set when the route already decoded the text and `body` is its UTF-8
   * bytes (bridge protocol 1): the Content-Type's own charset no longer
   * applies. Gone with protocol 2 (P6.1), which relays the bytes.
   */
  charset?: "utf-8";
  /**
   * Set when the body was an event stream read as it arrived (P5.6).
   * `stopped`: the caller ended it, and `body` is what had arrived.
   * `truncated`: the stream was longer than `STREAM_BODY_BYTES`, and `body` is its start.
   */
  stream?: { stopped: boolean; truncated?: true };
  /**
   * Set by a route that makes each hop of a redirect itself and so can say
   * them (the Local Bridge, P5.4): each one followed, and why no more were
   * when the response is itself a redirect. A direct request has none: the
   * browser follows and tells a page only `redirected` and `finalUrl`.
   */
  redirects?: { chain: RedirectHop[]; stopped?: RedirectStop };
}

/** One redirect that was followed: the status, the address that answered with it, and its `Location` as the server wrote it. */
export interface RedirectHop {
  status: number;
  url: string;
  location: string;
}

/**
 * Why a redirect was not followed: the request said not to (`off`), the
 * limit of hops, a `Location` that is no http or https address, or a hop
 * to another host that was not to be made.
 */
export type RedirectStop = "off" | "limit" | "location" | "other-host";

/** The most redirects that are followed for one request. */
export const MAX_REDIRECTS = 20;

/** An event of a stream, and when it arrived: milliseconds after the response's headers. */
export type StreamEvent = SseEvent & { timeMs: number };

/** How much of an event stream is kept as the response's body. A stream may never end; its events are given to the caller as they come. */
export const STREAM_BODY_BYTES = 1024 * 1024;

export interface TransportOptions {
  /** Aborted when the user cancels. */
  signal: AbortSignal;
  /** 0 means no timeout. */
  timeoutMs: number;
  /**
   * Asks for a `text/event-stream` response to be read as it arrives (P5.6):
   * called with each event. The timeout then ends with the response's
   * headers, and an abort after them ends the stream as a response.
   * A route that cannot stream (the Local Bridge) reads the body whole.
   */
  onEvent?: (event: StreamEvent) => void;
  /**
   * For the route that can see a redirect (the Local Bridge, P5.4): whether
   * to follow, and whether to stop at a hop that leaves the host. Absent,
   * nothing is followed and a 3xx is the response. A direct request ignores
   * it: the browser always follows, and a page cannot read a redirect it
   * was told not to follow.
   */
  redirects?: { follow: boolean; stayOnHost: boolean };
}

export interface Transport {
  send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope>;
}

export type TransportErrorKind = "network" | "timeout" | "aborted" | "bridge";

/** No response was received. `status` is the bridge's own answer, when it gave one. */
export class TransportError extends Error {
  override readonly name = "TransportError";

  constructor(
    readonly kind: TransportErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

/** Bodies up to this size are kept as bytes to display; larger ones become a `Blob`. */
export const DISPLAY_CAP_BYTES = 50 * 1024 * 1024;

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Runs one send under the caller's signal and the timeout, and names a
 * failure: the timeout, the user's cancel, or the network.
 *
 * One controller and one timer, not `AbortSignal.any([signal,
 * AbortSignal.timeout(ms)])`: in WebKit a signal made by `any` that only
 * `fetch` refers to never aborted, so a timeout never ended the request.
 */
export async function withDeadline<T>(options: TransportOptions, run: (signal: AbortSignal, arrived: () => void) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal.aborted) cancel();
  options.signal.addEventListener("abort", cancel);
  const timer =
    options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeoutMs)
      : undefined;
  try {
    // `arrived`: the answer has begun, and the timeout has nothing more to say (a stream).
    return await run(controller.signal, () => clearTimeout(timer));
  } catch (cause) {
    if (cause instanceof TransportError) throw cause;
    if (timedOut) throw new TransportError("timeout", `Timed out after ${options.timeoutMs} ms`);
    if (options.signal.aborted) throw new TransportError("aborted", "The request was cancelled.");
    throw new TransportError("network", cause instanceof Error ? cause.message : String(cause));
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", cancel);
  }
}

/**
 * Reads a response body: bytes up to the display cap, a `Blob` beyond it.
 * Past the cap the chunks are folded into the blob as they arrive, so the
 * page never holds the whole body in one buffer.
 */
export async function readBody(response: Response, cap = DISPLAY_CAP_BYTES): Promise<ArrayBuffer | Blob> {
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let pending = 0;
  let blob: Blob | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new Uint8Array(value));
    pending += value.byteLength;
    if (pending > cap || (blob && pending > FOLD_BYTES)) {
      blob = new Blob(blob ? [blob, ...chunks] : chunks);
      chunks = [];
      pending = 0;
    }
  }
  if (blob) return new Blob([blob, ...chunks]);
  const bytes = new Uint8Array(pending);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

const FOLD_BYTES = 8 * 1024 * 1024;

/**
 * Reads an event stream as it arrives: each event to `onEvent`, and the first
 * `STREAM_BODY_BYTES` of it as the body. Ends when the server ends it, or
 * when `signal` aborts: that is the caller's stop, and what had arrived is
 * the response. Any other failure is thrown.
 */
export async function readEventStream(response: Response, signal: AbortSignal, onEvent: (event: StreamEvent) => void): Promise<{ body: ArrayBuffer; stream: NonNullable<ResponseEnvelope["stream"]> }> {
  const started = Date.now();
  const parser = new SseParser();
  const decoder = new TextDecoder();
  const kept = new Uint8Array(STREAM_BODY_BYTES);
  let size = 0;
  let truncated = false;
  let stopped = false;
  const reader = response.body?.getReader();
  try {
    for (;;) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      const room = STREAM_BODY_BYTES - size;
      kept.set(chunk.value.subarray(0, room), size);
      size += Math.min(room, chunk.value.byteLength);
      if (chunk.value.byteLength > room) truncated = true;
      for (const event of parser.push(decoder.decode(chunk.value, { stream: true }))) onEvent({ ...event, timeMs: Date.now() - started });
    }
  } catch (error) {
    if (!signal.aborted) throw error;
    stopped = true;
  }
  return { body: kept.slice(0, size).buffer, stream: { stopped, ...(truncated && { truncated }) } };
}
