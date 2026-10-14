import { COLLECTION_FORMAT, ENVIRONMENTS_FORMAT } from "../model/collection";
import { validateRequestContent, validateRows } from "../model/validate";
import { VAULT_FILE_FORMAT, validateVaultFile } from "../vault/vault-crypto";
import { validateCollection } from "./wayfarer-collection";
import { validateEnvironmentExport } from "./wayfarer-environments";

/** A whole workspace as one file (P2.11): every store the app keeps, the vault's secrets encrypted as they are stored. */
export const WORKSPACE_FORMAT = "wayfarer/workspace/3";

/** The keys of the records of the `meta` store. */
export const META_STATE_KEY = "state";
export const META_GLOBALS_KEY = "globals";
export const META_VAULT_KEY = "vault";

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const own = (value: Fields, key: string): unknown => (Object.hasOwn(value, key) ? value[key] : undefined);

/**
 * Checks a workspace file against what the app writes, store by store, with
 * the validators the single-store importers use. A file is untrusted.
 */
export function validateWorkspaceFile(value: unknown): string[] {
  if (!isObject(value) || own(value, "$id") !== WORKSPACE_FORMAT) {
    return [`Not a Wayfarer workspace file: "$id" must be "${WORKSPACE_FORMAT}".`];
  }
  const stores = own(value, "stores");
  if (!isObject(stores)) return ["stores: Value must be an object."];
  const errors: string[] = [];
  const list = (name: string): Fields[] => {
    const records = own(stores, name);
    if (!Array.isArray(records) || !records.every(isObject)) {
      errors.push(`stores.${name}: Value must be an array of objects.`);
      return [];
    }
    return records as Fields[];
  };
  const [collections, folders, requests, environments, secrets, meta] = ["collections", "folders", "requests", "environments", "secrets", "meta"].map(list);
  if (errors.length) return errors;

  // Each collection with its folders and requests, as a collection file would hold them.
  const idOf = (doc: Fields) => (isObject(doc["meta"]) ? doc["meta"]["id"] : undefined);
  const known = new Set(collections.map(idOf));
  for (const collection of collections) {
    const id = idOf(collection);
    const result = validateCollection({
      $id: COLLECTION_FORMAT,
      meta: collection["meta"],
      collection,
      folders: folders.filter((folder) => folder["collectionId"] === id),
      requests: requests.filter((request) => request["collectionId"] === id),
    });
    errors.push(...(result.errors ?? []).map((issue) => `collection "${String(collection["name"])}": ${issue.path}: ${issue.message}`));
    if (!isObject(collection["scriptTrust"])) errors.push(`collection "${String(collection["name"])}": scriptTrust is missing.`);
  }
  for (const [kind, docs] of [["folders", folders], ["requests", requests]] as const) {
    docs.forEach((doc, index) => {
      if (!known.has(doc["collectionId"])) errors.push(`stores.${kind}[${index}]: belongs to a collection that is not in the file.`);
    });
  }
  errors.push(...(validateEnvironmentExport({ $id: ENVIRONMENTS_FORMAT, environments }).errors ?? []));

  // The meta records: the active environment, the globals, the vault.
  let vault: Fields | undefined;
  for (const record of meta) {
    const key = record["key"];
    if (key === META_STATE_KEY) {
      const active = record["activeEnvironmentId"];
      if (active !== null && active !== undefined && typeof active !== "string") errors.push("stores.meta: the active environment must be an id or null.");
    } else if (key === META_GLOBALS_KEY) {
      errors.push(...validateRows(record["variables"], "stores.meta.globals.variables").map((issue) => `${issue.path}: ${issue.message}`));
    } else if (key === META_VAULT_KEY) {
      vault = record;
    } else {
      errors.push(`stores.meta: "${String(key)}" is not a record the app keeps.`);
    }
  }
  if (vault || secrets.length) {
    const issues = validateVaultFile({ $id: VAULT_FILE_FORMAT, vault, secrets });
    errors.push(...issues.map((issue) => `vault: ${issue.path}: ${issue.message}`));
    secrets.forEach((secret, index) => {
      if (!isObject(secret["meta"]) || secret["meta"]["id"] !== secret["id"]) errors.push(`stores.secrets[${index}]: meta.id must be the secret's id.`);
    });
  }

  const history = own(stores, "history");
  if (history !== undefined) {
    list("history").forEach((entry, index) => {
      const path = `stores.history[${index}]`;
      const sent = entry["sent"];
      if (typeof entry["createdAt"] !== "number") errors.push(`${path}.createdAt: Value must be a number.`);
      if (entry["route"] !== "direct" && entry["route"] !== "bridge") errors.push(`${path}.route: Value must be direct or bridge.`);
      if (!isObject(sent) || typeof sent["method"] !== "string" || typeof sent["url"] !== "string" || !Array.isArray(sent["headers"])) {
        errors.push(`${path}.sent: Value must hold a method, a URL and headers.`);
      }
      errors.push(...validateRequestContent(entry["template"], `${path}.template`).map((issue) => `${issue.path}: ${issue.message}`));
    });
  }
  return errors;
}

