import {
  Collection,
  CollectionExport,
  CollectionId,
  Folder,
  RequestDoc,
} from "../../models/collections.models";
import { CollectionTree } from "../../services/collections.service";

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
  const ordered = deepSort(payload);
  return JSON.stringify(ordered, null, 2);
}

export function validateCollection(
  input: string | object
): { ok: boolean; errors?: ValidationResult[]; payload?: CollectionExport } {
  const payload = typeof input === "string" ? safeParse(input) : input;
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      errors: [{ path: "root", message: "Collection export must be an object." }],
    };
  }

  const errors: ValidationResult[] = [];
  const value = payload as Partial<CollectionExport>;
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

export function parseCollectionImport(text: string): {
  payload?: CollectionExport;
  errors?: ValidationResult[];
} {
  const result = validateCollection(text);
  return result.ok ? { payload: normalizeExport(result.payload!) } : { errors: result.errors };
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

export function deepSort<T>(value: T): T {
  if (Array.isArray(value)) {
    const items = sortByOrder(
      value as unknown as { order?: number; meta?: { id?: string }; id?: string }[]
    );
    return items.map((item) => deepSort(item)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = deepSort(val);
    }
    return result as T;
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
  const clone = cloneExport(payload);
  const idMap: Record<string, string> = {};

  const newCollectionId = newId();
  const originalCollectionId = clone.collection.id ?? clone.collection.meta.id;
  idMap[originalCollectionId] = newCollectionId;
  clone.collection.id = newCollectionId;
  clone.collection.meta.id = newCollectionId;
  clone.collection.meta = touchMeta(clone.collection.meta);

  clone.folders = clone.folders.map((folder) => {
    const updated = cloneValue(folder);
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
    const updated = cloneValue(request);
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
  const normalized = cloneExport(payload);
  ensureDocId(normalized.collection);
  normalized.folders = sortByOrder(normalized.folders.map((folder) => ensureDocId(folder)));
  normalized.requests = sortByOrder(normalized.requests.map((request) => ensureDocId(request)));
  return normalized;
}

function toExport(input: CollectionTree | CollectionExport): CollectionExport {
  if (isCollectionTree(input)) {
    return {
      meta: input.collection.meta,
      collection: input.collection,
      folders: input.folders,
      requests: input.requests,
    };
  }
  return input;
}

function isCollectionTree(value: unknown): value is CollectionTree {
  return Boolean(
    value &&
      typeof value === "object" &&
      "collection" in value &&
      "folders" in value &&
      "requests" in value
  );
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
  validateRequiredString(request?.method, `${path}.method`, errors);
  validateRequiredString(request?.url, `${path}.url`, errors);
  if (typeof request?.headers !== "object" || request.headers === null) {
    errors.push({
      path: `${path}.headers`,
      message: "Headers must be an object of string pairs.",
    });
  }
}

function validateMeta(meta: unknown, path: string, errors: ValidationResult[]): void {
  if (!meta || typeof meta !== "object") {
    errors.push({ path, message: "Meta must be an object." });
    return;
  }
  const m = meta as Record<string, unknown>;
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

function cloneExport(payload: CollectionExport): CollectionExport {
  return cloneValue(payload);
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function newId(): CollectionId {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `col-${Math.random().toString(16).slice(2, 10)}-${Date.now().toString(16)}`;
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
