/**
 * The request model of data model v5 (plan section 4.4). Until v5 is the
 * stored shape (P2.2), only the composer's `Draft` uses it; the stores read
 * and write v4 through `from-v4.ts` and `to-v4.ts`.
 */
export interface Row {
  key: string;
  value: string;
  enabled: boolean;
}

export type RawLanguage = "json" | "text" | "xml" | "html" | "javascript";

/** The body as the user wrote it: template text, `{{variables}}` intact. */
export type RequestBody = { mode: "none" } | { mode: "raw"; raw: { language: RawLanguage; text: string } };

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" };

export type AssertionTarget = "status" | "body" | "header" | "duration";

export type AssertionOperator =
  | "equals"
  | "not-equals"
  | "contains"
  | "not-contains"
  | "exists"
  | "not-exists"
  | "is-array"
  | "is-object"
  | "less-than"
  | "greater-than";

export interface TestAssertion {
  id: string;
  target: AssertionTarget;
  /** JSON dot-path for body target (e.g. "data.users[0].id"), header name, or empty for status/duration */
  key?: string;
  operator: AssertionOperator;
  /** Expected value (string representation; compared after coercion) */
  expected?: string;
}

/**
 * What a composer tab edits: a request without its place in a collection,
 * plus a reference to the response the tab last received.
 */
export interface Draft {
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
  responseId?: string;
}
