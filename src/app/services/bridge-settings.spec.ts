import { TestBed } from "@angular/core/testing";
import { Idb } from "../data/idb";
import { BridgeSettings } from "./bridge-settings";
import { SecretsVault } from "./secrets-vault";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

describe("BridgeSettings", () => {
  let service: BridgeSettings;

  beforeEach(() => {
    localStorage.removeItem("wayfarer:bridge");
    TestBed.configureTestingModule({});
    service = TestBed.inject(BridgeSettings);
  });

  afterEach(() => {
    localStorage.removeItem("wayfarer:bridge");
  });

  it("defaults to disabled with a localhost URL and no token", () => {
    const config = service.config();
    expect(config.enabled).toBe(false);
    expect(config.url).toBe("http://127.0.0.1:7717");
    expect(config.token).toBe("");
  });

  it("keeps whether it is on and its address in localStorage, and the token in memory only (F83)", () => {
    service.update({ enabled: true, url: "http://localhost:9999", token: "abc123" });

    expect(service.config()).toEqual({ enabled: true, url: "http://localhost:9999", token: "abc123" });

    expect(localStorage.getItem("wayfarer:bridge")).not.toContain("abc123");
    expect(JSON.parse(localStorage.getItem("wayfarer:bridge") ?? "{}")).toEqual({ enabled: true, url: "http://localhost:9999" });
  });

  it("loads what is stored, and removes a token an older version left there as plain text (F83)", () => {
    localStorage.setItem("wayfarer:bridge", JSON.stringify({ enabled: true, url: "http://localhost:1234", token: "xyz" }));

    // A fresh instance re-reads localStorage in its constructor.
    const fresh = TestBed.runInInjectionContext(() => new BridgeSettings());

    expect(fresh.config()).toEqual({ enabled: true, url: "http://localhost:1234", token: "" });
    expect(localStorage.getItem("wayfarer:bridge")).toBe(JSON.stringify({ enabled: true, url: "http://localhost:1234" }));
  });

  describe("with a vault (F83)", () => {
    let vault: SecretsVault;
    let idb: Idb;
    const NAME = "Local Bridge token";
    const inVault = async () => {
      const secret = (await vault.listSecrets()).find((entry) => entry.name === NAME);
      return secret ? vault.readSecret(secret.id) : undefined;
    };

    beforeEach(() => {
      vault = TestBed.inject(SecretsVault);
      idb = TestBed.inject(Idb);
    });

    afterEach(async () => {
      vault.lock();
      await idb.resetDatabase();
    });

    it("unlocked, a saved token is a vault secret, and a tab that starts later reads it once the vault is unlocked", async () => {
      await vault.create("correct horse");
      service.update({ enabled: true, token: "token-kept-in-the-vault" });
      await vi.waitFor(async () => expect(await inVault()).toBe("token-kept-in-the-vault"));
      expect(localStorage.getItem("wayfarer:bridge")).not.toContain("token-kept-in-the-vault");

      // A reload: a new service, the vault locked again.
      vault.lock();
      const reloaded = TestBed.runInInjectionContext(() => new BridgeSettings());
      expect(reloaded.config().token).toBe("");
      await vault.unlock("correct horse");
      await vi.waitFor(() => expect(reloaded.config().token).toBe("token-kept-in-the-vault"));
    });

    it("a token typed while the vault was locked goes into the vault when it is unlocked", async () => {
      await vault.create("correct horse");
      vault.lock();
      service.update({ token: "typed-while-locked" });
      expect(await inVault()).toBeUndefined();
      await vault.unlock("correct horse");
      await vi.waitFor(async () => expect(await inVault()).toBe("typed-while-locked"));
    });

    it("a token that is cleared is removed from the vault", async () => {
      await vault.create("correct horse");
      service.update({ token: "to-be-removed" });
      await vi.waitFor(async () => expect(await inVault()).toBe("to-be-removed"));
      service.update({ token: "" });
      await vi.waitFor(async () => expect((await vault.listSecrets()).some((entry) => entry.name === NAME)).toBe(false));
    });

    it("for a send: the token held; with none held and one in a locked vault, the user is asked to unlock, and a no gives none", async () => {
      await vault.create("correct horse");
      service.update({ enabled: true, token: "asked-for-at-send" });
      await vi.waitFor(async () => expect(await inVault()).toBe("asked-for-at-send"));
      await expect(service.tokenForSend()).resolves.toBe("asked-for-at-send");

      vault.lock();
      const reloaded = TestBed.runInInjectionContext(() => new BridgeSettings());
      const refused = reloaded.tokenForSend();
      await vi.waitFor(() => expect(vault.unlockRequested()).toBe(true));
      vault.unlockDialogClosed();
      await expect(refused).resolves.toBe("");

      const given = reloaded.tokenForSend();
      await vi.waitFor(() => expect(vault.unlockRequested()).toBe(true));
      await vault.unlock("correct horse");
      vault.unlockDialogClosed();
      await expect(given).resolves.toBe("asked-for-at-send");
    });

    it("for a send with no token anywhere, nobody is asked for a passphrase", async () => {
      await vault.create("correct horse");
      vault.lock();
      await expect(service.tokenForSend()).resolves.toBe("");
      expect(vault.unlockRequested()).toBe(false);
    });
  });

  it("falls back to defaults when localStorage holds malformed JSON", () => {
    localStorage.setItem("wayfarer:bridge", "{not json");

    const fresh = TestBed.runInInjectionContext(() => new BridgeSettings());

    expect(fresh.config().enabled).toBe(false);
    expect(fresh.config().url).toBe("http://127.0.0.1:7717");
  });

  it("checkHealth probes the given URL, trailing slash removed, without saving it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(service.checkHealth("http://localhost:9999/")).resolves.toBe(true);

    expect(fetchSpy.mock.calls[0][0]).toBe("http://localhost:9999/health");
    expect(service.config().url).toBe("http://127.0.0.1:7717");
    fetchSpy.mockRestore();
  });

  it("checkHealth returns true when the bridge responds ok", async () => {
    service.update({ url: "http://localhost:7717" });
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await expect(service.checkHealth()).resolves.toBe(true);
  });

  it("checkHealth returns false when the bridge is unreachable", async () => {
    service.update({ url: "http://localhost:7717" });
    vi.spyOn(window, "fetch").mockRejectedValue(new Error("network error"));

    await expect(service.checkHealth()).resolves.toBe(false);
  });

  it("checkHealth returns false when there is no configured URL", async () => {
    service.update({ url: "" });
    await expect(service.checkHealth()).resolves.toBe(false);
  });
});
