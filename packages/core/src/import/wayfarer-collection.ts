import { newId } from "../id";
import { COLLECTION_FORMAT, type Collection, type CollectionExport, type CollectionTree, type Folder, type RequestDoc } from "../model/collection";
import { validateInherited, validateRequestContent, validateRows } from "../model/validate";
import { IMPORT_TOO_LARGE, isOversizedImport, parseJson } from "../safe-json";

export interface ValidationResult {
  path: string;
  message: string;
}

export interface CollectionImportPlanEntry {
  type: "collection" | "folder" | "request";
  name: string;
  id: string;
  action: "create" | "overwrite";
}

export interface CollectionImportResult {
  payload?: CollectionExport;
  plan?: CollectionImportPlanEntry[];
  summary?: {
    folders: number;
    requests: number;
  };
  idRemap?: Record<string, string>;
  errors?: ValidationResult[];
}

export function serializeDeterministic(
  source: CollectionTree | CollectionExport
): string {
  const payload = normalizeExport(toExport(source));
  return JSON.stringify(sortKeys(payload), null, 2);
}

export function validateCollection(
  input: string | object
): { ok: boolean; errors?: ValidationResult[]; payload?: CollectionExport } {
  if (isOversizedImport(input)) {
    return { ok: false, errors: [{ path: "root", message: IMPORT_TOO_LARGE }] };
  }
  const payload = typeof input === "string" ? safeParse(input) : input;
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      errors: [{ path: "root", message: "Collection export must be an object." }],
    };
  }

  const errors: ValidationResult[] = [];
  const value = payload as Partial<CollectionExport>;
  if (value.$id !== COLLECTION_FORMAT) {
    // Nothing else is checked: a file in another format would fail on every field.
    return {
      ok: false,
      errors: [{ path: "$id", message: `Not a Wayfarer collection file: "$id" must be "${COLLECTION_FORMAT}".` }],
    };
  }
  if (!value.collection) {
    errors.push({ path: "collection", message: "Missing collection block." });
  } else {
    validateCollectionDoc(value.collection, "collection", errors);
  }

  if (!Array.isArray(value.folders)) {
    errors.push({ path: "folders", message: "Folders must be an array." });
  } else {
    value.folders.forEach((folder, index) =>
      validateFolderDoc(folder, `folders[${index}]`, errors)
    );
  }

  if (!Array.isArray(value.requests)) {
    errors.push({ path: "requests", message: "Requests must be an array." });
  } else {
    value.requests.forEach((request, index) =>
      validateRequestDoc(request, `requests[${index}]`, errors)
    );
  }

  if (!value.meta) {
    errors.push({ path: "meta", message: "Missing export meta block." });
  } else {
    validateMeta(value.meta, "meta", errors);
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, payload: value as CollectionExport };
}

export function importCollection(
  input: string | object,
  options: { duplicateAsNew?: boolean } = {}
): CollectionImportResult {
  const validation = validateCollection(input);
  if (!validation.ok || !validation.payload) {
    return { errors: validation.errors };
  }

  const normalized = normalizeExport(validation.payload);
  const duplicate = options.duplicateAsNew ?? false;
  const { payload, idRemap } = duplicate
    ? remapIdentifiers(normalized)
    : { payload: normalized, idRemap: undefined };

  const plan = buildPlan(payload, duplicate);

  return {
    payload,
    plan,
    summary: {
      folders: payload.folders.length,
      requests: payload.requests.length,
    },
    idRemap,
  };
}

export function sortByOrder<T extends { order?: number; meta?: { id?: string }; id?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const orderA = typeof a.order === "number" ? a.order : 0;
    const orderB = typeof b.order === "number" ? b.order : 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const idA = (a.id ?? a.meta?.id ?? "").toString();
    const idB = (b.id ?? b.meta?.id ?? "").toString();
    return idA.localeCompare(idB);
  });
}

/**
 * The same value with every object's keys in alphabetical order. Arrays keep
 * their order: a list of header rows or assertions is in the order the user
 * gave it (F57).
 */
export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => sortKeys(item)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return Object.fromEntries(entries.map(([key, val]) => [key, sortKeys(val)])) as T;
  }

  return value;
}

function buildPlan(
  payload: CollectionExport,
  duplicate: boolean
): CollectionImportPlanEntry[] {
  const action = duplicate ? "create" : "overwrite";
  const entries: CollectionImportPlanEntry[] = [
    {
      type: "collection",
      name: payload.collection.name,
      id: payload.collection.id ?? payload.collection.meta.id,
      action,
    },
  ];

  for (const folder of payload.folders) {
    entries.push({
      type: "folder",
      name: folder.name,
      id: folder.id ?? folder.meta.id,
      action,
    });
  }

  for (const request of payload.requests) {
    entries.push({
      type: "request",
      name: request.name || request.url,
      id: request.id ?? request.meta.id,
      action,
    });
  }

  return entries;
}

