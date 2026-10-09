import { Injectable, inject } from "@angular/core";
import {
  BridgeTransport,
  FetchTransport,
  type ResolvedRequest,
  type ResponseEnvelope,
  type Transport,
  type TransportOptions,
} from "@wayfarer/core";
import { BridgeSettings } from "./bridge-settings";

/**
 * Sends a request by the route the device is set to: straight from the page,
 * or through the Local Bridge when it is switched on (see
 * `local-bridge/README.md`).
 */
@Injectable({ providedIn: "root" })
export class TransportRouter implements Transport {
  private readonly bridge = inject(BridgeSettings);

  send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
    const bridge = this.bridge.config();
    const transport =
      bridge.enabled && bridge.url ? new BridgeTransport({ url: bridge.url, token: bridge.token }) : new FetchTransport();
    return transport.send(withJsonContentType(request), options);
  }
}

/**
 * The composer's body is JSON. Sent as text with no Content-Type, `fetch`
 * would call it text/plain; HttpClient used to add this header itself.
 */
function withJsonContentType(request: ResolvedRequest): ResolvedRequest {
  if (request.body === undefined || request.headers.some(([name]) => name.toLowerCase() === "content-type")) {
    return request;
  }
  return { ...request, headers: [...request.headers, ["Content-Type", "application/json"]] };
}
