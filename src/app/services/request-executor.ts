import { Injectable, inject } from "@angular/core";
import { RequestSettings } from "./request-settings";
import { TransportRouter } from "./transport-router";
import { EnvironmentsStore } from "./environments-store";
import { SecretsVault } from "./secrets-vault";
import { protectedSecretId } from "../shared/secrets/secret-reference";
import { ResponseInspector } from "../shared/inspect/response-inspector";
import { ScriptSandbox, scriptResponse, type ScriptResponseContext, type ScriptRunExtras } from "../shared/scripts/script-sandbox";
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
  emptyChanges,
  newId,
  parseJson,
  scriptRequestOf,
  sentScriptRequest,
  stringifyJson,
  variablesByName,
  withScriptRequest,
  type RequestContent,
  type ResponseEnvelope,
  type Scripts,
  type Row,
  type ScriptResponse,
  type ScriptRequest,
  type ScriptResult,
  type ScriptSendRequest,
  type VariableChange,
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

/** How long each part of a send took. A script that did not run has no time. */
export interface SendTimings {
  preScriptMs?: number;
  requestMs?: number;
  postScriptMs?: number;
}

/**
 * The pre-request script ended in an error, so nothing was sent, as in
 * Postman. What the script did before it ended is here to be shown.
 */
export class PreRequestScriptError extends SendBlockedError {
  constructor(
    readonly testResults: TestResult[],
    readonly scriptLogs: string[],
    readonly timings: SendTimings,
    /** Which script it was: the request's own, or one of its collection or of a folder. */
    script = "Pre-request script"
  ) {
    super(`The ${script[0].toLowerCase()}${script.slice(1)} failed, so the request was not sent.`);
  }
}

/**
 * Thrown by `buildRequest` when the user was asked whether to send a request
 * its pre-request script had pointed at another host, and said no (plan Q6).
 * `execute()` then undoes what that script set.
 */
export class SendDeclinedError extends SendBlockedError {}

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
function containsSecretPlaceholder(request: Pick<BuiltRequest, "url" | "headers" | "body">): boolean {
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
  /** False when the scripts have not been approved (`ScriptTrust`): they are skipped, and the assertions still run. */
  runScripts: boolean;
  /** The request as composed, `{{variables}}` not resolved: history keeps it. */
  template: RequestContent;
  /**
   * Builds the actual method/url/headers/body to send. Invoked *after* the
   * pre-request script has run (and any pm.environment.set() mutations from
   * it have been persisted) — not upfront — so a pre-script that sets a
   * variable this same request's own headers/body/URL reference (e.g. an
   * auth token fetched by a prior call) is reflected in what actually gets
   * sent, matching the ordering `pre-script -> build -> send` implies.
   *
   * It is given the request to build: `template`, as the pre-request script
   * left it (`pm.request`).
   */
  buildRequest: (request: RequestContent) => BuiltRequest | Promise<BuiltRequest>;
  /** The saved request the composer is bound to, for `pm.info`. */
  info?: { requestName: string; requestId: string };
  /** The variables of that request's collection, read when a script starts, and the way to change them. Absent for a request of no collection. */
  collection?: { variables: () => Row[]; change: (changes: VariableChange[]) => Promise<unknown> };
  /**
   * What the request's collection and folders hold for it (P4.9), in the
   * order their scripts run: the collection, then the folders from the
   * outside in. The request's own scripts run last.
   */
  inherited?: { name: string; scripts: Scripts }[];
  /** The variables of the request's folders, the outermost folder's rows first, read when a script starts. A script reads them and cannot change them. */
  folderVariables?: () => Row[];
  /** Aborted when the user cancels the send. */
  signal?: AbortSignal;
}

/** One script that ran, under the name its rows and its error are shown with. */
interface ScriptRun {
  name: string;
  result: ScriptResult;
}

