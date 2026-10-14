import { newId } from "../id";
import { COLLECTION_FORMAT, ENVIRONMENTS_FORMAT, type CollectionExport, type EnvironmentDoc, type Meta } from "../model/collection";
import type { RequestContent, Scripts } from "../model/request";
import { validateRequestContent, validateRows } from "../model/validate";
import { IMPORT_TOO_LARGE, isOversizedImport, parseJson } from "../safe-json";
import { curlRequest, parseCurl } from "./curl";
import { isCurlCommand } from "./curl-command";
import { isHar, parseHar } from "./har";
import { ImportError } from "./import-error";
import { insomniaExport, isInsomnia } from "./insomnia";
import { isOpenApi, openApiCollection } from "./openapi";
import { isPostmanCollection, isPostmanEnvironment, isPostmanV1, postmanCollection, postmanEnvironment } from "./postman";
import { unsupportedApis } from "./script-scan";
import { importCollection, type CollectionImportPlanEntry } from "./wayfarer-collection";
import { validateEnvironmentExport } from "./wayfarer-environments";
import { NOT_READABLE, parseYaml } from "./yaml";

export { ImportError };

/** The formats a file can be in, each with the name the report gives it. */
export const IMPORT_FORMATS = {
  "wayfarer-collection": "Wayfarer collection",
  "wayfarer-environments": "Wayfarer environments",
  curl: "cURL command",
  har: "HAR 1.2",
  "postman-collection": "Postman collection",
  "postman-environment": "Postman environment",
  insomnia: "Insomnia export",
  openapi: "OpenAPI description",
} as const;
export type ImportFormat = keyof typeof IMPORT_FORMATS;

/** Something of the file the app could not keep, or will not run as written. `item` says where: `request "Login"`. */
export interface ImportWarning {
  item: string;
  message: string;
}

/** What an import will add, shown before anything is stored. */
export interface ImportReport {
  format: ImportFormat;
  formatName: string;
  counts: { collections: number; folders: number; requests: number; environments: number };
  warnings: ImportWarning[];
}

export interface ImportedCollection {
  payload: CollectionExport;
  /** What storing it does to each document: a new one, or one that replaces the document of that id. */
  plan: CollectionImportPlanEntry[];
}

/** A file in the app's own model, checked by the shared validators, with its report. Nothing is stored yet. */
export interface Imported {
  report: ImportReport;
  collections: ImportedCollection[];
  environments: EnvironmentDoc[];
}

export interface ImportOptions {
  /** A Wayfarer collection is stored beside the one it came from, under new ids, instead of replacing it. */
  duplicateAsNew?: boolean;
}

/** The `$id` is of this family: this version's, or a numbered one an earlier version wrote, which is refused by name. */
const of = (id: string, family: string): boolean => id === family || id.startsWith(`${family}/`);

const UNKNOWN = `This is not a file Wayfarer can import. It reads a Wayfarer collection ("$id": "${COLLECTION_FORMAT}"), a Wayfarer environments file ("$id": "${ENVIRONMENTS_FORMAT}"), a Postman collection (v2.0 or v2.1), a Postman environment or globals file, an Insomnia export (format 4 or 5, JSON or YAML), an OpenAPI 3.0 or 3.1 or Swagger 2.0 description (JSON or YAML), a HAR 1.2 file, and a cURL command.`;

function idOf(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.hasOwn(value, "$id")) return "";
  const id = (value as { $id: unknown }).$id;
  return typeof id === "string" ? id : "";
}

/**
 * Which format a parsed file is in, from its content, or null. A Wayfarer
 * file of any version is its format: the format's own check then says
 * which version is read. (A cURL command is not JSON, and is recognised
 * from the text before this is asked: `isCurlCommand`.)
 */
export function detectFormat(value: unknown): ImportFormat | null {
  const id = idOf(value);
  if (of(id, "wayfarer/collection")) return "wayfarer-collection";
  if (of(id, "wayfarer/environments")) return "wayfarer-environments";
  if (isHar(value)) return "har";
  // Before Postman's: an Insomnia file and an OpenAPI description say what they are, and a Postman file is known by a list it holds.
  if (isInsomnia(value)) return "insomnia";
  if (isOpenApi(value)) return "openapi";
  if (isPostmanCollection(value)) return "postman-collection";
  if (isPostmanEnvironment(value)) return "postman-environment";
  return null;
}

