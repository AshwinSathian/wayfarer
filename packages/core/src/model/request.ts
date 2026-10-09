/**
 * The request model of data model v5 (plan section 4.4): what the composer
 * edits, what the stores keep and what an export file holds.
 */

/** The methods the composer offers and an import accepts. */
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export interface Row {
  key: string;
  value: string;
  enabled: boolean;
}

export const RAW_LANGUAGES = ["json", "text", "xml", "html", "javascript"] as const;
export type RawLanguage = (typeof RAW_LANGUAGES)[number];

/** The body as the user wrote it: template text, `{{variables}}` intact. */
export type RequestBody = { mode: "none" } | { mode: "raw"; raw: { language: RawLanguage; text: string } };

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" };

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
  scripts: { pre: string; post: string };
  tests: TestAssertion[];
  settings: { timeoutMs?: number; followRedirects?: boolean; route?: "auto" | "direct" | "bridge" };
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
    case "none":
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
