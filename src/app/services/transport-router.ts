import { Injectable, inject } from "@angular/core";
import {
  BridgeTransport,
  FetchTransport,
  TransportError,
  afterDirectSend,
  type ResolvedRequest,
  type ResponseEnvelope,
  type Route,
  type RoutePolicy,
  type Transport,
  type TransportOptions,
} from "@wayfarer/core";
import { BridgeSettings } from "./bridge-settings";

/**
 * Sends a request by its route: straight from the page, through the Local
 * Bridge (see `packages/bridge/README.md`), or `auto`: from the page, and
 * through the bridge after a network failure where D7 allows it.
 */
@Injectable({ providedIn: "root" })
export class TransportRouter implements Transport {
  private readonly bridge = inject(BridgeSettings);

  /** The device's route: what a request of no other route is sent by. */
  route(): Route {
    return this.bridge.config().route;
  }

  /** Where a request of `route` goes first. A bridge with no address is no route. */
  first(route: Route = this.route()): "direct" | "bridge" {
    return route === "bridge" && this.bridge.config().url ? "bridge" : "direct";
  }

  async send(request: ResolvedRequest, options: TransportOptions, policy: RoutePolicy = { route: this.route() }): Promise<ResponseEnvelope> {
    policy.took = this.first(policy.route);
    if (policy.took === "bridge") return this.viaBridge(request, options);
    if (policy.route !== "auto") return new FetchTransport().send(request, options);
    try {
      return await new FetchTransport().send(request, options);
    } catch (error) {
      if (!(error instanceof TransportError) || error.kind !== "network" || !(await this.retryable(request, policy))) throw error;
      policy.took = "bridge";
      return this.viaBridge(request, options);
    }
  }

  /** D7, for a request the page sent and got no response to. With no bridge to send it to, nothing is asked. */
  private async retryable(request: ResolvedRequest, policy: RoutePolicy): Promise<boolean> {
    if (!this.bridge.config().url || !(await this.bridge.hasToken())) return false;
    const next = afterDirectSend(request, location.origin, true);
    return next === "retry" || (next === "ask" && !!policy.ask && (await policy.ask()));
  }

  private async viaBridge(request: ResolvedRequest, options: TransportOptions): Promise<ResponseEnvelope> {
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
