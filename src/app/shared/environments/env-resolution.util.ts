import { EnvironmentDoc, EnvironmentId } from "../../models/environments.models";

export type VariableSource = "request" | "environment" | "global" | "missing";
export type VariableLocation = "url" | "header" | "body";

export interface VariableContext {
  requestVars?: Record<string, string>;
  environment?: EnvironmentDoc | null;
  globals?: Record<string, string>;
}

export interface VariableToken {
  key: string;
  value?: string;
  source: VariableSource;
  location: VariableLocation;
  field: string;
  environmentId?: EnvironmentId;
}

const PLACEHOLDER_PATTERN = /{{\s*([\w.-]+)\s*}}/g;

export function resolveVariable(
  variable: string,
  context: VariableContext
): { value?: string; source: VariableSource; environmentId?: EnvironmentId } {
  const requestValue = context.requestVars?.[variable];
  if (requestValue !== undefined) {
    return { value: requestValue, source: "request" };
  }
  const envValue = context.environment?.vars?.[variable];
  if (envValue !== undefined) {
    return {
      value: envValue,
      source: "environment",
      environmentId: context.environment?.meta.id,
    };
  }
  const globalValue = context.globals?.[variable];
  if (globalValue !== undefined) {
    return { value: globalValue, source: "global" };
  }
  return { source: "missing" };
}

/**
 * Substitutes every resolvable `{{key}}` occurrence in `text` with its
 * resolved value. Unresolved keys (source "missing") are left as the
 * original literal placeholder rather than being blanked out, so a
 * still-typed request never silently sends an empty string in place of a
 * variable that simply hasn't been set yet.
 */
export function resolveTemplate(
  text: string,
  context: VariableContext
): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const resolved = resolveVariable(key, context);
    return resolved.value ?? match;
  });
}

export function extractVariables(
  text: string | undefined,
  location: VariableLocation,
  field: string,
  context: VariableContext
): VariableToken[] {
  if (!text) {
    return [];
  }
  const matches: VariableToken[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
    const key = match[1];
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const resolved = resolveVariable(key, context);
    matches.push({
      key,
      value: resolved.value,
      source: resolved.source,
      location,
      field,
      environmentId: resolved.environmentId,
    });
  }
  return matches;
}

export function collectVariableTokens(
  payload: {
    url?: string;
    headers?: { key: string; value: string }[];
    body?: { key: string; value: unknown }[];
  },
  context: VariableContext
): VariableToken[] {
  const tokens: VariableToken[] = [];
  tokens.push(...extractVariables(payload.url, "url", "endpoint", context));
  payload.headers?.forEach((header, index) => {
    tokens.push(
      ...extractVariables(header.key, "header", `header-${index}-key`, context)
    );
    tokens.push(
      ...extractVariables(header.value, "header", `header-${index}-value`, context)
    );
  });
  payload.body?.forEach((item, index) => {
    tokens.push(
      ...extractVariables(
        typeof item.value === "string" ? item.value : JSON.stringify(item.value),
        "body",
        `body-${index}`,
        context
      )
    );
  });
  return tokens;
}
