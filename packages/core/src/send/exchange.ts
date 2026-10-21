import type { Cookie } from "../cookies/jar";
import { withJarCookies } from "../cookies/jar";
import { BinaryBody, decodeEnvelope } from "../http/response-body";
import type { RequestContent, Route, Row, Scripts, TestAssertion } from "../model/request";
import { protectedSecretId, scriptVariables, type ScriptVariable, type VariableChange } from "../model/variables";
import { Redactor } from "../redact/redactor";
import type { RunIteration } from "../run/runner";
import {
  emptyChanges,
  type ScriptContext,
  type ScriptRequest,
  type ScriptResponse,
  type ScriptResult,
  type ScriptSendRequest,
} from "../scripting/host";
import { scriptRequestOf, sentScriptRequest, withScriptRequest } from "../scripting/request-view";
import { parseJson, stringifyJson } from "../safe-json";
import type { RoutePolicy } from "../transport/route";
import {
  TransportError,
  type RelayTimings,
  type ResolvedRequest,
  type ResponseEnvelope,
  type StreamEvent,
  type TransportOptions,
} from "../transport/transport";
import { runAssertions, type TestResult } from "./assertions";
import { containsSecretPlaceholder } from "./wire";

/** A request as it is sent: every variable replaced, the vault read, the auth applied. */
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

/** A response body as history keeps it: text, masked, at most 1 MB of it. */
export interface HistoryBody {
  text: string;
  /** More was received than is kept here. */
  truncated: boolean;
}

/**
 * One exchange as history keeps it (plan section 4.4). Nothing
 * here holds a credential or a vault secret: `sent` and `response` are
 * stored masked, and so is a credential typed into the template (D5).
 */
export interface PastRequest {
  id?: number;
  createdAt: number;
  /** The request as it was composed: `{{variables}}` are not resolved. */
  template: RequestContent;
  /** What went on the wire. `bodyPreview` is the text of a text body; of a form or a file, its field names, file names and sizes. */
  sent: { method: string; url: string; headers: [string, string][]; bodyPreview?: string };
  /** Absent when no response arrived. A binary body is not kept: bytes cannot be searched for a secret. */
  response?: { status: number; statusText: string; headers: [string, string][]; body?: HistoryBody };
  durationMs?: number;
  route: "direct" | "bridge";
  error?: string;
}

/**
 * Thrown when a request must not reach the network. The message is
 * user-facing.
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
    script = "Pre-request script",
  ) {
    super(`The ${script[0].toLowerCase()}${script.slice(1)} failed, so the request was not sent.`);
  }
}

/**
 * Thrown by `buildRequest` when the user was asked whether to send a request
 * its pre-request script had pointed at another host, and said no (plan Q6).
 * `exchange` then undoes what that script set.
 */
export class SendDeclinedError extends SendBlockedError {}

/**
 * A pre-request script of a run called `pm.execution.skipRequest()`: the
 * request is not sent, as in Postman, and that is no failure. What the
 * scripts did until then is here.
 */
export class RequestSkipped extends SendBlockedError {
  constructor(
    readonly testResults: TestResult[],
    readonly scriptLogs: string[],
    readonly nextRequest: string | null | undefined,
  ) {
    super("A pre-request script skipped this request: it was not sent.");
  }
}

const NETWORK_ERROR_TEXT =
  "Network error — no response was received. The host may not resolve (DNS), may have refused " +
  "the connection, or may not allow cross-origin requests from this site (CORS). The browser " +
  "does not reveal which. Check the URL and your connection; for CORS, the Local Bridge can relay the request.";

/** Without a page (the CLI), there is no CORS and the runtime says why. */
const networkErrorWithoutPage = (reason: string) =>
  `Network error — no response was received: ${reason}. Check the URL, that the host resolves, and that it accepts connections.`;

const SECRET_PLACEHOLDER_BLOCKED =
  "This request refers to a vault secret that could not be read (it may have been deleted), so it was not sent. " +
  "Give the variable a value again.";

