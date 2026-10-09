import { TestBed } from "@angular/core/testing";
import { IdbCore } from "./idb-core";
import { historyEntry, jsonBody, rowsOf } from "../../testing/request-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Idb } from "./idb";
import type { SecretEnvelope, VaultRecord } from "@wayfarer/core";

// These run against the real IndexedDB of the test browser, through
// Idb, the facade the app calls: the stores, indexes and transactions
// are the ones users' data lives in.
describe("collections, folders and requests (real IndexedDB)", () => {
  let core: Idb;
  let collections: Idb;
  let folders: Idb;
  let requests: Idb;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    core = collections = folders = requests = TestBed.inject(Idb);
  });

  afterEach(async () => {
    await core.resetDatabase();
  });

  async function seed() {
    const collection = await collections.createCollection({ name: "  Billing  ", description: " invoices " });
    const folder = await folders.createFolder({ collectionId: collection.meta.id, name: " Auth " });
    const inFolder = await requests.createRequest({
      collectionId: collection.meta.id,
      folderId: folder.meta.id,
      name: " Login ",
      method: "POST",
      url: "https://api.test/login",
      headers: rowsOf({ "X-Trace": "1" }),
      body: jsonBody({ user: "a" }),
    });
    const atRoot = await requests.createRequest({
      collectionId: collection.meta.id,
      name: "Ping",
      method: "GET",
      url: "https://api.test/ping",
    });
    return { collection, folder, inFolder, atRoot };
  }

  it("creates collections, folders and requests with trimmed names and increasing order", async () => {
    const { collection, folder, inFolder, atRoot } = await seed();
    const second = await collections.createCollection({ name: "Second", description: "   " });

    expect(collection.name).toBe("Billing");
    expect(collection.description).toBe("invoices");
    expect(second.description).toBeUndefined();
    expect(second.order).toBeGreaterThan(collection.order);
    expect(folder.name).toBe("Auth");
    expect(inFolder.name).toBe("Login");
    expect(atRoot.headers).toEqual([]);
    expect(atRoot.order).toBeGreaterThan(inFolder.order);

    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Billing", "Second"]);
    expect((await folders.listFolders(collection.meta.id)).map((f) => f.name)).toEqual(["Auth"]);
    expect((await requests.listRequests(collection.meta.id)).map((r) => r.name)).toEqual(["Login", "Ping"]);
    expect(await requests.listRequests(second.meta.id)).toEqual([]);
  });

  it("renames and updates in place, and reports a missing id as null", async () => {
    const { collection, folder, inFolder } = await seed();

    const renamed = await collections.renameCollection(collection.meta.id, { name: " Payments ", description: "" });
    expect(renamed?.name).toBe("Payments");
    expect(renamed?.description).toBeUndefined();
    expect(renamed?.meta.updatedAt).toBeGreaterThanOrEqual(collection.meta.updatedAt);
    expect(renamed?.meta.createdAt).toBe(collection.meta.createdAt);

    expect((await folders.renameFolder(folder.meta.id, " Sessions "))?.name).toBe("Sessions");
    expect((await requests.renameRequest(inFolder.meta.id, " Sign in "))?.name).toBe("Sign in");

    const updated = await requests.updateRequest(inFolder.meta.id, {
      method: "PUT",
      url: "https://api.test/session",
      headers: rowsOf({ Accept: "application/json" }),
      body: jsonBody([1, 2]),
    });
    expect(updated).toMatchObject({ method: "PUT", url: "https://api.test/session", body: jsonBody([1, 2]) });
    const stored = (await requests.listRequests(collection.meta.id)).find((r) => r.meta.id === inFolder.meta.id);
    expect(stored?.headers).toEqual(rowsOf({ Accept: "application/json" }));
    expect(stored?.name).toBe("Sign in");

    expect(await collections.renameCollection("missing", { name: "x" })).toBeNull();
    expect(await folders.renameFolder("missing", "x")).toBeNull();
    expect(await requests.renameRequest("missing", "x")).toBeNull();
    expect(await requests.updateRequest("missing", { url: "x" })).toBeNull();
  });

  it("duplicates a request, a folder with its requests, and a whole collection, each under new ids", async () => {
    const { collection, folder, inFolder } = await seed();

    const requestCopy = await requests.duplicateRequest(inFolder.meta.id);
    expect(requestCopy?.meta.id).not.toBe(inFolder.meta.id);
    expect(requestCopy).toMatchObject({ url: inFolder.url, method: "POST", folderId: folder.meta.id });

    const folderCopy = await folders.duplicateFolder(folder.meta.id);
    expect(folderCopy?.name).toBe("Auth copy");
    const afterFolderCopy = await requests.listRequests(collection.meta.id);
    expect(afterFolderCopy.filter((r) => r.folderId === folderCopy?.meta.id)).toHaveLength(2);

    const collectionCopy = await collections.duplicateCollection(collection.meta.id);
    expect(collectionCopy?.meta.id).not.toBe(collection.meta.id);
    const copiedFolders = await folders.listFolders(collectionCopy!.meta.id);
    const copiedRequests = await requests.listRequests(collectionCopy!.meta.id);
    expect(copiedFolders).toHaveLength(2);
    expect(copiedRequests).toHaveLength(afterFolderCopy.length);
    // Requests in the copy point at the copy's folders, never at the original's.
    const copiedFolderIds = new Set(copiedFolders.map((f) => f.meta.id));
    for (const request of copiedRequests.filter((r) => r.folderId)) {
      expect(copiedFolderIds.has(request.folderId!)).toBe(true);
    }
    // The original is untouched.
    expect(await requests.listRequests(collection.meta.id)).toHaveLength(afterFolderCopy.length);

    expect(await requests.duplicateRequest("missing")).toBeNull();
    expect(await folders.duplicateFolder("missing")).toBeNull();
    expect(await collections.duplicateCollection("missing")).toBeNull();
  });

  it("reorders by the given order values and ignores unknown ids", async () => {
    const { collection, folder, inFolder, atRoot } = await seed();
    const second = await collections.createCollection({ name: "Second" });
    const otherFolder = await folders.createFolder({ collectionId: collection.meta.id, name: "Zed" });

    await collections.reorderCollections([
      { id: second.meta.id, order: 0 },
      { id: collection.meta.id, order: 1 },
      { id: "missing", order: 2 },
    ]);
    await folders.reorderFolders([
      { id: otherFolder.meta.id, order: 0 },
      { id: folder.meta.id, order: 1 },
      { id: "missing", order: 2 },
    ]);
    await requests.reorderRequests([
      { id: atRoot.meta.id, order: 0 },
      { id: inFolder.meta.id, order: 1 },
      { id: "missing", order: 2 },
    ]);

    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Second", "Billing"]);
    expect((await folders.listFolders(collection.meta.id)).map((f) => f.name)).toEqual(["Zed", "Auth"]);
    expect((await requests.listRequests(collection.meta.id)).map((r) => r.name)).toEqual(["Ping", "Login"]);
  });

  it("deleting a folder removes its requests; deleting a collection removes everything under it", async () => {
    const { collection, folder, atRoot } = await seed();
    const other = await collections.createCollection({ name: "Other" });
    const kept = await requests.createRequest({ collectionId: other.meta.id, name: "Kept", method: "GET", url: "/k" });

    await folders.deleteFolder(folder.meta.id);
    expect(await folders.listFolders(collection.meta.id)).toEqual([]);
    expect((await requests.listRequests(collection.meta.id)).map((r) => r.meta.id)).toEqual([atRoot.meta.id]);

    await requests.deleteRequest(atRoot.meta.id);
    expect(await requests.listRequests(collection.meta.id)).toEqual([]);

    await folders.createFolder({ collectionId: collection.meta.id, name: "Again" });
    await requests.createRequest({ collectionId: collection.meta.id, name: "Again", method: "GET", url: "/a" });
    await collections.deleteCollection(collection.meta.id);

    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Other"]);
    expect(await folders.listFolders(collection.meta.id)).toEqual([]);
    expect(await requests.listRequests(collection.meta.id)).toEqual([]);
    expect((await requests.listRequests(other.meta.id)).map((r) => r.meta.id)).toEqual([kept.meta.id]);
  });

  it("deleting a folder moves the folders inside it up one level, with their requests (F60)", async () => {
    const { collection } = await seed();
    const outer = await folders.createFolder({ collectionId: collection.meta.id, name: "Outer" });
    const middle = await folders.createFolder({ collectionId: collection.meta.id, name: "Middle", parentFolderId: outer.meta.id });
    const inner = await folders.createFolder({ collectionId: collection.meta.id, name: "Inner", parentFolderId: middle.meta.id });
    const kept = await requests.createRequest({ collectionId: collection.meta.id, folderId: inner.meta.id, name: "Kept", method: "GET", url: "/k" });

    await folders.deleteFolder(middle.meta.id);

    const left = await folders.listFolders(collection.meta.id);
    expect(left.map((f) => [f.name, f.parentFolderId])).toEqual([
      ["Auth", undefined],
      ["Outer", undefined],
      ["Inner", outer.meta.id],
    ]);
    expect((await requests.listRequests(collection.meta.id)).some((r) => r.meta.id === kept.meta.id)).toBe(true);

    // A folder at the top level: what was inside it is at the top level now.
    await folders.deleteFolder(outer.meta.id);
    expect((await folders.listFolders(collection.meta.id)).map((f) => [f.name, f.parentFolderId])).toEqual([
      ["Auth", undefined],
      ["Inner", undefined],
    ]);
  });

  it("exports a collection with its folders and requests, and imports it back over the existing one", async () => {
    const { collection, folder, inFolder, atRoot } = await seed();

    const exported = await collections.getCollectionExport(collection.meta.id);
    expect(exported?.collection.name).toBe("Billing");
    expect(exported?.folders.map((f) => f.meta.id)).toEqual([folder.meta.id]);
    expect(exported?.requests.map((r) => r.meta.id).sort()).toEqual([inFolder.meta.id, atRoot.meta.id].sort());
    expect(await collections.getCollectionExport("missing")).toBeNull();

    // Local changes made after the export are replaced by the import.
    await requests.createRequest({ collectionId: collection.meta.id, name: "Local only", method: "GET", url: "/l" });
    const payload = structuredClone(exported!);
    payload.collection.name = "Billing (imported)";
    // A request that points at a folder the file does not contain lands at the root.
    payload.requests[0].folderId = "folder-that-is-not-in-the-file";

    const imported = await collections.importCollectionExport(payload);

    expect(imported?.name).toBe("Billing (imported)");
    const after = await requests.listRequests(collection.meta.id);
    expect(after.map((r) => r.name).sort()).toEqual(["Login", "Ping"]);
    expect(after.find((r) => r.meta.id === payload.requests[0].meta.id)?.folderId).toBeUndefined();
    expect(await collections.listCollections()).toHaveLength(1);
  });

  describe("files of request bodies (P2.12)", () => {
    const fileIds = async () => {
      const db = (await TestBed.inject(IdbCore).getDatabase())!;
      return (await db.getAllKeys("files")).sort();
    };
    const blob = (text: string) => new Blob([text]);
    const binary = (fileId: string) => ({ mode: "binary" as const, binary: { fileId, fileName: `${fileId}.bin` } });

    it("stores a request's files with it, and deletes them with the request", async () => {
      const { collection } = await seed();
      const request = await requests.createRequest(
        { collectionId: collection.meta.id, name: "Upload", method: "POST", url: "https://api.test/up", body: binary("f-1") },
        new Map([["f-1", new Blob(["one"], { type: "text/x-one" })]])
      );
      expect(await fileIds()).toEqual(["f-1"]);
      const read = await requests.readFile("f-1");
      expect(await read?.text()).toBe("one");
      expect(read?.type).toBe("text/x-one");
      expect(await requests.readFile("missing")).toBeUndefined();

      await requests.deleteRequest(request.meta.id);

      expect(await fileIds()).toEqual([]);
    });

    it("keeps a file while any request names it, also in a part its mode does not send; drops it when the body lets go", async () => {
      const { collection, inFolder } = await seed();
      await requests.updateRequest(inFolder.meta.id, { body: binary("f-1") }, new Map([["f-1", blob("one")]]));
      const copy = (await requests.duplicateRequest(inFolder.meta.id))!;

      // The copy shares the file: deleting the original must not take it.
      await requests.deleteRequest(inFolder.meta.id);
      expect(await fileIds()).toEqual(["f-1"]);

      // Mode none, but the binary part is kept, so its file is too.
      await requests.updateRequest(copy.meta.id, { body: { ...binary("f-1"), mode: "none" } });
      expect(await fileIds()).toEqual(["f-1"]);

      await requests.updateRequest(copy.meta.id, { body: binary("f-2") }, new Map([["f-2", blob("two")]]));
      expect(await fileIds()).toEqual(["f-2"]);
      expect(collection.meta.id).toBeTruthy();
    });

    it("deletes the files of the requests that go with a folder or a collection", async () => {
      const { collection, folder, inFolder, atRoot } = await seed();
      await requests.updateRequest(inFolder.meta.id, { body: binary("in-folder") }, new Map([["in-folder", blob("a")]]));
      await requests.updateRequest(atRoot.meta.id, { body: binary("at-root") }, new Map([["at-root", blob("b")]]));

      await folders.deleteFolder(folder.meta.id);
      expect(await fileIds()).toEqual(["at-root"]);

      await collections.deleteCollection(collection.meta.id);
      expect(await fileIds()).toEqual([]);
    });

    it("an import over a collection keeps the files its requests still name and drops the rest", async () => {
      const { collection, inFolder, atRoot } = await seed();
      await requests.updateRequest(inFolder.meta.id, { body: binary("kept") }, new Map([["kept", blob("a")]]));
      await requests.updateRequest(atRoot.meta.id, { body: binary("dropped") }, new Map([["dropped", blob("b")]]));
      const file = (await collections.getCollectionExport(collection.meta.id))!;
      file.requests = file.requests.filter((request) => request.meta.id === inFolder.meta.id);

      await collections.importCollectionExport(file);

      expect(await fileIds()).toEqual(["kept"]);
    });
  });

  it("a collection starts with no variables; a change keeps what another change set; they go into an export and a copy (P2.4)", async () => {
    const { collection } = await seed();
    expect(collection.variables).toEqual([]);

    await Promise.all([
      collections.changeCollectionVariables(collection.meta.id, [{ key: "fromA", value: "1" }]),
      collections.changeCollectionVariables(collection.meta.id, [{ key: "fromB", value: "2" }]),
    ]);
    expect((await collections.listCollections())[0].variables).toEqual(rowsOf({ fromA: "1", fromB: "2" }));
    expect(await collections.changeCollectionVariables("missing", [{ key: "a", value: "1" }])).toBeNull();

    const file = (await collections.getCollectionExport(collection.meta.id))!;
    expect(file.collection.variables).toEqual(rowsOf({ fromA: "1", fromB: "2" }));
    const copy = await collections.duplicateCollection(collection.meta.id);
    expect(copy?.variables).toEqual(rowsOf({ fromA: "1", fromB: "2" }));
  });

  it("trusts the scripts of a collection made here, and not those of an imported one", async () => {
    const { collection } = await seed();
    expect(collection.scriptTrust).toEqual({ trusted: true });

    const file = (await collections.getCollectionExport(collection.meta.id))!;
    expect("scriptTrust" in file.collection).toBe(false);

    // Over the trusted original: the file's scripts replace the ones that were approved.
    expect((await collections.importCollectionExport(file))?.scriptTrust.trusted).toBe(false);
    expect((await collections.listCollections()).map((c) => c.scriptTrust.trusted)).toEqual([false]);

    const copy = structuredClone(file);
    copy.collection.id = copy.collection.meta.id = "copy-1";
    expect((await collections.importCollectionExport(copy, { duplicateAsNew: true }))?.scriptTrust.trusted).toBe(false);
  });

  it("refuses an import whose collection has no identifier, and writes nothing", async () => {
    const { collection } = await seed();
    const payload = structuredClone((await collections.getCollectionExport(collection.meta.id))!);
    const broken = { ...payload, collection: { ...payload.collection, id: "", meta: { ...payload.collection.meta, id: "" } } };

    await expect(collections.importCollectionExport(broken)).rejects.toThrow();
    expect((await collections.listCollections()).map((c) => c.name)).toEqual(["Billing"]);
  });
});

