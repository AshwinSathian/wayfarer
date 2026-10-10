import { TestBed } from "@angular/core/testing";
import type { Folder, OwnAuth } from "@wayfarer/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../../state/workspace-store";
import { inCollection, inFolder, rowsOf } from "../../../testing/request-fixtures";
import { ComposerHarness, JSON_HEADERS, buildEnvironment, jsonBytes, makeRequestDoc, meta, rows, setupComposer } from "../../../testing/composer-setup";
import { Composer } from "./composer";

// P4.9: what a request takes from its collection and its folders, as the request that leaves shows it.
describe("Composer: auth and variables inherited from the collection and its folders", () => {
  let component: Composer;
  let store: WorkspaceStore;
  let httpMock: ComposerHarness["httpMock"];
  let environmentsService: ComposerHarness["environmentsService"];
  let collectionsService: ComposerHarness["collectionsService"];
  let requestSave: ComposerHarness["requestSave"];

  beforeEach(async () => {
    ({ component, store, httpMock, environmentsService, collectionsService, requestSave } = await setupComposer());
  });

  afterEach(() => {
    httpMock.verify();
  });

  const folder = (id: string, fields: Partial<Folder> = {}): Folder => ({ id, meta: meta(id), collectionId: "c1", name: id, order: 1, ...inFolder, ...fields });
  const bearer = (token: string): OwnAuth => ({ type: "bearer", token });

  /** A collection with bearer auth, a folder in it and a folder in that one. */
  function tree(folders: Folder[]) {
    collectionsService.setTree([
      {
        collection: { id: "c1", meta: meta("c1"), name: "Shop", order: 1, variables: rowsOf({ who: "collection", where: "collection", token: "c-token" }), ...inCollection, auth: bearer("{{token}}"), scriptTrust: { trusted: true } },
        folders,
        requests: [],
      },
    ]);
  }

  async function sent(url = "https://api.test/"): Promise<{ headers: Headers }> {
    const pending = component.sendRequest();
    const req = httpMock.expectOne(url);
    req.flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await pending;
    return req.request;
  }

  it("@claim:C-019 a request set to inherit is sent with its collection's auth, its variables replaced", async () => {
    tree([]);
    requestSave.bind(makeRequestDoc({ collectionId: "c1" }));
    store.patch({ url: "https://api.test/", auth: { type: "inherit" } });

    expect((await sent()).headers.get("Authorization")).toBe("Bearer c-token");
    expect(store.inheritedAuth()).toEqual({ auth: bearer("{{token}}"), from: 'collection "Shop"' });
  });

  it("@claim:C-019 a folder's auth replaces the collection's, the nearest folder's first; a folder that inherits is passed through", async () => {
    tree([folder("outer", { auth: { type: "apikey", key: "X-Key", value: "outer-key", in: "header" } }), folder("inner", { parentFolderId: "outer" })]);
    requestSave.bind(makeRequestDoc({ collectionId: "c1", folderId: "inner" }));
    store.patch({ url: "https://api.test/", auth: { type: "inherit" } });

    const request = await sent();
    expect(request.headers.get("X-Key")).toBe("outer-key");
    expect(request.headers.get("Authorization")).toBeNull();
    expect(store.inheritedAuth().from).toBe('folder "outer"');
  });

  it("a request's own auth, and its own none, are not replaced by what is above it", async () => {
    tree([]);
    requestSave.bind(makeRequestDoc({ collectionId: "c1" }));
    store.patch({ url: "https://api.test/", auth: { type: "none" } });
    expect((await sent()).headers.get("Authorization")).toBeNull();

    store.patch({ auth: bearer("own") });
    expect((await sent()).headers.get("Authorization")).toBe("Bearer own");
  });

  it("a request in no collection that is set to inherit sends no auth", async () => {
    tree([]);
    store.patch({ url: "https://api.test/", auth: { type: "inherit" } });

    expect((await sent()).headers.get("Authorization")).toBeNull();
    expect(store.inheritedAuth()).toEqual({ auth: { type: "none" } });
  });

  it("an inherited credential is masked in history as the request's own is", async () => {
    tree([]);
    collectionsService.setTree(collectionsService.tree().map((entry) => ({ ...entry, collection: { ...entry.collection, auth: bearer("inherited-credential-1") } })));
    requestSave.bind(makeRequestDoc({ collectionId: "c1" }));
    store.patch({ url: "https://api.test/", auth: { type: "inherit" } });
    await sent();

    expect(store.responseExportContext()?.credentials).toContain("inherited-credential-1");
  });

  it("a folder's variable wins over the collection's and loses to the environment's, the nearest folder first", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ who: "environment" }));
    tree([folder("outer", { variables: rowsOf({ who: "outer", where: "outer", what: "outer" }) }), folder("inner", { parentFolderId: "outer", variables: rowsOf({ where: "inner" }) })]);
    requestSave.bind(makeRequestDoc({ collectionId: "c1", folderId: "inner" }));
    store.patch({ url: "https://api.test/", auth: { type: "none" }, headers: rows([{ key: "X-Scopes", value: "{{who}} {{where}} {{what}}" }]) });

    expect((await sent()).headers.get("X-Scopes")).toBe("environment inner outer");
    TestBed.tick();
    store.refreshVariablePreview();
    expect(store.variableTokens().map((token) => [token.key, token.source])).toEqual([
      ["who", "environment"],
      ["where", "folder"],
      ["what", "folder"],
    ]);
  });
});
