import { describe, expect, it } from "vitest";
import { SHOP } from "../../test/export/postman-shop";
import type { EnvironmentDoc } from "../model/collection";
import { POSTMAN_COLLECTION_SCHEMA, postmanCollection, postmanEnvironment } from "./postman";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- the file is read as Postman would read it: by its keys.

const shop = () => postmanCollection(SHOP);
const top = (): Loose[] => shop().file["item"] as Loose[];
const named = (items: Loose[], name: string): Loose => items.find((item) => item["name"] === name) ?? {};
const admin = () => named(top(), "Admin");
const bodies = () => named(top(), "Bodies")["item"] as Loose[];

describe("postmanCollection: each thing is where Postman's v2.1 format puts it", () => {
  it("info names the schema, and carries the name and the description", () => {
    expect(shop().file["info"]).toEqual({ _postman_id: "shop", name: "Shop", description: "Every body mode, and auth and scripts at three levels.", schema: POSTMAN_COLLECTION_SCHEMA });
    expect(POSTMAN_COLLECTION_SCHEMA).toBe("https://schema.getpostman.com/json/collection/v2.1.0/collection.json");
  });

  it("folders are items that hold items, in each other, their folders before their requests", () => {
    expect(top().map((item) => item["name"])).toEqual(["Admin", "Bodies", "Inherit bearer"]);
    expect((admin()["item"] as Loose[]).map((item) => item["name"])).toEqual(["Deep", "JSON"]);
    expect((named(admin()["item"], "Deep")["item"] as Loose[]).map((item) => item["name"])).toEqual(["Form"]);
    expect(bodies().map((item) => item["name"])).toEqual(["Multipart", "File", "XML"]);
  });

  it("variables are the collection's `variable`, one that is switched off marked disabled", () => {
    expect(shop().file["variable"]).toEqual([
      { key: "greeting", value: "hello", type: "string" },
      { key: "token", value: "col-token", type: "string" },
      { key: "order", value: "", type: "string" },
      { key: "unused", value: "off", type: "string", disabled: true },
    ]);
  });

  it("auth at three levels: the collection's, a folder's, a request's; inherit is no entry, and none is noauth", () => {
    expect(shop().file["auth"]).toEqual({ type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] });
    expect(admin()["auth"]).toEqual({ type: "basic", basic: [{ key: "username", value: "admin", type: "string" }, { key: "password", value: "p@ss", type: "string" }] });
    expect(named(bodies(), "Multipart")["request"]["auth"]).toEqual({ type: "apikey", apikey: [{ key: "key", value: "X-Key", type: "string" }, { key: "value", value: "k-1", type: "string" }, { key: "in", value: "header", type: "string" }] });
    expect(named(bodies(), "XML")["request"]["auth"]["apikey"][2]).toEqual({ key: "in", value: "query", type: "string" });
    expect(named(bodies(), "File")["request"]["auth"]).toEqual({ type: "noauth" });
    expect(Object.hasOwn(named(top(), "Inherit bearer")["request"], "auth")).toBe(false);
    expect(Object.hasOwn(named(admin()["item"], "Deep"), "auth")).toBe(false);
  });

  it("scripts at three levels are events: prerequest and test, a line of the script per entry", () => {
    expect(shop().file["event"]).toEqual([
      { listen: "prerequest", script: { type: "text/javascript", exec: ['pm.collectionVariables.set("order", "c");'] } },
      { listen: "test", script: { type: "text/javascript", exec: ['pm.test("collection: the server answered 200", () => pm.response.to.have.status(200));'] } },
    ]);
    expect((admin()["event"] as Loose[]).map((event) => event["listen"])).toEqual(["prerequest", "test"]);
    expect(admin()["event"][1]["script"]["exec"]).toHaveLength(2);
    // A script that is blank is no event, and no scripts at all is no `event`.
    expect((named(admin()["item"], "Deep")["event"] as Loose[]).map((event) => event["listen"])).toEqual(["prerequest"]);
    expect((named(bodies(), "File")["event"] as Loose[]).map((event) => event["listen"])).toEqual(["test"]);
    expect(Object.hasOwn(named(top(), "Bodies"), "event")).toBe(false);
  });

  it("every body mode: raw with its language, urlencoded, formdata with a file by its name, file", () => {
    const body = (items: Loose[], name: string): Loose => named(items, name)["request"]["body"];
    expect(body(admin()["item"], "JSON")).toEqual({ mode: "raw", raw: '{"name":"{{greeting}}"}', options: { raw: { language: "json" } } });
    expect(body(named(admin()["item"], "Deep")["item"], "Form")).toEqual({
      mode: "urlencoded",
      urlencoded: [{ key: "q", value: "a b&c", type: "text" }, { key: "greeting", value: "{{greeting}}", type: "text" }, { key: "off", value: "1", type: "text", disabled: true }],
    });
    expect(body(bodies(), "Multipart")).toEqual({
      mode: "formdata",
      formdata: [{ key: "note", value: "with a file", type: "text" }, { key: "upload", type: "file", src: "pixel.png" }, { key: "left", value: "out", type: "text", disabled: true }],
    });
    expect(body(bodies(), "File")).toEqual({ mode: "file", file: { src: "pixel.png" } });
    expect(Object.hasOwn(named(top(), "Inherit bearer")["request"], "body")).toBe(false);
  });

  it("a file body's own type is a header, as it is on the wire; one the request names is left alone", () => {
    expect(named(bodies(), "File")["request"]["header"]).toEqual([{ key: "X-Order", value: "{{order}}" }, { key: "Content-Type", value: "image/png" }]);
    const file = SHOP.requests.find((doc) => doc.id === "file")!;
    const own = postmanCollection({ ...SHOP, folders: [], requests: [{ ...file, folderId: undefined, headers: [{ key: "content-type", value: "image/x-own", enabled: true }] }] });
    expect((own.file["item"] as Loose[])[0]["request"]["header"]).toEqual([{ key: "content-type", value: "image/x-own" }]);
  });

  it("the address is in parts, cut as text: a variable stays as typed, and a row switched off keeps its place in the query", () => {
    const inherit = named(top(), "Inherit bearer")["request"];
    expect(inherit["url"]).toEqual({
      raw: "{{base}}/echo?a=1&b=two%20words",
      host: ["{{base}}"],
      path: ["echo"],
      query: [{ key: "a", value: "1" }, { key: "c", value: "3", disabled: true }, { key: "b", value: "two%20words" }],
    });
    expect(inherit["header"]).toEqual([{ key: "X-Order", value: "{{order}}" }, { key: "X-Off", value: "1", disabled: true }]);
    expect(inherit["method"]).toBe("GET");
  });

  it.each([
    ["https://api.test:8443/v1/items/?q=1&flag&e=#top", { protocol: "https", host: ["api", "test"], port: "8443", path: ["v1", "items", ""], query: [{ key: "q", value: "1" }, { key: "flag", value: null }, { key: "e", value: "" }], hash: "top" }],
    ["http://user:p:w@host/a", { protocol: "http", auth: { user: "user", password: "p:w" }, host: ["host"], path: ["a"] }],
    ["{{scheme}}://{{host}}:{{port}}", { protocol: "{{scheme}}", host: ["{{host}}"], port: "{{port}}" }],
    ["http://[::1]:3000/x", { protocol: "http", host: ["[::1]"], port: "3000", path: ["x"] }],
    ["http://[::1]/x", { protocol: "http", host: ["[::1]"], path: ["x"] }],
    ["localhost/a://b", { host: ["localhost"], path: ["a:", "", "b"] }],
    ["", { host: [""] }],
  ])("the parts of %s", (raw, parts) => {
    const request = { ...SHOP.requests[0], folderId: undefined, url: raw, params: [] };
    expect((postmanCollection({ ...SHOP, folders: [], requests: [request] }).file["item"] as Loose[])[0]["request"]["url"]).toEqual({ raw, ...parts });
  });

  it("a query the Params rows do not mirror is written as the text has it: the text is what is sent", () => {
    const request = { ...SHOP.requests[0], folderId: undefined, url: "http://h/?x=1&y=2", params: [{ key: "stale", value: "row", enabled: true }, { key: "off", value: "", enabled: false }] };
    const { query } = (postmanCollection({ ...SHOP, folders: [], requests: [request] }).file["item"] as Loose[])[0]["request"]["url"];
    expect(query).toEqual([{ key: "x", value: "1" }, { key: "off", value: "", disabled: true }, { key: "y", value: "2" }]);
  });

  it("a folder's variables are written and noted; assertions and files are noted", () => {
    const form = SHOP.requests.find((doc) => doc.id === "form")!;
    const { file, notes } = postmanCollection({
      ...SHOP,
      folders: SHOP.folders.map((folder) => (folder.id === "deep" ? { ...folder, variables: [{ key: "inFolder", value: "v", enabled: true }] } : folder)),
      requests: [...SHOP.requests.filter((doc) => doc.id !== "form"), { ...form, tests: [{ id: "t", target: "status", operator: "equals", expected: "200" }] }],
    });
    expect(named((named(file["item"] as Loose[], "Admin")["item"] as Loose[]), "Deep")["variable"]).toEqual([{ key: "inFolder", value: "v", type: "string" }]);
    expect(notes).toEqual([
      { item: 'folder "Deep"', message: "Its variables are written, but Postman does not read a folder's variables: move them to the collection or to an environment there." },
      { item: 'request "Form"', message: "Its assertion is left out: Postman has tests only as scripts." },
      { item: 'request "Multipart"', message: "A file of its body is named, not included: choose it again in Postman." },
      { item: 'request "File"', message: "A file of its body is named, not included: choose it again in Postman." },
    ]);
    expect(shop().notes.map((note) => note.item)).toEqual(['request "Multipart"', 'request "File"']);
  });

  it("nothing is left out without a word: a folder or a request whose parent is not in the file, and folders that name each other, go to the top", () => {
    const [deep] = SHOP.folders.filter((folder) => folder.id === "deep");
    const loop = [{ ...deep, id: "a", name: "A", parentFolderId: "b" }, { ...deep, id: "b", name: "B", parentFolderId: "a" }];
    const lost = { ...SHOP.requests[0], id: "lost", name: "Lost", folderId: "gone" };
    const inLoop = { ...SHOP.requests[0], id: "in", name: "In the loop", folderId: "b" };
    const items = postmanCollection({ ...SHOP, folders: [{ ...deep, parentFolderId: "gone" }, ...loop], requests: [lost, inLoop] }).file["item"] as Loose[];

    expect(items.map((item) => item["name"])).toEqual(["A", "Deep", "Lost"]);
    expect(named(named(items, "A")["item"], "B")["item"].map((item: Loose) => item["name"])).toEqual(["In the loop"]);
  });

  it("writes what it is given: the same collection gives the same file", () => {
    expect(JSON.stringify(shop().file)).toBe(JSON.stringify(shop().file));
    expect(JSON.stringify(shop().file)).not.toContain("createdAt");
  });
});

describe("postmanEnvironment", () => {
  const environment: EnvironmentDoc = {
    id: "env-1",
    meta: { id: "env-1", createdAt: 0, updatedAt: 0, version: 1 },
    name: "Staging",
    order: 0,
    vars: [
      { key: "base", value: "https://staging.test", enabled: true },
      { key: "token", value: "{{$secret.abc-1}}", enabled: true },
      { key: "old", value: "x", enabled: false },
    ],
  };

  it("is a Postman environment: values with `enabled`, a protected variable of type secret with what the caller gives for its value", () => {
    expect(postmanEnvironment(environment, (text) => (text.includes("$secret") ? "" : text))).toEqual({
      id: "env-1",
      name: "Staging",
      values: [
        { key: "base", value: "https://staging.test", type: "default", enabled: true },
        { key: "token", value: "", type: "secret", enabled: true },
        { key: "old", value: "x", type: "default", enabled: false },
      ],
      _postman_variable_scope: "environment",
    });
  });
});
