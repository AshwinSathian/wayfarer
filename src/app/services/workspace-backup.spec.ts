import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Idb } from "../data/idb";
import { historyEntry, jsonBody, rowsOf } from "../../testing/request-fixtures";
import { SecretsVault } from "./secrets-vault";
import { WORKSPACE_FORMAT, WorkspaceBackup, WorkspaceFile, validateWorkspaceFile } from "./workspace-backup";

const KEYS = ["wayfarer:last-backup", "wayfarer:backup-reminder-from"];
const DAY = 24 * 60 * 60 * 1000;

// Over the real stores and the real vault: a backup is what a user's browser holds.
describe("WorkspaceBackup", () => {
  let idb: Idb;
  let backup: WorkspaceBackup;
  let vault: SecretsVault;

  function start(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    idb = TestBed.inject(Idb);
    backup = TestBed.inject(WorkspaceBackup);
    vault = TestBed.inject(SecretsVault);
  }

  beforeEach(() => {
    KEYS.forEach((key) => localStorage.removeItem(key));
    start();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vault.lock();
    await idb.resetDatabase();
    KEYS.forEach((key) => localStorage.removeItem(key));
  });

  /** A workspace with something in every store a backup holds. */
  async function seed(): Promise<string> {
    const collection = await idb.createCollection({ name: "Billing" });
    await idb.changeCollectionVariables(collection.meta.id, [{ key: "base", value: "https://api.test" }]);
    const folder = await idb.createFolder({ collectionId: collection.meta.id, name: "Auth" });
    await idb.createRequest({ collectionId: collection.meta.id, folderId: folder.meta.id, name: "Login", method: "POST", url: "{{base}}/login", body: jsonBody({ user: "a" }) });
    await vault.create("correct horse");
    const environment = await idb.createEnvironment({ name: "Dev" });
    const secret = await vault.saveSecret({ name: "token", environmentId: environment.meta.id, plaintext: "backup-plaintext-1" });
    await idb.updateEnvironment(environment.meta.id, { vars: rowsOf({ host: "localhost", token: `{{$secret.${secret}}}` }) });
    await idb.setActiveEnvironment(environment.meta.id);
    await idb.changeGlobals([{ key: "region", value: "eu" }]);
    await idb.add(historyEntry({ url: "https://api.test/sent", createdAt: 5, status: 200 }), 500);
    return secret;
  }

  it("a backup holds every store and no plaintext; after a reset, restore puts the same records back, with collections untrusted", async () => {
    const secret = await seed();
    const before = await idb.readWorkspace(true);

    const json = await backup.exportJson({ history: true });
    expect(json).not.toContain("backup-plaintext-1");
    expect(json).not.toContain("correct horse");
    const file = JSON.parse(json) as WorkspaceFile;
    expect(file.$id).toBe(WORKSPACE_FORMAT);
    expect(Object.keys(file.stores).sort()).toEqual(["collections", "environments", "folders", "history", "meta", "requests", "secrets"]);
    expect(file.stores.meta.map((record) => record.key).sort()).toEqual(["globals", "state", "vault"]);

    vault.lock();
    await idb.resetDatabase();
    start();
    expect(await backup.restore(json)).toEqual([]);

    const after = await idb.readWorkspace(true);
    // A file cannot grant itself trust (D6): that is the one difference.
    expect(before.collections[0].scriptTrust).toEqual({ trusted: true });
    expect(after).toEqual({ ...before, collections: before.collections.map((c) => ({ ...c, scriptTrust: { trusted: false } })) });
    // The vault came back with its passphrase and opens the secret it held.
    expect(await vault.unlock("correct horse")).toBe(true);
    expect(await vault.readSecret(secret)).toBe("backup-plaintext-1");
    expect(await idb.getActiveEnvironmentId()).toBe(before.environments[0].meta.id);
    expect(await idb.getGlobals()).toEqual(rowsOf({ region: "eu" }));
  });

  it("leaves history out unless asked, and a restore without history keeps the history that is here", async () => {
    await seed();
    const json = await backup.exportJson();
    expect(Object.keys((JSON.parse(json) as WorkspaceFile).stores)).not.toContain("history");

    await idb.add(historyEntry({ url: "https://api.test/later", createdAt: 9 }), 500);
    expect(await backup.restore(json)).toEqual([]);
    expect((await idb.getLatest()).map((entry) => entry.sent.url)).toEqual(["https://api.test/later", "https://api.test/sent"]);
  });

  it("replaces what is stored: a collection made after the backup is gone after the restore", async () => {
    await seed();
    const json = await backup.exportJson();
    await idb.createCollection({ name: "Made later" });

    expect(await backup.restore(json)).toEqual([]);
    expect((await idb.listCollections()).map((c) => c.name)).toEqual(["Billing"]);
  });

  it("refuses a file that is not what the app writes, says what is wrong, and changes nothing", async () => {
    await seed();
    const good = JSON.parse(await backup.exportJson({ history: true })) as WorkspaceFile;
    const before = JSON.stringify(await idb.readWorkspace(true));
    const broken = (change: (file: WorkspaceFile) => void): string => {
      const copy = structuredClone(good);
      change(copy);
      return JSON.stringify(copy);
    };

    expect(await backup.restore("{nope")).toEqual(["The file is not valid JSON."]);
    expect(await backup.restore(" ".repeat(10 * 1024 * 1024 + 1))).toEqual(["The file is larger than 10 MB."]);
    expect(await backup.restore("{}")).toEqual(['Not a Wayfarer workspace file: "$id" must be "wayfarer/workspace/3".']);
    expect(validateWorkspaceFile({ $id: WORKSPACE_FORMAT, stores: 5 })).toEqual(["stores: Value must be an object."]);
    expect(validateWorkspaceFile({ $id: WORKSPACE_FORMAT, stores: {} })).toHaveLength(6);

    const cases: [string, (file: WorkspaceFile) => void, RegExp][] = [
      ["a method that is not one", (f) => (f.stores.requests[0].method = "GET; rm -rf ~"), /requests\[0\]\.method/],
      ["a request of no collection", (f) => (f.stores.requests[0].collectionId = "elsewhere"), /belongs to a collection that is not in the file/],
      ["a collection without variables", (f) => delete (f.stores.collections[0] as { variables?: unknown }).variables, /collection\.variables/],
      ["a collection without trust", (f) => delete (f.stores.collections[0] as { scriptTrust?: unknown }).scriptTrust, /scriptTrust is missing/],
      ["an environment variable that is not a row", (f) => (f.stores.environments[0].vars = [{ key: 1 }] as never), /environments\[0\]\.vars/],
      ["a meta record the app does not keep", (f) => f.stores.meta.push({ key: "extra" } as never), /"extra" is not a record the app keeps/],
      ["an active environment that is not an id", (f) => ((f.stores.meta.find((r) => r.key === "state") as { activeEnvironmentId: unknown }).activeEnvironmentId = 7), /active environment/],
      ["globals that are not rows", (f) => ((f.stores.meta.find((r) => r.key === "globals") as { variables: unknown }).variables = "x"), /globals\.variables/],
      ["a vault with a cheap key derivation", (f) => ((f.stores.meta.find((r) => r.key === "vault") as { kdf: { iterations: number } }).kdf.iterations = 1), /vault\.kdf\.iterations/],
      ["secrets with no vault", (f) => (f.stores.meta = f.stores.meta.filter((r) => r.key !== "vault")), /vault: vault/],
      ["a secret whose meta names another", (f) => (f.stores.secrets[0].meta.id = "other"), /meta\.id must be the secret's id/],
      ["history without what was sent", (f) => delete (f.stores.history![0] as { sent?: unknown }).sent, /history\[0\]\.sent/],
      ["history with a bad route and time", (f) => Object.assign(f.stores.history![0], { route: "pigeon", createdAt: "now" }), /history\[0\]\.(createdAt|route)/],
      ["history whose request is not one", (f) => (f.stores.history![0].template = { method: "GET" } as never), /history\[0\]\.template/],
    ];
    for (const [name, change, expected] of cases) {
      const errors = await backup.restore(broken(change));
      expect(errors.join("\n"), name).toMatch(expected);
    }
    expect(JSON.stringify(await idb.readWorkspace(true))).toBe(before);
  });

  it("reminds after 14 days without a backup, counted from the first use; a backup or Not now starts the count again", async () => {
    // The first use started the count in beforeEach.
    expect(backup.reminderDue()).toBe(false);
    const firstUse = Number(localStorage.getItem("wayfarer:backup-reminder-from"));
    expect(firstUse).toBeGreaterThan(0);

    vi.useFakeTimers({ now: firstUse + 14 * DAY - 1000 });
    start();
    expect(backup.reminderDue()).toBe(false);

    vi.setSystemTime(firstUse + 15 * DAY);
    start();
    expect(backup.reminderDue()).toBe(true);
    backup.dismissReminder();
    expect(backup.reminderDue()).toBe(false);
    start();
    expect(backup.reminderDue()).toBe(false);

    vi.setSystemTime(firstUse + 30 * DAY);
    start();
    expect(backup.reminderDue()).toBe(true);
    vi.useRealTimers();
    await backup.exportJson();
    expect(backup.reminderDue()).toBe(false);
    expect(Number(localStorage.getItem("wayfarer:last-backup"))).toBeGreaterThan(firstUse);
  });
});