/**
 * A body as history describes it. Text is kept as text. Of a form or a
 * file, the names and sizes are kept and never the bytes: a file may be the
 * user's key or their customers' data.
 */
function sentBodyPreview(body: BuiltRequest["body"]): string | undefined {
  if (body === undefined || typeof body === "string") return body;
  const file = (blob: Blob) => `(${blob.size} bytes${blob.type ? `, ${blob.type}` : ""})`;
  if (body instanceof FormData) {
    return [...body]
      .map(([name, value]) =>
        typeof value === "string" ? `${name}=${value}` : `${name}=@${value.name} ${file(value)}`,
      )
      .join("\n");
  }
  return `@file ${file(body)}`;
}

/** A response as a script's host is told of it. */
export interface ScriptResponseContext {
  statusCode: number;
  statusText: string;
  body: unknown;
  headers: Record<string, string>;
  durationMs?: number;
  /** The size of the body as received, when it is known. */
  sizeBytes?: number;
}

/** What a script is given besides the active environment's variables and the response: the other scopes, the request, and a way to make requests. */
export interface ScriptRunExtras extends Pick<
  ScriptContext,
  "environmentName" | "folder" | "collection" | "globals" | "request" | "info" | "data"
> {
  /** Makes a request for `pm.sendRequest`. Without it a script that calls it is told it cannot. */
  send?: (request: ScriptSendRequest) => Promise<ScriptResponse>;
}

/** A response as a script reads it. */
export function scriptResponse(response: ScriptResponseContext): ScriptResponse {
  const body = bodyText(response.body);
  return {
    code: response.statusCode,
    status: response.statusText,
    headers: response.headers,
    body,
    responseTime: response.durationMs ?? 0,
    responseSize: response.sizeBytes ?? new TextEncoder().encode(body).length,
  };
}

/** A response body as the text a script reads: text as it is, parsed JSON written out again, nothing for bytes. */
function bodyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body === undefined || body === null || body instanceof BinaryBody) return "";
  return stringifyJson(body) ?? "";
}

/**
 * What one send needs of whoever runs it: the app gives its services, the
 * CLI its own. `exchange` reads nothing else.
 */
export interface ExchangePorts {
  /** Runs one script and gives its result. A script that is blank is not given. */
  runScript(
    script: string,
    environment: ScriptVariable[],
    response: ScriptResponseContext | undefined,
    extras: ScriptRunExtras,
  ): Promise<ScriptResult>;
  /** Sends by a route, and says in `policy.took` where the request went. */
  transport: {
    send(request: ResolvedRequest, options: TransportOptions, policy: RoutePolicy): Promise<ResponseEnvelope>;
    /** The route of a request that names none. */
    route(): Route;
    /** Where a request of `route` goes first. */
    first(route: Route): "direct" | "bridge";
  };
  /** The active environment, read when it is used, with the way to change it. `undefined` when none is active. */
  environment(): { name: string; vars: Row[]; change(changes: VariableChange[]): Promise<unknown> } | undefined;
  globals(): Row[];
  changeGlobals(changes: VariableChange[]): Promise<unknown>;
  /** What a script's `set` on a protected variable needs (P3.12). */
  vault: {
    isUnlocked(): boolean;
    readSecret(id: string): Promise<string | null>;
    replaceSecret(id: string, plaintext: string): Promise<boolean>;
  };
  /** The cookie jar (P5.3), for the route that sends what it is given. Absent: no jar. */
  cookies?: { for(url: string): Cookie[]; store(url: string, setCookies: string[], secrets: string[]): unknown };
  timeoutMs(): number;
  /** Whether history keeps a response's body. */
  historyBodies(): boolean;
  /** The address of the page that sends, when one does: a direct answer from another origin shows only some headers. */
  page?: string;
  /** Told when the request goes out, before the first try, and when its answer is in, after the last. */
  watch?: { sending(url: string): void; received(url: string): void };
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
  /**
   * Asked when the response is a 401 (P4.7): the request built again with a
   * renewed token, to send once more, or `null` to keep the 401.
   */
  retryUnauthorized?: (request: RequestContent) => Promise<BuiltRequest | null>;
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
  /** The request's route (P6.4: `routeOf`), for it and for a script's requests. The device's when absent. */
  route?: Route;
  /** Asked before the route `auto` sends again a request the browser may have sent (D7). */
  askRoute?: () => Promise<boolean>;
  /** Asks for an event stream to be read as it arrives (P5.6): each event, as it comes. The send then ends when the stream does, or is stopped. */
  onEvent?: (event: StreamEvent) => void;
  /**
   * The send is a request of a collection run (P5.2): its scripts read the
   * iteration and the data file's row, and `pm.execution.skipRequest()` in a
   * pre-request script holds the request back. Absent in a single send.
   */
  iteration?: RunIteration;
}

