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
}

export interface TransportOptions {
  /** Aborted when the user cancels. */
  signal: AbortSignal;
  /** 0 means no timeout. */
  timeoutMs: number;
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
export async function withDeadline<T>(options: TransportOptions, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
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
    return await run(controller.signal);
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