describe("environments (real IndexedDB)", () => {
  let core: Idb;
  let environments: Idb;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    core = environments = TestBed.inject(Idb);
  });

  afterEach(async () => {
    await core.resetDatabase();
  });

  // P2.10 (F37): each change reads the stored rows inside the transaction that writes them.
  it("keeps both changes when two are made at once to different variables of one environment", async () => {
    const env = await environments.createEnvironment({ name: "Shared", vars: rowsOf({ base: "kept" }) });

    // Neither is awaited before the other starts: whole-document writes from two stale copies would lose one.
    const [first, second] = await Promise.all([
      environments.changeEnvironment(env.meta.id, [{ key: "fromA", value: "1" }]),
      environments.changeEnvironment(env.meta.id, [{ key: "fromB", value: "2" }], { name: " Renamed " }),
    ]);

    const [stored] = await environments.listEnvironments();
    expect(stored.vars).toEqual(rowsOf({ base: "kept", fromA: "1", fromB: "2" }));
    expect(stored.name).toBe("Renamed");
    expect(first?.vars.map((row) => row.key)).toEqual(["base", "fromA"]);
    expect(second?.vars.map((row) => row.key)).toEqual(["base", "fromA", "fromB"]);

    await environments.changeEnvironment(env.meta.id, [{ key: "base", value: null }, { key: "fromA", value: "one" }]);
    expect((await environments.listEnvironments())[0].vars).toEqual(rowsOf({ fromA: "one", fromB: "2" }));
    expect(await environments.changeEnvironment("missing", [{ key: "a", value: "1" }])).toBeNull();
  });

  it("keeps both changes when two are made at once to different global variables, and tells the other tabs (P2.4)", async () => {
    const otherTab = new BroadcastChannel("wayfarer:data");
    const heard: string[][] = [];
    otherTab.addEventListener("message", (event: MessageEvent<{ stores: string[] }>) => heard.push(event.data.stores));
    try {
      expect(await environments.getGlobals()).toEqual([]);
      // Not awaited one after the other: each reads the stored rows inside its own transaction.
      await Promise.all([
        environments.changeGlobals([{ key: "fromA", value: "1" }]),
        environments.changeGlobals([{ key: "fromB", value: "2" }]),
      ]);
      expect(await environments.getGlobals()).toEqual(rowsOf({ fromA: "1", fromB: "2" }));
      expect(await environments.changeGlobals([{ key: "fromA", value: null }])).toEqual(rowsOf({ fromB: "2" }));
      await vi.waitFor(() => expect(heard).toEqual([["meta"], ["meta"], ["meta"]]));
      // The active environment lives in the same store, in another record.
      expect(await environments.getActiveEnvironmentId()).toBeNull();
    } finally {
      otherTab.close();
    }
  });

  it("tells the other tabs which stores a write touched, and not the tab that wrote", async () => {
    const otherTab = new BroadcastChannel("wayfarer:data");
    const heard: string[][] = [];
    otherTab.addEventListener("message", (event: MessageEvent<{ stores: string[] }>) => heard.push(event.data.stores));
    const heardHere: string[][] = [];
    environments.onChangeElsewhere((stores) => heardHere.push(stores));
    try {
      const env = await environments.createEnvironment({ name: "Dev" });
      await environments.setActiveEnvironment(env.meta.id);
      await environments.add(historyEntry({ url: "https://api.test", createdAt: 1 }), 500);
      await vi.waitFor(() => expect(heard).toEqual([["environments"], ["meta"], ["history"]]));
      expect(heardHere).toEqual([]);

      // A message from another tab reaches this one's listeners; anything that is not a list of names is ignored.
      otherTab.postMessage({ stores: ["requests", 7] });
      otherTab.postMessage({ stores: "requests" });
      otherTab.postMessage(null);
      await vi.waitFor(() => expect(heardHere).toEqual([["requests"]]));
    } finally {
      otherTab.close();
    }
  });

  it("creates, updates, duplicates and reorders environments", async () => {
    const dev = await environments.createEnvironment({ name: " Dev ", description: " local ", vars: rowsOf({ host: "localhost" }) });
    const prod = await environments.createEnvironment({ name: "Prod" });
    expect(dev).toMatchObject({ name: "Dev", description: "local", vars: rowsOf({ host: "localhost" }) });
    expect(prod.vars).toEqual([]);

    const updated = await environments.updateEnvironment(dev.meta.id, {
      name: " Development ",
      description: "  ",
      vars: rowsOf({ host: "127.0.0.1", port: "8080" }),
    });
    expect(updated).toMatchObject({ name: "Development", vars: rowsOf({ host: "127.0.0.1", port: "8080" }) });
    expect(updated?.description).toBeUndefined();
    expect(await environments.updateEnvironment("missing", { name: "x" })).toBeNull();

    const copy = await environments.duplicateEnvironment(dev.meta.id);
    expect(copy?.meta.id).not.toBe(dev.meta.id);
    expect(copy?.vars).toEqual(rowsOf({ host: "127.0.0.1", port: "8080" }));
    expect(await environments.duplicateEnvironment("missing")).toBeNull();

    await environments.reorderEnvironments([
      { id: prod.meta.id, order: 0 },
      { id: dev.meta.id, order: 1 },
      { id: copy!.meta.id, order: 2 },
      { id: "missing", order: 3 },
    ]);
    const listed = await environments.listEnvironments();
    expect(listed.map((e) => e.meta.id)).toEqual([prod.meta.id, dev.meta.id, copy!.meta.id]);
  });

  it("remembers the active environment and clears it when that environment is deleted", async () => {
    const dev = await environments.createEnvironment({ name: "Dev" });
    const prod = await environments.createEnvironment({ name: "Prod" });
    expect(await environments.getActiveEnvironmentId()).toBeNull();

    await environments.setActiveEnvironment(dev.meta.id);
    expect(await environments.getActiveEnvironmentId()).toBe(dev.meta.id);

    // Deleting another environment leaves the active one alone.
    await environments.deleteEnvironment(prod.meta.id);
    expect(await environments.getActiveEnvironmentId()).toBe(dev.meta.id);

    await environments.deleteEnvironment(dev.meta.id);
    expect(await environments.getActiveEnvironmentId()).toBeNull();
    expect(await environments.listEnvironments()).toEqual([]);
  });
});

