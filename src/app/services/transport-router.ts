import { Injectable, inject } from "@angular/core";
import {
  BridgeTransport,
  FetchTransport,
  TransportError,
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

  async send(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
    if (this.route() !== "bridge") return new FetchTransport().send(request, options);
    // Held in this tab: sent at once. Otherwise it may be in the vault, and the vault may have to be unlocked.
    const token = this.bridge.config().token || (await this.bridge.tokenForSend());
    if (!token) {
      throw new TransportError(
        "bridge",
        "The Local Bridge is on, and its token is not in this tab. It is kept in the vault while the vault is unlocked, and otherwise only until the tab reloads. Unlock the vault, or enter the token again in Settings, Local Bridge."
      );
    }
    return new BridgeTransport({ url: this.bridge.config().url, token }).send(request, options);
  }
}