/** One script that ran, under the name its rows and its error are shown with. */
interface ScriptRun {
  name: string;
  result: ScriptResult;
}

/** What the scripts that ran gave `pm.execution.setNextRequest`: the last of them that called it. */
function lastNext(runs: ScriptRun[]): string | null | undefined {
  return runs.reduce<string | null | undefined>(
    (last, run) => (run.result.nextRequest !== undefined ? run.result.nextRequest : last),
    undefined,
  );
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
  /** Where the response came from: the page or the Local Bridge (P6.4's badge). Absent when none came. */
  route?: "direct" | "bridge";
  /** The redirects that were followed through the Local Bridge (P5.4), and why no more were. */
  redirects?: ResponseEnvelope["redirects"];
  /** The request was sent with the server's certificate not verified (the Local Bridge). */
  tlsInsecure?: true;
  /** The `Content-Type` header as received. */
  contentType?: string;
  /** The browser withheld headers: a direct answer from another origin shows only the CORS-safelisted ones and those the server exposes. */
  headersLimited?: boolean;
  /** The body was an event stream read as it arrived (P5.6): whether the user stopped it, and whether the body shown is only its start. */
  stream?: { stopped: boolean; truncated?: true };
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
  const rows: TestResult[] =
    result.error === undefined
      ? result.testResults
      : [...result.testResults, { label: name, passed: false, error: result.error, source: "script" }];
  return rows.map((row) => ({
    ...row,
    label: redactor.text(row.label),
    ...(row.error !== undefined && { error: redactor.text(row.error) }),
  }));
}

export interface ExchangeResult {
  /** The request alone: no script's time is in it (F11). */
  durationMs: number;
  timings: SendTimings;
  /** How long each part of the exchange took, as the Local Bridge measured it on its own connection. */
  relayTimings?: RelayTimings;
  testResults: TestResult[];
  /** What the scripts wrote with `console`, the pre-request script's lines first, masked like the test rows. */
  scriptLogs: string[];
  response: RequestExecutionResponse;
  history: PastRequest;
  /** What the scripts gave `pm.execution.setNextRequest`, the last call of them. A run reads it. */
  nextRequest?: string | null;
  /** The values of the jar's cookies that went out with the request or with a hop of its redirects (P5.3): credentials, to whatever exports the exchange. */
  cookieValues: string[];
}

/**
 * One send, from its first step to its last (D5, D6, P3.9): each
 * pre-request script, its variable changes stored, the request built (and
 * only then the vault read), the wire check (C-007), the send by its
 * route, each post-response script, the assertions, and the exchange as
 * history keeps it, masked. The app and the CLI both send through this.
 */
