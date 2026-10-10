import { TestBed } from "@angular/core/testing";
import { emptyRequest, scriptDigest, type RequestContent } from "@wayfarer/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Idb } from "../data/idb";
import { CollectionsStore } from "./collections-store";
import { RequestSave } from "./request-save";
import { ScriptTrust } from "./script-trust";

// Script trust (P3.8, plan D6) over the real stores: which scripts may run
// is decided from what is stored, so the test stores it.
describe("ScriptTrust", () => {
  let trust: ScriptTrust;
  let collections: CollectionsStore;
  let saved: RequestSave;
  let idb: Idb;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    trust = TestBed.inject(ScriptTrust);
    collections = TestBed.inject(CollectionsStore);
    saved = TestBed.inject(RequestSave);
    idb = TestBed.inject(Idb);
    await collections.ensureLoaded();
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  const content = (pre: string, post = ""): RequestContent => ({ ...emptyRequest(), url: "https://api.test/", scripts: { pre, post } });
  const trustOf = (id: string) => collections.getCollectionTree(id)?.collection.scriptTrust;
  /** What `send` is told, once the signal the banner reads agrees with it (a digest is asynchronous). */
  const allowed = async () => {
    const answer = await trust.check();
    await expect
      .poll(() => {
        TestBed.tick();
        return trust.allowed();
      })
      .toBe(answer);
    return answer;
  };

  /** A collection as a file brings it: one request with a script, untrusted. */
  async function imported(script: string) {
    const made = await collections.createCollection({ name: "From a file" });
    await collections.createRequest({ ...content(script), collectionId: made.meta.id, name: "Login" });
    const file = (await idb.getCollectionExport(made.meta.id))!;
    await collections.importCollection(file);
    return collections.getCollectionTree(made.meta.id)!;
  }

  it("a request typed here, saved nowhere, runs its scripts", async () => {
    saved.bind(null);
    trust.openedHere();
    expect(await trust.check()).toBe(true);
    expect(await allowed()).toBe(true);
  });

  it("a script the user saves into a collection made here is approved there, by its digest", async () => {
    const collection = await collections.createCollection({ name: "Mine" });
    expect(trustOf(collection.meta.id)).toEqual({ trusted: true });

    saved.bind(null);
    saved.saveAsName.set("Login");
    saved.saveAsCollectionId.set(collection.meta.id);
    await saved.confirmSaveAs(content("pm.environment.set('a', '1');"), await trust.check());
    expect(trustOf(collection.meta.id)).toEqual({ trusted: true, approved: [await scriptDigest("pm.environment.set('a', '1');")] });
    expect(await allowed()).toBe(true);

    // An edit is the user's own too: the new text is approved when it is saved.
    await saved.save(content("pm.environment.set('a', '2');", "pm.test('t', () => {});"), await trust.check());
    expect(trustOf(collection.meta.id)?.approved).toHaveLength(3);
    expect(await allowed()).toBe(true);
  });

  it("@claim:C-051 an imported collection's script does not run until it is reviewed, and then it does", async () => {
    const tree = await imported("pm.environment.set('host', 'evil.test');");
    expect(tree.collection.scriptTrust).toEqual({ trusted: false });
    saved.bind(tree.requests[0]);
    trust.openedHere();
    expect(await allowed()).toBe(false);
    expect(trust.toReview()).toEqual([{ name: "Login", pre: "pm.environment.set('host', 'evil.test');", post: "" }]);

    await trust.approve();
    expect(trustOf(tree.collection.meta.id)).toEqual({ trusted: true, approved: [await scriptDigest("pm.environment.set('host', 'evil.test');")] });
    expect(await allowed()).toBe(true);
  });

  it("saving an unreviewed script does not approve it, here or in another collection", async () => {
    const tree = await imported("stolen()");
    const mine = await collections.createCollection({ name: "Mine" });
    saved.bind(tree.requests[0]);
    trust.openedHere();
    expect(await allowed()).toBe(false);

    await saved.save(content("stolen()"), await trust.check());
    expect(trustOf(tree.collection.meta.id)).toEqual({ trusted: false });

    saved.saveAsName.set("Copy");
    saved.saveAsCollectionId.set(mine.meta.id);
    await saved.confirmSaveAs(content("stolen()"), await trust.check());
    expect(trustOf(mine.meta.id)).toEqual({ trusted: true });
    // The copy is in a trusted collection and still does not run.
    expect(await allowed()).toBe(false);
  });

  it("@claim:C-051 a script that changed in storage by any other road does not run: only its own digest approves it", async () => {
    const collection = await collections.createCollection({ name: "Mine" });
    saved.bind(null);
    saved.saveAsName.set("Login");
    saved.saveAsCollectionId.set(collection.meta.id);
    await saved.confirmSaveAs(content("mine()"), true);
    const request = saved.loadedCollectionRequest()!;
    expect(await allowed()).toBe(true);

    // Written past the composer, as a future importer or another program could.
    await collections.updateRequest(request.meta.id, { scripts: { pre: "mine(); extra()", post: "" } });
    saved.bind(collections.getCollectionTree(collection.meta.id)!.requests[0]);
    expect(await allowed()).toBe(false);
  });

  it("importing over a reviewed collection makes it untrusted again", async () => {
    const tree = await imported("first()");
    saved.bind(tree.requests[0]);
    await trust.approve();
    expect(await allowed()).toBe(true);

    const file = (await idb.getCollectionExport(tree.collection.meta.id))!;
    file.requests[0].scripts.pre = "second()";
    await collections.importCollection(file);
    expect(trustOf(tree.collection.meta.id)).toEqual({ trusted: false });
    saved.bind(collections.getCollectionTree(tree.collection.meta.id)!.requests[0]);
    expect(await allowed()).toBe(false);
  });

  it("an edit never approves in a collection that is not trusted", async () => {
    const tree = await imported("first()");
    await collections.approveScripts(tree.collection.meta.id, ["0".repeat(64)], false);
    expect(trustOf(tree.collection.meta.id)).toEqual({ trusted: false });
  });

  it("a history entry's scripts wait for a review of their own; one without scripts does not", async () => {
    saved.bind(null);
    trust.openedFromHistory(content("", ""));
    expect(await allowed()).toBe(true);

    trust.openedFromHistory(content("fromThen()", "after()"));
    expect(await allowed()).toBe(false);
    expect(trust.toReview()).toEqual([{ name: "From history", pre: "fromThen()", post: "after()" }]);
    await trust.approve();
    expect(await allowed()).toBe(true);

    // The approval was for that entry: the next one asks again.
    trust.openedFromHistory(content("fromThen()"));
    expect(await allowed()).toBe(false);
  });
});
