import type { AuthConfig, OwnAuth } from "../model/request";

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
    case "inherit":
      return auth;
  }
}

/**
 * The auth a request is sent with (P4.9): its own unless it inherits, then
 * that of the nearest folder that does not inherit, then the collection's.
 * `chain` is the collection first and then the folders from the outside in;
 * `from` names the one whose auth it is. Nothing to inherit from sends none.
 */
export function effectiveAuth(own: AuthConfig, chain: readonly { name: string; auth: AuthConfig }[]): { auth: OwnAuth; from?: string } {
  if (own.type !== "inherit") return { auth: own };
  for (const { name, auth } of [...chain].reverse()) {
    if (auth.type !== "inherit") return { auth, from: name };
  }
  return { auth: { type: "none" } };
}

/** The credentials of an auth, as resolved: what a redactor must look for besides vault secrets. */
export function credentialsOf(auth: AuthConfig): string[] {
  switch (auth.type) {
    case "bearer":
      return [auth.token];
    case "basic":
      return [auth.password];
    case "apikey":
      return [auth.value];
    case "none":
    case "inherit":
      return [];
  }
}
