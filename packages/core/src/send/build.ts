import { OAuthError, oauthTokenKey, type OAuth2Auth } from "../auth/oauth2";
import { buildAuthHeaders, buildAuthQueryParam, credentialsOf, effectiveAuth, resolveAuth } from "../auth/request-auth";
import { signV4 } from "../auth/sigv4";
import { graphqlPayload } from "../http/graphql";
import type { Ancestor } from "../model/collection";
import { RAW_CONTENT_TYPES, type AuthConfig, type FileRef, type MultipartPart, type RequestBody, type RequestContent, type Row } from "../model/request";
import { isCredentialHeader } from "../redact/redactor";
import { VariableNestingError, VariableResolver, type ScopeStack } from "../variables/resolver";
import { SendBlockedError, SendDeclinedError, type BuiltRequest } from "./exchange";

/** A request that has a `{{variable}}` with no value, held back until the user says to send it as written (plan D3). */
export class UnresolvedVariablesError extends SendBlockedError {
  constructor(readonly names: string[]) {
    super(`${names.map((name) => `{{${name}}}`).join(", ")} ${names.length === 1 ? "has" : "have"} no value. The request was not sent.`);
  }
}

/** A request as it was before its pre-request script ran: its address as composed, and the variables as they were. */
export interface Composed {
  url: string;
  scopes: ScopeStack;
  /** In a run: the hosts the user has said yes to. A host is asked about once in a run. */
  accepted?: Set<string>;
}

/** What a run's requests share (P5.2): the variables as they were when the run started, and the hosts the user has said yes to. */
export interface RunSend {
  baseline: ScopeStack;
  acceptedHosts: Set<string>;
}

/** A body as it is sent, with the `Content-Type` its mode implies. */
export interface SentBody {
  data: string | Blob | FormData;
  contentType?: string;
}

/** What building one request needs of whoever sends it. */
export interface BuildContext {
  /** The variables, read at each use: a pre-request script, or a vault unlock, may have come between. */
  scopes(): ScopeStack;
  /** What the request inherits its auth from: its collection, then its folders from the outside in. */
  ancestors: Ancestor[];
  /** The plaintext of the vault secrets named. One the vault does not have is left out. Throws a `SendBlockedError` when the vault cannot be read. */
  readSecrets(ids: string[]): Promise<Map<string, string>>;
  /** The bytes of a file of the body. Throws a `SendBlockedError` when there are none. */
  readFile(ref: FileRef): Promise<Blob>;
  /** A `{{variable}}` with no value holds the request back (D3). */
  blockUnresolved: boolean;
  /** The request before its pre-request script ran (plan Q6, C-053). */
  composed?: Composed;
  /** Asked when a script left a request with a vault secret going to another host. Absent: the answer is no. */
  askHost?(from: string, to: string): Promise<boolean>;
  /** The OAuth 2.0 token of `auth`, kept under `key`: the one held, or a new one. Absent: such a request cannot be sent here. */
  oauthToken?(auth: OAuth2Auth, key: string, renew: boolean): Promise<string>;
  /** Ask for a new OAuth 2.0 token, not the one held (the one more send of a 401). */
  renewToken?: boolean;
  /** The id a reconnecting event stream names, as the server sent it (P5.6). */
  lastEventId?: string;
}

/** GET and HEAD cannot carry a body: `fetch` refuses one. */
export function isBodyMethod(method?: string): boolean {
  return !!method && method !== "GET" && method !== "HEAD";
}

/** The headers that are sent: enabled rows with a name, in order. */
export function sentHeaders(rows: Row[]): [string, string][] {
  return rows.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value]);
}

