import { UiMenuItem } from "../../ui/menu-item";
import { UiTreeNode } from "../../ui/tree";
import { CollectionNodeData } from "./collection-tree-nodes";

/** Names of the sidebar actions a context menu / keyboard shortcut / command palette entry can dispatch through `handleAction`. */
export type CollectionNodeAction = "new-folder" | "new-request" | "rename" | "duplicate" | "delete" | "export" | "export-credentials" | "settings";

/**
 * Builds the right-click context menu for a collection/folder/request tree
 * node. Pure given the node and a dispatcher — the sidebar component still
 * owns what each action actually does (`handleAction`/`exportCollection`),
 * this just decides which actions are offered for which node type.
 */
export function buildContextItems(
  node: UiTreeNode<CollectionNodeData>,
  dispatch: (action: CollectionNodeAction, node: UiTreeNode<CollectionNodeData>) => void
): UiMenuItem[] {
  const data = node.data as CollectionNodeData;

  if (data.type === "collection") {
    return [
      { label: "New Folder", icon: "folder", command: () => dispatch("new-folder", node) },
      { label: "New Request", icon: "add", command: () => dispatch("new-request", node) },
      { label: "Settings", icon: "settings", command: () => dispatch("settings", node) },
      { separator: true },
      { label: "Rename", icon: "edit", command: () => dispatch("rename", node) },
      { label: "Duplicate", icon: "content_copy", command: () => dispatch("duplicate", node) },
      { label: "Export", icon: "download", command: () => dispatch("export", node) },
      { label: "Export with credentials", icon: "key", command: () => dispatch("export-credentials", node) },
      { label: "Delete", icon: "delete", command: () => dispatch("delete", node) },
    ];
  }

  if (data.type === "folder") {
    return [
      { label: "New Request", icon: "add", command: () => dispatch("new-request", node) },
      { label: "Settings", icon: "settings", command: () => dispatch("settings", node) },
      { label: "Rename", icon: "edit", command: () => dispatch("rename", node) },
      { label: "Duplicate", icon: "content_copy", command: () => dispatch("duplicate", node) },
      { label: "Delete", icon: "delete", command: () => dispatch("delete", node) },
    ];
  }

  return [
    { label: "Rename", icon: "edit", command: () => dispatch("rename", node) },
    { label: "Duplicate", icon: "content_copy", command: () => dispatch("duplicate", node) },
    { label: "Delete", icon: "delete", command: () => dispatch("delete", node) },
  ];
}
