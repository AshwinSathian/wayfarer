import { emptyRequest } from "../model/request";
import { Redactor } from "../redact/redactor";
import { HISTORY_BODY_LIMIT, recordOf, type ModelAction, type PastRequest } from "../send/exchange";
import { TransportError, type ResponseEnvelope } from "../transport/transport";
import { answerText, keyHeader, providerMessage, type AiProvider, type ModelRequest } from "./model-call";

/** What a model call came to: the history entry it is kept as, and the answer's text or what went wrong. */
export interface ModelCallOutcome {
  history: PastRequest;
  /** The answer's text, when a 2xx response held one. */
  answer?: string;
  /** The provider's own words about a failure status, or the transport's for no response. */
  problem?: string;
}

/**
 * A model call as history keeps it (AI-13): masked as a send is, the key by the Redactor (it is in no field as
 * itself), with its exchange record made by the record's own code. With response bodies off in history, a prompt
 * that quoted a response body is not kept either (AI-14), and nor is the answer's body.
 */
export function keptModelCall(input: {
  provider: AiProvider;
  action: ModelAction;
  request: ModelRequest;
  /** The key sent, "" with none. */
  key: string;
  /** The vault secret's name the key came from, as the record names it. */
  keyName: string;
  outcome: ResponseEnvelope | TransportError;
  durationMs: number;
  route: "direct" | "bridge";
  unpaired: boolean;
  keepBodies: boolean;
  /** The prompt quotes a response body. */
  quotesResponseBody: boolean;
  createdAt: number;
}): ModelCallOutcome {
  const { request, outcome } = input;
  const redactor = new Redactor(input.key ? [input.key] : []);
  const sentHeaders: [string, string][] = input.key
    ? [...request.headers, keyHeader(input.provider, input.key)]
    : request.headers;
  const keepPrompt = input.keepBodies || !input.quotesResponseBody;
  const headers = redactor.headers(sentHeaders);
  const history: PastRequest = {
    createdAt: input.createdAt,
    template: {
      ...emptyRequest(),
      method: request.method,
      url: request.url,
      headers: headers.map(([key, value]) => ({ key, value, enabled: true })),
      ...(keepPrompt && { body: { mode: "raw", raw: { language: "json", text: redactor.text(request.body) } } }),
    },
    sent: {
      method: request.method,
      url: redactor.text(request.url),
      headers,
      ...(keepPrompt && { bodyPreview: redactor.text(request.body).slice(0, HISTORY_BODY_LIMIT) }),
    },
    durationMs: input.durationMs,
    route: input.route,
    model: { action: input.action, model: input.provider.model },
  };
  let answer: string | undefined;
  let problem: string | undefined;
  let bodyText: string | undefined;
  if (outcome instanceof TransportError) {
    problem = redactor.text(outcome.message);
    history.error = problem;
  } else {
    bodyText = outcome.body instanceof Blob ? undefined : new TextDecoder().decode(outcome.body);
    history.response = {
      status: outcome.status,
      statusText: outcome.statusText,
      headers: redactor.headers(outcome.headers),
      ...(input.keepBodies &&
        bodyText !== undefined && {
          body: {
            text: redactor.text(bodyText).slice(0, HISTORY_BODY_LIMIT),
            truncated: bodyText.length > HISTORY_BODY_LIMIT,
          },
        }),
    };
    if (outcome.status >= 200 && outcome.status < 300) {
      const text = bodyText === undefined ? undefined : answerText(input.provider.kind, bodyText);
      if (text !== undefined) answer = redactor.text(text);
    } else problem = redactor.text(providerMessage(bodyText ?? ""));
  }
  history.record = recordOf(history, {
    sentHeaders,
    sentUrl: request.url,
    sentPreview: keepPrompt ? request.body : undefined,
    received: outcome instanceof TransportError ? undefined : { headers: outcome.headers, body: bodyText },
    vaulted: input.key ? [{ name: input.keyName }] : [],
    unpaired: outcome instanceof TransportError && input.route === "direct" && input.unpaired,
    failure:
      outcome instanceof TransportError
        ? { kind: outcome.kind, reported: problem ?? "", summary: problem ?? "" }
        : undefined,
  });
  if (!keepPrompt) history.record.kept.quoteLeftOut = true;
  return { history, ...(answer !== undefined && { answer }), ...(problem !== undefined && { problem }) };
}
