import { Injectable, inject } from "@angular/core";
import { RequestSettings } from "./request-settings";
import { TransportRouter } from "./transport-router";
import { EnvironmentsStore } from "./environments-store";
import { ResponseInspector } from "../shared/inspect/response-inspector";
import {
  SCRIPTS_ENABLED,
  ScriptSandbox,
  ScriptResponseContext,
} from "../shared/scripts/script-sandbox";
import {
  AssertionRunner,
  AssertionResponseContext,
} from "../shared/scripts/assertion-runner";
import { PastRequest } from "../models/history";
import { TestAssertion, TestResult } from "../models/test-assertion";
import {
  BinaryBody,
  Redactor,
  TransportError,
  decodeEnvelope,
  newId,
  parseJson,
  stringifyJson,
  variablesByName,
  type RequestContent,
  type ResponseEnvelope,
} from "@wayfarer/core";

export interface BuiltRequest {
  method: string;
  url: string;
  /** In the order they are sent. */
  headers: [string, string][];
  /** Text, a file, or a multipart form. Absent when the request has no body. */
  body?: string | Blob | FormData;
  /** The plaintext of every vault secret that was placed into this request. Masked wherever the request is stored or exported. */
  secrets: string[];
  /** The credentials of the Auth tab as they were sent. Masked too, unless the user asks for an export with credentials. */
  credentials: string[];
}

/** How much of a body history keeps, in characters. */
export const HISTORY_BODY_LIMIT = 1024 * 1024;

/**
 * Thrown by `execute()` when a request must not reach the network. The
 * message is user-facing.
 */
export class SendBlockedError extends Error {
  override readonly name = "SendBlockedError";
}

