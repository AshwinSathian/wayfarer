import { parseJson } from "../json/safe-json";
import { EnvironmentDoc } from "../../models/environments";
import { deepSort, sortByOrder } from "../collections/collection-io";

export interface EnvironmentValidationResult {
  ok: boolean;
  errors?: string[];
  payload?: EnvironmentDoc[];
}

export function serializeEnvironmentExport(environments: EnvironmentDoc[]): string {
  const normalized = prepareEnvironments(environments);
  return JSON.stringify(deepSort(normalized), null, 2);
}

export function validateEnvironmentExport(
  input: string | object
): EnvironmentValidationResult {
  const parsed = typeof input === "string" ? safeParse(input) : input;
  if (!parsed) {
    return { ok: false, errors: ["File does not contain a valid JSON payload."] };
  }

  const value = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)["environments"])
      ? ((parsed as Record<string, unknown>)["environments"] as EnvironmentDoc[])
      : null;

  if (!value) {
    return { ok: false, errors: ["Expected an array of environments."] };
  }

  const errors: string[] = [];
  value.forEach((env, index) => {
    if (!env || typeof env !== "object") {
      errors.push(`environments[${index}] must be an object.`);
      return;
    }
    if (!env.meta || typeof env.meta !== "object") {
      errors.push(`environments[${index}].meta is missing.`);
    }
    if (typeof env.name !== "string" || !env.name.trim()) {
      errors.push(`environments[${index}].name is required.`);
    }
    if (typeof env.order !== "number") {
      errors.push(`environments[${index}].order must be a number.`);
    }
    if (
      typeof env.vars !== "object" ||
      env.vars === null ||
      Array.isArray(env.vars)
    ) {
      errors.push(`environments[${index}].vars must be an object.`);
    } else if (Object.values(env.vars).some((value) => typeof value !== "string")) {
      errors.push(`environments[${index}].vars values must be strings.`);
    }
  });

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, payload: prepareEnvironments(value) };
}

function prepareEnvironments(environments: EnvironmentDoc[]): EnvironmentDoc[] {
  return sortByOrder(environments).map((env) => ensureEnvId(cloneValue(env)));
}

function safeParse(text: string): unknown {
  const parsed = parseJson(text);
  return parsed.ok ? parsed.value : null;
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureEnvId(env: EnvironmentDoc): EnvironmentDoc {
  if (!env.id && env.meta?.id) {
    env.id = env.meta.id;
  }
  return env;
}
