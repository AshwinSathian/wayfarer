import { withJarCookies } from "../cookies/jar";
import { nextHop } from "./redirect";
import {
  MAX_REDIRECTS,
  TransportError,
  withDeadline,
  type FetchFn,
  type RedirectHop,
  type RedirectStop,
  type ResolvedRequest,
  type ResponseEnvelope,
  type Transport,
  type TransportOptions,
} from "./transport";

/** What the bridge answers a relay with (protocol 2). */
interface RelayEnvelope {
  status: number;
  statusText: string;
  /** As received, one entry each: two `Set-Cookie` headers are two. */
  headers: [string, string][];
  /** The body's bytes, decoded when the response had a `Content-Encoding`. */
  bodyB64: string;
  /** The body as it came over the wire, and as it is: they differ for a compressed one. */
  encodedSize: number;
  decodedSize: number;
}

interface RelayErrorBody {
  error?: string | { message: string; code?: string };
}

/** The protocol this page speaks to the Local Bridge. The bridge says its own in `/health`, and the relay's path carries it. */
export const BRIDGE_PROTOCOL = 2;

/**
 * What is wrong with the bridge whose `/health` answered `health`, as a
 * sentence for the user, or undefined when the page can use it (P6.3).
 * A bridge from before protocol 2 names no protocol: it speaks 1.
 */
export function bridgeHealthProblem(health: unknown): string | undefined {
  if (health === null || typeof health !== "object" || Array.isArray(health) || (health as { ok?: unknown }).ok !== true) return "What answered at this address is not a Local Bridge.";
  const { version, protocol } = health as { version?: unknown; protocol?: unknown };
  const speaks = typeof protocol === "number" && Number.isInteger(protocol) && protocol > 0 ? protocol : 1;
  if (speaks === BRIDGE_PROTOCOL) return undefined;
  // A length first: the text is another program's, and a pattern is not run over more than a version can be.
  const named = typeof version === "string" && version.length <= 40 && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]*)?$/.test(version) ? version : "(version not given)";
  return speaks < BRIDGE_PROTOCOL
    ? `Local Bridge ${named} is too old for this page: it speaks protocol ${speaks}, and the page speaks protocol ${BRIDGE_PROTOCOL}. Update the Local Bridge and start it again.`
    : `Local Bridge ${named} is newer than this page: it speaks protocol ${speaks}, and the page speaks protocol ${BRIDGE_PROTOCOL}. Reload Wayfarer to get its current version.`;
}

/** The bridge is not one of protocol 2: an older one does not know the path, and its answer is not read as anything. */
export const BRIDGE_PROTOCOL_MISMATCH = "The Local Bridge that answered does not speak protocol 2, which this page speaks: it is an older version. Update the Local Bridge and start it again.";

/**
 * Sends the request through the Local Bridge (protocol 2): one POST to
 * `/v2/relay`, with the request's headers as a list and its body as bytes,
 * answered with 200 and the target's response whenever the target was
 * reached, whatever its status. Any other answer is the bridge's own
 * failure (bad token, unreachable target) and becomes a `TransportError`.
 * The path carries the protocol: a bridge of protocol 1 has no such path,
 * so it sends nothing for a request it would have read wrongly.
 *
 * The bridge follows no redirect. When the caller asks for them to be
 * followed (P5.4), each hop is a relay of its own, made here: the page
 * decides where a request may go (C-063). One timeout holds for the whole
 * chain.
 */
