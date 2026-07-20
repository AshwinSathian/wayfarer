import { TestBed } from "@angular/core/testing";
import { SecretsService } from "./secrets.service";
import { IdbService } from "../data/idb.service";
import { SecretCryptoService } from "../shared/secrets/secret-crypto.service";
import { SecretEnvelope } from "../models/secrets.models";

class IdbServiceMock {
  writeCipher = jasmine.createSpy("writeCipher").and.resolveTo();
  readCipher = jasmine.createSpy("readCipher").and.resolveTo(null);
  peekSecretEnvelope = jasmine.createSpy("peekSecretEnvelope").and.resolveTo(null);
}

class SecretCryptoServiceMock {
  private _isUnlocked = false;
  get isUnlocked(): boolean {
    return this._isUnlocked;
  }
  setUnlocked(value: boolean): void {
    this._isUnlocked = value;
  }

  encryptWithSession = jasmine
    .createSpy("encryptWithSession")
    .and.resolveTo({ v: 1, alg: "AES-GCM", salt: "salt", iv: "iv", ct: "enc" } as SecretEnvelope);
  decryptWithSession = jasmine.createSpy("decryptWithSession").and.resolveTo("plaintext");
  decrypt = jasmine.createSpy("decrypt").and.resolveTo("plaintext");
  unlock = jasmine.createSpy("unlock").and.resolveTo();
}

describe("SecretsService", () => {
  let service: SecretsService;
  let idb: IdbServiceMock;
  let crypto: SecretCryptoServiceMock;

  beforeEach(() => {
    idb = new IdbServiceMock();
    crypto = new SecretCryptoServiceMock();
    TestBed.configureTestingModule({
      providers: [
        { provide: IdbService, useValue: idb },
        { provide: SecretCryptoService, useValue: crypto },
      ],
    });
    service = TestBed.inject(SecretsService);
  });

  describe("saveSecret()", () => {
    it("throws instead of persisting anything when the vault is locked", async () => {
      crypto.setUnlocked(false);

      await expectAsync(
        service.saveSecret({ name: "API key", plaintext: "shh" })
      ).toBeRejectedWithError("Secrets are locked. Unlock before saving new secrets.");

      expect(idb.writeCipher).not.toHaveBeenCalled();
    });

    it("encrypts the plaintext and writes the envelope under a fresh id when unlocked", async () => {
      crypto.setUnlocked(true);

      const id = await service.saveSecret({
        name: "API key",
        environmentId: "env-1",
        plaintext: "shh",
      });

      expect(crypto.encryptWithSession).toHaveBeenCalledWith("shh");
      expect(idb.writeCipher).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id,
          name: "API key",
          environmentId: "env-1",
          envelope: jasmine.objectContaining({ ct: "enc" }),
        })
      );
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("never lets the plaintext itself reach IdbService.writeCipher", async () => {
      crypto.setUnlocked(true);

      await service.saveSecret({ name: "API key", plaintext: "super-secret-value" });

      const written = idb.writeCipher.calls.mostRecent().args[0];
      expect(JSON.stringify(written)).not.toContain("super-secret-value");
    });
  });

  describe("readSecret()", () => {
    it("returns null without touching storage when the vault is locked", async () => {
      crypto.setUnlocked(false);

      const result = await service.readSecret("secret-1");

      expect(result).toBeNull();
      expect(idb.readCipher).not.toHaveBeenCalled();
    });

    it("returns null when no envelope exists for that id", async () => {
      crypto.setUnlocked(true);
      idb.readCipher.and.resolveTo(null);

      const result = await service.readSecret("missing");

      expect(result).toBeNull();
      expect(crypto.decryptWithSession).not.toHaveBeenCalled();
    });

    it("decrypts and returns the plaintext when unlocked and the envelope exists", async () => {
      crypto.setUnlocked(true);
      const envelope = { v: 1, alg: "AES-GCM", salt: "z", iv: "y", ct: "x" } as SecretEnvelope;
      idb.readCipher.and.resolveTo(envelope);

      const result = await service.readSecret("secret-1");

      expect(crypto.decryptWithSession).toHaveBeenCalledWith(envelope);
      expect(result).toBe("plaintext");
    });
  });

  describe("decryptEnvelope()", () => {
    it("returns null when locked, without calling decryptWithSession", async () => {
      crypto.setUnlocked(false);
      const envelope = {} as SecretEnvelope;

      expect(await service.decryptEnvelope(envelope)).toBeNull();
      expect(crypto.decryptWithSession).not.toHaveBeenCalled();
    });

    it("delegates to decryptWithSession when unlocked", async () => {
      crypto.setUnlocked(true);
      const envelope = {} as SecretEnvelope;

      expect(await service.decryptEnvelope(envelope)).toBe("plaintext");
      expect(crypto.decryptWithSession).toHaveBeenCalledWith(envelope);
    });
  });

  describe("hasAnySecrets()", () => {
    it("is false when the vault has never had anything written to it", async () => {
      idb.peekSecretEnvelope.and.resolveTo(null);
      expect(await service.hasAnySecrets()).toBeFalse();
    });

    it("is true once at least one secret envelope exists, independent of lock state", async () => {
      idb.peekSecretEnvelope.and.resolveTo({} as SecretEnvelope);
      expect(await service.hasAnySecrets()).toBeTrue();
    });
  });

  describe("verifyAndUnlock()", () => {
    it("treats an empty vault as first-use: unlocks with whatever passphrase is given", async () => {
      idb.peekSecretEnvelope.and.resolveTo(null);

      const ok = await service.verifyAndUnlock("new-passphrase");

      expect(ok).toBeTrue();
      expect(crypto.unlock).toHaveBeenCalledWith("new-passphrase");
      expect(crypto.decrypt).not.toHaveBeenCalled();
    });

    it("verifies the passphrase against an existing secret before unlocking", async () => {
      const sample = { v: 1, alg: "AES-GCM", salt: "z", iv: "y", ct: "x" } as SecretEnvelope;
      idb.peekSecretEnvelope.and.resolveTo(sample);
      crypto.decrypt.and.resolveTo("plaintext");

      const ok = await service.verifyAndUnlock("correct-passphrase");

      expect(crypto.decrypt).toHaveBeenCalledWith(sample, "correct-passphrase");
      expect(crypto.unlock).toHaveBeenCalledWith("correct-passphrase");
      expect(ok).toBeTrue();
    });

    it("returns false and never unlocks when the passphrase fails to decrypt the sample", async () => {
      const sample = { v: 1, alg: "AES-GCM", salt: "z", iv: "y", ct: "x" } as SecretEnvelope;
      idb.peekSecretEnvelope.and.resolveTo(sample);
      crypto.decrypt.and.rejectWith(new Error("bad passphrase"));

      const ok = await service.verifyAndUnlock("wrong-passphrase");

      expect(ok).toBeFalse();
      expect(crypto.unlock).not.toHaveBeenCalled();
    });
  });
});
