import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResponseEnvelope, ScriptResult, VariableChange } from "@wayfarer/core";
import { requestContent } from "../../testing/request-fixtures";
import { Idb } from "../data/idb";
import { ResponseInspector } from "../shared/inspect/response-inspector";
import { ScriptSandbox } from "../shared/scripts/script-sandbox";
import { buildSecretReference } from "../shared/secrets/secret-reference";
import { EnvironmentsStore } from "./environments-store";
import { RequestExecutor, SendDeclinedError } from "./request-executor";
import { SecretsVault } from "./secrets-vault";
import { TransportRouter } from "./transport-router";

// P3.12: a script sets a protected variable. Over the real IndexedDB stores
// and the real vault: the new value goes into the vault under the same
// secret id, and no store holds it as text.
describe("a script sets a protected variable (P3.12)", () => {
  const PASSPHRASE = "correct horse battery staple";
  const OLD = "old-plaintext-3f9a1c";
  const NEW = "new-plaintext-7b2e4d";
  let executor: RequestExecutor;
  let environments: EnvironmentsStore;
  let vault: SecretsVault;
  let idb: Idb;
  let secretId: string;
  let script: ScriptResult;

  beforeEach(async () => {
    localStorage.removeItem("wayfarer:vault-idle-minutes");
    const body = new TextEncoder().encode("{}").buffer;
    const answer: ResponseEnvelope = { status: 200, statusText: "OK", headers: [], body, redirected: false, finalUrl: "", route: "direct", sizes: { decoded: 2 } };
    TestBed.configureTestingModule({
      providers: [
        { provide: ScriptSandbox, useValue: { execute: async () => script } },
        { provide: TransportRouter, useValue: { send: async () => answer, route: () => "direct" } },
        { provide: ResponseInspector, useValue: { markRequest: () => undefined, markResponse: () => undefined } },
      ],
    });
    executor = TestBed.inject(RequestExecutor);
    environments = TestBed.inject(EnvironmentsStore);
    vault = TestBed.inject(SecretsVault);
    idb = TestBed.inject(Idb);

    expect(await vault.create(PASSPHRASE)).toBe(true);
    secretId = await vault.saveSecret({ name: "token", plaintext: OLD });
    const environment = await environments.createEnvironment({
      name: "Staging",
      vars: [
        { key: "token", value: buildSecretReference(secretId), enabled: true },
        { key: "plain", value: "before", enabled: true },
      ],
    });
    await environments.setActiveEnvironment(environment.meta.id);
  });

  afterEach(async () => {
    vault.lock();
    await idb.resetDatabase();
  });

  const sets = (...environment: VariableChange[]): ScriptResult => ({ logs: [], changes: { environment, collection: [], global: [] }, testResults: [] });
  const run = (when: "pre" | "post") =>
    executor.execute({
      template: requestContent(),
      runScripts: true,
      preRequestScript: when === "pre" ? "set()" : "",
      postRequestScript: when === "post" ? "set()" : "",
      tests: [],
      buildRequest: () => ({ method: "GET", url: "https://api.test/", headers: [], secrets: [OLD], credentials: [] }),
    });
  const variables = () => Object.fromEntries((environments.activeEnvironment()?.vars ?? []).map((row) => [row.key, row.value]));

  /** Everything every store holds, as text. */
  async function everythingStored(): Promise<string> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("api-sandbox");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const names = [...db.objectStoreNames];
    const stores = await Promise.all(
      names.map((name) => new Promise<unknown[]>((resolve) => (db.transaction(name).objectStore(name).getAll().onsuccess = (event) => resolve((event.target as IDBRequest<unknown[]>).result))))
    );
    db.close();
    expect(names.sort()).toEqual(["collections", "environments", "files", "folders", "history", "meta", "requests", "secrets"]);
    return JSON.stringify(stores);
  }

  for (const when of ["pre", "post"] as const) {
    it(`unlocked, from a ${when}-request script: the value is encrypted into the same secret, the variable keeps its reference, and no store holds the plaintext`, async () => {
      script = sets({ key: "token", value: NEW }, { key: "plain", value: "after" });
      const result = await run(when);

      expect(await vault.readSecret(secretId)).toBe(NEW);
      expect(variables()).toEqual({ token: buildSecretReference(secretId), plain: "after" });
      expect((await vault.listSecrets()).map((secret) => [secret.id, secret.name])).toEqual([[secretId, "token"]]);
      expect(result.scriptLogs).toEqual([]);
      const stored = await everythingStored();
      expect(stored).not.toContain(NEW);
      expect(stored).not.toContain(OLD);
      // The scan read the stores the values would be in.
      expect(stored).toContain(buildSecretReference(secretId));
      expect(stored).toContain('"after"');
    });
  }

  it("locked: the change is refused with a line in the console, the secret is what it was, and the rest of what the script set is stored", async () => {
    vault.lock();
    script = sets({ key: "token", value: NEW }, { key: "plain", value: "after" });
    const result = await run("pre");

    expect(result.scriptLogs).toEqual(['[warn] pm.environment.set("token"): this variable is protected and the vault is locked, so its value was not changed.']);
    expect(variables()).toEqual({ token: buildSecretReference(secretId), plain: "after" });
    expect(await everythingStored()).not.toContain(NEW);
    expect(await vault.unlock(PASSPHRASE)).toBe(true);
    expect(await vault.readSecret(secretId)).toBe(OLD);
  });

  it("a script that writes back the reference it read changes nothing", async () => {
    script = sets({ key: "token", value: buildSecretReference(secretId) });
    const result = await run("pre");
    expect(await vault.readSecret(secretId)).toBe(OLD);
    expect(variables()["token"]).toBe(buildSecretReference(secretId));
    expect(result.scriptLogs).toEqual([]);
  });

  it("a reference to a secret the vault does not have: refused with a line, and the plaintext is stored nowhere", async () => {
    await vault.deleteSecret(secretId);
    script = sets({ key: "token", value: NEW });
    const result = await run("pre");
    expect(result.scriptLogs).toEqual(['[warn] pm.environment.set("token"): the secret this variable refers to is not in the vault, so its value was not changed.']);
    expect(variables()["token"]).toBe(buildSecretReference(secretId));
    expect(await everythingStored()).not.toContain(NEW);
  });

  it("the user declines the send (C-053): the secret the pre-request script replaced is the old one again", async () => {
    script = sets({ key: "token", value: NEW }, { key: "plain", value: "after" });
    const failure: unknown = await executor
      .execute({
        template: requestContent(),
        runScripts: true,
        preRequestScript: "set()",
        postRequestScript: "",
        tests: [],
        buildRequest: async () => {
          // When the question is asked, the script's value is in the vault: the request would be built with it.
          expect(await vault.readSecret(secretId)).toBe(NEW);
          throw new SendDeclinedError("declined");
        },
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SendDeclinedError);
    expect(await vault.readSecret(secretId)).toBe(OLD);
    expect(variables()).toEqual({ token: buildSecretReference(secretId), plain: "before" });
    const stored = await everythingStored();
    expect(stored).not.toContain(NEW);
    expect(stored).not.toContain(OLD);
  });

  it("a variable that became protected after this tab last read it: the script's value still does not replace the reference", async () => {
    // Another tab protects "plain"; this tab's copy of the rows still holds the old text.
    const other = await vault.saveSecret({ name: "plain", plaintext: OLD });
    const id = environments.activeEnvironment()!.meta.id;
    await idb.changeEnvironment(id, [{ key: "plain", value: buildSecretReference(other) }]);
    expect(variables()["plain"]).toBe("before");

    script = sets({ key: "plain", value: NEW });
    await run("pre");

    expect(variables()["plain"]).toBe(buildSecretReference(other));
    expect(await everythingStored()).not.toContain(NEW);
  });

  it("unset removes a protected variable as it removes any other", async () => {
    script = sets({ key: "token", value: null });
    await run("pre");
    expect(variables()).toEqual({ plain: "before" });
  });
});
