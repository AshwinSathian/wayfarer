import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { Tabs } from "../../state/tabs";
import { ComposerHarness, makeRequestDoc, setupComposer } from "../../../testing/composer-setup";

describe("Composer: which tab a request goes into", () => {
  let component: ComposerHarness["component"];
  let view: ComposerHarness["view"];

  beforeEach(async () => {
    ({ component, view } = await setupComposer());
  });

  it("loadCollectionRequest opens a tab of its own while the open tab waits for a response or has a socket open", () => {
    const tabs = TestBed.inject(Tabs);
    const x = makeRequestDoc({ id: "x" });
    component.loadCollectionRequest(x);
    const first = tabs.active();
    first.loadingState.set(true);
    component.loadCollectionRequest(makeRequestDoc({ id: "y" }));
    expect(tabs.tabs().length).toBe(2);
    expect(first.bound()?.meta.id).toBe("x");

    first.loadingState.set(false);
    tabs.activate(first.id);
    first.socket.status.set("open");
    component.loadCollectionRequest(makeRequestDoc({ id: "z" }));
    expect(tabs.tabs().length).toBe(3);
    expect(first.bound()?.meta.id).toBe("x");
  });

  it("Duplicate tab on the Environments tab or a settings tab makes no second one", () => {
    const tabs = TestBed.inject(Tabs);
    view.openEnvironments();
    component.duplicateTab();
    view.openHolder({ collectionId: "c1" });
    component.duplicateTab();
    expect(tabs.tabs().filter((tab) => tab.environments).length).toBe(1);
    expect(tabs.tabs().filter((tab) => tab.holder).length).toBe(1);
  });
});
