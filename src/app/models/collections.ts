import type { Collection, Folder, Meta, RequestContent, RequestDoc } from "@wayfarer/core";

export { COLLECTION_FORMAT, type Collection, type CollectionExport, type Folder, type Meta, type RequestDoc } from "@wayfarer/core";

export type UUID = string;

export const META_VERSION: Meta["version"] = 1;

/** What `createRequest` takes: where the request goes, and as much of its content as the caller has. */
export type NewRequest = Pick<RequestDoc, "collectionId" | "name"> &
  Partial<Pick<RequestDoc, "folderId" | "order"> & RequestContent>;

export type RequestPatch = Partial<Pick<RequestDoc, "name" | "folderId"> & RequestContent>;

/** What a collection or a folder holds for the requests in it, besides its variables (P4.9). */
export type InheritedPatch<T extends Collection | Folder> = Pick<T, "auth" | "scripts">;

export type CollectionId = UUID;
export type FolderId = UUID;
export type RequestDocId = UUID;
