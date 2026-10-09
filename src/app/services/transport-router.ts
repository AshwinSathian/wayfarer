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

  /** The route a request sent now would take. */
  route(): "direct" | "bridge" {
    const bridge = this.bridge.config();
    return bridge.enabled && bridge.url ? "bridge" : "direct";
  }

  send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
    const bridge = this.bridge.config();
    const transport =
      this.route() === "bridge" ? new BridgeTransport({ url: bridge.url, token: bridge.token }) : new FetchTransport();
    return transport.send(request, options);
  }
}
