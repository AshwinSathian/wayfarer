import { IMPORT_TOO_LARGE, isOversizedImport, parseJson, validateRows } from "@wayfarer/core";
import { ENVIRONMENTS_FORMAT, EnvironmentDoc } from "../../models/environments";
import { sortByOrder, sortKeys } from "../collections/collection-io";

export interface EnvironmentValidationResult {
  ok: boolean;
  errors?: string[];
  payload?: EnvironmentDoc[];
}

export function serializeEnvironmentExport(environments: EnvironmentDoc[]): string {
  return JSON.stringify(sortKeys({ $id: ENVIRONMENTS_FORMAT, environments: prepareEnvironments(environments) }), null, 2);
}

export function validateEnvironmentExport(
  input: string | object
): EnvironmentValidationResult {
  if (isOversizedImport(input)) {
    return { ok: false, errors: [IMPORT_TOO_LARGE] };
  }
  const parsed = typeof input === "string" ? safeParse(input) : input;
  if (!parsed) {
    return { ok: false, errors: ["File does not contain a valid JSON payload."] };
  }

  const file = parsed as { $id?: unknown; environments?: unknown };
  if (file.$id !== ENVIRONMENTS_FORMAT) {
    return { ok: false, errors: [`Not a Wayfarer environments file: "$id" must be "${ENVIRONMENTS_FORMAT}".`] };
  }
  if (!Array.isArray(file.environments)) {
    return { ok: false, errors: ["Expected an array of environments."] };
  }
  const value = file.environments as EnvironmentDoc[];

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
    for (const issue of validateRows(env.vars, `environments[${index}].vars`)) {
      errors.push(`${issue.path}: ${issue.message}`);
    }
  });

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, payload: prepareEnvironments(value) };
}

function prepareEnvironments(environments: EnvironmentDoc[]): EnvironmentDoc[] {
  return sortByOrder(environments).map((env) => ensureEnvId(structuredClone(env)));
}

function safeParse(text: string): unknown {
  const parsed = parseJson(text);
  return parsed.ok ? parsed.value : null;
}

function ensureEnvId(env: EnvironmentDoc): EnvironmentDoc {
  if (!env.id && env.meta?.id) {
    env.id = env.meta.id;
  }
  return env;
}
