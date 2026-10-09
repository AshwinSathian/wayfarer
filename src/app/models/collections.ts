import type { V4Auth } from "@wayfarer/core";
import { PastRequest } from "./history";
import { TestAssertion } from "./test-assertion";

export type UUID = string;

export interface Meta {
  id: UUID;
  createdAt: number;
  updatedAt: number;
  version: 1;
}

export const META_VERSION: Meta["version"] = 1;

export type HttpAuthPlaceholder = V4Auth;
export type AuthType = V4Auth["type"];

interface BaseDocument {
  id: UUID;
  meta: Meta;
}

export interface Collection extends BaseDocument {
  name: string;
  description?: string;
  order: number;
}

export interface Folder extends BaseDocument {
  collectionId: UUID;
  parentFolderId?: UUID;
  name: string;
  order: number;
}

export interface RequestDoc extends BaseDocument {
  collectionId: UUID;
  folderId?: UUID;
  name: string;
  order: number;
  method: PastRequest["method"];
  url: string;
  params?: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
  vars?: Record<string, string>;
  auth?: HttpAuthPlaceholder;
  preRequestScript?: string;
  postRequestScript?: string;
  tests?: TestAssertion[];
}

export type CollectionId = UUID;
export type FolderId = UUID;
export type RequestDocId = UUID;

export interface CollectionExport {
  meta: Meta;
  collection: Collection;
  folders: Folder[];
  requests: RequestDoc[];
}
