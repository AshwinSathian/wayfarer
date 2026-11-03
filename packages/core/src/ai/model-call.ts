import { emptyRequest, type RequestContent } from "../model/request";
import { validateRequestContent } from "../model/validate";
import type { PastRequest } from "../send/exchange";
import { containsSecretPlaceholder } from "../send/wire";

// D4.10 (docs/design/ai.md, docs/design/ai/): what a model call sends and what is made of its answer. Pure: the app
// shows the call before it is sent, sends it through its transports and keeps it in history.

/** OpenAI's chat completions (OpenAI, Ollama, LM Studio, most gateways) or Anthropic's Messages API. */
export type AiProviderKind = "openai" | "anthropic";

/** A provider as the call needs it: where, which model, which API. The key is filled in by the app from the vault. */
export interface AiProvider {
  kind: AiProviderKind;
  /** Text, never through `URL`, and never a template. */
  address: string;
  model: string;
}

/** A text body goes into a prompt cut to this many characters. */
export const PROMPT_BODY_CHARS = 16 * 1024;
const ANTHROPIC_VERSION = "2023-06-01";

/** Where a call to the provider goes: `{address}/chat/completions` or `{address}/v1/messages`. */
export function modelEndpoint(provider: AiProvider): string {
  const base = provider.address.trim().replace(/\/+$/, "");
  return provider.kind === "openai" ? `${base}/chat/completions` : `${base}/v1/messages`;
}

/** What a prompt is made of: the app's instruction, and what the person's action gives it. */
export interface Prompt {
  system: string;
  user: string;
}

/** A model call as it goes on the wire, the key not yet in it. The body is the text the preview shows, byte for byte. */
export interface ModelRequest {
  method: "POST";
  url: string;
  headers: [string, string][];
  body: string;
}

export function modelRequest(provider: AiProvider, prompt: Prompt, maxTokens = 2048): ModelRequest {
  const body =
    provider.kind === "openai"
      ? {
          model: provider.model,
          max_tokens: maxTokens,
          messages: [
            ...(prompt.system ? [{ role: "system", content: prompt.system }] : []),
            { role: "user", content: prompt.user },
          ],
        }
      : {
          model: provider.model,
          max_tokens: maxTokens,
          ...(prompt.system && { system: prompt.system }),
          messages: [{ role: "user", content: prompt.user }],
        };
  const headers: [string, string][] = [["Content-Type", "application/json"]];
  if (provider.kind === "anthropic")
    headers.push(["anthropic-version", ANTHROPIC_VERSION], ["anthropic-dangerous-direct-browser-access", "true"]);
  return { method: "POST", url: modelEndpoint(provider), headers, body: JSON.stringify(body, null, 2) };
}

/** The key's header, as each API asks for it. Filled in last; the app puts the key in `BuiltRequest.secrets`. */
export function keyHeader(provider: AiProvider, key: string): [string, string] {
  return provider.kind === "openai" ? ["Authorization", `Bearer ${key}`] : ["x-api-key", key];
}

/**
 * A prompt that names a vault secret's reference is not sent (AI-9): the same check that guards every request's
 * wire (C-007), over the body as it would go.
 */
export function promptNamesSecret(request: Pick<ModelRequest, "url" | "headers" | "body">): boolean {
  return containsSecretPlaceholder(request);
}

/** "The first 16 kB of the response body, of 48.2 kB": a text cut to `PROMPT_BODY_CHARS`, and whether it was. */
export function promptBody(text: string): { text: string; cut: boolean } {
  return text.length > PROMPT_BODY_CHARS ? { text: text.slice(0, PROMPT_BODY_CHARS), cut: true } : { text, cut: false };
}

/**
 * An exchange as a prompt quotes it, from what history keeps of it (after the Redactor: a vault secret, a credential
 * and a cookie value are *** in it). Nothing here is resolved: `{{name}}` goes as written (AI-8).
 */
export function exchangeText(exchange: PastRequest, withResponseBody: boolean): string {
  const lines = [`Request:`, `${exchange.sent.method} ${exchange.sent.url}`];
  for (const [name, value] of exchange.sent.headers) lines.push(`${name}: ${value}`);
  if (exchange.sent.bodyPreview) lines.push("", exchange.sent.bodyPreview);
  const response = exchange.response;
  if (!response) lines.push("", "No response came.", ...(exchange.error ? [exchange.error] : []));
  else {
    lines.push("", "Response:", `${response.status} ${response.statusText}`.trim());
    for (const [name, value] of response.headers) lines.push(`${name}: ${value}`);
    if (withResponseBody && response.body) lines.push("", promptBody(response.body.text).text);
  }
  return lines.join("\n");
}