const SECRET_PLACEHOLDER = /\{\{\s*\$secret\./;

const NETWORK_ERROR_TEXT =
  "Network error — no response was received. The host may not resolve (DNS), may have refused " +
  "the connection, or may not allow cross-origin requests from this site (CORS). The browser " +
  "does not reveal which. Check the URL and your connection; for CORS, the Local Bridge can relay the request.";

const SECRET_PLACEHOLDER_BLOCKED =
  "This request refers to a vault secret that could not be read (it may have been deleted), so it was not sent. " +
  "Give the variable a value again.";

/**
 * True when a built request still carries a literal `{{$secret.<id>}}`
 * placeholder anywhere it would go on the wire (F03). The URL is also checked
 * percent-decoded, since URL normalisation may have encoded the braces, and
 * Basic credentials base64-decoded.
 */
function containsSecretPlaceholder(request: BuiltRequest): boolean {
  const wire = [
    request.url,
    percentDecoded(request.url),
    JSON.stringify(request.headers),
    ...request.headers.map(([, value]) => decodeBasicCredentials(value)),
    ...bodyTexts(request.body),
  ];
  return wire.some((text) => SECRET_PLACEHOLDER.test(text));
}

function percentDecoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch (error) {
    // Malformed escape: the text as it is gets checked too.
    if (!(error instanceof URIError)) throw error;
    return "";
  }
}

/**
 * The text a body puts on the wire: itself, also percent-decoded (a form
 * body encodes the braces), and every name, value and file name of a
 * multipart form. A file's own bytes are the user's and are not read.
 */
function bodyTexts(body: BuiltRequest["body"]): string[] {
  if (typeof body === "string") {
    return [body, percentDecoded(body.replaceAll("+", " "))];
  }
  if (body instanceof FormData) {
    return [...body].flatMap(([name, value]) => [name, typeof value === "string" ? value : value.name]);
  }
  return [];
}

/** The `user:password` inside a `Basic` header value, where base64 would hide a placeholder; "" otherwise. */
function decodeBasicCredentials(headerValue: string): string {
  const encoded = /^\s*Basic\s+(\S+)/i.exec(headerValue)?.[1];
  if (!encoded) return "";
  try {
    return atob(encoded);
  } catch (error) {
    // Not base64 (atob throws InvalidCharacterError): nothing hidden in it.
    if (!(error instanceof DOMException)) throw error;
    return "";
  }
}

/**
 * A body as history describes it. Text is kept as text. Of a form or a
 * file, the names and sizes are kept and never the bytes: a file may be the
 * user's key or their customers' data.
 */
function sentBodyPreview(body: BuiltRequest["body"]): string | undefined {
  if (body === undefined || typeof body === "string") return body;
  const file = (blob: Blob) => `(${blob.size} bytes${blob.type ? `, ${blob.type}` : ""})`;
  if (body instanceof FormData) {
    return [...body].map(([name, value]) => (typeof value === "string" ? `${name}=${value}` : `${name}=@${value.name} ${file(value)}`)).join("\n");
  }
  return `@file ${file(body)}`;
}

export interface RequestExecutionSpec {
  preRequestScript: string;
  postRequestScript: string;
  tests: TestAssertion[];
  /** The request as composed, `{{variables}}` not resolved: history keeps it. */
  template: RequestContent;
  /**
   * Builds the actual method/url/headers/body to send. Invoked *after* the
   * pre-request script has run (and any pm.environment.set() mutations from
   * it have been persisted) — not upfront — so a pre-script that sets a
   * variable this same request's own headers/body/URL reference (e.g. an
   * auth token fetched by a prior call) is reflected in what actually gets
   * sent, matching the ordering `pre-script -> build -> send` implies.
   */
  buildRequest: () => BuiltRequest | Promise<BuiltRequest>;
  /** Aborted when the user cancels the send. */
  signal?: AbortSignal;
}

export interface RequestExecutionResponse {
  isError: boolean;
  statusCode?: number;
  statusText?: string;
  bodyIsJson: boolean;
  dataText: string;
  errorText: string;
  headersView: { name: string; value: string }[];
  contentLength?: number;
  /** Set when the body is binary; the viewer offers it as a download (F05). */
  binary?: BinaryBody;
  /** The URL the response came from, when the request was redirected there. */
  redirectedTo?: string;
}

/** One outcome of a send, in the shapes its three consumers take. */
interface Shaped {
  /** The decoded body, for the post-response script and the assertions. */
  body: unknown;
  headers: Record<string, string>;
  /** As received, in order, a repeated name once per value. */
  headerList: [string, string][];
  /** The body as text, when it is text. */
  bodyText?: string;
  historyError?: string;
  response: RequestExecutionResponse;
}

export interface RequestExecutionResult {
  durationMs: number;
  testResults: TestResult[];
  response: RequestExecutionResponse;
  history: PastRequest;
}

/**
 * Owns the pre-script -> send -> post-script -> assertions pipeline that
 * used to live inline in the composer. Extracted so the
 * sequencing (and the response-shaping/error-classification logic it
 * depends on) is unit-testable without an Angular component harness, and so
 * WorkspaceStore only has to own request-*building* (turning form
 * state into a spec) rather than request-*execution*.
 */
@Injectable({ providedIn: "root" })
export class RequestExecutor {
  private readonly transport = inject(TransportRouter);
  private readonly settings = inject(RequestSettings);
  private readonly environmentsService = inject(EnvironmentsStore);
  private readonly responseInspector = inject(ResponseInspector);
  private readonly scriptSandbox = inject(ScriptSandbox);
  private readonly scriptsEnabled = inject(SCRIPTS_ENABLED);
  private readonly assertionRunner = inject(AssertionRunner);

  async execute(spec: RequestExecutionSpec): Promise<RequestExecutionResult> {
    const requestId = newId();
    const createdAt = Date.now();
    let testResults: TestResult[] = [];

    if (this.scriptsEnabled && spec.preRequestScript?.trim()) {
      const preResult = await this.scriptSandbox.execute(
        spec.preRequestScript,
        this.getEnvSnapshot()
      );
      if (preResult.testResults.length) {
        testResults = [...preResult.testResults];
      }
      await this.applyEnvMutations(preResult.envMutations);
    }

    // Built only now, after the pre-script (and any environment mutations
    // it made) has already landed — see BuiltRequest / buildRequest's doc.
    // Awaited only when it is a promise: a request with no file to read is sent in the same task as the click.
    const built = spec.buildRequest();
    const request = built instanceof Promise ? await built : built;
    // The last line of defence (C-007): a reference to a secret that is not in
    // the vault, or one somewhere the resolver does not read, stays as written.
    // It must not go on the wire as that text.
    if (containsSecretPlaceholder(request)) {
      throw new SendBlockedError(SECRET_PLACEHOLDER_BLOCKED);
    }

    this.responseInspector.markRequest(requestId, request.url);

    // The duration is the transport call alone: no script time (F11).
    const startedAt = performance.now();
    let outcome: ResponseEnvelope | TransportError;
    try {
      outcome = await this.transport.send(
        {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
        },
        { signal: spec.signal ?? new AbortController().signal, timeoutMs: this.settings.timeoutMs() }
      );
    } catch (error) {
      if (!(error instanceof TransportError)) throw error;
      outcome = error;
    }
    const durationMs = Math.round(performance.now() - startedAt);
    this.responseInspector.markResponse(requestId, request.url);

    const shaped = outcome instanceof TransportError ? this.shapeFailure(outcome, request.url) : this.shapeResponse(outcome, request.url);
    const postTestResults = await this.runPostScriptAndAssertions(
      spec,
      shaped.response.statusCode ?? 0,
      shaped.response.statusText ?? "",
      shaped.body,
      shaped.headers,
      durationMs
    );
    testResults = [...testResults, ...postTestResults];

    // History keeps nothing that can be used as a credential (D5): every vault
    // secret and credential of this request is masked in what was sent and in
    // what came back, since a server may send them back.
    const redactor = new Redactor([...request.secrets, ...request.credentials]);
    const keep = (text: string) => {
      const masked = redactor.text(text);
      return { text: masked.slice(0, HISTORY_BODY_LIMIT), truncated: masked.length > HISTORY_BODY_LIMIT };
    };
    const preview = sentBodyPreview(request.body);
    const history: PastRequest = {
      createdAt,
      template: redactor.template(spec.template),
      sent: {
        method: request.method,
        url: redactor.text(request.url),
        headers: redactor.headers(request.headers),
        ...(preview !== undefined && { bodyPreview: keep(preview).text }),
      },
      route: outcome instanceof TransportError ? this.transport.route() : outcome.route,
      durationMs,
    };
    if (!(outcome instanceof TransportError)) {
      history.response = {
        status: outcome.status,
        statusText: outcome.statusText,
        headers: redactor.headers(shaped.headerList),
        ...(this.settings.historyBodies() && shaped.bodyText !== undefined && { body: keep(shaped.bodyText) }),
      };
    }
    if (shaped.historyError) {
      history.error = redactor.text(shaped.historyError);
    }

    return { durationMs, testResults, history, response: shaped.response };
  }

  /** A response arrived. A status outside 200 to 299 is shown as an error, with its body. */
  private shapeResponse(envelope: ResponseEnvelope, url: string): Shaped {
    const body = decodeEnvelope(envelope);
    const isError = envelope.status < 200 || envelope.status >= 300;
    const failureText = `Http failure response for ${url}: ${envelope.status} ${envelope.statusText}`;
    const shown = isError ? body ?? failureText : body;
    const bodyIsJson = this.isJsonPayload(shown);
    const text = bodyIsJson ? this.serializeJsonPayload(shown) : this.stringifyPayload(shown);
    const header = (name: string) => envelope.headers.find(([key]) => key.toLowerCase() === name)?.[1];
    const contentLength = Number(header("content-length") || NaN);
    return {
      body,
      headers: Object.fromEntries(envelope.headers),
      headerList: envelope.headers,
      bodyText: body === undefined || body === null || body instanceof BinaryBody ? undefined : text,
      historyError: isError ? failureText : undefined,
      response: {
        isError,
        statusCode: envelope.status,
        statusText: envelope.statusText,
        bodyIsJson,
        dataText: isError ? "" : text,
        errorText: isError ? text : "",
        headersView: envelope.headers
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
        binary: body instanceof BinaryBody ? body : undefined,
        redirectedTo: envelope.redirected ? envelope.finalUrl : undefined,
      },
    };
  }

  /**
   * No response arrived. The browser does not say why a request failed, so
   * a network failure gets the guidance text (F06); a timeout, a cancel and
   * the Local Bridge say what happened themselves.
   */
  private shapeFailure(failure: TransportError, url: string): Shaped {
    const network = failure.kind === "network";
    const statusCode = network ? 0 : failure.kind === "bridge" ? failure.status ?? 0 : undefined;
    return {
      body: network ? undefined : failure.message,
      headers: {},
      headerList: [],
      historyError: network ? `Http failure response for ${url}: 0 Unknown Error` : failure.message,
      response: {
        isError: true,
        statusCode,
        statusText: network ? "Unknown Error" : "",
        bodyIsJson: false,
        dataText: "",
        errorText: network ? NETWORK_ERROR_TEXT : failure.message,
        headersView: [],
      },
    };
  }

  private async runPostScriptAndAssertions(
    spec: RequestExecutionSpec,
    statusCode: number,
    statusText: string,
    body: unknown,
    headers: Record<string, string>,
    durationMs: number
  ): Promise<TestResult[]> {
    let results: TestResult[] = [];

    if (this.scriptsEnabled && spec.postRequestScript?.trim()) {
      const responseCtx: ScriptResponseContext = {
        statusCode,
        statusText,
        body,
        headers,
        durationMs,
      };
      const postResult = await this.scriptSandbox.execute(
        spec.postRequestScript,
        this.getEnvSnapshot(),
        responseCtx
      );
      results = [...results, ...postResult.testResults];
      await this.applyEnvMutations(postResult.envMutations);
    }

    if (spec.tests.length) {
      const assertionCtx: AssertionResponseContext = {
        statusCode,
        body,
        headers,
        durationMs,
      };
      const assertionResults = this.assertionRunner.run(spec.tests, assertionCtx);
      results = [...results, ...assertionResults];
    }

    return results;
  }

  private getEnvSnapshot(): Record<string, string> {
    return Object.fromEntries(variablesByName(this.environmentsService.activeEnvironment()?.vars ?? []));
  }

  private async applyEnvMutations(mutations: Record<string, string>): Promise<void> {
    const keys = Object.keys(mutations);
    if (!keys.length) {
      return;
    }
    const active = this.environmentsService.activeEnvironment();
    if (!active) {
      return;
    }
    // An empty value removes the variable. Applied to the stored rows, not to this tab's copy of them.
    await this.environmentsService.changeEnvironment(
      active.meta.id,
      keys.map((key) => ({ key, value: mutations[key] === "" ? null : mutations[key] }))
    );
  }


  private isJsonPayload(payload: unknown): boolean {
    if (payload === null || payload === undefined) {
      return false;
    }
    if (payload instanceof BinaryBody) {
      return false;
    }
    if (typeof payload === "object") {
      return !(payload instanceof Blob || payload instanceof ArrayBuffer || payload instanceof FormData);
    }
    if (typeof payload === "string") {
      return parseJson(payload).ok;
    }
    return false;
  }

  private serializeJsonPayload(payload: unknown): string {
    if (payload === null || payload === undefined) {
      return "";
    }
    if (typeof payload === "string") {
      return payload;
    }
    return stringifyJson(payload) ?? this.stringifyPayload(payload);
  }

  private stringifyPayload(payload: unknown): string {
    if (payload === null || payload === undefined || payload instanceof BinaryBody) {
      return "";
    }
    if (typeof payload === "string") {
      return payload;
    }
    return stringifyJson(payload, 4) ?? String(payload);
  }
}
