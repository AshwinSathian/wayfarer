import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestSave } from "../services/request-save";
import { ScriptTrust } from "../services/script-trust";
import { Tabs } from "./tabs";
import { WorkspaceStore } from "./workspace-store";
import { ComposerHarness, JSON_HEADERS, jsonBytes, makeRequestDoc, meta, setupComposer } from "../../testing/composer-setup";
import { inCollection, rowsOf } from "../../testing/request-fixtures";

// P5.1: the composer's tabs, before anything of them is stored.
describe("Tabs", () => {
  let tabs: Tabs;
  let store: WorkspaceStore;
  let component: ComposerHarness["component"];
  let httpMock: ComposerHarness["httpMock"];
  let collectionsService: ComposerHarness["collectionsService"];

  beforeEach(async () => {
    ({ store, component, httpMock, collectionsService } = await setupComposer());
    tabs = TestBed.inject(Tabs);
  });

  afterEach(() => httpMock.verify());

  it("starts with one empty tab that is not dirty", () => {
    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.active().dirty()).toBe(false);
    expect(store.draft().url).toBe("");
  });

  it("a tab keeps its own request, error and response", () => {
    const first = tabs.active();
    store.patch({ url: "https://one.test" });
    store.endpointError.set("first tab's error");
    first.responseData.set("first tab's body");

    tabs.open();
    expect(tabs.tabs()).toHaveLength(2);
    expect(store.draft().url).toBe("");
    expect(store.endpointError()).toBe("");
    expect(store.responseData()).toBe("");
    store.patch({ url: "https://two.test" });

    tabs.activate(first.id);
    expect(store.draft().url).toBe("https://one.test");
    expect(store.endpointError()).toBe("first tab's error");
    expect(store.responseData()).toBe("first tab's body");
  });

  it("a tab is dirty once its request differs from what it was opened with, and clean again when it does not", () => {
    store.setUrl("https://one.test?a=1");
    expect(tabs.active().dirty()).toBe(true);
    store.setUrl("");
    expect(tabs.active().dirty()).toBe(false);
  });

  it("a row edited in place makes the tab dirty once the panel has said so", () => {
    store.addTest();
    tabs.active().markClean();
    store.draft().tests[0].expected = "200";
    store.edited();
    expect(tabs.active().dirty()).toBe(true);
  });

  it("the saved request and the held scripts are the open tab's", () => {
    const saved = TestBed.inject(RequestSave);
    const trust = TestBed.inject(ScriptTrust);
    const first = tabs.active();
    trust.openedFromHistory({ ...store.snapshot(), scripts: { pre: "x()", post: "" } });
    expect(trust.check()).toBe(false);

    tabs.open();
    expect(trust.check()).toBe(true);
    expect(saved.loadedCollectionRequest()).toBeNull();

    tabs.activate(first.id);
    expect(trust.check()).toBe(false);
  });

  it("a copy of a tab whose scripts wait for a review waits too", () => {
    const trust = TestBed.inject(ScriptTrust);
    store.patch({ url: "https://one.test", scripts: { pre: "x()", post: "" } });
    trust.openedFromHistory(store.snapshot());

    tabs.open(tabs.active().copy());

    expect(tabs.tabs()).toHaveLength(2);
    expect(store.draft().url).toBe("https://one.test");
    expect(tabs.active().dirty()).toBe(true);
    expect(trust.check()).toBe(false);
  });

  it("a saved request opens in the open tab when that holds nothing unsaved, and in a tab of its own when it does", () => {
    component.loadCollectionRequest(makeRequestDoc({ id: "one", url: "https://one.test" }));
    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.active().dirty()).toBe(false);

    component.loadCollectionRequest(makeRequestDoc({ id: "two", url: "https://two.test" }));
    expect(tabs.tabs()).toHaveLength(1);
    expect(store.draft().url).toBe("https://two.test");

    store.setUrl("https://two.test/edited");
    component.loadCollectionRequest(makeRequestDoc({ id: "three", url: "https://three.test" }));
    expect(tabs.tabs()).toHaveLength(2);
    expect(store.draft().url).toBe("https://three.test");
    expect(tabs.tabs()[0].draft().url).toBe("https://two.test/edited");
  });

  it("a saved request that is open in a tab goes to that tab, with what was changed in it", () => {
    const doc = makeRequestDoc({ id: "one", url: "https://one.test" });
    component.loadCollectionRequest(doc);
    store.setUrl("https://one.test/edited");
    tabs.open();

    component.loadCollectionRequest(doc);

    expect(tabs.tabs()).toHaveLength(2);
    expect(tabs.active()).toBe(tabs.tabs()[0]);
    expect(store.draft().url).toBe("https://one.test/edited");
  });

  it("closing the open tab opens the one after it, or the one before", () => {
    const [a] = tabs.tabs();
    tabs.open();
    const b = tabs.active();
    tabs.open();
    const c = tabs.active();

    tabs.activate(b.id);
    tabs.close(b.id);
    expect(tabs.active()).toBe(c);
    tabs.close(c.id);
    expect(tabs.active()).toBe(a);
  });

  it("closing the last tab leaves a new, empty one", () => {
    const only = tabs.active();
    store.patch({ url: "https://one.test" });
    tabs.close(only.id);
    expect(tabs.tabs()).toHaveLength(1);
    expect(tabs.active()).not.toBe(only);
    expect(store.draft().url).toBe("");
  });

  // A send holds the tab it was started in (session 5B): the open tab may change while it is on its way.
  it("a response goes to the tab that sent the request, whichever tab is open when it arrives", async () => {
    const first = tabs.active();
    store.setUrl("https://one.test/items");
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne("https://one.test/items"));

    tabs.open();
    const second = tabs.active();
    expect(second).not.toBe(first);
    expect(first.loadingState()).toBe(true);
    expect(store.loadingState()).toBe(false);

    httpMock.expectOne("https://one.test/items").flush(jsonBytes({ from: "one" }), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    expect(await sent).toBe(true);

    expect(first.loadingState()).toBe(false);
    expect(first.responseStatusCode()).toBe(200);
    expect(first.responseData()).toContain('"from"');
    expect(first.historyKey()).toBe(1);
    expect(second.responseStatusCode()).toBeUndefined();
    expect(second.responseData()).toBe("");
    expect(second.draft().responseId).toBeUndefined();
  });

  it("a request is built with the variables of the tab that sent it, when another tab is open by then", async () => {
    // A script that waits for a review: the send asks for its digest first, so the request is built a moment after the click.
    const doc = makeRequestDoc({ id: "one", url: "{{host}}/items", headers: [], scripts: { pre: "x()", post: "" } });
    collectionsService.setTree([
      { collection: { id: "c1", meta: meta("c1"), name: "c1", order: 1, variables: rowsOf({ host: "https://one.test" }), ...inCollection, scriptTrust: { trusted: false } }, folders: [], requests: [doc] },
    ]);
    component.loadCollectionRequest(doc);
    const first = tabs.active();

    const sent = store.send();
    tabs.open();
    await vi.waitFor(() => httpMock.expectOne("https://one.test/items").flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS }));
    expect(await sent).toBe(true);

    expect(first.scriptsSkipped()).toBe(true);
    expect(first.responseStatusCode()).toBe(200);
    expect(tabs.active().endpointError()).toBe("");
  });

  it("two tabs send at once and each gets its own response", async () => {
    const first = tabs.active();
    store.setUrl("https://one.test/a");
    const one = store.send();
    tabs.open();
    const second = tabs.active();
    store.setUrl("https://two.test/b");
    const two = store.send();

    await vi.waitFor(() => httpMock.expectOne("https://two.test/b").flush(null, { status: 204, statusText: "No Content" }));
    expect(await two).toBe(true);
    expect(second.responseStatusCode()).toBe(204);
    expect(first.loadingState()).toBe(true);

    httpMock.expectOne("https://one.test/a").flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    expect(await one).toBe(true);
    expect(first.responseStatusCode()).toBe(200);
    expect(second.responseStatusCode()).toBe(204);
  });

  it("the timings shown are those of the open tab's last send, not of whichever tab sent last", async () => {
    const first = tabs.active();
    store.setUrl("https://one.test/a");
    const one = store.send();
    await vi.waitFor(() => httpMock.expectOne("https://one.test/a").flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS }));
    await one;
    expect(store.responseInspection()?.url).toBe("https://one.test/a");

    tabs.open();
    expect(store.responseInspection()).toBeNull();
    store.setUrl("https://two.test/b");
    const two = store.send();
    await vi.waitFor(() => httpMock.expectOne("https://two.test/b").flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS }));
    await two;
    expect(store.responseInspection()?.url).toBe("https://two.test/b");

    tabs.activate(first.id);
    expect(store.responseInspection()?.url).toBe("https://one.test/a");
  });

  it("closing a tab gives up on the request it has on its way", async () => {
    const first = tabs.active();
    store.setUrl("https://one.test/slow");
    const sent = store.send();
    await vi.waitFor(() => httpMock.expectOne("https://one.test/slow"));

    tabs.close(first.id);

    expect(await sent).toBe(true);
    expect(first.responseError()).toMatch(/cancel/i);
    expect(tabs.tabs()).not.toContain(first);
  });
});
