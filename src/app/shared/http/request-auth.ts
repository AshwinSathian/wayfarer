import type { AuthConfig } from "@wayfarer/core";

/**
 * Pure translation of the composer's Auth tab state into the headers/query
 * param it actually contributes to an outgoing request. Extracted from
 * the composer so this (security-adjacent — it's what puts a bearer
 * token or basic-auth credential on the wire) logic is unit testable on its
 * own.
 */
export function buildAuthHeaders(auth: AuthConfig): Record<string, string> {
  if (auth.type === "bearer" && auth.token) {
    return { Authorization: `Bearer ${auth.token}` };
  }
  if (auth.type === "basic" && auth.username) {
    // UTF-8 bytes (RFC 7617): btoa alone throws on anything outside Latin-1.
    const bytes = new TextEncoder().encode(`${auth.username}:${auth.password}`);
    const encoded = btoa(String.fromCharCode(...bytes));
    return { Authorization: `Basic ${encoded}` };
  }
  if (auth.type === "apikey" && auth.key && auth.in === "header") {
    return Object.fromEntries([[auth.key, auth.value]]);
  }
  return {};
}

export function buildAuthQueryParam(auth: AuthConfig): { key: string; value: string } | null {
  if (auth.type === "apikey" && auth.key && auth.in === "query") {
    return { key: auth.key, value: auth.value };
  }
  return null;
}

/** Applies `resolve` (e.g. `{{var}}` substitution) to every auth field that goes on the wire (F07). */
export function resolveAuth(auth: AuthConfig, resolve: (text: string) => string): AuthConfig {
  switch (auth.type) {
    case "bearer":
      return { ...auth, token: resolve(auth.token) };
    case "basic":
      return { ...auth, username: resolve(auth.username), password: resolve(auth.password) };
    case "apikey":
      return { ...auth, key: resolve(auth.key), value: resolve(auth.value) };
    case "none":
      return auth;
  }
}
