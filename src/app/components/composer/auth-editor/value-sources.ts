import type { VariableToken } from "../../../services/variable-focus";

const SCOPES: Record<string, string> = {
  local: "a script of this send",
  data: "the run's data file",
  folder: "a folder's variables",
  collection: "the collection's variables",
  global: "the global variables",
};

/**
 * Where each variable of the auth a request is sent with gets its value, as
 * the Auth tab says it (U-130): "{{token}} comes from the environment Local,
 * as a vault secret." The auth may be set in the collection while its value is
 * the environment's.
 */
export function valueSources(tokens: readonly VariableToken[], environment?: string): string {
  const seen = new Set<string>();
  const said: string[] = [];
  for (const token of tokens) {
    if (token.location !== "auth" || seen.has(token.key)) continue;
    seen.add(token.key);
    const name = `{{${token.key}}}`;
    const vaulted = token.vaulted ? ", as a vault secret" : "";
    if (token.source === "missing") said.push(`${name} has no value.`);
    else if (token.source === "dynamic") said.push(`${name} is made new at each send.`);
    else if (token.source === "secret") said.push(`${name} is a vault secret.`);
    else if (token.source === "environment")
      said.push(`${name} comes from the environment${environment ? ` ${environment}` : ""}${vaulted}.`);
    else said.push(`${name} comes from ${SCOPES[token.source] ?? token.source}${vaulted}.`);
  }
  return said.join(" ");
}
