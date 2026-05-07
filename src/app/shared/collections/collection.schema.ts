import { PastRequest } from "../../models/history.models";

const metaSchema = {
  type: "object",
  required: ["id", "createdAt", "updatedAt", "version"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
    version: { const: 1 },
  },
};

const idProperty = { type: "string", minLength: 1 };

const headersSchema = {
  type: "object",
  additionalProperties: { type: "string" },
};

const authSchema = {
  type: "object",
  required: ["type"],
  additionalProperties: true,
  properties: {
    type: {
      type: "string",
      enum: ["none", "basic", "bearer", "api-key"],
    },
  },
};

const testAssertionSchema = {
  type: "object",
  required: ["id", "target", "operator"],
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    target: { type: "string" },
    key: { type: "string" },
    operator: { type: "string" },
    expected: { type: "string" },
  },
};

const collectionSchema = {
  type: "object",
  required: ["id", "meta", "name", "order"],
  additionalProperties: false,
  properties: {
    id: idProperty,
    meta: metaSchema,
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    order: { type: "number" },
  },
};

const folderSchema = {
  type: "object",
  required: ["id", "meta", "collectionId", "name", "order"],
  additionalProperties: false,
  properties: {
    id: idProperty,
    meta: metaSchema,
    collectionId: { type: "string", minLength: 1 },
    parentFolderId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    order: { type: "number" },
  },
};

const requestSchema = {
  type: "object",
  required: ["id", "meta", "collectionId", "name", "order", "method", "url", "headers"],
  additionalProperties: false,
  properties: {
    id: idProperty,
    meta: metaSchema,
    collectionId: { type: "string", minLength: 1 },
    folderId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    order: { type: "number" },
    method: {
      type: "string",
      enum: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
      ] satisfies PastRequest["method"][],
    },
    url: { type: "string", minLength: 1 },
    params: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    headers: headersSchema,
    body: { type: ["object", "string", "number", "boolean", "null"] },
    vars: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    auth: authSchema,
    preRequestScript: { type: "string" },
    postRequestScript: { type: "string" },
    tests: {
      type: "array",
      items: testAssertionSchema,
    },
  },
};

const environmentSchema = {
  type: "object",
  required: ["id", "meta", "name", "vars", "order"],
  additionalProperties: false,
  properties: {
    id: idProperty,
    meta: metaSchema,
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    vars: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    order: { type: "number" },
  },
};

export const CollectionExportSchema = {
  $id: "https://api-sandbox.dev/schemas/collection-export.json",
  type: "object",
  additionalProperties: false,
  required: ["meta", "collection", "folders", "requests"],
  properties: {
    meta: metaSchema,
    collection: collectionSchema,
    folders: {
      type: "array",
      items: folderSchema,
    },
    requests: {
      type: "array",
      items: requestSchema,
    },
  },
} as const;

export const EnvironmentExportSchema = {
  $id: "https://api-sandbox.dev/schemas/environment-export.json",
  type: "object",
  additionalProperties: false,
  required: ["meta", "environments"],
  properties: {
    meta: metaSchema,
    environments: {
      type: "array",
      items: environmentSchema,
    },
  },
} as const;

// Backwards compatible aliases
export const COLLECTION_EXPORT_SCHEMA = CollectionExportSchema;
export const ENVIRONMENT_EXPORT_SCHEMA = EnvironmentExportSchema;
