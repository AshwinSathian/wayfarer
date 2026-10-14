import { Injectable, inject } from "@angular/core";
import { CookieJar } from "./cookie-jar";
import { RequestSettings } from "./request-settings";
import { TransportRouter } from "./transport-router";
import { EnvironmentsStore } from "./environments-store";
import { SecretsVault } from "./secrets-vault";
import { ResponseInspection, ResponseInspector } from "../shared/inspect/response-inspector";
import { ScriptSandbox } from "../shared/scripts/script-sandbox";
import { exchange, newId, type ExchangePorts, type ExchangeResult, type RequestExecutionSpec } from "@wayfarer/core";

export interface RequestExecutionResult extends Omit<ExchangeResult, "relayTimings"> {
  /** The request's phases and sizes, where the browser gives them. */
  inspection: ResponseInspection;
}

/**
 * Sends one request through `exchange` (`@wayfarer/core`), the road the CLI
 * takes too, with the app's services as its ports: the script worker, the
 * router, the stored variables, the vault and the cookie jar. What is the
 * page's alone is added here: the browser's timings of the exchange.
 */
@Injectable({ providedIn: "root" })
export class RequestExecutor {
  private readonly transport = inject(TransportRouter);
  private readonly settings = inject(RequestSettings);
  private readonly environments = inject(EnvironmentsStore);
  private readonly responseInspector = inject(ResponseInspector);
  private readonly scriptSandbox = inject(ScriptSandbox);
  private readonly vault = inject(SecretsVault);
  private readonly cookieJar = inject(CookieJar);

  private readonly ports: ExchangePorts = {
    runScript: (script, environment, response, extras) => this.scriptSandbox.execute(script, environment, response, undefined, extras),
    transport: this.transport,
    environment: () => {
      const active = this.environments.activeEnvironment();
      return active ? { name: active.name, vars: active.vars, change: (changes) => this.environments.changeEnvironment(active.meta.id, changes) } : undefined;
    },
    globals: () => this.environments.globals(),
    changeGlobals: (changes) => this.environments.changeGlobals(changes),
    vault: { isUnlocked: () => this.vault.isUnlocked(), readSecret: (id) => this.vault.readSecret(id), replaceSecret: (id, plaintext) => this.vault.replaceSecret(id, plaintext) },
    cookies: this.cookieJar,
    timeoutMs: () => this.settings.timeoutMs(),
    historyBodies: () => this.settings.historyBodies(),
    page: location.href,
  };

  async execute(spec: RequestExecutionSpec): Promise<RequestExecutionResult> {
    const requestId = newId();
    let inspection: ResponseInspection | undefined;
    const { relayTimings, ...result } = await exchange(spec, {
      ...this.ports,
      watch: {
        sending: (url) => this.responseInspector.markRequest(requestId, url),
        received: (url) => (inspection = this.responseInspector.markResponse(requestId, url)),
      },
    });
    // Told before the post-response scripts ran: `exchange` returns only after them.
    if (!inspection) throw new Error("The exchange ended without its answer.");
    // Through the Local Bridge the connection is the bridge's, and so are its timings: the browser's own are of the call to the bridge.
    if (relayTimings) {
      inspection.phases = relayTimings;
      inspection.limitedByCors = false;
    }
    return { ...result, inspection };
  }
}
