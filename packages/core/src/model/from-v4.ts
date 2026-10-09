import type { AuthConfig, Draft, RequestBody, TestAssertion } from "./request";

/** The request shapes of data model v4, as far as a `Draft` is built from them. */
export const V4_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type V4Method = (typeof V4_METHODS)[number];

export interface V4Auth {
  type: "none" | "bearer" | "basic" | "api-key";
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apiKey?: { key: string; value: string; addTo: "header" | "query" };
}

/** A v4 `RequestDoc` or history entry: both carry these fields, a history entry only the first four. */
export interface V4Request {
  method: V4Method;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  auth?: V4Auth;
  preRequestScript?: string;
  postRequestScript?: string;
  tests?: TestAssertion[];
}

export function authFromV4(auth: V4Auth | undefined): AuthConfig {
  switch (auth?.type) {
    case "bearer":
      return { type: "bearer", token: auth.bearer?.token ?? "" };
    case "basic":
      return { type: "basic", username: auth.basic?.username ?? "", password: auth.basic?.password ?? "" };
    case "api-key":
      return {
        type: "apikey",
        key: auth.apiKey?.key ?? "",
        value: auth.apiKey?.value ?? "",
        in: auth.apiKey?.addTo ?? "header",
      };
    default:
      return { type: "none" };
  }
}

/** v4 stored the body as a JSON value; a draft holds it as JSON text. */
export function bodyFromV4(body: unknown): RequestBody {
  const text = body === undefined ? undefined : JSON.stringify(body, null, 2);
  return text === undefined ? { mode: "none" } : { mode: "raw", raw: { language: "json", text } };
}

export function draftFromV4(request: V4Request): Draft {
  return {
    method: request.method,
    url: request.url,
    params: [],
    headers: Object.entries(request.headers ?? {}).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
      enabled: true,
    })),
    body: bodyFromV4(request.body),
    auth: authFromV4(request.auth),
    scripts: { pre: request.preRequestScript ?? "", post: request.postRequestScript ?? "" },
    tests: request.tests ?? [],
    settings: {},
  };
}
