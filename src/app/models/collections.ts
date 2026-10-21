import type { Collection, Folder, RequestContent, RequestDoc } from "@wayfarer/core";

export {
  COLLECTION_FORMAT,
  type Collection,
  type CollectionExport,
  type Folder,
  type Meta,
  type RequestDoc,
} from "@wayfarer/core";

/** What `createRequest` takes: where the request goes, and as much of its content as the caller has. */
export type NewRequest = Pick<RequestDoc, "collectionId" | "name"> &
  Partial<Pick<RequestDoc, "folderId" | "order"> & RequestContent>;

export type RequestPatch = Partial<Pick<RequestDoc, "name" | "folderId"> & RequestContent>;

/** What a collection's or a folder's settings dialog saves. A collection's holds its route (P6.4); absent, it has none of its own. */
export type InheritedPatch<T extends Collection | Folder> = Pick<T, "auth" | "scripts"> &
  (T extends Collection ? Pick<Collection, "route"> : unknown);
