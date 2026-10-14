/**
 * The request model (plan section 4.4): what the composer
 * edits, what the stores keep and what an export file holds.
 */

/**
 * Where a request is sent from (P6.4): the page, the Local Bridge, or the
 * page first and then, where D7 allows it, the bridge.
 */
export type Route = "auto" | "direct" | "bridge";

/** The methods the composer suggests. Any HTTP method can be typed. */
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

/** Methods a browser refuses to send: `fetch` throws on them. Only the Local Bridge can. */
export const FORBIDDEN_METHODS: readonly string[] = ["CONNECT", "TRACE", "TRACK"];

/**
 * Whether `text` is an HTTP method as the app stores one: an RFC 9110 token
 * of at most 32 characters, in upper case. The composer upper-cases what is
 * typed; `fetch` does that only for the common verbs, so `patch` would
 * otherwise go out as written.
 */
export function isHttpMethod(text: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Z]{1,32}$/.test(text);
}

export interface Row {
  key: string;
  value: string;
  enabled: boolean;
  /**
   * A variable a script set to something that is not text: `value` is its
   * JSON, and a script reads it back as the number, boolean, null, object
   * or list it was. Where a request holds `{{name}}` the value is put in
   * as the text it is. A row someone edits is text again.
   */
  json?: true;
}

export const RAW_LANGUAGES = ["json", "text", "xml", "html", "javascript"] as const;
export type RawLanguage = (typeof RAW_LANGUAGES)[number];

export const BODY_MODES = ["none", "raw", "urlencoded", "multipart", "binary", "graphql"] as const;
export type BodyMode = (typeof BODY_MODES)[number];

/** A file kept in the `files` store, by id, with the name it was picked under. */
export interface FileRef {
  fileId: string;
  fileName: string;
}

export type MultipartPart = { key: string; enabled: boolean } & ({ kind: "text"; value: string } | ({ kind: "file" } & FileRef));

/**
 * The body as the user wrote it: template text, `{{variables}}` intact.
 * `mode` says which part is sent. The others are kept, so changing the mode
 * and changing it back loses nothing.
 */
export interface RequestBody {
  mode: BodyMode;
  raw?: { language: RawLanguage; text: string };
  urlencoded?: Row[];
  multipart?: MultipartPart[];
  binary?: FileRef & { contentType?: string };
  /** A GraphQL query and the text of its variables, a JSON object (P5.5). Sent as one JSON body: `graphqlPayload`. */
  graphql?: { query: string; variables: string };
}

/** The `Content-Type` a raw body is sent with when the request sets none. */
export const RAW_CONTENT_TYPES: Record<RawLanguage, string> = {
  json: "application/json",
  text: "text/plain",
  xml: "application/xml",
  html: "text/html",
  javascript: "application/javascript",
};

/** The ids of every file a body refers to, whatever its mode: a mode not chosen keeps its files. */
export function fileIdsOf(body: RequestBody): string[] {
  const parts = (body.multipart ?? []).flatMap((part) => (part.kind === "file" ? [part.fileId] : []));
  return body.binary ? [...parts, body.binary.fileId] : parts;
}

/** `inherit`: what the nearest folder that does not inherit says, then the collection (P4.9). In no collection, nothing. */
export type AuthConfig =
  | { type: "inherit" }
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" }
  /** AWS Signature Version 4 (P4.8). A session token is empty when there is none. */
  | { type: "awsv4"; accessKey: string; secretKey: string; sessionToken: string; region: string; service: string }
  /**
   * OAuth 2.0 (P4.7). The token is not here: it is kept under a name made
   * from these fields (`oauthTokenKey`), in the vault or in memory. A field
   * a grant does not use is empty.
   */
  | {
      type: "oauth2";
      grant: OAuthGrant;
      authUrl: string;
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      scope: string;
      username: string;
      password: string;
      /** Where the token request names the client: a Basic header, or the form. */
      clientAuth: "header" | "body";
      /** A 401 gets one more send, with a new token. */
      retryOn401: boolean;
    };

export const OAUTH_GRANTS = ["authorization_code", "client_credentials", "password"] as const;
export type OAuthGrant = (typeof OAUTH_GRANTS)[number];

/** An auth that says what is sent by itself. */
export type OwnAuth = Exclude<AuthConfig, { type: "inherit" }>;

export const AUTH_TYPES = ["inherit", "none", "bearer", "basic", "apikey", "awsv4", "oauth2"] as const satisfies readonly AuthConfig["type"][];

/** The two scripts of a request, of a folder or of a collection. Blank: there is none. */
export interface Scripts {
  pre: string;
  post: string;
}

export const ASSERTION_TARGETS = ["status", "body", "header", "duration"] as const;
export type AssertionTarget = (typeof ASSERTION_TARGETS)[number];

export const ASSERTION_OPERATORS = [
  "equals",
  "not-equals",
  "contains",
  "not-contains",
  "exists",
  "not-exists",
  "is-array",
  "is-object",
  "less-than",
  "greater-than",
] as const;
export type AssertionOperator = (typeof ASSERTION_OPERATORS)[number];

export interface TestAssertion {
  id: string;
  target: AssertionTarget;
  /** JSON dot-path for body target (e.g. "data.users[0].id"), header name, or empty for status/duration */
  key?: string;
  operator: AssertionOperator;
  /** Expected value (string representation; compared after coercion) */
  expected?: string;
}

/** A request without its identity and its place in a collection. */
export interface RequestContent {
  /** An HTTP method, upper-cased. */
  method: string;
  /** Text, never passed through `URL`: it may hold `{{variables}}`. */
  url: string;
  params: Row[];
  /** Ordered; duplicates allowed. */
  headers: Row[];
  body: RequestBody;
  auth: AuthConfig;
  scripts: Scripts;
  tests: TestAssertion[];
  settings: { timeoutMs?: number; followRedirects?: boolean; /** Absent: the collection's, else the device's (P6.4). */ route?: Route; /** Through the Local Bridge, the server's certificate is not verified. Only `true` is written. */ tlsInsecure?: boolean };
}

/** The auth of a type just chosen, with nothing typed. */
export function emptyAuth(type: AuthConfig["type"]): AuthConfig {
  switch (type) {
    case "bearer":
      return { type, token: "" };
    case "basic":
      return { type, username: "", password: "" };
    case "apikey":
      return { type, key: "", value: "", in: "header" };
    case "awsv4":
      return { type, accessKey: "", secretKey: "", sessionToken: "", region: "", service: "" };
    case "oauth2":
      return { type, grant: "authorization_code", authUrl: "", tokenUrl: "", clientId: "", clientSecret: "", scope: "", username: "", password: "", clientAuth: "header", retryOn401: false };
    case "none":
    case "inherit":
      return { type };
  }
}

export function emptyRequest(): RequestContent {
  return {
    method: "GET",
    url: "",
    params: [],
    headers: [],
    body: { mode: "none" },
    auth: { type: "none" },
    scripts: { pre: "", post: "" },
    tests: [],
    settings: {},
  };
}

/** What a composer tab edits: a request, plus a reference to the response the tab last received. */
export interface Draft extends RequestContent {
  responseId?: string;
}