describe("secrets (real IndexedDB)", () => {
  let core: Idb;
  let secrets: Idb;
  const envelope = (tag: string): SecretEnvelope => ({ v: 2, iv: `iv-${tag}`, ct: `ct-${tag}` });
  const vault = (tag: string): VaultRecord => ({ v: 2, kdf: { alg: "PBKDF2-SHA256", iterations: 600_000, salt: `salt-${tag}` }, wrappedDek: `dek-${tag}` });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    core = secrets = TestBed.inject(Idb);
  });

  afterEach(async () => {
    await core.resetDatabase();
  });

  it("stores and returns exactly the envelope it was given, per secret id", async () => {
    expect(await secrets.listSecrets()).toEqual([]);

    await secrets.writeCipher({ id: "s-1", name: "API key", environmentId: "env-1", envelope: envelope("a") });
    await secrets.writeCipher({ id: "s-2", name: "Token", envelope: envelope("b") });

    expect(await secrets.readCipher("s-1")).toEqual(envelope("a"));
    expect(await secrets.readCipher("s-2")).toEqual(envelope("b"));
    expect(await secrets.readCipher("missing")).toBeNull();

    const listed = await secrets.listSecrets();
    expect(listed.map((s) => [s.id, s.name, s.environmentId]).sort()).toEqual([
      ["s-1", "API key", "env-1"],
      ["s-2", "Token", undefined],
    ]);

    // Writing the same id again replaces the ciphertext.
    await secrets.writeCipher({ id: "s-1", name: "API key", environmentId: "env-1", envelope: envelope("c") });
    expect(await secrets.readCipher("s-1")).toEqual(envelope("c"));
    expect(await secrets.listSecrets()).toHaveLength(2);
  });

  it("keeps one vault record: the first is not overwritten by a second, and a change of passphrase needs one to change (P2.6)", async () => {
    expect(await secrets.readVault()).toBeNull();
    // A change of passphrase with no vault writes nothing.
    expect(await secrets.writeVault(vault("x"), true)).toBe(false);
    expect(await secrets.readVault()).toBeNull();

    // Two tabs choosing a passphrase at once: one record is kept, and each is told which.
    const made = await Promise.all([secrets.writeVault(vault("a"), false), secrets.writeVault(vault("b"), false)]);
    expect(made).toEqual([true, false]);
    expect(await secrets.readVault()).toEqual(vault("a"));

    expect(await secrets.writeVault(vault("rotated"), true)).toBe(true);
    expect(await secrets.readVault()).toEqual(vault("rotated"));
    // The record shares its store with the active environment and the globals, and leaves them alone.
    expect(await secrets.getActiveEnvironmentId()).toBeNull();
    expect(await secrets.getGlobals()).toEqual([]);
  });

  it("writes the secrets of a vault file in one transaction, each under its id", async () => {
    await secrets.writeCipher({ id: "s-1", name: "Old name", envelope: envelope("old") });
    await secrets.writeSecrets([
      { id: "s-1", name: "API key", environmentId: "env-1", envelope: envelope("a") },
      { id: "s-2", name: "Token", envelope: envelope("b") },
    ]);
    expect((await secrets.listSecrets()).map((s) => [s.id, s.name, s.environmentId, s.envelope]).sort()).toEqual([
      ["s-1", "API key", "env-1", envelope("a")],
      ["s-2", "Token", undefined, envelope("b")],
    ]);
  });

  it("renames without touching the ciphertext, keeps the old name for a blank one, and deletes", async () => {
    await secrets.writeCipher({ id: "s-1", name: "API key", envelope: envelope("a") });

    expect((await secrets.renameSecret("s-1", "  Stripe key "))?.name).toBe("Stripe key");
    expect((await secrets.renameSecret("s-1", "   "))?.name).toBe("Stripe key");
    expect(await secrets.renameSecret("missing", "x")).toBeNull();
    expect(await secrets.readCipher("s-1")).toEqual(envelope("a"));

    await secrets.deleteSecret("s-1");
    expect(await secrets.readCipher("s-1")).toBeNull();
    expect(await secrets.listSecrets()).toEqual([]);
  });
});

