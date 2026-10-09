import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KDF_ITERATIONS,
  VAULT_FILE_FORMAT,
  createVault,
  decryptSecret,
  encryptSecret,
  rewrapDek,
  unwrapDek,
  validateVaultFile,
  type VaultRecord,
} from "./vault-crypto";

const bytes = (b64url: string) => atob(b64url.replace(/-/g, "+").replace(/_/g, "/")).length;

describe("vault crypto", () => {
  afterEach(() => vi.restoreAllMocks());

  it("@claim:C-004 derives the passphrase key with PBKDF2-SHA-256 at 600,000 iterations and a 16-byte salt; it wraps a random AES-GCM-256 data key; a secret has a 12-byte IV of its own", async () => {
    const deriveKey = vi.spyOn(crypto.subtle, "deriveKey");
    const generateKey = vi.spyOn(crypto.subtle, "generateKey");
    const wrapKey = vi.spyOn(crypto.subtle, "wrapKey");
    const { record, dek } = await createVault("pass");

    const [algorithm, , derived] = deriveKey.mock.calls[0];
    expect(algorithm).toMatchObject({ name: "PBKDF2", hash: "SHA-256", iterations: 600_000 });
    expect(derived).toEqual({ name: "AES-GCM", length: 256 });
    expect(generateKey.mock.calls[0][0]).toEqual({ name: "AES-GCM", length: 256 });
    expect(wrapKey.mock.calls[0][3]).toMatchObject({ name: "AES-GCM" });
    expect(record.v).toBe(2);
    expect(record.kdf).toMatchObject({ alg: "PBKDF2-SHA256", iterations: KDF_ITERATIONS });
    expect(KDF_ITERATIONS).toBe(600_000);
    expect(bytes(record.kdf.salt)).toBe(16);
    // A 12-byte IV, the 32-byte key and the 16-byte tag.
    expect(bytes(record.wrappedDek)).toBe(12 + 32 + 16);

    const first = await encryptSecret(dek, "id-1", "payload");
    const second = await encryptSecret(dek, "id-1", "payload");
    expect(first.v).toBe(2);
    expect(bytes(first.iv)).toBe(12);
    expect(second.iv).not.toBe(first.iv);
    expect(second.ct).not.toBe(first.ct);
    expect(atob(first.ct.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain("payload");
    expect(`${record.kdf.salt}${record.wrappedDek}${first.iv}${first.ct}`).toMatch(/^[\w-]+$/);
  });

  it("the data key held after unlock cannot be exported", async () => {
    const { record, dek } = await createVault("pass");
    expect(dek.extractable).toBe(false);
    expect((await unwrapDek(record, "pass"))?.extractable).toBe(false);
  });

  it("refuses a wrong passphrase, also for a vault with no secret in it", async () => {
    const { record } = await createVault("right passphrase");

    expect(await unwrapDek(record, "wrong passphrase")).toBeNull();
    // Exactly as typed: a space at the end is part of it.
    expect(await unwrapDek(record, "right passphrase ")).toBeNull();
    expect(await unwrapDek(record, "right passphrase")).not.toBeNull();
  });

  it("encrypts under the data key and decrypts with it, whichever unlock gave the key", async () => {
    const { record, dek } = await createVault("pass");
    const envelope = await encryptSecret(dek, "id-1", "héllo ✓");

    const again = (await unwrapDek(record, "pass"))!;
    expect(await decryptSecret(again, "id-1", envelope)).toBe("héllo ✓");
  });

  it("binds a ciphertext to its secret's id: two secrets' ciphertexts swapped both fail to decrypt", async () => {
    const { dek } = await createVault("pass");
    const a = await encryptSecret(dek, "id-a", "value a");
    const b = await encryptSecret(dek, "id-b", "value b");

    await expect(decryptSecret(dek, "id-a", b)).rejects.toThrow();
    await expect(decryptSecret(dek, "id-b", a)).rejects.toThrow();
    expect(await decryptSecret(dek, "id-a", a)).toBe("value a");
  });

  it("rotation wraps the same data key under the new passphrase: the old one fails, the new one opens what was encrypted before", async () => {
    const { record, dek } = await createVault("old passphrase");
    const envelope = await encryptSecret(dek, "id-1", "kept");

    expect(await rewrapDek(record, "not the passphrase", "new passphrase")).toBeNull();
    const rotated = (await rewrapDek(record, "old passphrase", "new passphrase"))!;

    expect(rotated.kdf.salt).not.toBe(record.kdf.salt);
    expect(rotated.wrappedDek).not.toBe(record.wrappedDek);
    expect(await unwrapDek(rotated, "old passphrase")).toBeNull();
    const reopened = (await unwrapDek(rotated, "new passphrase"))!;
    expect(reopened.extractable).toBe(false);
    expect(await decryptSecret(reopened, "id-1", envelope)).toBe("kept");
  });

  it("passes on an error that is not a wrong passphrase", async () => {
    const { record } = await createVault("pass");
    await expect(unwrapDek({ ...record, wrappedDek: "!" }, "pass")).rejects.toThrow();
    vi.spyOn(crypto.subtle, "unwrapKey").mockRejectedValue(new TypeError("no crypto"));
    await expect(unwrapDek(record, "pass")).rejects.toThrow(TypeError);
  });

  it("does not give out a vault it could not open again", async () => {
    vi.spyOn(crypto.subtle, "unwrapKey").mockRejectedValue(Object.assign(new Error("tag"), { name: "OperationError" }));
    await expect(createVault("pass")).rejects.toThrow("could not be opened with its own passphrase");
  });

  it("says so when the page has no WebCrypto (plain http)", async () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      await expect(createVault("pass")).rejects.toThrow("The vault needs a secure page");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("validateVaultFile", () => {
    const record: VaultRecord = { v: 2, kdf: { alg: "PBKDF2-SHA256", iterations: 600_000, salt: "c2FsdA" }, wrappedDek: "d3JhcHBlZA" };
    const file = () => ({
      $id: VAULT_FILE_FORMAT,
      vault: structuredClone(record),
      secrets: [{ id: "s-1", name: "token", environmentId: "env-1", envelope: { v: 2, iv: "aXY", ct: "Y3Q" } }],
    });

    it("accepts what the app writes", () => {
      expect(validateVaultFile(file())).toEqual([]);
      const bare = file();
      delete (bare.secrets[0] as { environmentId?: string }).environmentId;
      expect(validateVaultFile(bare)).toEqual([]);
    });

    it("names every field that is not what the app writes", () => {
      const paths = (value: unknown) => validateVaultFile(value).map((issue) => issue.path);

      expect(paths(null)).toEqual(["$"]);
      expect(paths({ ...file(), $id: "wayfarer/vault/1" })).toEqual(["$id"]);
      expect(paths({ $id: VAULT_FILE_FORMAT })).toEqual(["vault", "secrets"]);
      expect(paths({ ...file(), vault: { v: 1, kdf: { alg: "scrypt", iterations: "many", salt: 5 }, wrappedDek: "a+b" } })).toEqual([
        "vault.v",
        "vault.kdf.alg",
        "vault.kdf.iterations",
        "vault.kdf.salt",
        "vault.wrappedDek",
      ]);
      expect(paths({ ...file(), vault: { ...record, kdf: null } })).toEqual(["vault.kdf"]);
      expect(paths({ ...file(), secrets: [null, { id: "", name: 1, environmentId: 2, envelope: { v: 1, iv: "", ct: "=" } }, { id: "x", name: "n" }] })).toEqual([
        "secrets[0]",
        "secrets[1].id",
        "secrets[1].name",
        "secrets[1].environmentId",
        "secrets[1].envelope.v",
        "secrets[1].envelope.iv",
        "secrets[1].envelope.ct",
        "secrets[2].envelope",
      ]);
    });

    it("refuses a key derivation cheaper than the app's own, or one that would hang the page", () => {
      const withIterations = (iterations: number) => ({ ...file(), vault: { ...record, kdf: { ...record.kdf, iterations } } });
      expect(validateVaultFile(withIterations(599_999))).toHaveLength(1);
      expect(validateVaultFile(withIterations(10_000_001))).toHaveLength(1);
      expect(validateVaultFile(withIterations(600_000.5))).toHaveLength(1);
      expect(validateVaultFile(withIterations(10_000_000))).toEqual([]);
    });

    it("reads own fields only", () => {
      const inherited = Object.create(file()) as object;
      expect(validateVaultFile(inherited).map((issue) => issue.path)).toEqual(["$id"]);
    });
  });
});
