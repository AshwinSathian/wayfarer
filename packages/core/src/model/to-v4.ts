import { parseJson } from "../safe-json";
import { V4_METHODS, type V4Auth, type V4Method } from "./from-v4";
import type { AuthConfig, Draft, RequestBody, Row, TestAssertion } from "./request";

/** What a draft contributes to a v4 `RequestDoc`: everything but its identity and place. */
export interface V4Content {
  method: V4Method;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  auth: V4Auth;
  preRequestScript: string;
  postRequestScript: string;
  tests: TestAssertion[];
}

export function isV4Method(method: string): method is V4Method {
  return (V4_METHODS as readonly string[]).includes(method);
}

export function authToV4(auth: AuthConfig): V4Auth {
  switch (auth.type) {
    case "bearer":
      return { type: "bearer", bearer: { token: auth.token } };
    case "basic":
      return { type: "basic", basic: { username: auth.username, password: auth.password } };
    case "apikey":
      return { type: "api-key", apiKey: { key: auth.key, value: auth.value, addTo: auth.in } };
    case "none":
      return { type: "none" };
  }
}

/** A v4 header record: enabled rows with a name, names trimmed. `Object.fromEntries` keeps a "__proto__" name as data. */
export function headersToV4(rows: Row[]): Record<string, string> {
  return Object.fromEntries(
    rows
      .filter((row) => row.enabled)
      .map((row): [string, string] => [row.key.trim(), row.value])
      .filter(([key]) => key)
  );
}

/** JSON text becomes its value; text that is not JSON is kept as a string. */
export function bodyToV4(body: RequestBody): unknown {
  if (body.mode === "none") return undefined;
  const parsed = parseJson(body.raw.text);
  return body.raw.language === "json" && parsed.ok ? parsed.value : body.raw.text;
}

export function draftToV4(draft: Draft): V4Content {
  return {
    // v4 stores one of seven methods and the composer offers no other until P2.16.
    method: isV4Method(draft.method) ? draft.method : "GET",
    url: draft.url,
    headers: headersToV4(draft.headers),
    body: bodyToV4(draft.body),
    auth: authToV4(draft.auth),
    preRequestScript: draft.scripts.pre,
    postRequestScript: draft.scripts.post,
    tests: draft.tests,
  };
}