const TESTS_INSTRUCTION =
  "You write tests for an API request, in the Postman sandbox's JavaScript: pm.test, pm.expect and pm.response. " +
  "Answer with the whole post-response script, in one ```js code block, and nothing else. Keep what the script " +
  "already does. Test what the response shows, not what you guess.";
const DRAFT_INSTRUCTION =
  "You draft one HTTP request from a description. Answer with one JSON object and nothing else: " +
  '{"method": "GET", "url": "https://…", "headers": [["Name", "value"]], "body": "text, or omitted"}. ' +
  "Write a value the description does not give as {{name}}.";
const EXPLAIN_INSTRUCTION =
  "You explain why an API request got the response it got, in plain sentences, at most 120 words. Name the likely " +
  "cause and what to change. Do not write code.";

/** Write tests from a response: the request as sent, the response's status and headers, its body if ticked, the script. */
export function testsPrompt(exchange: PastRequest, script: string, withResponseBody: boolean): Prompt {
  const current = script.trim()
    ? `\n\nThe post-response script now:\n${script}`
    : "\n\nThere is no post-response script yet.";
  return { system: TESTS_INSTRUCTION, user: `${exchangeText(exchange, withResponseBody)}${current}` };
}

/** Draft a request: the description as typed, and the names (no values) of the variables in use when ticked. */
export function draftPrompt(description: string, variableNames: readonly string[] = []): Prompt {
  const names = variableNames.length ? `\n\nVariables that have values: ${variableNames.join(", ")}.` : "";
  return { system: DRAFT_INSTRUCTION, user: `${description}${names}` };
}

/** Explain a response: the request as sent, the response's status and headers, its body if ticked. */
export function explainPrompt(exchange: PastRequest, withResponseBody: boolean): Prompt {
  return { system: EXPLAIN_INSTRUCTION, user: exchangeText(exchange, withResponseBody) };
}

/** The answer's text: OpenAI's first choice, or Anthropic's text blocks joined. Undefined when there is none. */
export function answerText(kind: AiProviderKind, body: string): string | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    // An answer that is not JSON has no text to read.
    if (!(error instanceof SyntaxError)) throw error;
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  if (kind === "openai") {
    const content = (value as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content : undefined;
  }
  const blocks = (value as { content?: { type?: unknown; text?: unknown }[] }).content;
  const text = Array.isArray(blocks)
    ? blocks.flatMap((block) => (block?.type === "text" && typeof block.text === "string" ? [block.text] : [])).join("")
    : "";
  return text.trim() ? text : undefined;
}

/** The provider's own message about a failure: its JSON's `error.message`, else the first 500 characters. */
export function providerMessage(body: string): string {
  try {
    const message = (JSON.parse(body) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string" && message) return message;
  } catch (error) {
    // Not JSON: the text itself.
    if (!(error instanceof SyntaxError)) throw error;
  }
  return body.slice(0, 500);
}

const SECRET_REFERENCE = /\{\{\s*\$secret\./i;

/** A proposed script: the answer's first fenced block, else the answer. Refused when it names a vault secret (AI-10). */
export function scriptProposal(answer: string): { script: string } | { refused: string } {
  const fenced = /```(?:js|javascript)?\s*\n([\s\S]*?)```/.exec(answer);
  const script = (fenced ? fenced[1] : answer).trim();
  if (SECRET_REFERENCE.test(script)) return { refused: "The answer names a vault secret, and is not shown." };
  return { script };
}

/**
 * A proposed request, checked as an imported file is (`validateRequestContent`): a method that is no HTTP method, a
 * field of the wrong kind or a vault secret's reference refuses it (AI-10).
 */
export function requestProposal(answer: string): { request: RequestContent } | { refused: string } {
  if (SECRET_REFERENCE.test(answer)) return { refused: "The answer names a vault secret, and is not shown." };
  const json = /\{[\s\S]*\}/.exec(answer)?.[0];
  let value: unknown;
  try {
    value = json === undefined ? undefined : JSON.parse(json);
  } catch (error) {
    // Braces that are not JSON: no request.
    if (!(error instanceof SyntaxError)) throw error;
    value = undefined;
  }
  if (typeof value !== "object" || value === null) return { refused: "The answer is not a request the app can read." };
  const { method, url, headers, body } = value as Record<string, unknown>;
  const request: RequestContent = {
    ...emptyRequest(),
    method: typeof method === "string" ? method.toUpperCase() : "",
    url: typeof url === "string" ? url : "",
    headers: Array.isArray(headers)
      ? headers.flatMap((pair) =>
          Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string"
            ? [{ key: pair[0], value: pair[1], enabled: true }]
            : [],
        )
      : [],
    ...(typeof body === "string" && body && { body: { mode: "raw", raw: { language: "text", text: body } } }),
  };
  if (!request.url || validateRequestContent(request, "request").length)
    return { refused: "The answer is not a request the app can read." };
  return { request };
}