describe("history (real IndexedDB)", () => {
  let idb: Idb;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    idb = TestBed.inject(Idb);
  });

  afterEach(async () => {
    await idb.resetDatabase();
  });

  it("returns entries newest first with what they recorded, and deletes one or all", async () => {
    const first = await idb.add(historyEntry({ url: "https://api.test/a", createdAt: 100, status: 200 }), 500);
    const second = await idb.add(historyEntry({ method: "POST", url: "https://api.test/b", createdAt: 200, template: { body: jsonBody({ x: 1 }) } }), 500);
    const third = await idb.add(historyEntry({ url: "https://api.test/a", createdAt: 300, error: "Network error" }), 500);
    expect(new Set([first, second, third]).size).toBe(3);

    expect((await idb.getLatest()).map((h) => h.createdAt)).toEqual([300, 200, 100]);
    expect((await idb.getLatest(2)).map((h) => h.createdAt)).toEqual([300, 200]);
    expect(await idb.get(second!)).toMatchObject({
      sent: { method: "POST", url: "https://api.test/b" },
      template: { method: "POST", url: "https://api.test/b", body: jsonBody({ x: 1 }) },
      route: "direct",
    });
    expect(await idb.get(first!)).toMatchObject({ response: { status: 200 } });
    expect(await idb.get(9999)).toBeNull();

    await idb.delete(second!);
    expect((await idb.getLatest()).map((h) => h.createdAt)).toEqual([300, 100]);

    await idb.clear();
    expect(await idb.getLatest()).toEqual([]);
  });
});
