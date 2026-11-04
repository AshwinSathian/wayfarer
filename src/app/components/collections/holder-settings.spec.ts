import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { emptyRequest, scriptDigest } from "@wayfarer/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { repositories, type Repositories } from "../../../testing/repositories";
import { CollectionsStore } from "../../services/collections-store";
import { TabsStorage } from "../../state/tabs-storage";
import { Tabs } from "../../state/tabs";
import { ComposerView } from "../composer/composer-view";
import type { VariableHolder } from "../variables/variable-rows";
import { HolderSettings } from "./holder-settings";

/** What the template calls as the editors and the route change. */
interface Edited {
  setScript(kind: "pre" | "post", text: string): void;
  setRoute(route: "bridge" | null): void;
}

// A collection's or a folder's settings in a tab (D5-e), over the real stores: each field is written as it is left.
describe("HolderSettings", () => {
  let collections: CollectionsStore;
  let idb: Repositories;
  let fixture: ComponentFixture<HolderSettings>;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    collections = TestBed.inject(CollectionsStore);
    idb = repositories();
    await collections.ensureLoaded();
  });

  afterEach(async () => {
    fixture?.destroy();
    await idb.resetDatabase();
  });

  async function open(target: { collectionId: string; folderId?: string }): Promise<HolderSettings & Edited> {
    fixture = TestBed.createComponent(HolderSettings);
    fixture.componentRef.setInput("holder", target);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance as unknown as HolderSettings & Edited;
  }

  const stored = (id: string) => collections.getCollectionTree(id)!;

  it("writes a collection's route and scripts with no Save, and its scripts written here run", async () => {
    const { meta } = await collections.createCollection({ name: "Shop" });
    const tab = await open({ collectionId: meta.id });

    tab.setScript("pre", "mine()");
    await tab.commit();
    tab.setRoute("bridge");
    await tab.commit();

    const tree = stored(meta.id);
    expect(tree.collection.scripts.pre).toBe("mine()");
    expect(tree.collection.route).toBe("bridge");
    expect(tree.collection.scriptTrust.approved).toContain(await scriptDigest("mine()"));
  });

  it("@claim:C-051 an edit of a script that is held, written as it is typed, does not let it run", async () => {
    const made = await collections.createCollection({ name: "Shop" });
    await collections.createRequest({ ...emptyRequest(), collectionId: made.meta.id, name: "Plain" });
    await collections.saveInherited(
      { collectionId: made.meta.id },
      { auth: { type: "none" }, scripts: { pre: "x()", post: "" } },
    );
    // As a file brings it: the collection is not reviewed.
    await collections.importCollection((await idb.collections.getCollectionExport(made.meta.id))!);
    const tab = await open({ collectionId: made.meta.id });

    for (const text of ["x();", "x();\ny()"]) {
      tab.setScript("pre", text);
      await tab.commit();
    }

    expect(stored(made.meta.id).collection.scripts.pre).toBe("x();\ny()");
    expect(stored(made.meta.id).collection.scriptTrust).toEqual({ trusted: false });
  });

  it("writes what was typed when the tab closes", async () => {
    const { meta } = await collections.createCollection({ name: "Shop" });
    const folder = await collections.createFolder({ collectionId: meta.id, name: "Admin" });
    const tab = await open({ collectionId: meta.id, folderId: folder.meta.id });
    tab.setScript("post", "after()");
    fixture.destroy();
    await expect.poll(() => stored(meta.id).folders[0].scripts.post).toBe("after()");
  });

  it("a variable typed in the rows is written to the folder as a change, with no Save", async () => {
    const { meta } = await collections.createCollection({ name: "Shop" });
    const folder = await collections.createFolder({ collectionId: meta.id, name: "Admin" });
    await collections.changeFolderVariables(folder.meta.id, [{ key: "kept", value: "1" }]);
    await open({ collectionId: meta.id, folderId: folder.meta.id });

    const holder = (fixture.componentInstance as unknown as { variables(): VariableHolder | null }).variables()!;
    const after = await holder.write([{ key: "region", value: "eu" }]);

    expect(stored(meta.id).folders[0].variables.map((row) => [row.key, row.value])).toEqual([
      ["kept", "1"],
      ["region", "eu"],
    ]);
    expect(after).toEqual(stored(meta.id).folders[0].variables);
  });

  it("says the holder is gone when it was deleted", async () => {
    const { meta } = await collections.createCollection({ name: "Shop" });
    await open({ collectionId: meta.id });
    await collections.deleteCollection(meta.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("This collection is no longer here");
  });
});

describe("ComposerView.openHolder", () => {
  it("opens one tab a holder, activates it again, and the tab is not stored", () => {
    TestBed.configureTestingModule({ providers: [ComposerView] });
    const view = TestBed.inject(ComposerView);
    const tabs = TestBed.inject(Tabs);
    const storage = TestBed.inject(TabsStorage) as unknown as { storable(): unknown[] };

    view.openHolder({ collectionId: "c1" });
    const first = tabs.active();
    view.openHolder({ collectionId: "c1", folderId: "f1" });
    expect(tabs.active()).not.toBe(first);
    view.openHolder({ collectionId: "c1" }, "token");

    expect(tabs.active()).toBe(first);
    expect(first.holder).toEqual({ collectionId: "c1" });
    expect(first.document).toBe(true);
    expect(first.reveal()).toEqual({ key: "token" });
    expect(tabs.tabs().filter((tab) => tab.holder)).toHaveLength(2);
    expect(storage.storable().some((tab) => (tab as { holder: unknown }).holder)).toBe(false);
  });
});
