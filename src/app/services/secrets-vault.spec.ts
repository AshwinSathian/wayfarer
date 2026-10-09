import { TestBed } from "@angular/core/testing";
import { computed } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Idb } from "../data/idb";
import { SecretsVault } from "./secrets-vault";

// The vault over the real IndexedDB stores and the browser's WebCrypto:
// what is asserted is what a user's browser stores and can open.
describe("SecretsVault", () => {
  let vault: SecretsVault;
  let idb: Idb;

  beforeEach(() => {
    localStorage.removeItem("wayfarer:vault-idle-minutes");
    TestBed.configureTestingModule({});
    vault = TestBed.inject(SecretsVault);
    idb = TestBed.inject(Idb);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vault.lock();
    await idb.resetDatabase();
  });

  /** Another tab: its own vault service over the same database. */
  function otherTab(): SecretsVault {
    return TestBed.runInInjectionContext(() => new SecretsVault());
  }

  describe("saveSecret()", () => {
    it("throws instead of persisting anything when the vault is locked", async () => {
      await expect(vault.saveSecret({ name: "API key", plaintext: "shh" })).rejects.toThrow(
        "Secrets are locked. Unlock before saving new secrets."
      );
      expect(await idb.listSecrets()).toEqual([]);
    });

    it("encrypts the plaintext and writes the envelope under a fresh id when unlocked", async () => {
      await vault.create("correct horse");
      const first = await vault.saveSecret({ name: "API key", environmentId: "env-1", plaintext: "shh" });
      const second = await vault.saveSecret({ name: "Other", plaintext: "shh" });

      expect(first).not.toBe(second);
      const [doc] = (await idb.listSecrets()).filter((secret) => secret.id === first);
      expect(doc).toMatchObject({ id: first, name: "API key", environmentId: "env-1", envelope: { v: 2 } });
      expect(Object.keys(doc.envelope).sort()).toEqual(["ct", "iv", "v"]);
    });

    it("never lets the plaintext itself reach storage", async () => {
      await vault.create("correct horse");
      await vault.saveSecret({ name: "API key", plaintext: "super-secret-value" });

      const stored = JSON.stringify([await idb.listSecrets(), await idb.readVault()]);
      expect(stored).not.toContain("super-secret-value");
      expect(stored).not.toContain("correct horse");
    });
  });

  describe("readSecret()", () => {
    it("returns null when the vault is locked", async () => {
      await vault.create("correct horse");
      const id = await vault.saveSecret({ name: "API key", plaintext: "shh" });
      vault.lock();

      expect(await vault.readSecret(id)).toBeNull();
    });

    it("returns null when no envelope exists for that id", async () => {
      await vault.create("correct horse");
      expect(await vault.readSecret("missing")).toBeNull();
    });

    it("decrypts and returns the plaintext when unlocked and the envelope exists", async () => {
      await vault.create("correct horse");
      const id = await vault.saveSecret({ name: "API key", plaintext: "héllo ✓" });

      expect(await vault.readSecret(id)).toBe("héllo ✓");
    });

    it("surfaces a damaged envelope instead of reporting no secret (P1.11, F36)", async () => {
      await vault.create("correct horse");
      const a = await vault.saveSecret({ name: "A", plaintext: "value a" });
      const b = await vault.saveSecret({ name: "B", plaintext: "value b" });
      const [envelopeA, envelopeB] = [(await idb.readCipher(a))!, (await idb.readCipher(b))!];

      // Two secrets' ciphertexts swapped in storage: neither opens, since each is bound to its id.
      await idb.writeCipher({ id: a, name: "A", envelope: envelopeB });
      await idb.writeCipher({ id: b, name: "B", envelope: envelopeA });

      await expect(vault.readSecret(a)).rejects.toThrow();
      await expect(vault.readSecret(b)).rejects.toThrow();
    });
  });

  describe("create() and unlock()", () => {
    it("exists only once a passphrase has been chosen, whatever the lock state", async () => {
      expect(await vault.exists()).toBe(false);
      await vault.create("correct horse");
      expect(await vault.exists()).toBe(true);
      vault.lock();
      expect(await vault.exists()).toBe(true);
    });

    it("exposes the lock state reactively, so OnPush views and effects follow unlock and lock", async () => {
      const unlocked = computed(() => vault.isUnlocked());
      expect(unlocked()).toBe(false);

      await vault.create("correct horse");
      expect(unlocked()).toBe(true);

      vault.lock();
      expect(unlocked()).toBe(false);
    });

    it("refuses a wrong passphrase with no secret stored, and never unlocks", async () => {
      await vault.create("correct horse");
      vault.lock();

      expect(await vault.unlock("wrong horse")).toBe(false);
      expect(vault.isUnlocked()).toBe(false);
      expect(await vault.unlock("correct horse")).toBe(true);
      expect(vault.isUnlocked()).toBe(true);
    });

    it("does not unlock when there is no vault yet", async () => {
      expect(await vault.unlock("anything")).toBe(false);
      expect(vault.isUnlocked()).toBe(false);
    });

    it("keeps the first passphrase when another tab chose one first", async () => {
      await otherTab().create("theirs first");

      expect(await vault.create("mine second")).toBe(false);
      expect(vault.isUnlocked()).toBe(false);
      expect(await vault.unlock("theirs first")).toBe(true);
    });
  });

  it("@claim:C-043 changing the passphrase: the old one fails, the new one works, the secrets are intact and no secret row is rewritten", async () => {
    await vault.create("old passphrase");
    const id = await vault.saveSecret({ name: "API key", plaintext: "kept" });
    const rowsBefore = JSON.stringify(await idb.listSecrets());

    expect(await vault.changePassphrase("not it", "new passphrase")).toBe(false);
    expect(await vault.changePassphrase("old passphrase", "new passphrase")).toBe(true);

    expect(JSON.stringify(await idb.listSecrets())).toBe(rowsBefore);
    // A tab that was unlocked stays so: the data key did not change.
    expect(await vault.readSecret(id)).toBe("kept");
    vault.lock();
    expect(await vault.unlock("old passphrase")).toBe(false);
    expect(await vault.unlock("new passphrase")).toBe(true);
    expect(await vault.readSecret(id)).toBe("kept");
  });

  it("does not change the passphrase of a vault that does not exist", async () => {
    expect(await vault.changePassphrase("a", "new passphrase")).toBe(false);
    expect(await vault.exists()).toBe(false);
  });

  describe("export and import", () => {
    it("@claim:C-044 a vault file holds the secrets encrypted, opens with the passphrase it was exported under, and its secrets keep their ids in the vault that imports it", async () => {
      await vault.create("source passphrase");
      const id = await vault.saveSecret({ name: "API key", environmentId: "env-1", plaintext: "travels-encrypted" });

      expect(await vault.exportFile("wrong")).toBeNull();
      const file = (await vault.exportFile("source passphrase"))!;
      expect(file).not.toContain("travels-encrypted");
      expect(file).not.toContain("source passphrase");
      expect(JSON.parse(file)).toMatchObject({ $id: "wayfarer/vault/2", secrets: [{ id, name: "API key", environmentId: "env-1" }] });

      // Another browser: a vault of its own, with another passphrase.
      vault.lock();
      await idb.resetDatabase();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      vault = TestBed.inject(SecretsVault);
      idb = TestBed.inject(Idb);
      await vault.create("destination passphrase");

      expect(await vault.importFile(file, "wrong")).toEqual({ error: "That is not the passphrase this file was exported with." });
      expect(await idb.listSecrets()).toEqual([]);
      expect(await vault.importFile(file, "source passphrase")).toEqual({ imported: 1 });

      expect(await vault.readSecret(id)).toBe("travels-encrypted");
      // Stored under this vault's key now: the destination passphrase opens it after a lock.
      vault.lock();
      expect(await vault.unlock("destination passphrase")).toBe(true);
      expect(await vault.readSecret(id)).toBe("travels-encrypted");
      expect((await idb.listSecrets())[0]).toMatchObject({ id, name: "API key", environmentId: "env-1" });
    });

    it("refuses a file that is not a vault file, is too large, or has a damaged secret, and then imports nothing", async () => {
      await vault.create("correct horse");
      await vault.saveSecret({ name: "One", plaintext: "one" });
      await vault.saveSecret({ name: "Two", plaintext: "two" });
      const file = JSON.parse((await vault.exportFile("correct horse"))!) as { secrets: { envelope: { ct: string } }[] };
      const before = JSON.stringify(await idb.listSecrets());

      expect(await vault.importFile("{not json", "correct horse")).toEqual({ error: "The file is not valid JSON." });
      expect(await vault.importFile("{}", "correct horse")).toEqual({
        error: '$id: Not a Wayfarer vault file: "$id" must be "wayfarer/vault/2".',
      });
      expect(await vault.importFile(" ".repeat(10 * 1024 * 1024 + 1), "correct horse")).toEqual({ error: "The file is larger than 10 MB." });

      // The second secret's ciphertext is the first's: it is not what the file's vault encrypted for that id.
      file.secrets[1].envelope = file.secrets[0].envelope;
      const result = await vault.importFile(JSON.stringify(file), "correct horse");
      expect(result).toEqual({ error: expect.stringContaining("is damaged. Nothing was imported.") as string });
      expect(JSON.stringify(await idb.listSecrets())).toBe(before);
    });

    it("needs this vault unlocked to import", async () => {
      await vault.create("correct horse");
      const file = (await vault.exportFile("correct horse"))!;
      vault.lock();
      await expect(vault.importFile(file, "correct horse")).rejects.toThrow("Secrets are locked");
    });
  });

  describe("locking", () => {
    it("a lock in one tab locks the others", async () => {
      await vault.create("correct horse");
      const other = otherTab();
      await other.unlock("correct horse");
      expect(other.isUnlocked()).toBe(true);

      vault.lock();

      await vi.waitFor(() => expect(other.isUnlocked()).toBe(false));
    });

    it("locks itself after the idle time, counted from the last key press or click; another tab is left alone", async () => {
      await vault.create("correct horse");
      const other = otherTab();
      await other.unlock("correct horse");
      vi.useFakeTimers();
      vault.setIdleMinutes(1);

      vi.advanceTimersByTime(59_000);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      vi.advanceTimersByTime(59_000);
      expect(vault.isUnlocked()).toBe(true);

      vi.advanceTimersByTime(1_000);
      expect(vault.isUnlocked()).toBe(false);
      expect(other.isUnlocked()).toBe(true);
      other.lock();
    });

    it("the idle time is 15 minutes unless set, from 1 to 240, and 0 never locks; it is kept over a reload", async () => {
      expect(vault.idleMinutes()).toBe(15);
      vault.setIdleMinutes(1000);
      expect(vault.idleMinutes()).toBe(240);
      vault.setIdleMinutes(2.9);
      expect(vault.idleMinutes()).toBe(2);
      expect(otherTab().idleMinutes()).toBe(2);
      vault.setIdleMinutes(-5);
      expect(vault.idleMinutes()).toBe(0);
      expect(otherTab().idleMinutes()).toBe(0);

      await vault.create("correct horse");
      vi.useFakeTimers();
      vault.setIdleMinutes(0);
      vi.advanceTimersByTime(24 * 60 * 60_000);
      expect(vault.isUnlocked()).toBe(true);

      localStorage.setItem("wayfarer:vault-idle-minutes", "soon");
      expect(otherTab().idleMinutes()).toBe(15);
    });
  });
});