export async function exchange(spec: RequestExecutionSpec, ports: ExchangePorts): Promise<ExchangeResult> {
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
    const before = {
      environment: ports.environment()?.vars ?? [],
      global: ports.globals(),
      collection: spec.collection?.variables() ?? [],
    };
    const touched = emptyChanges();
    const restoreSecrets: (() => Promise<void>)[] = [];
    // Each name a script touched gets the value it had, or is removed again; a secret one replaced gets its old value.
    const was = (rows: Row[], names: VariableChange[]): VariableChange[] =>
      names.map(({ key }) => {
        const [, value = null, json] = scriptVariables(rows).find(([name]) => name === key) ?? [];
        return { key, value, ...(json && { json }) };
      });
    undo = async () => {
      await applyChanges(
        ports,
        spec,
        {
          environment: was(before.environment, touched.environment),
          global: was(before.global, touched.global),
          collection: was(before.collection, touched.collection),
        },
        [],
      );
      for (const restore of restoreSecrets.reverse()) await restore();
    };
    timings.preScriptMs = 0;
    // The collection's, each folder's from the outside in, the request's own (P4.9): each a run of its own, with the variables the one before left.
    for (const { name, text } of preScripts) {
      const scriptStarted = performance.now();
      const result = await ports.runScript(
        text,
        environmentSnapshot(ports),
        undefined,
        scriptExtras(ports, spec, "prerequest", scriptRequestOf(template)),
      );
      timings.preScriptMs += Math.round(performance.now() - scriptStarted);
      preRuns.push({ name, result });
      const { changes } = result;
      // As the script wrote them: it runs before any secret is read, and was
      // given the variables as stored, a secret as its reference.
      restoreSecrets.push(await applyChanges(ports, spec, changes, notes));
      for (const scope of ["environment", "global", "collection"] as const) touched[scope].push(...changes[scope]);
      // A script that ended in an error did not finish its work on the request: it is not sent (P3.9), and no later script runs.
      if (result.error !== undefined) {
        // No secret was read for this send, and the script was given none: there is nothing to mask.
        const nothing = new Redactor([]);
        throw new PreRequestScriptError(
          preRuns.flatMap((run) => scriptRows(run.result, run.name, nothing)),
          [...preRuns.flatMap((run) => run.result.logs), ...notes],
          timings,
          name,
        );
      }
      // What the script did to pm.request is sent, and is what the next script sees. The request as composed is what history keeps.
      if (result.request) template = withScriptRequest(template, result.request);
    }
    // In a run, as in Postman: the request is not sent and its post-response scripts do not run. What the scripts set stays.
    if (spec.iteration && preRuns.some((run) => run.result.skipRequest)) {
      const nothing = new Redactor([]);
      throw new RequestSkipped(
        preRuns.flatMap((run) => scriptRows(run.result, run.name, nothing)),
        [...preRuns.flatMap((run) => run.result.logs), ...notes],
        lastNext(preRuns),
      );
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

  ports.watch?.sending(request.url);

  // The duration is the transport call alone: no script time (F11).
  let startedAt = 0;
  // The cookie jar (P5.3), for the route that sends what it is given (the Local Bridge). Each value that went out is a
  // credential to the redactor; `sentCookies` are those of the request itself, for what history says was sent.
  const cookieValues = new Set<string>();
  let sentCookies: Cookie[] | undefined;
  const jar = ports.cookies;
  const cookies: TransportOptions["cookies"] = jar && {
    for: (url) => {
      // A cookie is the server's text and never a template. One that holds a secret's reference would go out as that text (C-007): it is left out.
      const found = jar
        .for(url)
        .filter(
          (cookie) => !containsSecretPlaceholder({ url: "", headers: [["Cookie", `${cookie.name}=${cookie.value}`]] }),
        );
      sentCookies ??= found;
      for (const cookie of found) cookieValues.add(cookie.value);
      return found;
    },
    store: (url, setCookies) => void jar.store(url, setCookies, request.secrets),
  };
  const policy: RoutePolicy = {
    route: spec.route ?? ports.transport.route(),
    ...(spec.askRoute && { ask: spec.askRoute }),
  };
  const transmit = async (): Promise<ResponseEnvelope | TransportError> => {
    startedAt = performance.now();
    sentCookies = undefined;
    try {
      return await ports.transport.send(
        {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
        },
        {
          signal: spec.signal ?? new AbortController().signal,
          timeoutMs: ports.timeoutMs(),
          ...(spec.onEvent && { onEvent: spec.onEvent }),
          // P5.4, for the route that can see a redirect (the Local Bridge). A request built with a vault secret is not
          // followed to another host (C-063): a redirect is the server's word, and the secret was written for this host.
          redirects: { follow: template.settings.followRedirects !== false, stayOnHost: request.secrets.length > 0 },
          ...(cookies && { cookies }),
          // The request's own setting, for the route that can (the Local Bridge): a browser always verifies.
          ...(template.settings.tlsInsecure === true && { tlsInsecure: true }),
        },
        policy,
      );
    } catch (error) {
      if (!(error instanceof TransportError)) throw error;
      return error;
    }
  };
  let outcome = await transmit();
  // OAuth 2.0 (P4.7): a 401 gets one more send, with a renewed token, when the auth asks for it. What is shown and kept is the second exchange.
  if (!(outcome instanceof TransportError) && outcome.status === 401 && spec.retryUnauthorized) {
    const again = await spec.retryUnauthorized(template);
    if (again && !containsSecretPlaceholder(again)) {
      request = again;
      outcome = await transmit();
    }
  }
  const durationMs = Math.round(performance.now() - startedAt);
  timings.requestMs = durationMs;
  ports.watch?.received(request.url);

  const shaped =
    outcome instanceof TransportError
      ? shapeFailure(outcome, request.url, ports.page)
      : shapeResponse(outcome, request.url, ports.page);
  // What a script writes is masked like everything else the app shows or
  // keeps of this exchange (D5): a post-response script reads the response,
  // and a server may send a secret back.
  const redactor = new Redactor([...request.secrets, ...request.credentials, ...cookieValues]);
  // A variable is stored: a vault secret must not get into one. A
  // credential that is no secret is in the environment already, and a
  // script that copies it must not turn it into a mask.
  const secrets = new Redactor(request.secrets);
  const post = await runPostScriptAndAssertions(
    ports,
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
    {
      statusCode: shaped.response.statusCode ?? 0,
      statusText: shaped.response.statusText ?? "",
      body: shaped.body,
      headers: shaped.headers,
      durationMs,
      sizeBytes: outcome instanceof TransportError ? undefined : outcome.sizes.decoded,
    },
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
      headers: redactor.headers(withJarCookies(request.headers, sentCookies ?? [])),
      ...(preview !== undefined && { bodyPreview: keep(preview).text }),
    },
    route: outcome instanceof TransportError ? (policy.took ?? ports.transport.first(policy.route)) : outcome.route,
    durationMs,
  };
  if (!(outcome instanceof TransportError)) {
    history.response = {
      status: outcome.status,
      statusText: outcome.statusText,
      headers: redactor.headers(shaped.headerList),
      ...(ports.historyBodies() && shaped.bodyText !== undefined && { body: keep(shaped.bodyText) }),
    };
  }
  if (shaped.historyError) {
    history.error = redactor.text(shaped.historyError);
  }

  const nextRequest = lastNext(runs);
  return {
    durationMs,
    timings,
    ...(!(outcome instanceof TransportError) && outcome.timings && { relayTimings: outcome.timings }),
    testResults,
    scriptLogs,
    history,
    response: shaped.response,
    cookieValues: [...cookieValues],
    ...(nextRequest !== undefined && { nextRequest }),
  };
}

