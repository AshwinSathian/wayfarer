import { describe, expect, it } from "vitest";
import type { Folder } from "../model/collection";
import type { AuthConfig } from "../model/request";
import { ancestorsOf, folderChain, type Collection } from "../model/collection";
import { effectiveAuth } from "./request-auth";

const inherit: AuthConfig = { type: "inherit" };
const bearer = (token: string): AuthConfig => ({ type: "bearer", token });
const from = (name: string, auth: AuthConfig) => ({ name, auth });

describe("effectiveAuth: collection, then folders from the outside in, then the request", () => {
  it("1. a request's own auth is used, whatever is above it", () => {
    expect(effectiveAuth(bearer("own"), [from("C", bearer("c"))])).toEqual({ auth: bearer("own") });
  });

  it("2. a request set to none sends none: none is not inherit", () => {
    expect(effectiveAuth({ type: "none" }, [from("C", bearer("c"))])).toEqual({ auth: { type: "none" } });
  });

  it("3. a request that inherits and is in no collection sends none", () => {
    expect(effectiveAuth(inherit, [])).toEqual({ auth: { type: "none" } });
  });

  it("4. a request that inherits takes its collection's auth", () => {
    expect(effectiveAuth(inherit, [from("C", bearer("c"))])).toEqual({ auth: bearer("c"), from: "C" });
  });

  it("5. a folder's auth replaces the collection's", () => {
    expect(effectiveAuth(inherit, [from("C", bearer("c")), from("F", bearer("f"))])).toEqual({ auth: bearer("f"), from: "F" });
  });

  it("6. a folder that inherits is passed through", () => {
    expect(effectiveAuth(inherit, [from("C", bearer("c")), from("F", inherit)])).toEqual({ auth: bearer("c"), from: "C" });
  });

  it("7. of several folders the nearest that does not inherit wins", () => {
    const chain = [from("C", bearer("c")), from("Outer", bearer("outer")), from("Middle", { type: "basic", username: "u", password: "p" }), from("Inner", inherit)];
    expect(effectiveAuth(inherit, chain)).toEqual({ auth: { type: "basic", username: "u", password: "p" }, from: "Middle" });
  });

  it("8. a folder set to none stops there: the collection's auth is not sent", () => {
    expect(effectiveAuth(inherit, [from("C", bearer("c")), from("F", { type: "none" })])).toEqual({ auth: { type: "none" }, from: "F" });
  });
});

describe("folderChain", () => {
  const folder = (id: string, parentFolderId?: string): Folder => ({
    id,
    meta: { id, createdAt: 0, updatedAt: 0, version: 1 },
    collectionId: "c",
    parentFolderId,
    name: id,
    order: 0,
    variables: [],
    auth: inherit,
    scripts: { pre: "", post: "" },
  });

  it("gives the folders a request is in, outermost first", () => {
    const folders = [folder("inner", "middle"), folder("outer"), folder("middle", "outer"), folder("other")];
    expect(folderChain(folders, "inner").map((entry) => entry.name)).toEqual(["outer", "middle", "inner"]);
    expect(folderChain(folders, undefined)).toEqual([]);
    expect(folderChain(folders, "gone")).toEqual([]);
  });

  it("ancestorsOf: the collection, then the folders from the outside in, each named as a person reads it", () => {
    const collection: Collection = { id: "c", meta: folder("c").meta, name: "Shop", order: 0, variables: [], auth: { type: "none" }, scripts: { pre: "", post: "" }, scriptTrust: { trusted: true } };
    const folders = [folder("inner", "outer"), folder("outer")];
    expect(ancestorsOf(collection, folders, "inner").map((ancestor) => ancestor.name)).toEqual(['collection "Shop"', 'folder "outer"', 'folder "inner"']);
    expect(ancestorsOf(collection, folders, undefined)).toEqual([{ name: 'collection "Shop"', variables: [], auth: { type: "none" }, scripts: { pre: "", post: "" } }]);
  });

  it("ends when a file's folders name each other as parents", () => {
    const folders = [folder("a", "b"), folder("b", "a")];
    expect(folderChain(folders, "a").map((entry) => entry.name)).toEqual(["b", "a"]);
  });
});