/** The scripts of one kind a send runs, in order, the blank ones left out. An inherited script is named for where it is from. */
function scriptsToRun(spec: RequestExecutionSpec, kind: keyof Scripts): { name: string; text: string }[] {
  const label = kind === "pre" ? "Pre-request script" : "Post-response script";
  return [
    ...(spec.inherited ?? []).map(({ name, scripts }) => ({ name: `${label} of ${name}`, text: scripts[kind] })),
    { name: label, text: kind === "pre" ? spec.preRequestScript : spec.postRequestScript },
  ].filter((script) => script.text?.trim());
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
  /** The `Content-Type` header as received. */
  contentType?: string;
  /** The browser withheld headers: a direct answer from another origin shows only the CORS-safelisted ones and those the server exposes. */
  headersLimited?: boolean;
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

/**
 * A script's `pm.test` results, and after them a failed row when the script
 * itself ended in an error: one that throws, or is stopped, must not look
 * like a request that has no script (F65).
 */
function scriptRows(result: ScriptResult | undefined, name: string, redactor: Redactor): TestResult[] {
  if (!result) return [];
  const rows: TestResult[] = result.error === undefined ? result.testResults : [...result.testResults, { label: name, passed: false, error: result.error, source: "script" }];
  return rows.map((row) => ({ ...row, label: redactor.text(row.label), ...(row.error !== undefined && { error: redactor.text(row.error) }) }));
}

export interface RequestExecutionResult {
  /** The request alone: no script's time is in it (F11). */
  durationMs: number;
  timings: SendTimings;
  testResults: TestResult[];
  /** What the scripts wrote with `console`, the pre-request script's lines first, masked like the test rows. */
  scriptLogs: string[];
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
  private readonly assertionRunner = inject(AssertionRunner);
  private readonly vault = inject(SecretsVault);

  async execute(spec: RequestExecutionSpec): Promise<RequestExecutionResult> {
    const requestId = newId();
    const createdAt = Date.now();
    const preRuns: ScriptRun[] = [];

    /** What the app has to say about a script's run, shown with the script's own console lines. */
    const notes: string[] = [];
    const timings: SendTimings = {};
    let template = spec.template;
    /** Puts back what the pre-request scripts set. */
    let undo = (): Promise<void> => Promise.resolve();
    const preScripts = spec.runScripts ? scriptsToRun(spec, "pre") : [];
    if (preScripts.length) {
      const before = { environment: this.environmentsService.activeEnvironment()?.vars ?? [], global: this.environmentsService.globals(), collection: spec.collection?.variables() ?? [] };
      const touched = emptyChanges();
      const restoreSecrets: (() => Promise<void>)[] = [];
      // Each name a script touched gets the value it had, or is removed again; a secret one replaced gets its old value.
      const was = (rows: Row[], names: VariableChange[]): VariableChange[] => names.map(({ key }) => ({ key, value: variablesByName(rows).get(key) ?? null }));
      undo = async () => {
        await this.applyChanges(spec, { environment: was(before.environment, touched.environment), global: was(before.global, touched.global), collection: was(before.collection, touched.collection) }, []);
        for (const restore of restoreSecrets.reverse()) await restore();
      };
      timings.preScriptMs = 0;
      // The collection's, each folder's from the outside in, the request's own (P4.9): each a run of its own, with the variables the one before left.
      for (const { name, text } of preScripts) {
        const scriptStarted = performance.now();
        const result = await this.scriptSandbox.execute(text, this.getEnvSnapshot(), undefined, undefined, this.scriptExtras(spec, "prerequest", scriptRequestOf(template)));
        timings.preScriptMs += Math.round(performance.now() - scriptStarted);
        preRuns.push({ name, result });
        const { changes } = result;
        // As the script wrote them: it runs before any secret is read, and was
        // given the variables as stored, a secret as its reference.
        restoreSecrets.push(await this.applyChanges(spec, changes, notes));
        for (const scope of ["environment", "global", "collection"] as const) touched[scope].push(...changes[scope]);
        // A script that ended in an error did not finish its work on the request: it is not sent (P3.9), and no later script runs.
        if (result.error !== undefined) {
          // No secret was read for this send, and the script was given none: there is nothing to mask.
          const nothing = new Redactor([]);
          throw new PreRequestScriptError(preRuns.flatMap((run) => scriptRows(run.result, run.name, nothing)), [...preRuns.flatMap((run) => run.result.logs), ...notes], timings, name);
        }
        // What the script did to pm.request is sent, and is what the next script sees. The request as composed is what history keeps.
        if (result.request) template = withScriptRequest(template, result.request);
      }
    }

    // Built only now, after the pre-script (and any environment mutations
    // it made) has already landed — see BuiltRequest / buildRequest's doc.
    // Awaited only when it is a promise: a request with no file to read is sent in the same task as the click.
    let request: BuiltRequest;
    try {
      const built = spec.buildRequest(template);
      request = built instanceof Promise ? await built : built;
    } catch (error) {
      if (error instanceof SendDeclinedError) await undo();
      throw error;
    }
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
    timings.requestMs = durationMs;
    this.responseInspector.markResponse(requestId, request.url);

    const shaped = outcome instanceof TransportError ? this.shapeFailure(outcome, request.url) : this.shapeResponse(outcome, request.url);
    // What a script writes is masked like everything else the app shows or
    // keeps of this exchange (D5): a post-response script reads the response,
    // and a server may send a secret back.
    const redactor = new Redactor([...request.secrets, ...request.credentials]);
    // A variable is stored: a vault secret must not get into one. A
    // credential that is no secret is in the environment already, and a
    // script that copies it must not turn it into a mask.
    const secrets = new Redactor(request.secrets);
    const post = await this.runPostScriptAndAssertions(
      spec,
      // The request as it went out (P3.9), a vault secret masked: a script is
      // not handed one, here as in a variable's value. Masked as text first,
      // so that form fields are read back from text that holds none.
      sentScriptRequest(template, {
        method: request.method,
        url: secrets.text(request.url),
        headers: request.headers.map(([name, value]): [string, string] => [name, secrets.text(value)]),
        ...(typeof request.body === "string" && { body: secrets.text(request.body) }),
      }),
      notes,
      secrets,
      timings,
      shaped.response.statusCode ?? 0,
      shaped.response.statusText ?? "",
      shaped.body,
      shaped.headers,
      durationMs,
      outcome instanceof TransportError ? undefined : outcome.sizes.decoded
    );
    const runs = [...preRuns, ...post.scripts];
    const testResults = [...runs.flatMap((run) => scriptRows(run.result, run.name, redactor)), ...post.assertions];
    const scriptLogs = [...runs.flatMap((run) => run.result.logs), ...notes].map((line) => redactor.text(line));

    // History keeps nothing that can be used as a credential (D5): every vault
    // secret and credential of this request is masked in what was sent and in
    // what came back, since a server may send them back.
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

    return { durationMs, timings, testResults, scriptLogs, history, response: shaped.response };
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
        contentType: header("content-type"),
        headersLimited: envelope.route === "direct" && URL.parse(envelope.finalUrl, location.href)?.origin !== location.origin,
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
    sent: ScriptRequest,
    notes: string[],
    variables: Redactor,
    timings: SendTimings,
    statusCode: number,
    statusText: string,
    body: unknown,
    headers: Record<string, string>,
    durationMs: number,
    sizeBytes: number | undefined
  ): Promise<{ scripts: ScriptRun[]; assertions: TestResult[] }> {
    const scripts: ScriptRun[] = [];
    const responseCtx: ScriptResponseContext = { statusCode, statusText, body, headers, durationMs, sizeBytes };
    // In the order of the pre-request scripts. One that ends in an error is a failed row, and the next still runs: the response is here either way.
    for (const { name, text } of spec.runScripts ? scriptsToRun(spec, "post") : []) {
      const scriptStarted = performance.now();
      const result = await this.scriptSandbox.execute(text, this.getEnvSnapshot(), responseCtx, undefined, this.scriptExtras(spec, "test", sent));
      timings.postScriptMs = (timings.postScriptMs ?? 0) + Math.round(performance.now() - scriptStarted);
      scripts.push({ name, result });
      await this.applyChanges(spec, result.changes, notes, variables);
    }

    if (spec.tests.length) {
      const assertionCtx: AssertionResponseContext = {
        statusCode,
        body,
        headers,
        durationMs,
      };
      return { scripts, assertions: this.assertionRunner.run(spec.tests, assertionCtx) };
    }

    return { scripts, assertions: [] };
  }

  private getEnvSnapshot(): Record<string, string> {
    return Object.fromEntries(variablesByName(this.environmentsService.activeEnvironment()?.vars ?? []));
  }

  /** What a script is given besides the active environment's variables: the other scopes, the request, and `pm.sendRequest`. */
  private scriptExtras(spec: RequestExecutionSpec, eventName: "prerequest" | "test", request: ScriptRequest): ScriptRunExtras {
    return {
      environmentName: this.environmentsService.activeEnvironment()?.name ?? "",
      globals: [...variablesByName(this.environmentsService.globals())],
      folder: [...variablesByName(spec.folderVariables?.() ?? [])],
      collection: [...variablesByName(spec.collection?.variables() ?? [])],
      request,
      info: { eventName, requestName: spec.info?.requestName ?? "", requestId: spec.info?.requestId ?? "" },
      send: (request) => this.sendForScript(request, spec.signal),
    };
  }

  /**
   * `pm.sendRequest`: a script's request goes out as the user's own does,
   * through the same transport with the same options, and under the same
   * rule (C-007): a vault secret's reference is never sent as text. The
   * vault is not read for it, so such a request is refused. Nothing of it
   * is stored.
   *
   * This does not keep a secret from an approved script: a pre-request
   * script can change the user's own request (`pm.request`), which is then
   * built with its secrets. Approval (`ScriptTrust`) is the control for that.
   */
  private async sendForScript(request: ScriptSendRequest, signal?: AbortSignal): Promise<ScriptResponse> {
    if (containsSecretPlaceholder(request)) {
      throw Object.assign(new Error("pm.sendRequest with a vault secret is not supported — see docs/postman-compatibility.md#pm-sendrequest"), { name: "WayfarerUnsupportedError" });
    }
    const startedAt = performance.now();
    const envelope = await this.transport.send(request, { signal: signal ?? new AbortController().signal, timeoutMs: this.settings.timeoutMs() });
    const shaped = this.shapeResponse(envelope, request.url);
    return scriptResponse({
      statusCode: envelope.status,
      statusText: envelope.statusText,
      body: shaped.body,
      headers: shaped.headers,
      durationMs: Math.round(performance.now() - startedAt),
      sizeBytes: envelope.sizes.decoded,
    });
  }

  /**
   * Stores what a script set and removed, scope by scope. Applied to the
   * stored rows, not to this tab's copy of them. A change that has nowhere
   * to go is said in the console, not dropped without a word.
   *
   * A value set on a protected variable goes into the vault (`intoVault`)
   * and never into these stores. `secrets` masks vault secrets in every
   * other value: a post-response script may have read one from the response.
   *
   * Gives back a function that puts the old value back into each vault
   * secret these changes replaced.
   */
  private async applyChanges(spec: RequestExecutionSpec, changes: ScriptResult["changes"], notes: string[], secrets?: Redactor): Promise<() => Promise<void>> {
    const active = this.environmentsService.activeEnvironment();
    /** The plaintext each replaced secret had, by id. Held for this send only, in memory. */
    const replaced = new Map<string, string>();
    // Marked as a script's: the stored rows are what counts, and a reference in them is never replaced with text (`applyVariableChanges`).
    const kept = async (api: string, rows: Row[], scope: VariableChange[]): Promise<VariableChange[]> =>
      (await this.intoVault(api, rows, scope, notes, replaced)).map(({ key, value }) => ({ key, value: value === null || !secrets ? value : secrets.text(value), keepSecret: true }));
    const environment = await kept("pm.environment", active?.vars ?? [], changes.environment);
    const global = await kept("pm.globals", this.environmentsService.globals(), changes.global);
    const collection = await kept("pm.collectionVariables", spec.collection?.variables() ?? [], changes.collection);
    if (environment.length) {
      if (active) await this.environmentsService.changeEnvironment(active.meta.id, environment);
      else notes.push("[warn] pm.environment: no environment is active, so what the script set was not kept.");
    }
    if (global.length) await this.environmentsService.changeGlobals(global);
    if (collection.length) {
      if (spec.collection) await spec.collection.change(collection);
      else notes.push("[warn] pm.collectionVariables: this request is in no collection, so what the script set was not kept.");
    }
    return async () => {
      for (const [id, plaintext] of replaced) await this.vault.replaceSecret(id, plaintext);
    };
  }

  /**
   * A script set a protected variable (P3.12): the value is encrypted into
   * the secret the variable refers to, and the variable keeps its reference.
   * A locked vault refuses, with a line in the console; the user is not
   * asked for the passphrase in the middle of a script's work. Gives back
   * the changes that are not of this kind, to be stored as variables.
   *
   * "Protected" is read from this tab's copy of the rows. Should that copy
   * be a moment old, the value is not encrypted, and it is not stored
   * either: the changes are marked `keepSecret`.
   */
  private async intoVault(api: string, rows: Row[], changes: VariableChange[], notes: string[], replaced: Map<string, string>): Promise<VariableChange[]> {
    const rest: VariableChange[] = [];
    for (const change of changes) {
      const reference = rows.find((row) => row.key === change.key && protectedSecretId(row.value) !== null)?.value;
      const id = protectedSecretId(reference);
      if (change.value === null || id === null) {
        rest.push(change);
        // Its own reference written back, as a script that copies every variable does: nothing to do.
      } else if (change.value.trim() !== reference?.trim()) {
        const refused = (why: string) => notes.push(`[warn] ${api}.set(${JSON.stringify(change.key)}): ${why}, so its value was not changed.`);
        if (!this.vault.isUnlocked()) {
          refused("this variable is protected and the vault is locked");
          continue;
        }
        const old = await this.vault.readSecret(id);
        if (old === null || !(await this.vault.replaceSecret(id, change.value))) refused("the secret this variable refers to is not in the vault");
        // The first value is the one to go back to, should the script set the variable twice in one run.
        else if (!replaced.has(id)) replaced.set(id, old);
      }
    }
    return rest;
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
