import { computed } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { SecretCrypto } from "./secret-crypto";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

describe("SecretCrypto", () => {
  let service: SecretCrypto;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SecretCrypto],
    });
    service = TestBed.inject(SecretCrypto);
  });

  it("encrypts and decrypts with passphrase", async () => {
    const envelope = await service.encrypt("hello", "pass");
    const plaintext = await service.decrypt(envelope, "pass");
    expect(plaintext).toBe("hello");
  });

  it("exposes the lock state reactively, so OnPush views and effects follow unlock and lock", async () => {
    const unlocked = computed(() => service.isUnlocked);
    expect(unlocked()).toBe(false);

    await service.unlock("passphrase");
    expect(unlocked()).toBe(true);

    service.lock();
    expect(unlocked()).toBe(false);
  });

  it("rejects decryption with wrong passphrase", async () => {
    const envelope = await service.encrypt("secret", "pass");
    await expect(service.decrypt(envelope, "nope")).rejects.toThrow();
  });

  it("generates base64url fields", async () => {
    const envelope = await service.encrypt("payload", "pass");
    expect(envelope.salt).not.toContain("+");
    expect(envelope.iv).not.toContain("/");
  });

  afterEach(() => vi.restoreAllMocks());

  it("@claim:C-004 derives with PBKDF2-SHA-256 at 600,000 iterations and encrypts with AES-GCM-256, 16-byte salt and 12-byte IV per secret", async () => {
    const deriveKey = vi.spyOn(crypto.subtle, "deriveKey");
    const encrypt = vi.spyOn(crypto.subtle, "encrypt");
    const first = await service.encrypt("payload", "pass");
    const second = await service.encrypt("payload", "pass");

    const [algorithm, , derived] = deriveKey.mock.calls[0];
    const kdf = algorithm as Pbkdf2Params;
    const target = derived as AesKeyGenParams;
    expect(kdf.name).toBe("PBKDF2");
    expect(kdf.hash).toBe("SHA-256");
    expect(kdf.iterations).toBe(600_000);
    expect(target).toEqual({ name: "AES-GCM", length: 256 });
    expect((encrypt.mock.calls[0][0] as AesGcmParams).name).toBe("AES-GCM");

    const bytes = (b64url: string) => atob(b64url.replace(/-/g, "+").replace(/_/g, "/")).length;
    expect(bytes(first.salt)).toBe(16);
    expect(bytes(first.iv)).toBe(12);
    // Salt and IV are random per secret, not per vault.
    expect(second.salt).not.toBe(first.salt);
    expect(second.iv).not.toBe(first.iv);
    expect(first.ct).not.toContain("payload");
  });
});