export class BridgeTransport implements Transport {
  constructor(
    private readonly bridge: { url: string; token: string },
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init)
  ) {}

  send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
    return withDeadline(options, async (signal) => {
      const { redirects } = options;
      const chain: RedirectHop[] = [];
      for (let hop = request; ; ) {
        // The jar's cookies are added to what is relayed, not to `hop`: the next hop asks the jar again.
        const envelope = await this.relay(options.cookies ? { ...hop, headers: withJarCookies(hop.headers, options.cookies.for(hop.url)) } : hop, signal, options.timeoutMs);
        options.cookies?.store(hop.url, envelope.headers.filter(([name]) => name === "set-cookie").map(([, value]) => value));
        if (!redirects) return envelope;
        const ended = (stopped?: RedirectStop): ResponseEnvelope => ({ ...envelope, redirected: chain.length > 0, redirects: { chain, ...(stopped && { stopped }) } });
        const location = envelope.headers.find(([name]) => name.toLowerCase() === "location")?.[1];
        if (location === undefined) return ended();
        const next = nextHop(hop, envelope.status, location, redirects.stayOnHost);
        if (!next) return ended();
        if (!redirects.follow) return ended("off");
        if ("stopped" in next) return ended(next.stopped);
        if (chain.length >= MAX_REDIRECTS) return ended("limit");
        chain.push({ status: envelope.status, url: hop.url, location });
        hop = next.request;
      }
    });
  }

  private async relay(request: ResolvedRequest, signal: AbortSignal, timeoutMs: number): Promise<ResponseEnvelope> {
    const { headers, bytes } = await wireBody(request);
    const response = await this.fetchFn(`${this.bridge.url.replace(/\/+$/, "")}/v${BRIDGE_PROTOCOL}/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Wayfarer-Bridge-Token": this.bridge.token },
      // Only the fields of the protocol: the bridge refuses one it does not know.
      body: JSON.stringify({ method: request.method, url: request.url, headers, ...(bytes && { bodyB64: toBase64(bytes) }), ...(timeoutMs > 0 && { timeoutMs }) }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
    });
    const text = await response.text();
    // Local Bridge 1.x answers a path it does not have with 404.
    if (response.status === 404) throw new TransportError("bridge", BRIDGE_PROTOCOL_MISMATCH, 404);
    if (!response.ok) {
      throw new TransportError("bridge", describeError(text) ?? `The bridge answered ${response.status}.`, response.status);
    }
    const relay = parseEnvelope(text);
    if (!relay) throw new TransportError("bridge", BRIDGE_PROTOCOL_MISMATCH);
    return toEnvelope(relay, request.url);
  }
}

/**
 * The request's body as the bytes that go on the wire, and its headers with
 * them. A form is written as `fetch` writes one, and its `Content-Type`,
 * which names the boundary, replaces any the request had.
 */
async function wireBody(request: ResolvedRequest): Promise<{ headers: [string, string][]; bytes?: Uint8Array }> {
  const { body, headers } = request;
  if (body === undefined) return { headers };
  if (typeof body === "string") return { headers, bytes: new TextEncoder().encode(body) };
  if (body instanceof ArrayBuffer) return { headers, bytes: new Uint8Array(body) };
  const written = new Response(body);
  const bytes = new Uint8Array(await written.arrayBuffer());
  const type = written.headers.get("content-type");
  if (!(body instanceof FormData) || type === null) return { headers, bytes };
  return { headers: [...headers.filter(([name]) => name.toLowerCase() !== "content-type"), ["Content-Type", type]], bytes };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In pieces: a call takes only so many arguments.
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

/** The bridge's answer when it is one of protocol 2, every field checked: an answer of another shape is not read as a response. */
function parseEnvelope(text: string): RelayEnvelope | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { status, statusText, headers, bodyB64, encodedSize, decodedSize } = value as Record<string, unknown>;
  const pairs = Array.isArray(headers) && headers.every((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string");
  if (typeof status !== "number" || typeof statusText !== "string" || !pairs || typeof bodyB64 !== "string" || typeof encodedSize !== "number" || typeof decodedSize !== "number") return undefined;
  return { status, statusText, headers, bodyB64, encodedSize, decodedSize };
}

function toEnvelope(relay: RelayEnvelope, url: string): ResponseEnvelope {
  const bytes = fromBase64(relay.bodyB64);
  if (!bytes || bytes.byteLength !== relay.decodedSize) throw new TransportError("bridge", BRIDGE_PROTOCOL_MISMATCH);
  return {
    status: relay.status,
    statusText: relay.statusText,
    // Names in lower case, as a direct response has them.
    headers: relay.headers.map(([name, value]) => [name.toLowerCase(), value]),
    body: bytes.buffer as ArrayBuffer,
    redirected: false,
    finalUrl: url,
    route: "bridge",
    sizes: { encoded: relay.encodedSize, decoded: bytes.byteLength },
  };
}

/** The bytes of a base64 string, or undefined when it is not base64. */
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
