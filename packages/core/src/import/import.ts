import { COLLECTION_FORMAT, ENVIRONMENTS_FORMAT, type CollectionExport, type EnvironmentDoc } from "../model/collection";
import type { Scripts } from "../model/request";
import type { ValidationIssue } from "../model/validate";
import { IMPORT_TOO_LARGE, isOversizedImport, parseJson } from "../safe-json";
import { unsupportedApis } from "./script-scan";
import { importCollection, type CollectionImportPlanEntry } from "./wayfarer-collection";
import { validateEnvironmentExport } from "./wayfarer-environments";

/**
 * Why a file was not imported. The message is user-facing; `issues` name
 * each field that is wrong, when the file is of a known format. An importer
 * throws nothing else (plan P4.1).
 */
export class ImportError extends Error {
  override readonly name = "ImportError";

  constructor(
    message: string,
    readonly issues: ValidationIssue[] = []
  ) {
    super(message);
  }
}

/** The formats a file can be in, each with the name the report gives it. */
export const IMPORT_FORMATS = {
  "wayfarer-collection": "Wayfarer collection",
  "wayfarer-environments": "Wayfarer environments",
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

const UNKNOWN = `This is not a file Wayfarer can import. It reads a Wayfarer collection ("$id": "${COLLECTION_FORMAT}") and a Wayfarer environments file ("$id": "${ENVIRONMENTS_FORMAT}").`;

function idOf(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.hasOwn(value, "$id")) return "";
  const id = (value as { $id: unknown }).$id;
  return typeof id === "string" ? id : "";
}

/**
 * Which format a parsed file is in, from its content, or null. A Wayfarer
 * file of any version is its format: the format's own check then says
 * which version is read.
 */
export function detectFormat(value: unknown): ImportFormat | null {
  const id = idOf(value);
  if (id.startsWith("wayfarer/collection/")) return "wayfarer-collection";
  if (id.startsWith("wayfarer/environments/")) return "wayfarer-environments";
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

/**
 * A file's text as collections and environments in the app's own model,
 * with a report of what it holds and of what could not be kept. It fetches
 * nothing and stores nothing. Throws `ImportError`, and nothing else.
 */
export function importText(text: string, options: ImportOptions = {}): Imported {
  if (isOversizedImport(text)) throw new ImportError(IMPORT_TOO_LARGE);
  const parsed = parseJson(text);
  if (!parsed.ok) throw new ImportError("The file is not valid JSON, so it is not a file Wayfarer can import.");
  const format = detectFormat(parsed.value);
  if (!format) {
    if (idOf(parsed.value).startsWith("wayfarer/workspace/")) throw new ImportError("This is a workspace backup, which replaces everything. Restore it in Settings.");
    throw new ImportError(UNKNOWN);
  }
  const report = (counts: Partial<ImportReport["counts"]>, warnings: ImportWarning[]): ImportReport => ({
    format,
    formatName: IMPORT_FORMATS[format],
    counts: { collections: 0, folders: 0, requests: 0, environments: 0, ...counts },
    warnings,
  });

  if (format === "wayfarer-environments") {
    const result = validateEnvironmentExport(parsed.value as object);
    if (!result.payload) throw new ImportError("The file is not a valid Wayfarer environments file.", (result.errors ?? []).map((message) => ({ path: "", message })));
    return { report: report({ environments: result.payload.length }, []), collections: [], environments: result.payload };
  }

  const { payload, plan, errors } = importCollection(parsed.value as object, options);
  if (!payload || !plan) throw new ImportError("The file is not a valid Wayfarer collection.", errors ?? []);
  const warnings = [
    ...scriptWarnings(`collection "${payload.collection.name}"`, payload.collection.scripts),
    ...payload.folders.flatMap((folder) => scriptWarnings(`folder "${folder.name}"`, folder.scripts)),
    ...payload.requests.flatMap((request) => scriptWarnings(`request "${request.name}"`, request.scripts)),
  ];
  return { report: report({ collections: 1, folders: payload.folders.length, requests: payload.requests.length }, warnings), collections: [{ payload, plan }], environments: [] };
}
