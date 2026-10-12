import { TestBed } from "@angular/core/testing";
import { scriptDigest } from "@wayfarer/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoredTab } from "../data/idb-schema";
import { TabsRepository } from "../data/tabs-repository";
import { ScriptTrust } from "../services/script-trust";
import { makeRequestDoc, meta, setupComposer, type ComposerHarness } from "../../testing/composer-setup";
import { Tabs } from "./tabs";
import { TabsStorage } from "./tabs-storage";
import { WorkspaceStore } from "./workspace-store";

/** The `tabs` store, in memory: what was written, and what a read gives. */
class TabsRepositoryFake {
  records = new Map<string, StoredTab>();
  writes = 0;
  readAll = async (): Promise<StoredTab[]> => [...this.records.values()].sort((a, b) => a.order - b.order).map((record) => structuredClone(record));
  write = async (put: StoredTab[], remove: string[]): Promise<void> => {
    this.writes++;
    for (const record of put) this.records.set(record.id, structuredClone(record));
    for (const id of remove) this.records.delete(id);
  };
}

// P5.1, slice 2: what of a tab is stored, and what a stored tab is when it is read again.
describe("TabsStorage", () => {
  let repository: TabsRepositoryFake;
  let storage: TabsStorage;
  let tabs: Tabs;
  let store: WorkspaceStore;
  let harness: ComposerHarness;

  const record = (id: string, change: Partial<StoredTab> = {}): StoredTab => {
    const draft = { ...store.snapshot(), url: `https://${id}.test` };
    return { id, order: 0, draft, baseline: JSON.stringify(draft), scripts: [], ...change };
  };

  beforeEach(async () => {
    repository = new TabsRepositoryFake();
    harness = await setupComposer([{ provide: TabsRepository, useValue: repository }]);
    ({ store } = harness);
    tabs = TestBed.inject(Tabs);
    storage = TestBed.inject(TabsStorage);
  });

  it("stores a tab once it holds something, as a saved request is stored, with whether it is unsaved", async () => {
    await storage.start();
    store.setUrl("https://one.test?a=1");
    store.patch({ auth: { type: "bearer", token: "{{$secret.id-1}}" } });
    await storage.flush();

    const [stored] = await repository.readAll();
    expect(stored.id).toBe(tabs.active().id);
    expect(stored.draft.url).toBe("https://one.test?a=1");
    expect(stored.draft.auth).toEqual({ type: "bearer", token: "{{$secret.id-1}}" });
    expect(stored.draft).not.toHaveProperty("responseId");
    expect(JSON.stringify(stored.draft)).not.toBe(stored.baseline);
  });

  it("writes nothing when nothing changed, and removes a closed tab's record", async () => {
    await storage.start();
    store.setUrl("https://one.test");
    tabs.open();
    store.setUrl("https://two.test");
    await storage.flush();
    expect(repository.records.size).toBe(2);
    const writes = repository.writes;

    await storage.flush();
    expect(repository.writes).toBe(writes);

    tabs.close(tabs.active().id);
    await storage.flush();
    expect([...repository.records.values()].map((stored) => stored.draft.url)).toEqual(["https://one.test"]);
  });

  it("stores an edit of any tab by itself, a moment after it: also of a tab after one that was edited before", async () => {
    await storage.start();
    const first = tabs.active();
    tabs.open();
    const second = tabs.active();
    await storage.flush();

    // The first tab alone changes, and is stored.
    first.draft.update((draft) => ({ ...draft, url: "https://first.test" }));
    await vi.waitFor(() => expect(repository.records.get(first.id)?.draft.url).toBe("https://first.test"));
    // Then the second alone.
    second.draft.update((draft) => ({ ...draft, url: "https://second.test" }));
    await vi.waitFor(() => expect(repository.records.get(second.id)?.draft.url).toBe("https://second.test"), { timeout: 2000 });
  });

  it("stores the digest of each script that may run, and none of a script that waits for a review", async () => {
    await storage.start();
    store.patch({ url: "https://one.test", scripts: { pre: "typed()", post: "" } });
    await storage.flush();
    expect((await repository.readAll())[0].scripts).toEqual([await scriptDigest("typed()")]);

    TestBed.inject(ScriptTrust).openedFromHistory(store.snapshot());
    await storage.flush();
    expect((await repository.readAll())[0].scripts).toEqual([]);
  });

  it("restores the tabs in their order, unsaved ones as unsaved, in place of the empty tab the page started with", async () => {
    const clean = record("one");
    const edited = record("two", { order: 1 });
    edited.draft.url = "https://two.test/edited";
    repository.records.set("two", edited).set("one", clean);

    await storage.start();

    expect(tabs.tabs().map((tab) => tab.id)).toEqual(["one", "two"]);
    expect(tabs.tabs().map((tab) => tab.dirty())).toEqual([false, true]);
    expect(tabs.tabs()[1].draft().url).toBe("https://two.test/edited");
    // Reading them back wrote nothing.
    await storage.flush();
    expect(repository.writes).toBe(0);
  });

  it("a restored script runs when its digest was stored with the tab, and waits for a review when it was not", async () => {
    const trust = TestBed.inject(ScriptTrust);
    const typed = record("one");
    typed.draft.scripts = { pre: "typed()", post: "" };
    typed.scripts = [await scriptDigest("typed()")];
    const changed = record("two", { order: 1, scripts: typed.scripts });
    changed.draft.scripts = { pre: "putThereByWhoKnows()", post: "" };
    repository.records.set("one", typed).set("two", changed);

    await storage.start();

    const [first, second] = tabs.tabs();
    expect(trust.check([], first)).toBe(true);
    expect(trust.check([], second)).toBe(false);
    tabs.activate(second.id);
    expect(trust.toReview()).toEqual([{ kind: "request", name: "This tab, as it was stored", pre: "putThereByWhoKnows()", post: "" }]);
  });

  it("a restored tab of a saved request is bound to it again, and the collection decides about scripts it did not change", async () => {
    const doc = makeRequestDoc({ id: "r-9", scripts: { pre: "saved()", post: "" } });
    const collection = { id: "c1", meta: meta("c1"), name: "Imported", order: 0, variables: [], auth: { type: "none" as const }, scripts: { pre: "", post: "" }, scriptTrust: { trusted: false } };
    harness.collectionsService.setTree([{ collection, folders: [], requests: [doc] }]);
    const bound = record("one", { requestId: "r-9" });
    bound.draft.scripts = { pre: "saved()", post: "" };
    repository.records.set("one", bound).set("gone", record("gone", { order: 1, requestId: "no-such-request" }));

    await storage.start();

    const [first, second] = tabs.tabs();
    expect(first.bound()?.meta.id).toBe("r-9");
    // Not held by the tab: the collection's list is what says no.
    expect(first.heldScripts()).toBeNull();
    expect(await TestBed.inject(ScriptTrust).check()).toBe(false);
    expect(second.bound()).toBeNull();
  });

  it("takes what another browser tab stored, but not over a change of its own that is not stored yet", async () => {
    await storage.start();
    store.setUrl("https://mine.test");
    await storage.flush();
    const id = tabs.active().id;

    // The other browser tab changed this tab and opened one.
    const theirs = (await repository.readAll())[0];
    theirs.draft.url = "https://theirs.test";
    repository.records.set(id, theirs).set("new", record("new", { order: 1 }));
    await storage.changedElsewhere();
    expect(store.draft().url).toBe("https://theirs.test");
    expect(tabs.tabs().map((tab) => tab.id)).toEqual([id, "new"]);
    expect(tabs.active().id).toBe(id);

    // It changes the tab again while this one holds an edit that is not stored yet: this one's stays, and is what is stored next.
    store.setUrl("https://mine.test/typing");
    theirs.draft.url = "https://theirs.test/again";
    repository.records.set(id, theirs);
    await storage.changedElsewhere();
    expect(store.draft().url).toBe("https://mine.test/typing");
    await storage.flush();
    expect(repository.records.get(id)?.draft.url).toBe("https://mine.test/typing");

    // It closed the other tab.
    repository.records.delete("new");
    await storage.changedElsewhere();
    expect(tabs.tabs().map((tab) => tab.id)).toEqual([id]);
  });
});