function remapIdentifiers(
  payload: CollectionExport
): { payload: CollectionExport; idRemap: Record<string, string> } {
  const clone = structuredClone(payload);
  const idMap: Record<string, string> = {};

  const newCollectionId = newId();
  const originalCollectionId = clone.collection.id ?? clone.collection.meta.id;
  idMap[originalCollectionId] = newCollectionId;
  clone.collection.id = newCollectionId;
  clone.collection.meta.id = newCollectionId;
  clone.collection.meta = touchMeta(clone.collection.meta);

  clone.folders = clone.folders.map((folder) => {
    const updated = structuredClone(folder);
    const mappedId = newId();
    const originalId = folder.id ?? folder.meta.id;
    idMap[originalId] = mappedId;
    updated.id = mappedId;
    updated.meta.id = mappedId;
    updated.collectionId = newCollectionId;
    if (updated.parentFolderId) {
      updated.parentFolderId = idMap[updated.parentFolderId] ?? updated.parentFolderId;
    }
    updated.meta = touchMeta(updated.meta);
    return updated;
  });

  clone.requests = clone.requests.map((request) => {
    const updated = structuredClone(request);
    const mappedId = newId();
    const originalId = request.id ?? request.meta.id;
    idMap[originalId] = mappedId;
    updated.id = mappedId;
    updated.meta.id = mappedId;
    updated.collectionId = newCollectionId;
    if (updated.folderId) {
      updated.folderId = idMap[updated.folderId] ?? updated.folderId;
    }
    updated.meta = touchMeta(updated.meta);
    return updated;
  });

  return { payload: clone, idRemap: idMap };
}

function normalizeExport(payload: CollectionExport): CollectionExport {
  const normalized = structuredClone(payload);
  ensureDocId(normalized.collection);
  normalized.folders = sortByOrder(normalized.folders.map((folder) => ensureDocId(folder)));
  normalized.requests = sortByOrder(normalized.requests.map((request) => ensureDocId(request)));
  return normalized;
}

function toExport(input: CollectionTree | CollectionExport): CollectionExport {
  if (!isCollectionTree(input)) {
    return input;
  }
  const { scriptTrust: _trust, ...collection } = input.collection;
  return {
    $id: COLLECTION_FORMAT,
    meta: collection.meta,
    collection,
    folders: input.folders,
    requests: input.requests,
  };
}

function isCollectionTree(value: unknown): value is CollectionTree {
  return Boolean(value && typeof value === "object" && !("$id" in value));
}

function validateCollectionDoc(
  doc: Partial<Collection>,
  path: string,
  errors: ValidationResult[]
): void {
  validateMeta(doc?.meta, `${path}.meta`, errors);
  validateRequiredString(doc?.id ?? doc?.meta?.id, `${path}.id`, errors);
  validateRequiredString(doc?.name, `${path}.name`, errors);
  validateNumber(doc?.order, `${path}.order`, errors);
  errors.push(...validateRows(doc?.variables, `${path}.variables`), ...validateInherited(doc, path, "collection"));
}

function validateFolderDoc(
  folder: Partial<Folder>,
  path: string,
  errors: ValidationResult[]
): void {
  validateMeta(folder?.meta, `${path}.meta`, errors);
  validateRequiredString(folder?.id ?? folder?.meta?.id, `${path}.id`, errors);
  validateRequiredString(folder?.collectionId, `${path}.collectionId`, errors);
  validateRequiredString(folder?.name, `${path}.name`, errors);
  validateNumber(folder?.order, `${path}.order`, errors);
  errors.push(...validateInherited(folder, path, "folder"));
}

function validateRequestDoc(
  request: Partial<RequestDoc>,
  path: string,
  errors: ValidationResult[]
): void {
  validateMeta(request?.meta, `${path}.meta`, errors);
  validateRequiredString(request?.id ?? request?.meta?.id, `${path}.id`, errors);
  validateRequiredString(request?.collectionId, `${path}.collectionId`, errors);
  validateRequiredString(request?.name, `${path}.name`, errors);
  errors.push(...validateRequestContent(request, path));
}

function validateMeta(meta: unknown, path: string, errors: ValidationResult[]): void {
  if (!meta || typeof meta !== "object") {
    errors.push({ path, message: "Meta must be an object." });
    return;
  }
  const m = meta as Partial<Record<"id" | "createdAt" | "updatedAt" | "version", unknown>>;
  validateRequiredString(m.id, `${path}.id`, errors);
  if (typeof m.createdAt !== "number") {
    errors.push({ path: `${path}.createdAt`, message: "createdAt must be a number." });
  }
  if (typeof m.updatedAt !== "number") {
    errors.push({ path: `${path}.updatedAt`, message: "updatedAt must be a number." });
  }
  if (m.version !== 1) {
    errors.push({ path: `${path}.version`, message: "version must equal 1." });
  }
}

function validateRequiredString(
  value: unknown,
  path: string,
  errors: ValidationResult[]
): void {
  if (typeof value !== "string" || !value.trim()) {
    errors.push({ path, message: "Value must be a non-empty string." });
  }
}

function validateNumber(value: unknown, path: string, errors: ValidationResult[]): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push({ path, message: "Value must be a number." });
  }
}

function safeParse(text: string): unknown {
  const parsed = parseJson(text);
  return parsed.ok ? parsed.value : null;
}

function touchMeta(meta: Collection["meta"]): Collection["meta"] {
  return { ...meta, updatedAt: Date.now() };
}

function ensureDocId<T extends { meta: { id: string }; id?: string }>(doc: T): T {
  if (!doc.id) {
    (doc as T & { id: string }).id = doc.meta.id;
  }
  return doc;
}
