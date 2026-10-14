import type { CollectionExport, CollectionTree } from "../model/collection";
import { inCollection, inFolder, requestContent, rowsOf } from "../../test/request-fixtures";
import { importCollection, serializeDeterministic, validateCollection } from "./wayfarer-collection";
import { describe, it, expect } from "vitest";

describe("collection-io", () => {
  const tree = (): CollectionTree => ({
    collection: {
      id: "c2",
      meta: { id: "c2", createdAt: 1, updatedAt: 2 },
      name: "Sample",
      description: "Desc",
      order: 2,
      variables: [
        { key: "base", value: "https://api.test", enabled: true },
        { key: "off", value: "x", enabled: false },
        { key: "base", value: "second", enabled: true },
      ],
      auth: { type: "bearer", token: "{{token}}" },
      scripts: { pre: "pm.variables.set('from', 'collection')", post: "" },
      scriptTrust: { trusted: true },
    },
    folders: [
      {
        id: "f2",
        meta: { id: "f2", createdAt: 1, updatedAt: 2 },
        collectionId: "c2",
        name: "Folder B",
        order: 2,
        variables: [{ key: "base", value: "https://b.test", enabled: true }],
        auth: { type: "basic", username: "user", password: "{{password}}" },
        scripts: { pre: "", post: "pm.test('folder', () => {})" },
      },
      {
        id: "f1",
        meta: { id: "f1", createdAt: 1, updatedAt: 2 },
        collectionId: "c2",
        name: "Folder A",
        order: 1,
        ...inFolder,
      },
    ],
    requests: [
      {
        id: "r2",
        meta: { id: "r2", createdAt: 1, updatedAt: 2 },
        collectionId: "c2",
        name: "Request B",
        order: 2,
        ...requestContent({
          method: "POST",
          url: "{{base}}/b?x=1",
          params: rowsOf({ x: "1" }),
          // Not in alphabetical order, one name twice, one row switched off.
          headers: [
            { key: "X-Zeta", value: "1", enabled: true },
            { key: "Accept", value: "text/plain", enabled: false },
            { key: "Accept", value: "*/*", enabled: true },
          ],
          body: { mode: "raw", raw: { language: "json", text: '{ "n": {{count}},\n  "b": 1, "a": 2 }' } },
          auth: { type: "apikey", key: "X-Key", value: "{{key}}", in: "query" },
          scripts: { pre: "", post: "pm.test('ok', () => {})" },
          tests: [
            { id: "t-b", target: "status", operator: "equals", expected: "200" },
            { id: "t-a", target: "body", key: "data.id", operator: "exists" },
          ],
          settings: { timeoutMs: 500 },
        }),
      },
      {
        id: "r1",
        meta: { id: "r1", createdAt: 1, updatedAt: 2 },
        collectionId: "c2",
        name: "Request A",
        order: 1,
        ...requestContent({ url: "https://example-a.com" }),
      },
    ],
  });

  it("@claim:C-026 produces byte-identical output after import/export round-trip", () => {
    const firstExport = serializeDeterministic(tree());
    const importResult = importCollection(firstExport);
    expect(importResult.payload).toBeTruthy();
    const secondExport = serializeDeterministic(importResult.payload!);
    expect(secondExport).toBe(firstExport);
  });

  it("writes the file: its $id first, documents in order, and no trust flag", () => {
    const text = serializeDeterministic(tree());
    const file = JSON.parse(text) as CollectionExport;

    expect(text.startsWith('{\n  "$id": "wayfarer/collection",')).toBe(true);
    expect(file.folders.map((folder) => folder.name)).toEqual(["Folder A", "Folder B"]);
    expect(file.requests.map((request) => request.name)).toEqual(["Request A", "Request B"]);
    // Trust is this browser's decision about a collection, not part of the collection.
    expect(text).not.toContain("scriptTrust");
  });

  it("keeps header rows and assertions in the order they were written (F57)", () => {
    const request = (JSON.parse(serializeDeterministic(tree())) as CollectionExport).requests[1];

    expect(request.headers.map((row) => [row.key, row.value, row.enabled])).toEqual([
      ["X-Zeta", "1", true],
      ["Accept", "text/plain", false],
      ["Accept", "*/*", true],
    ]);
    expect(request.tests.map((test) => test.id)).toEqual(["t-b", "t-a"]);
    // The body is the user's text, not a re-serialised value.
    expect(request.body).toEqual({ mode: "raw", raw: { language: "json", text: '{ "n": {{count}},\n  "b": 1, "a": 2 }' } });
  });

  it("refuses a file without the $id this version writes, naming $id", () => {
    // A file of before 2.0: no $id, headers as an object.
    const formatOne = {
      meta: meta("export-1"),
      collection: { id: "col-1", meta: meta("col-1"), name: "Old", order: 1 },
      folders: [],
      requests: [{ id: "r-1", meta: meta("r-1"), collectionId: "col-1", name: "R", method: "GET", url: "https://a.test", headers: {}, order: 1 }],
    };

    expect(validateCollection(formatOne).errors).toEqual([
      { path: "$id", message: 'Not a Wayfarer collection file: "$id" must be "wayfarer/collection".' },
    ]);
    // A file of 2.4.0 or before has a numbered $id: there is no converter.
    expect(validateCollection({ ...validExport(), $id: "wayfarer/collection/3" }).errors).toEqual([
      { path: "$id", message: 'Not a Wayfarer collection file: "$id" must be "wayfarer/collection".' },
    ]);
    expect(validateCollection({ ...validExport(), $id: "wayfarer/collection/2" }).errors?.[0].path).toBe("$id");
  });

  it("rejects invalid payloads with helpful errors", () => {
    const invalid = validateCollection("null");
    expect(invalid.ok).toBe(false);
    expect(invalid.errors?.[0].path).toBe("root");

    const valid = validateCollection({
      $id: "wayfarer/collection",
      meta: { id: "export-1", createdAt: 1, updatedAt: 1 },
      collection: {
        id: "col-1",
        meta: { id: "col-1", createdAt: 1, updatedAt: 1 },
        name: "Valid",
        order: 1,
        variables: [],
        ...inCollection,
      },
      folders: [],
      requests: [],
    });
    expect(valid.ok).toBe(true);
  });

  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
  const validExport = () => ({
    $id: "wayfarer/collection" as const,
    meta: meta("export-1"),
    collection: { id: "col-1", meta: meta("col-1"), name: "Billing", order: 1, variables: [], ...inCollection },
    folders: [
      { id: "f-parent", meta: meta("f-parent"), collectionId: "col-1", name: "Parent", order: 1, ...inFolder },
      { id: "f-child", meta: meta("f-child"), collectionId: "col-1", parentFolderId: "f-parent", name: "Child", order: 2, ...inFolder },
    ] as CollectionExport["folders"],
    requests: [
      { id: "r-1", meta: meta("r-1"), collectionId: "col-1", folderId: "f-child", name: "Login", order: 1, ...requestContent({ method: "POST", url: "https://api.test/login" }) },
      { id: "r-2", meta: meta("r-2"), collectionId: "col-1", name: "Ping", order: 2, ...requestContent({ url: "https://api.test/ping" }) },
    ],
  });

  it("names every problem in a malformed file by its path", () => {
    const broken = {
      $id: "wayfarer/collection",
      meta: { id: "export-1", createdAt: "yesterday", updatedAt: 1 },
      collection: { meta: meta(""), name: "", order: "first" },
      folders: [{ id: "f-1", meta: "nope", name: "Folder", order: 1 }],
      requests: [{ id: "r-1", meta: meta("r-1"), collectionId: "col-1", name: "R", method: "", url: "", headers: null, order: 1 }],
    };

    const result = validateCollection(broken);

    expect(result.ok).toBe(false);
    const paths = result.errors!.map((e) => e.path);
    for (const path of [
      "meta.createdAt",
      "collection.id",
      "collection.name",
      "collection.order",
      "collection.variables",
      "collection.auth",
      "collection.scripts",
      "folders[0].meta",
      "folders[0].collectionId",
      "folders[0].auth",
      "folders[0].scripts",
      "folders[0].variables",
      "requests[0].method",
      "requests[0].url",
      "requests[0].headers",
    ]) {
      expect(paths, `missing error for ${path}`).toContain(path);
    }
  });

  it("takes a collection's route (P6.4), and refuses one the app does not write", () => {
    const file = (route: unknown) => ({
      $id: "wayfarer/collection",
      meta: meta("m"),
      collection: { id: "col-1", meta: meta("col-1"), name: "C", order: 1, variables: [], ...inCollection, route },
      folders: [],
      requests: [],
    });

    expect(validateCollection(file("bridge")).ok).toBe(true);
    expect(validateCollection(file("proxy")).errors?.map((e) => e.path)).toEqual(["collection.route"]);
    const { route: _none, ...without } = file(undefined).collection;
    expect(validateCollection({ ...file(undefined), collection: without }).ok).toBe(true);
  });

  it("rejects a request whose method is not one of the HTTP verbs the app sends", () => {
    const result = validateCollection({
      $id: "wayfarer/collection",
      meta: meta("m"),
      collection: { id: "col-1", meta: meta("col-1"), name: "C", order: 1, variables: [], ...inCollection },
      folders: [],
      requests: [{ id: "r-1", meta: meta("r-1"), collectionId: "col-1", name: "R", order: 1, ...requestContent({ url: "https://a.test" }), method: "GET; rm -rf ~" }],
    });

    expect(result.errors?.map((e) => e.path)).toEqual(["requests[0].method"]);
  });

  it("rejects a file whose blocks are missing or of the wrong shape", () => {
    expect(validateCollection("{not json").ok).toBe(false);
    expect(validateCollection("42").ok).toBe(false);

    const paths = validateCollection({ $id: "wayfarer/collection", folders: "none", requests: {} }).errors!.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["collection", "folders", "requests", "meta"]));

    expect(importCollection({ $id: "wayfarer/collection", folders: [], requests: [] }).errors?.length).toBeGreaterThan(0);
    expect(importCollection({ $id: "wayfarer/collection", folders: [], requests: [] }).payload).toBeUndefined();
  });

  it("plans an overwrite that keeps every id when importing over the original", () => {
    const result = importCollection(JSON.stringify(validExport()));

    expect(result.errors).toBeUndefined();
    expect(result.idRemap).toBeUndefined();
    expect(result.summary).toEqual({ folders: 2, requests: 2 });
    expect(result.plan).toEqual([
      { type: "collection", name: "Billing", id: "col-1", action: "overwrite" },
      { type: "folder", name: "Parent", id: "f-parent", action: "overwrite" },
      { type: "folder", name: "Child", id: "f-child", action: "overwrite" },
      { type: "request", name: "Login", id: "r-1", action: "overwrite" },
      { type: "request", name: "Ping", id: "r-2", action: "overwrite" },
    ]);
  });

  it("F73: a copy keeps a folder in its parent when the folder comes before the parent in the file's order", () => {
    // A child at place 0 in its parent, and the parent at place 1 at the top: the child is read first.
    const source = validExport();
    const parent = source.folders.find((folder) => folder.name !== "Child")!;
    const child = source.folders.find((folder) => folder.name === "Child")!;
    parent.order = 1;
    child.order = 0;
    const payload = importCollection(source, { duplicateAsNew: true }).payload!;

    const copied = payload.folders.find((folder) => folder.name === "Child")!;
    expect(copied.parentFolderId).toBe(payload.folders.find((folder) => folder.name === parent.name)!.id);
    expect(payload.folders.map((folder) => folder.id)).toContain(copied.parentFolderId);
  });

  it("a copy leaves a parent the file does not hold as the text it is, whatever it spells", () => {
    const source = validExport();
    source.folders.find((folder) => folder.name === "Child")!.parentFolderId = "constructor";

    expect(importCollection(source, { duplicateAsNew: true }).payload!.folders.find((folder) => folder.name === "Child")!.parentFolderId).toBe("constructor");
  });

  it("gives everything a new id when importing as a copy, and keeps the tree connected", () => {
    const source = validExport();
    const result = importCollection(source, { duplicateAsNew: true });
    const payload = result.payload!;
    const remap = result.idRemap!;

    expect(Object.keys(remap).sort()).toEqual(["col-1", "f-child", "f-parent", "r-1", "r-2"]);
    expect(new Set(Object.values(remap)).size).toBe(5);
    for (const [oldId, newId] of Object.entries(remap)) expect(newId).not.toBe(oldId);

    expect(payload.collection.id).toBe(remap["col-1"]);
    expect(payload.collection.meta.id).toBe(remap["col-1"]);
    expect(payload.folders.every((f) => f.collectionId === remap["col-1"])).toBe(true);
    expect(payload.requests.every((r) => r.collectionId === remap["col-1"])).toBe(true);
    // Parent/child and request/folder links follow the new ids.
    expect(payload.folders.find((f) => f.name === "Child")?.parentFolderId).toBe(remap["f-parent"]);
    expect(payload.requests.find((r) => r.name === "Login")?.folderId).toBe(remap["f-child"]);
    expect(payload.requests.find((r) => r.name === "Ping")?.folderId).toBeUndefined();
    expect(result.plan!.every((entry) => entry.action === "create")).toBe(true);

    // The caller's object is not modified.
    expect(source.collection.id).toBe("col-1");
    expect(source.folders[1].parentFolderId).toBe("f-parent");
  });
});