/** A warning for each script of the file that uses what the app does not have. */
function scriptWarnings(item: string, scripts: Scripts): ImportWarning[] {
  return (["pre", "post"] as const).flatMap((kind) => {
    const found = unsupportedApis(scripts[kind]);
    if (!found.length) return [];
    const names = found.length > 1 ? `${found.slice(0, -1).join(", ")} and ${found.at(-1)}` : found[0];
    return [{ item, message: `Its ${kind === "pre" ? "pre-request" : "post-response"} script uses ${names}, which Wayfarer does not have. The script will end in an error there.` }];
  });
}

/** The script warnings of a collection: its own scripts, its folders' and its requests'. */
function inheritedScriptWarnings(payload: CollectionExport): ImportWarning[] {
  return [
    ...scriptWarnings(`collection "${payload.collection.name}"`, payload.collection.scripts),
    ...payload.folders.flatMap((folder) => scriptWarnings(`folder "${folder.name}"`, folder.scripts)),
    ...payload.requests.flatMap((request) => scriptWarnings(`request "${request.name}"`, request.scripts)),
  ];
}

/**
 * A cURL command as one request of the app, with what of it was left out:
 * what a paste into the address field fills the composer with. Checked by
 * the shared validator, like anything that came from outside. Throws
 * `ImportError`.
 */
export function curlToRequest(text: string): { name: string; content: RequestContent; warnings: string[] } {
  // A paste has the cap a file has: the text does not come through `readImportText`.
  if (isOversizedImport(text)) throw new ImportError(IMPORT_TOO_LARGE);
  const parsed = parseCurl(text);
  const { content, warnings } = curlRequest(parsed);
  const issues = validateRequestContent(content, "request");
  if (issues.length) throw new ImportError("The cURL command does not make a request the app can hold.", issues);
  const address = URL.parse(parsed.request.url);
  return { name: `${content.method} ${address ? address.host + address.pathname : parsed.request.url}`, content, warnings };
}

/**
 * Requests that came without a collection (a command, a HAR) as a new
 * collection of the app: ids from `newId()`, no auth and no scripts of its
 * own, the requests in the order given. Checked like a collection file.
 */
function built(format: ImportFormat, name: string, requests: { name: string; content: RequestContent; warnings: string[] }[]): Imported {
  const now = Date.now();
  const meta = (): Meta => ({ id: newId(), createdAt: now, updatedAt: now });
  const top = meta();
  const payload: CollectionExport = {
    $id: COLLECTION_FORMAT,
    meta: top,
    collection: { id: top.id, meta: top, name, order: 0, variables: [], auth: { type: "none" }, scripts: { pre: "", post: "" } },
    folders: [],
    requests: requests.map(({ name: requestName, content }, order) => {
      const own = meta();
      return { id: own.id, meta: own, collectionId: top.id, name: requestName, order, ...content };
    }),
  };
  return {
    report: {
      format,
      formatName: IMPORT_FORMATS[format],
      counts: { collections: 1, folders: 0, requests: requests.length, environments: 0 },
      warnings: requests.flatMap(({ name: requestName, warnings }) => warnings.map((message) => ({ item: `request "${requestName}"`, message }))),
    },
    collections: [added(payload)],
    environments: [],
  };
}

/** A collection an importer made, checked like a collection file: what it writes is what the app itself would. */
function added(payload: CollectionExport): ImportedCollection {
  const { payload: checked, plan, errors } = importCollection(payload, { duplicateAsNew: true });
  if (!checked || !plan) throw new ImportError(`The file does not make requests the app can hold.`, errors ?? []);
  return { payload: checked, plan };
}

/**
 * A file's text as collections and environments in the app's own model,
 * with a report of what it holds and of what could not be kept. It fetches
 * nothing and stores nothing. Throws `ImportError`, and nothing else.
 */
