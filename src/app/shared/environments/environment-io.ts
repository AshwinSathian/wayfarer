import { IMPORT_TOO_LARGE, isOversizedImport, parseJson, validateRows, type VaultFile } from "@wayfarer/core";
import { ENVIRONMENTS_FORMAT, EnvironmentDoc } from "../../models/environments";
import { sortByOrder, sortKeys } from "../collections/collection-io";

export interface EnvironmentValidationResult {
  ok: boolean;
  errors?: string[];
  payload?: EnvironmentDoc[];
}

/**
 * What an environments file holds of a protected variable (P2.11):
 * - `strip`: nothing. The value is empty: the file has no secret and no
 *   reference to one.
 * - `references`: the `{{$secret.<id>}}` reference, with the vault, still
 *   encrypted, beside it in the file.
 * - `plain`: the secret's plaintext, given in `plaintexts` by id.
 */
export type ProtectedValues =
  | { mode: "strip" }
  | { mode: "references"; vault: VaultFile | null }
  | { mode: "plain"; plaintexts: ReadonlyMap<string, string> };

export function serializeEnvironmentExport(environments: EnvironmentDoc[], protectedValues: ProtectedValues = { mode: "strip" }): string {
  // Each reference in a value, also one that stands inside other text.
  const value = (text: string): string =>
    protectedValues.mode === "references"
      ? text
      : text.replace(/\{\{\s*\$secret\.([a-z0-9-]+)\s*\}\}/gi, (_reference, id: string) =>
          protectedValues.mode === "plain" ? protectedValues.plaintexts.get(id) ?? "" : ""
        );
  const prepared = prepareEnvironments(environments).map((env) => ({ ...env, vars: env.vars.map((row) => ({ ...row, value: value(row.value) })) }));
  return JSON.stringify(
    sortKeys({
      $id: ENVIRONMENTS_FORMAT,
      environments: prepared,
      ...(protectedValues.mode === "references" && protectedValues.vault && { vault: protectedValues.vault }),
    }),
    null,
    2
  );
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