/** A response arrived. A status outside 200 to 299 is shown as an error, with its body. */
function shapeResponse(envelope: ResponseEnvelope, url: string, page?: string): Shaped {
  const body = decodeEnvelope(envelope);
  const isError = envelope.status < 200 || envelope.status >= 300;
  const failureText = `Http failure response for ${url}: ${envelope.status} ${envelope.statusText}`;
  const shown = isError ? (body ?? failureText) : body;
  const bodyIsJson = isJsonPayload(shown);
  const text = bodyIsJson ? serializeJsonPayload(shown) : stringifyPayload(shown);
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
      route: envelope.route,
      contentType: header("content-type"),
      // Outside a page nothing is withheld: no browser stands between.
      headersLimited:
        page !== undefined &&
        envelope.route === "direct" &&
        URL.parse(envelope.finalUrl, page)?.origin !== URL.parse(page)?.origin,
      ...(envelope.stream && { stream: envelope.stream }),
      ...(envelope.redirects && { redirects: envelope.redirects }),
      ...(envelope.tlsInsecure && { tlsInsecure: true as const }),
    },
  };
}

/**
 * No response arrived. The browser does not say why a request failed, so
 * a network failure from a page gets the guidance text (F06); without a
 * page, the runtime's reason is given. A timeout, a cancel and the Local
 * Bridge say what happened themselves.
 */