export function importText(text: string, options: ImportOptions = {}): Imported {
  if (isOversizedImport(text)) throw new ImportError(IMPORT_TOO_LARGE);
  // A byte order mark is not part of the file's text. A browser takes it off as it reads the file; Node does not.
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  if (isCurlCommand(text)) {
    const { name, content, warnings } = curlToRequest(text);
    return built("curl", "Imported from cURL", [{ name, content, warnings }]);
  }
  const json = parseJson(text);
  // What is not JSON may be YAML. Almost any text is YAML for one value or another: only a file that holds a map or a list is read on.
  const value = json.ok ? json.value : parseYaml(text);
  if (!json.ok && (typeof value !== "object" || value === null)) throw new ImportError(NOT_READABLE);
  const format = detectFormat(value);
  if (!format) {
    if (of(idOf(value), "wayfarer/workspace")) throw new ImportError("This is a workspace backup, which replaces everything. Restore it in Settings.");
    if (isPostmanV1(value)) throw new ImportError("This is a Postman Collection v1 file, which Wayfarer does not read. In Postman, export the collection as Collection v2.1 and import that.");
    throw new ImportError(UNKNOWN);
  }
  const report = (counts: Partial<ImportReport["counts"]>, warnings: ImportWarning[]): ImportReport => ({
    format,
    formatName: IMPORT_FORMATS[format],
    counts: { collections: 0, folders: 0, requests: 0, environments: 0, ...counts },
    warnings,
  });

  if (format === "har") {
    const requests = parseHar(value).map(({ name, request, warnings }) => ({ name, ...curlRequest({ request, warnings }) }));
    return built("har", "Imported from HAR", requests);
  }
  if (format === "postman-collection" || format === "openapi") {
    // An OpenAPI description is written out as a Postman collection first: one mapping to the app's model.
    const source = format === "openapi" ? openApiCollection(value) : { collection: value, warnings: [] };
    const { payload, warnings } = postmanCollection(source.collection);
    const collection = added(payload);
    return {
      report: report({ collections: 1, folders: payload.folders.length, requests: payload.requests.length }, [...source.warnings, ...warnings, ...inheritedScriptWarnings(collection.payload)]),
      collections: [collection],
      environments: [],
    };
  }
  if (format === "insomnia") {
    const { collections: made, environments, warnings } = insomniaExport(value);
    const read = made.map((collection) => postmanCollection(collection));
    const collections = read.map(({ payload }) => added(payload));
    const issues = environments.flatMap((environment) => validateRows(environment.vars, "data"));
    if (issues.length) throw new ImportError("The file's environments are not ones the app can hold.", issues);
    const count = (of: (payload: CollectionExport) => unknown[]): number => collections.reduce((sum, { payload }) => sum + of(payload).length, 0);
    return {
      report: report({ collections: collections.length, folders: count((payload) => payload.folders), requests: count((payload) => payload.requests), environments: environments.length }, [
        ...warnings,
        ...read.flatMap((collection) => collection.warnings),
      ]),
      collections,
      environments,
    };
  }
  if (format === "postman-environment") {
    const { environment, warnings } = postmanEnvironment(value);
    const issues = validateRows(environment.vars, "values");
    if (issues.length) throw new ImportError("The file is not a Postman environment the app can hold.", issues);
    return { report: report({ environments: 1 }, warnings), collections: [], environments: [environment] };
  }
  if (format === "wayfarer-environments") {
    const result = validateEnvironmentExport(value as object);
    if (!result.payload) throw new ImportError("The file is not a valid Wayfarer environments file.", (result.errors ?? []).map((message) => ({ path: "", message })));
    return { report: report({ environments: result.payload.length }, []), collections: [], environments: result.payload };
  }

  const { payload, plan, errors } = importCollection(value as object, options);
  if (!payload || !plan) throw new ImportError("The file is not a valid Wayfarer collection.", errors ?? []);
  return { report: report({ collections: 1, folders: payload.folders.length, requests: payload.requests.length }, inheritedScriptWarnings(payload)), collections: [{ payload, plan }], environments: [] };
}
