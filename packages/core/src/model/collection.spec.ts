import { describe, expect, it } from "vitest";
import { treeInOrder } from "./collection";

const folder = (id: string, order: number, parentFolderId?: string) => ({ id, order, parentFolderId });
const request = (id: string, order: number, folderId?: string) => ({ id, order, folderId });
const ids = (tree: Parameters<typeof treeInOrder>[0]) =>
  treeInOrder(tree).map((item) => (item.kind === "request" ? item.request.id : item.folder.id));

describe("treeInOrder", () => {
  it("lists each folder before what it holds, folders and requests of one parent in their shared order", () => {
    const tree = {
      folders: [folder("orders", 0), folder("drafts", 1, "orders"), folder("customers", 1)],
      requests: [
        request("list", 0, "orders"),
        request("draft", 0, "drafts"),
        request("get-customer", 0, "customers"),
        request("health", 2),
      ],
    };
    expect(ids(tree)).toEqual(["orders", "list", "drafts", "draft", "customers", "get-customer", "health"]);
  });

  it("enters a folder once when folders name each other as parents, and keeps every item", () => {
    const tree = {
      folders: [folder("a", 0, "b"), folder("b", 0, "a"), folder("top", 0)],
      requests: [request("in-a", 0, "a"), request("lost", 0, "gone"), request("root", 1)],
    };
    const listed = ids(tree);
    expect(listed.slice(0, 2)).toEqual(["top", "root"]);
    expect([...listed].sort()).toEqual(["a", "b", "in-a", "lost", "root", "top"]);
    expect(new Set(listed).size).toBe(listed.length);
  });
});