function shapeFailure(failure: TransportError, url: string, page: string | undefined): Shaped {
  const network = failure.kind === "network";
  const statusCode = network ? 0 : failure.kind === "bridge" ? (failure.status ?? 0) : undefined;
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
      errorText: !network
        ? failure.message
        : page === undefined
          ? networkErrorWithoutPage(failure.message)
          : NETWORK_ERROR_TEXT,
      headersView: [],
    },
  };
}

async function runPostScriptAndAssertions(
  ports: ExchangePorts,
  spec: RequestExecutionSpec,
  sent: ScriptRequest,
  notes: string[],
  variables: Redactor,
  timings: SendTimings,
  response: ScriptResponseContext & { durationMs: number },
): Promise<{ scripts: ScriptRun[]; assertions: TestResult[] }> {
  const scripts: ScriptRun[] = [];
  // In the order of the pre-request scripts. One that ends in an error is a failed row, and the next still runs: the response is here either way.
  for (const { name, text } of spec.runScripts ? scriptsToRun(spec, "post") : []) {
    const scriptStarted = performance.now();
    const result = await ports.runScript(
      text,
      environmentSnapshot(ports),
      response,
      scriptExtras(ports, spec, "test", sent),
    );
    timings.postScriptMs = (timings.postScriptMs ?? 0) + Math.round(performance.now() - scriptStarted);
    scripts.push({ name, result });
    await applyChanges(ports, spec, result.changes, notes, variables);
  }
  const { statusCode, body, headers, durationMs } = response;
  return {
    scripts,
    assertions: spec.tests.length ? runAssertions(spec.tests, { statusCode, body, headers, durationMs }) : [],
  };
}

function environmentSnapshot(ports: ExchangePorts): ScriptVariable[] {
  return scriptVariables(ports.environment()?.vars ?? []);
}

