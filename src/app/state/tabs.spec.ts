import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { RequestSave } from "../services/request-save";
import { ScriptTrust } from "../services/script-trust";
import { TabState } from "./tab-state";
import { Tabs } from "./tabs";
import { WorkspaceStore } from "./workspace-store";
import { ComposerHarness, makeRequestDoc, setupComposer } from "../../testing/composer-setup";

// P5.1: the composer's tabs, before anything of them is stored.
describe("Tabs", () => {
  let tabs: Tabs;
  let store: WorkspaceStore;
  let component: ComposerHarness["component"];

  beforeEach(async () => {
    ({ store, component } = await setupComposer());
    tabs = TestBed.inject(Tabs);
  });

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

  it("while a send is in flight the open tab stays the open one", () => {
    const first = tabs.active();
    const second = new TabState();
    tabs.open(second);
    tabs.activate(first.id);
    first.loadingState.set(true);

    tabs.activate(second.id);
    tabs.open();
    tabs.close(first.id);

    expect(tabs.active()).toBe(first);
    expect(tabs.tabs()).toHaveLength(2);
  });
});
