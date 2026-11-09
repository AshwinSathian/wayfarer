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

  it("keeps a folder and a request that share an id, and a second item with an id already listed", () => {
    // The review lists what Trust approves: an item left out by its id would be approved unseen.
    const tree = {
      folders: [folder("x", 0)],
      requests: [request("x", 1), request("x", 0, "x"), request("dup", 2), request("dup", 0, "missing")],
    };
    expect(treeInOrder(tree)).toHaveLength(5);
  });

  it("reads each item once, not once per folder: 20,000 folders of one request each in well under a second", () => {
    const count = 20_000;
    const tree = {
      folders: Array.from({ length: count }, (_, i) => folder(`f${i}`, i)),
      requests: Array.from({ length: count }, (_, i) => request(`r${i}`, 0, `f${i}`)),
    };
    const started = performance.now();
    expect(treeInOrder(tree)).toHaveLength(2 * count);
    // Four seconds when every folder filtered the whole tree for its children.
    expect(performance.now() - started).toBeLessThan(500);
  });
});
