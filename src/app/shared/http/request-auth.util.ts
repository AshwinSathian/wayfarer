import { HttpAuthPlaceholder } from "../../models/collections.models";

/**
 * Pure translation of the composer's Auth tab state into the headers/query
 * param it actually contributes to an outgoing request. Extracted from
 * `ApiParamsComponent` so this (security-adjacent — it's what puts a bearer
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
    const encoded = btoa(`${auth.basic.username}:${auth.basic.password ?? ""}`);
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
