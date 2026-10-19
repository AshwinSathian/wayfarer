import { childrenInOrder } from "@wayfarer/core";
import { UiTreeNode } from "../../ui/tree";
import { Collection, Folder, RequestDoc } from "../../models/collections";
import { CollectionTree } from "../../services/collections-store";

/** Discriminated union backing every tree node's `data` in the collections sidebar. */
export type CollectionNodeData =
  | { type: "collection"; ref: Collection }
  | { type: "folder"; ref: Folder }
  | { type: "request"; ref: RequestDoc };

/** Pure conversion from the collections service's tree shape to `ui-tree` nodes. */
export function collectionsToNodes(trees: CollectionTree[]): UiTreeNode<CollectionNodeData>[] {
  return trees.map((entry) => toCollectionNode(entry));
}

function toCollectionNode(entry: CollectionTree): UiTreeNode<CollectionNodeData> {
  const drawn = new Set<Folder>();
  // A parent's folders and requests are one list, in the order they share: the order of a run.
  const children = (parent: string | undefined): UiTreeNode<CollectionNodeData>[] => childrenInOrder(entry, parent).flatMap((child) => (child.request ? [toRequestNode(child.request)] : drawn.has(child.folder) ? [] : [toFolderNode(child.folder)]));
  const toFolderNode = (folder: Folder): UiTreeNode<CollectionNodeData> => {
    drawn.add(folder);
    return { key: `folder:${folder.meta.id}`, label: folder.name, data: { type: "folder", ref: folder }, children: children(folder.meta.id) };
  };
  const top = children(undefined);
  // A folder whose parent is not there, or folders that name each other as parents (a file may hold either), go to the top: none is hidden.
  for (const folder of entry.folders) if (!drawn.has(folder)) top.push(toFolderNode(folder));
  return {
    key: `collection:${entry.collection.meta.id}`,
    label: entry.collection.name,
    data: { type: "collection", ref: entry.collection },
    expanded: true,
    children: top,
  };
}

/** A method as the tree shows it: the two long ones shortened, as Postman does. */
export function methodLabel(method: string): string {
  return method === "DELETE" ? "DEL" : method === "OPTIONS" ? "OPT" : method;
}

function toRequestNode(req: RequestDoc): UiTreeNode<CollectionNodeData> {
  const label = req.name || req.url || req.method;
  // The row shows its method before its name, and is named as it reads.
  return { key: `request:${req.meta.id}`, label, ariaLabel: `${methodLabel(req.method)} ${label}`, data: { type: "request", ref: req } };
}

export function isCollectionRef(ref: Collection | Folder | RequestDoc): ref is Collection {
  return !("collectionId" in ref) && !("method" in ref);
}

export function isFolderRef(ref: Collection | Folder | RequestDoc): ref is Folder {
  return "collectionId" in ref && !("method" in ref);
}