/** What a script is given besides the active environment's variables: the other scopes, the request, and `pm.sendRequest`. */
function scriptExtras(
  ports: ExchangePorts,
  spec: RequestExecutionSpec,
  eventName: "prerequest" | "test",
  request: ScriptRequest,
): ScriptRunExtras {
  return {
    environmentName: ports.environment()?.name ?? "",
    globals: scriptVariables(ports.globals()),
    folder: scriptVariables(spec.folderVariables?.() ?? []),
    ...(spec.iteration && { data: scriptVariables(spec.iteration.data) }),
    collection: scriptVariables(spec.collection?.variables() ?? []),
    request,
    info: {
      eventName,
      requestName: spec.info?.requestName ?? "",
      requestId: spec.info?.requestId ?? "",
      ...(spec.iteration && { iteration: spec.iteration.index, iterationCount: spec.iteration.count }),
    },
    send: (request) => sendForScript(ports, request, spec.signal, spec.route),
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
async function sendForScript(
  ports: ExchangePorts,
  request: ScriptSendRequest,
  signal?: AbortSignal,
  route = ports.transport.route(),
): Promise<ScriptResponse> {
  if (containsSecretPlaceholder(request)) {
    throw Object.assign(
      new Error(
        "pm.sendRequest with a vault secret is not supported — see docs/postman-compatibility.md#pm-sendrequest",
      ),
      { name: "WayfarerUnsupportedError" },
    );
  }
  const startedAt = performance.now();
  // By the route of the request whose script sends it. Nothing is asked in the middle of a script: a request the browser may have sent is not sent again (D7).
  const envelope = await ports.transport.send(
    request,
    { signal: signal ?? new AbortController().signal, timeoutMs: ports.timeoutMs() },
    { route },
  );
  const shaped = shapeResponse(envelope, request.url, ports.page);
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
 * stored rows, not to a copy of them. A change that has nowhere to go is
 * said in the console, not dropped without a word.
 *
 * A value set on a protected variable goes into the vault (`intoVault`)
 * and never into these stores. `secrets` masks vault secrets in every
 * other value: a post-response script may have read one from the response.
 *
 * Gives back a function that puts the old value back into each vault
 * secret these changes replaced.
 */
async function applyChanges(
  ports: ExchangePorts,
  spec: RequestExecutionSpec,
  changes: ScriptResult["changes"],
  notes: string[],
  secrets?: Redactor,
): Promise<() => Promise<void>> {
  const active = ports.environment();
  /** The plaintext each replaced secret had, by id. Held for this send only, in memory. */
  const replaced = new Map<string, string>();
  // Marked as a script's: the stored rows are what counts, and a reference in them is never replaced with text (`applyVariableChanges`).
  const kept = async (api: string, rows: Row[], scope: VariableChange[]): Promise<VariableChange[]> =>
    (await intoVault(ports, api, rows, scope, notes, replaced)).map(({ key, value, json }) => ({
      key,
      value: value === null || !secrets ? value : secrets.text(value),
      keepSecret: true,
      ...(json && { json }),
    }));
  const environment = await kept("pm.environment", active?.vars ?? [], changes.environment);
  const global = await kept("pm.globals", ports.globals(), changes.global);
  const collection = await kept("pm.collectionVariables", spec.collection?.variables() ?? [], changes.collection);
  if (environment.length) {
    if (active) await active.change(environment);
    else notes.push("[warn] pm.environment: no environment is active, so what the script set was not kept.");
  }
  if (global.length) await ports.changeGlobals(global);
  if (collection.length) {
    if (spec.collection) await spec.collection.change(collection);
    else
      notes.push(
        "[warn] pm.collectionVariables: this request is in no collection, so what the script set was not kept.",
      );
  }
  return async () => {
    for (const [id, plaintext] of replaced) await ports.vault.replaceSecret(id, plaintext);
  };
}

/**
 * A script set a protected variable (P3.12): the value is encrypted into
 * the secret the variable refers to, and the variable keeps its reference.
 * A locked vault refuses, with a line in the console; the user is not
 * asked for the passphrase in the middle of a script's work. Gives back
 * the changes that are not of this kind, to be stored as variables.
 *
 * "Protected" is read from the rows as the sender holds them. Should that
 * copy be a moment old, the value is not encrypted, and it is not stored
 * either: the changes are marked `keepSecret`.
 */
async function intoVault(
  ports: ExchangePorts,
  api: string,
  rows: Row[],
  changes: VariableChange[],
  notes: string[],
  replaced: Map<string, string>,
): Promise<VariableChange[]> {
  const rest: VariableChange[] = [];
  for (const change of changes) {
    const reference = rows.find((row) => row.key === change.key && protectedSecretId(row.value) !== null)?.value;
    const id = protectedSecretId(reference);
    if (change.value === null || id === null) {
      rest.push(change);
      // Its own reference written back, as a script that copies every variable does: nothing to do.
    } else if (change.value.trim() !== reference?.trim()) {
      const refused = (why: string) =>
        notes.push(`[warn] ${api}.set(${JSON.stringify(change.key)}): ${why}, so its value was not changed.`);
      if (!ports.vault.isUnlocked()) {
        refused("this variable is protected and the vault is locked");
        continue;
      }
      const old = await ports.vault.readSecret(id);
      if (old === null || !(await ports.vault.replaceSecret(id, change.value)))
        refused("the secret this variable refers to is not in the vault");
      // The first value is the one to go back to, should the script set the variable twice in one run.
      else if (!replaced.has(id)) replaced.set(id, old);
    }
  }
  return rest;
}

function isJsonPayload(payload: unknown): boolean {
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

function serializeJsonPayload(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  return stringifyJson(payload) ?? stringifyPayload(payload);
}

function stringifyPayload(payload: unknown): string {
  if (payload === null || payload === undefined || payload instanceof BinaryBody) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  return stringifyJson(payload, 4) ?? String(payload);
}
