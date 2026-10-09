import {
  TransportError,
  withDeadline,
  type FetchFn,
  type ResolvedRequest,
  type ResponseEnvelope,
  type Transport,
  type TransportOptions,
} from "./transport";

interface RelayEnvelope {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
}

interface RelayErrorBody {
  error?: string | { message: string; code?: string };
}

/**
 * Sends the request through the Local Bridge (protocol 1): one POST to
 * `/relay`, answered with 200 and the target's response whenever the target
 * was reached, whatever its status. Any other answer is the bridge's own
 * failure (bad token, unreachable target) and becomes a `TransportError`.
 */
export class BridgeTransport implements Transport {
  constructor(
    private readonly bridge: { url: string; token: string },
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init)
  ) {}

  send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
    return withDeadline(options, async (signal) => {
      // Protocol 1 carries the body as text inside JSON. Bytes and forms need protocol 2 (P6.1).
      if (request.body !== undefined && typeof request.body !== "string") {
        throw new TransportError("bridge", "The Local Bridge cannot relay a file or multipart body yet. Turn the bridge off to send this request.");
      }
      const response = await this.fetchFn(`${this.bridge.url.replace(/\/+$/, "")}/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Wayfarer-Bridge-Token": this.bridge.token },
        body: JSON.stringify({
          method: request.method,
          url: request.url,
          headers: Object.fromEntries(request.headers),
          body: request.body,
        }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new TransportError("bridge", describeError(text) ?? `The bridge answered ${response.status}.`, response.status);
      }
      return toEnvelope(JSON.parse(text) as RelayEnvelope, request.url);
    });
  }
}

function toEnvelope(relay: RelayEnvelope, url: string): ResponseEnvelope {
  const raw = relay.body ?? "";
  const base64 = relay.bodyEncoding === "base64";
  const bytes = (base64 ? fromBase64(raw) : undefined) ?? new TextEncoder().encode(raw);
  return {
    status: relay.status,
    statusText: relay.statusText,
    headers: Object.entries(relay.headers ?? {}),
    body: bytes.buffer as ArrayBuffer,
    redirected: false,
    finalUrl: url,
    route: "bridge",
    sizes: { decoded: bytes.byteLength },
    // The bridge decoded a text body to a string; it is UTF-8 again here.
    ...(base64 ? {} : { charset: "utf-8" as const }),
  };
}

/** The bytes of a base64 string, or undefined when it is not base64 (shown as the text the bridge sent). */
function fromBase64(text: string): Uint8Array | undefined {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch (error) {
    // atob throws a DOMException named InvalidCharacterError.
    if (!(error instanceof Error) || error.name !== "InvalidCharacterError") throw error;
    return undefined;
  }
}

function describeError(text: string): string | undefined {
  let body: RelayErrorBody;
  try {
    body = JSON.parse(text) as RelayErrorBody;
  } catch (error) {
    // Not JSON: the bridge's status is all there is to report.
    if (!(error instanceof SyntaxError)) throw error;
    return undefined;
  }
  if (!body?.error) return undefined;
  return typeof body.error === "string" ? body.error : body.error.message;
}
