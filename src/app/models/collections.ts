import type { RequestContent, Row } from "@wayfarer/core";

export type UUID = string;

export interface Meta {
  id: UUID;
  createdAt: number;
  updatedAt: number;
  version: 1;
}

export const META_VERSION: Meta["version"] = 1;

interface BaseDocument {
  id: UUID;
  meta: Meta;
}

export interface Collection extends BaseDocument {
  name: string;
  description?: string;
  order: number;
  /** Variables every request of the collection can use. An environment's variable of the same name wins. */
  variables: Row[];
  /** Whether this collection's scripts may run. True for one made here; an import is untrusted until approved (D6). */
  scriptTrust: { trusted: boolean };
}

export interface Folder extends BaseDocument {
  collectionId: UUID;
  parentFolderId?: UUID;
  name: string;
  order: number;
}

export interface RequestDoc extends BaseDocument, RequestContent {
  collectionId: UUID;
  folderId?: UUID;
  name: string;
  order: number;
}

/** What `createRequest` takes: where the request goes, and as much of its content as the caller has. */
export type NewRequest = Pick<RequestDoc, "collectionId" | "name"> &
  Partial<Pick<RequestDoc, "folderId" | "order"> & RequestContent>;

export type RequestPatch = Partial<Pick<RequestDoc, "name" | "folderId"> & RequestContent>;

export type CollectionId = UUID;
export type FolderId = UUID;
export type RequestDocId = UUID;

export const COLLECTION_FORMAT = "wayfarer/collection/2";

/** A collection file. Trust is not content: the file leaves it out and an import starts untrusted. */
export interface CollectionExport {
  $id: typeof COLLECTION_FORMAT;
  meta: Meta;
  collection: Omit<Collection, "scriptTrust">;
  folders: Folder[];
  requests: RequestDoc[];
}
