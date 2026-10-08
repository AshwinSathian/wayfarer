import { HttpAuthPlaceholder } from "../../models/collections";

/**
 * Pure translation of the composer's Auth tab state into the headers/query
 * param it actually contributes to an outgoing request. Extracted from
 * `ApiParams` so this (security-adjacent — it's what puts a bearer
 * token or basic-auth credential on the wire) logic is unit testable on its
 * own.
 */
export function buildAuthHeaders(auth: HttpAuthPlaceholder | undefined): Record<string, string> {
  if (!auth || auth.type === "none") {
    return {};
  }
  if (auth.type === "bearer" && auth.bearer?.token) {
    return { Authorization: `Bearer ${auth.bearer.token}` };
  }
  if (auth.type === "basic" && auth.basic?.username) {
    // UTF-8 bytes (RFC 7617): btoa alone throws on anything outside Latin-1.
    const bytes = new TextEncoder().encode(`${auth.basic.username}:${auth.basic.password ?? ""}`);
    const encoded = btoa(String.fromCharCode(...bytes));
    return { Authorization: `Basic ${encoded}` };
  }
  if (auth.type === "api-key" && auth.apiKey?.key && auth.apiKey?.addTo === "header") {
    return { [auth.apiKey.key]: auth.apiKey.value ?? "" };
  }
  return {};
}

export function buildAuthQueryParam(
  auth: HttpAuthPlaceholder | undefined
): { key: string; value: string } | null {
  if (auth?.type === "api-key" && auth.apiKey?.key && auth.apiKey?.addTo === "query") {
    return { key: auth.apiKey.key, value: auth.apiKey.value ?? "" };
  }
  return null;
}

/** Applies `resolve` (e.g. `{{var}}` substitution) to every auth field that goes on the wire (F07). */
export function resolveAuth(
  auth: HttpAuthPlaceholder | undefined,
  resolve: (text: string) => string
): HttpAuthPlaceholder | undefined {
  if (!auth) {
    return auth;
  }
  return {
    ...auth,
    bearer: auth.bearer && { token: resolve(auth.bearer.token) },
    basic: auth.basic && {
      username: resolve(auth.basic.username),
      password: resolve(auth.basic.password ?? ""),
    },
    apiKey: auth.apiKey && {
      ...auth.apiKey,
      key: resolve(auth.apiKey.key),
      value: resolve(auth.apiKey.value ?? ""),
    },
  };
}
