import { Injectable, inject } from "@angular/core";
import { TransportError, type ModelAction } from "@wayfarer/core";
import type { ModelCallOutcome } from "@wayfarer/core/ai";
import { HistoryRepository } from "../data/history-repository";
import { AI_KEY_NAME, AiSettings } from "./ai-settings";
import { RequestSettings } from "./request-settings";
import { TransportRouter } from "./transport-router";

/** A model call ready to be previewed: what will be sent, byte for byte, and why it cannot be sent, if it cannot. */
export interface PreparedCall {
  action: ModelAction;
  method: "POST";
  url: string;
  /** Without the key, which is filled in last: the preview shows it as ***. */
  headers: [string, string][];
  body: string;
  /** The prompt quotes a response body (its tick is ticked). */
  quotesResponseBody: boolean;
  /** Why Send to model is disabled, in the preview's words; "" when it may be sent. */
  blocked: string;
}

/**
 * Model calls (D4.10): made only by a person's Send to model (AI-12), never by a send, a run or a script. Each goes
 * through `TransportRouter` with the provider's route, as every request does, and is kept in history masked (AI-13).
 * The core module is fetched when the first call is prepared: nothing of it is in the first download.
 */
@Injectable({ providedIn: "root" })
export class ModelCalls {
  private readonly ai = inject(AiSettings);
  private readonly router = inject(TransportRouter);
  private readonly history = inject(HistoryRepository);
  private readonly settings = inject(RequestSettings);

  /** The call a prompt makes, for the preview. Null with no provider: no AI is offered then (AI-1). */
  async prepare(
    action: ModelAction,
    prompt: { system: string; user: string },
    quotesResponseBody: boolean,
  ): Promise<PreparedCall | null> {
    const provider = this.ai.provider();
    if (!provider) return null;
    const ai = await import("@wayfarer/core/ai");
    const request = ai.modelRequest(provider, prompt, action === "test" ? 8 : 2048);
    const bytes = new TextEncoder().encode(request.body).length;
    const blocked = ai.promptNamesSecret(request)
      ? "The prompt names a vault secret ({{$secret.…}}), which never leaves this browser. Take it out to send."
      : bytes > ai.MAX_PROMPT_BYTES
        ? `A prompt can be 128 kB at most. This one is ${Math.ceil(bytes / 1024)} kB: untick the response body, or shorten the description.`
        : "";
    return { action, ...request, quotesResponseBody, blocked };
  }

  /** Settings › AI's test: a few bytes, with no part of any request in them. */
  async prepareTest(): Promise<PreparedCall | null> {
    const { PROVIDER_TEST_PROMPT } = await import("@wayfarer/core/ai");
    return this.prepare("test", PROVIDER_TEST_PROMPT, false);
  }

  /** Sends a prepared call, keeps it in history, and says what came of it. */
  async send(call: PreparedCall, signal: AbortSignal): Promise<ModelCallOutcome> {
    const provider = this.ai.provider();
    if (!provider) throw new Error("No AI provider is set up.");
    if (call.blocked) throw new Error(call.blocked);
    const ai = await import("@wayfarer/core/ai");
    const key = this.ai.keyStored()
      ? await this.ai.keyForCall(`Asking ${provider.address} needs ${AI_KEY_NAME} from the vault.`)
      : "";
    const headers: [string, string][] = key ? [...call.headers, ai.keyHeader(provider, key)] : call.headers;
    const policy = { route: provider.route };
    const started = performance.now();
    let outcome;
    try {
      outcome = await this.router.send(
        { method: call.method, url: call.url, headers, body: call.body },
        { signal, timeoutMs: ai.MODEL_CALL_TIMEOUT_MS },
        policy,
      );
    } catch (error) {
      if (!(error instanceof TransportError)) throw error;
      outcome = error;
    }
    const kept = ai.keptModelCall({
      provider,
      action: call.action,
      request: { method: call.method, url: call.url, headers: call.headers, body: call.body },
      key,
      keyName: AI_KEY_NAME,
      outcome,
      durationMs: Math.round(performance.now() - started),
      route:
        outcome instanceof TransportError
          ? ((policy as { took?: "direct" | "bridge" }).took ?? "direct")
          : outcome.route,
      unpaired: !!(policy as { unpaired?: true }).unpaired,
      keepBodies: this.settings.historyBodies(),
      quotesResponseBody: call.quotesResponseBody,
      createdAt: Date.now(),
    });
    await this.history.add(kept.history, this.settings.historyCap());
    return kept;
  }
}
