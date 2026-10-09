import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../../state/workspace-store";
import { rowsOf } from "../../../testing/request-fixtures";
import { ComposerHarness, JSON_HEADERS, buildEnvironment, jsonBytes, makeRequestDoc, meta, rows, setupComposer } from "../../../testing/composer-setup";
import { Composer } from "./composer";

// P2.4: where a {{variable}} gets its value, as the request that leaves shows it.
describe("Composer: variable scopes", () => {
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

  function collection(id: string, variables: Record<string, string>) {
    return {
      collection: { id, meta: meta(id), name: id, order: 1, variables: rowsOf(variables), scriptTrust: { trusted: true } },
      folders: [],
      requests: [],
    };
  }

  async function sent(url: string): Promise<{ headers: Headers }> {
    const pending = component.sendRequest();
    const req = httpMock.expectOne(url);
    req.flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await pending;
    return req.request;
  }

  it("uses the environment's value, then the collection's, then the global one", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ all: "env" }));
    collectionsService.setTree([collection("c1", { all: "collection", two: "collection" }), collection("other", { three: "wrong" })]);
    environmentsService.globals.set(rowsOf({ all: "global", two: "global", three: "global" }));
    requestSave.bind(makeRequestDoc({ collectionId: "c1" }));

    store.patch({ url: "https://api.test/", headers: rows([{ key: "X-Scopes", value: "{{all}} {{two}} {{three}}" }]) });

    expect((await sent("https://api.test/")).headers.get("X-Scopes")).toBe("env collection global");
    // A panel does this after an edit; `patch` alone does not.
    store.refreshVariablePreview();
    expect(store.variableTokens().map((token) => [token.key, token.source, token.value])).toEqual([
      ["all", "environment", "env"],
      ["two", "collection", "collection"],
      ["three", "global", "global"],
    ]);
    expect(store.variableTokens()[0].environmentId).toBe("env-1");
    expect(store.missingVariableKeys()).toEqual([]);
  });

  it("a request that is not saved in a collection has no collection variables", async () => {
    collectionsService.setTree([collection("c1", { two: "collection" })]);
    store.patch({ url: "https://api.test/", headers: rows([{ key: "X-Two", value: "{{two}}" }]) });

    expect((await sent("https://api.test/")).headers.get("X-Two")).toBe("{{two}}");
    store.refreshVariablePreview();
    expect(store.missingVariableKeys()).toEqual(["two"]);

    // Opening a request of that collection changes the preview without an edit.
    requestSave.bind(makeRequestDoc({ collectionId: "c1" }));
    TestBed.tick();
    expect(store.variableTokens().map((token) => token.source)).toEqual(["collection"]);
  });

  it("resolves a value that holds a variable of another scope, and gives a new value for a dynamic one", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ url: "https://{{host}}/v1" }));
    environmentsService.globals.set(rowsOf({ host: "api.test" }));
    store.patch({ url: "{{url}}", headers: rows([{ key: "X-Id", value: "{{$guid}}" }]) });

    const request = await sent("https://api.test/v1");
    expect(request.headers.get("X-Id")).toMatch(/^[0-9a-f-]{36}$/);
    store.refreshVariablePreview();
    expect(store.variableTokens().map((token) => [token.key, token.source, token.value])).toEqual([
      ["url", "environment", "https://api.test/v1"],
      ["$guid", "dynamic", undefined],
    ]);
    expect(store.missingVariableKeys()).toEqual([]);
  });

  it("sends nothing when variables refer to each other in a circle, and says which", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ a: "{{b}}", b: "{{a}}" }));
    store.patch({ url: "https://api.test/", headers: rows([{ key: "X-A", value: "{{a}}" }]) });

    expect(await store.send()).toBe(false);

    expect(store.endpointError()).toBe("Variables refer to each other in a circle: {{a}} → {{b}} → {{a}}.");
    expect(store.loadingState()).toBe(false);
    store.refreshVariablePreview();
    expect(store.variableTokens()[0].error).toContain("in a circle");

    store.patch({ url: "https://{{a}}/" });
    expect(await store.send()).toBe(false);
    expect(store.endpointError()).toContain("in a circle");
    await store.copyAsCurl();
    expect(store.endpointError()).toContain("in a circle");
  });
});