function hasExplicitScheme(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

/**
 * Prefixes a scheme-less endpoint with `https://` so it's always sent to
 * `fetch` as an absolute URL. Without this, a scheme-less string like
 * "not-a-url" is a *relative* URL as far as the browser is concerned, and
 * `fetch` silently resolves it against the app's own origin — fetching
 * the app's own index.html and reporting it back as a misleading "200 OK".
 * The text is otherwise sent as written.
 */
export function normalizeUrl(text: string): string {
  // A URL parser takes tabs and line breaks out of an address without a word (a variable's value may hold one).
  // Percent-encoded, as Postman sends them, they stay what they are: data in a path or a query, and no host.
  const address = text.replace(/[\t\n\r]/g, encodeURIComponent);
  return hasExplicitScheme(address) ? address : `https://${address}`;
}

/** Appends a single key/value pair onto a URL's query string, tolerating an unparseable base URL by returning it unchanged. */
export function appendQueryParam(url: string, key: string, value: string): string {
  const parsed = URL.parse(normalizeUrl(url));
  if (!parsed) {
    return url;
  }
  parsed.searchParams.append(key, value);
  return parsed.toString();
}

/** The host a request goes to: its name, and its port when that is not the scheme's own. An address that is no URL stands for itself. */
export function hostOf(url: string, scopes: ScopeStack): string {
  const address = normalizeUrl(new VariableResolver(scopes).resolve(url.trim()));
  return URL.parse(address)?.host ?? address;
}

/** The `Content-Type` a body's mode implies, without reading a file: what a preflight is decided on. */
export function bodyContentType(body: RequestBody): string | undefined {
  switch (body.mode) {
    case "raw":
      return body.raw?.text ? RAW_CONTENT_TYPES[body.raw.language] : undefined;
    case "graphql":
      return "application/json";
    case "urlencoded":
      return "application/x-www-form-urlencoded";
    case "multipart":
      return "multipart/form-data";
    case "binary":
      return body.binary?.contentType || "application/octet-stream";
    default:
      return undefined;
  }
}

/** Every text of a body that may hold a `{{variable}}`. */
export function bodyTexts(body: RequestBody): string[] {
  switch (body.mode) {
    case "raw":
      return [body.raw?.text ?? ""];
    case "graphql":
      return [body.graphql?.query ?? "", body.graphql?.variables ?? ""];
    case "urlencoded":
      return (body.urlencoded ?? []).flatMap((row) => [row.key, row.value]);
    case "multipart":
      return (body.multipart ?? []).flatMap((part) => [part.key, part.kind === "text" ? part.value : ""]);
    default:
      return [];
  }
}

/** The auth that is sent for `own`: itself, or what it inherits from `ancestors`. */
export function sentAuth(own: AuthConfig, ancestors: Ancestor[]): AuthConfig {
  return effectiveAuth(own, ancestors).auth;
}

/**
 * The OAuth 2.0 auth a request is sent with, its own or inherited, and the
 * name its token is kept under (`oauthTokenKey`): made with the variables
 * replaced and no vault secret read, so the name holds none. `null` for
 * another auth, or for variables that refer to each other.
 */
export function oauthOf(own: AuthConfig, ancestors: Ancestor[], scopes: ScopeStack): { auth: OAuth2Auth; key: string } | null {
  const auth = sentAuth(own, ancestors);
  if (auth.type !== "oauth2") return null;
  const probe = new VariableResolver(scopes);
  try {
    return { auth, key: oauthTokenKey(resolveAuth(auth, (text) => probe.resolve(text))) };
  } catch (error) {
    // Variables that refer to each other: the send says so. Such an auth has no token.
    if (!(error instanceof VariableNestingError)) throw error;
    return null;
  }
}

/**
 * `content` (the request, as a pre-request script may have changed it)
 * with `{{var}}` placeholders substituted, as it is transmitted. The
 * editors keep the literal template.
 *
 * `context.composed` is the request before its pre-request script ran. When
 * the script left it going to another host and it uses a vault secret, the
 * user is asked before the vault is read (plan Q6). One send is compared:
 * a variable a script set in an earlier send is not seen here.
 */
export function buildRequest(content: RequestContent, context: BuildContext): BuiltRequest | Promise<BuiltRequest> {
  const endpointText = content.url;
  const { scopes, composed } = context;
  // First without the vault: this pass says which secrets the request needs.
  const probe = new VariableResolver(scopes());
  for (const text of [endpointText, ...sentHeaders(content.headers).flat(), ...bodyTexts(content.body)]) {
    probe.resolve(text);
  }
  // Every field of the auth that is sent, not its credentials alone: a username or an access key may be a secret too (F81).
  resolveAuth(sentAuth(content.auth, context.ancestors), (text) => probe.resolve(text));
  const checked = (resolver: VariableResolver): BuiltRequest | Promise<BuiltRequest> => {
    const built = build(content, resolver, context);
    const check = (request: BuiltRequest): BuiltRequest => {
      if (resolver.unresolved.size && context.blockUnresolved) {
        throw new UnresolvedVariablesError([...resolver.unresolved]);
      }
      return request;
    };
    return built instanceof Promise ? built.then(check) : check(built);
  };
  // Nothing to read from the vault: the request is built at once, in the same task as the click.
  if (!probe.lockedSecrets.size) return checked(new VariableResolver(scopes()));
  const withSecrets = () => context.readSecrets([...probe.lockedSecrets]).then((secrets) => checked(new VariableResolver(scopes(), (id) => secrets.get(id))));
  const from = composed && hostOf(composed.url, composed.scopes);
  const to = hostOf(endpointText, scopes());
  if (from === undefined || from === to || composed?.accepted?.has(to)) return withSecrets();
  return (context.askHost?.(from, to) ?? Promise.resolve(false)).then((accepted) => {
    if (!accepted) throw new SendDeclinedError("The request was not sent, and what the pre-request script set was undone.");
    composed?.accepted?.add(to);
    return withSecrets();
  });
}

/** A promise only when a file has to be read: everything else is built at once. */
function build(content: RequestContent, resolver: VariableResolver, context: BuildContext): BuiltRequest | Promise<BuiltRequest> {
  const resolve = (text: string): string => resolver.resolve(text);
  const auth = resolveAuth(sentAuth(content.auth, context.ancestors), resolve);
  // Read before anything else is resolved: these are the auth's own.
  const withoutValue = [...resolver.unresolved];
  const sent = isBodyMethod(content.method) ? resolveBody(content.body, resolve, context) : undefined;
  const finish = (body: SentBody | undefined, token?: string): BuiltRequest | Promise<BuiltRequest> =>
    sign(assemble(content, body, resolver, { ancestors: context.ancestors, token, lastEventId: context.lastEventId }), auth);
  const oauth = auth.type === "oauth2" ? oauthOf(content.auth, context.ancestors, context.scopes()) : null;
  if (auth.type !== "oauth2" || !oauth) return sent instanceof Promise ? sent.then((body) => finish(body)) : finish(sent);
  // A token is not asked for with a variable's name where its value should be, whatever "Send anyway" says of the request itself.
  if (withoutValue.length) {
    throw new SendBlockedError(`The OAuth 2.0 auth uses ${withoutValue.map((name) => `{{${name}}}`).join(", ")}, which ${withoutValue.length === 1 ? "has" : "have"} no value. No token was asked for, and nothing was sent.`);
  }
  if (!context.oauthToken) throw new SendBlockedError("OAuth 2.0 tokens are not fetched here. Nothing was sent.");
  // OAuth 2.0 (P4.7): the token held, or a renewed one. Fetched before the request is put together, and never by a copy or an export.
  const token = context.oauthToken(auth, oauth.key, context.renewToken ?? false).catch((error: unknown) => {
    throw error instanceof OAuthError ? new SendBlockedError(`${error.message} Nothing was sent.`) : error;
  });
  return Promise.all([sent, token]).then(([body, value]) => finish(body, value));
}

/**
 * AWS Signature Version 4 (P4.8), last of all: it signs the address, the
 * headers and the body as they will be sent. Signed besides `Host` and the
 * signer's own headers: `Content-Type` and any `x-amz-` header the request
 * sets. The hashes are WebCrypto's, which a page has only when it is
 * served over https or from localhost.
 */
function sign(built: BuiltRequest, auth: AuthConfig): BuiltRequest | Promise<BuiltRequest> {
  if (auth.type !== "awsv4" || !URL.canParse(built.url)) return built;
  if (built.body instanceof FormData) {
    throw new SendBlockedError("AWS Signature cannot sign a multipart form: the browser writes the form's boundary as it sends, so the app does not have the bytes to sign. Send a file as a File body, or the fields as a URL-encoded form. Nothing was sent.");
  }
  if (!(globalThis.crypto as typeof globalThis.crypto | undefined)?.subtle) throw new SendBlockedError("AWS Signature needs the browser's cryptography, which a page has only over https or from localhost. Nothing was sent.");
  const add = async (body: string | Uint8Array | undefined): Promise<BuiltRequest> => {
    const own = built.headers.filter(([name]) => /^(content-type$|x-amz-)/i.test(name));
    const { headers: signature } = await signV4({ method: built.method, url: built.url, headers: own, body }, auth, new Date());
    const replaced = new Set(signature.map(([name]) => name.toLowerCase()));
    return {
      ...built,
      headers: [...built.headers.filter(([name]) => !replaced.has(name.toLowerCase())), ...signature],
      // The signature's header too: a server may send it back.
      credentials: [...built.credentials, ...signature.filter(([name]) => isCredentialHeader(name)).map(([, value]) => value)],
    };
  };
  if (built.body instanceof Blob) return built.body.arrayBuffer().then((bytes) => add(new Uint8Array(bytes)));
  return add(built.body);
}

/**
 * The request put together: its headers one per name, the auth's among
 * them, the address normalised, and what the redactor is to look for. It
 * neither signs nor reads the vault: an export builds with this too.
 */
export function assemble(
  content: RequestContent,
  sent: SentBody | undefined,
  resolver: VariableResolver,
  extra: {
    ancestors: Ancestor[];
    /** An OAuth 2.0 token fetched for this send. It goes in as it is: a token is not a template. */
    token?: string;
    /** The id of an event is the server's text, not a template: a `{{variable}}` in it is not replaced, or a server could name one and be sent its value. */
    lastEventId?: string;
  }
): BuiltRequest {
  const resolve = (text: string): string => resolver.resolve(text);
  const auth = resolveAuth(sentAuth(content.auth, extra.ancestors), resolve);
  // One value per name, whatever its case, the later one winning: the auth
  // header replaces a row of the same name. A Map keeps a name such as
  // "__proto__" as data (F56).
  const byName = new Map<string, [string, string]>();
  for (const [key, value] of [...sentHeaders(content.headers), ...Object.entries(buildAuthHeaders(auth))]) {
    const name = resolve(key);
    byName.set(name.toLowerCase(), [name, resolve(value)]);
  }
  if (extra.token) byName.set("authorization", ["Authorization", `Bearer ${extra.token}`]);
  if (extra.lastEventId !== undefined) byName.set("last-event-id", ["Last-Event-ID", extra.lastEventId]);
  // The body's own type, unless the request names one.
  if (sent?.contentType && !byName.has("content-type")) {
    byName.set("content-type", ["Content-Type", sent.contentType]);
  }
  const headers = [...byName.values()];
  // The Params rows are already in the URL field (they mirror its query).
  let url = normalizeUrl(resolve(content.url.trim()));
  const authParam = buildAuthQueryParam(auth);
  if (authParam) {
    url = appendQueryParam(url, authParam.key, authParam.value);
  }
  return {
    method: content.method,
    url,
    headers,
    body: sent?.data,
    // An OAuth 2.0 token is kept like a vault secret and masked like one: in history, in every export, and in what a script is shown.
    secrets: [...resolver.taint, ...(extra.token ? [extra.token] : [])],
    // Also what a credential header carries, typed by hand or built from the Auth tab: a server may send it back.
    credentials: [...credentialsOf(auth), ...headers.filter(([name]) => isCredentialHeader(name)).map(([, value]) => value)].filter((value) => value),
  };
}

/**
 * The body as it is sent, by mode, with the `Content-Type` it implies. A
 * form has none here: `fetch` writes the multipart type with its boundary.
 */
function resolveBody(body: RequestBody, resolve: (text: string) => string, context: BuildContext): SentBody | undefined | Promise<SentBody> {
  switch (body.mode) {
    case "none":
      return undefined;
    case "raw": {
      const text = resolve(body.raw?.text ?? "");
      return text ? { data: text, contentType: RAW_CONTENT_TYPES[body.raw?.language ?? "text"] } : undefined;
    }
    case "graphql": {
      // The variables are replaced in the query and in the variables' text, and the JSON is made of the result: whatever a value holds, the query is one JSON string.
      const payload = graphqlPayload(resolve(body.graphql?.query ?? ""), resolve(body.graphql?.variables ?? ""));
      if ("error" in payload) throw new SendBlockedError(payload.error);
      return { data: payload.text, contentType: "application/json" };
    }
    case "urlencoded": {
      const pairs = (body.urlencoded ?? []).filter((row) => row.enabled).map((row): [string, string] => [resolve(row.key), resolve(row.value)]);
      return { data: new URLSearchParams(pairs).toString(), contentType: "application/x-www-form-urlencoded" };
    }
    case "multipart":
      return multipartForm((body.multipart ?? []).filter((item) => item.enabled), resolve, context);
    case "binary":
      return binaryFile(body.binary, context);
  }
}

async function multipartForm(parts: MultipartPart[], resolve: (text: string) => string, context: BuildContext): Promise<SentBody> {
  const form = new FormData();
  for (const part of parts) {
    if (part.kind === "text") {
      form.append(resolve(part.key), resolve(part.value));
    } else {
      form.append(resolve(part.key), await context.readFile(part), part.fileName);
    }
  }
  return { data: form };
}

async function binaryFile(binary: RequestBody["binary"], context: BuildContext): Promise<SentBody> {
  if (!binary) {
    throw new SendBlockedError("Choose a file for the body, or set the body to None.");
  }
  const file = await context.readFile(binary);
  return { data: file, contentType: binary.contentType || file.type || "application/octet-stream" };
}
