import { TestBed } from "@angular/core/testing";
import { repositories, type Repositories } from "../../testing/repositories";
import { BRIDGE_UNREACHABLE, BridgeSettings } from "./bridge-settings";
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

  it("defaults to the route auto with a localhost URL and no token (P6.4)", () => {
    const config = service.config();
    expect(config.route).toBe("auto");
    expect(config.url).toBe("http://127.0.0.1:7717");
    expect(config.token).toBe("");
  });

  it("keeps the route and the address in localStorage, and the token in memory only (F83)", () => {
    service.update({ route: "bridge", url: "http://localhost:9999", token: "abc123" });

    expect(service.config()).toEqual({ route: "bridge", url: "http://localhost:9999", token: "abc123" });

    expect(localStorage.getItem("wayfarer:bridge")).not.toContain("abc123");
    expect(JSON.parse(localStorage.getItem("wayfarer:bridge") ?? "{}")).toEqual({
      route: "bridge",
      url: "http://localhost:9999",
    });
  });

  it("loads what is stored, and removes a token an older version left there as plain text (F83)", () => {
    localStorage.setItem(
      "wayfarer:bridge",
      JSON.stringify({ route: "direct", url: "http://localhost:1234", token: "xyz" }),
    );

    // A fresh instance re-reads localStorage in its constructor.
    const fresh = TestBed.runInInjectionContext(() => new BridgeSettings());

    expect(fresh.config()).toEqual({ route: "direct", url: "http://localhost:1234", token: "" });
    expect(localStorage.getItem("wayfarer:bridge")).toBe(
      JSON.stringify({ route: "direct", url: "http://localhost:1234" }),
    );
  });

  it("reads the switch of a version before P6.4: on is the route bridge, and the route is written in its place", () => {
    localStorage.setItem("wayfarer:bridge", JSON.stringify({ enabled: true, url: "http://localhost:1234" }));
    expect(TestBed.runInInjectionContext(() => new BridgeSettings()).config().route).toBe("bridge");
    expect(localStorage.getItem("wayfarer:bridge")).toBe(
      JSON.stringify({ route: "bridge", url: "http://localhost:1234" }),
    );

    localStorage.setItem("wayfarer:bridge", JSON.stringify({ enabled: false, url: "http://localhost:1234" }));
    expect(TestBed.runInInjectionContext(() => new BridgeSettings()).config().route).toBe("auto");
  });

  it("a route it does not know is the default", () => {
    localStorage.setItem("wayfarer:bridge", JSON.stringify({ route: "proxy", url: "http://localhost:1234" }));
    expect(TestBed.runInInjectionContext(() => new BridgeSettings()).config().route).toBe("auto");
  });

  describe("with a vault (F83)", () => {
    let vault: SecretsVault;
    let idb: Repositories;
    const NAME = "Local Bridge token";
    const inVault = async () => {
      const secret = (await vault.listSecrets()).find((entry) => entry.name === NAME);
      return secret ? vault.readSecret(secret.id) : undefined;
    };

    beforeEach(() => {
      vault = TestBed.inject(SecretsVault);
      idb = repositories();
    });

    afterEach(async () => {
      vault.lock();
      await idb.resetDatabase();
    });

    it("unlocked, a saved token is a vault secret, and a tab that starts later reads it once the vault is unlocked", async () => {
      await vault.create("correct horse");
      service.update({ route: "bridge", token: "token-kept-in-the-vault" });
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
      await vi.waitFor(async () =>
        expect((await vault.listSecrets()).some((entry) => entry.name === NAME)).toBe(false),
      );
    });

    it("for a send: the token held; with none held and one in a locked vault, the user is asked to unlock, and a no gives none", async () => {
      await vault.create("correct horse");
      service.update({ route: "bridge", token: "asked-for-at-send" });
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

    it("is paired with a token in this tab, or one in the vault, locked or not; and with an address (U-131)", async () => {
      expect(service.paired()).toBe(false);
      service.update({ token: "held-in-this-tab" });
      expect(service.paired()).toBe(true);
      service.update({ url: "" });
      expect(service.paired()).toBe(false);
      service.update({ url: "http://127.0.0.1:7717", token: "" });
      expect(service.paired()).toBe(false);

      await vault.create("correct horse");
      service.update({ token: "kept-in-the-vault" });
      await vi.waitFor(async () => expect(await inVault()).toBe("kept-in-the-vault"));
      vault.lock();
      // A reload: the token is in the locked vault only, and the bridge is paired all the same.
      const reloaded = TestBed.runInInjectionContext(() => new BridgeSettings());
      expect(reloaded.config().token).toBe("");
      await vi.waitFor(() => expect(reloaded.paired()).toBe(true));
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

    expect(fresh.config().route).toBe("auto");
    expect(fresh.config().url).toBe("http://127.0.0.1:7717");
  });

  it("checkHealth probes the given URL, trailing slash removed, without saving it", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, name: "wayfarer-bridge", version: "2.0.0" }), { status: 200 }),
      );

    await expect(service.checkHealth("http://localhost:9999/")).resolves.toBeUndefined();

    expect(fetchSpy.mock.calls[0][0]).toBe("http://localhost:9999/health");
    expect(service.config().url).toBe("http://127.0.0.1:7717");
    fetchSpy.mockRestore();
  });

  it("checkHealth finds nothing wrong with a bridge that answers ok", async () => {
    service.update({ url: "http://localhost:7717" });
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, name: "wayfarer-bridge", version: "2.3.0" }), { status: 200 }),
    );

    await expect(service.checkHealth()).resolves.toBeUndefined();
  });

  it("checkHealth says so when what answers is not a bridge: another status, or no JSON", async () => {
    service.update({ url: "http://localhost:7717" });
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(new Response("<html>", { status: 200 }));
    await expect(service.checkHealth()).resolves.toBe("What answered at this address is not a Local Bridge.");
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, name: "wayfarer-bridge", version: "2.0.0" }), { status: 500 }),
    );
    await expect(service.checkHealth()).resolves.toBe("What answered at this address is not a Local Bridge.");
  });

  it("checkHealth says a bridge that does not answer is not reachable", async () => {
    service.update({ url: "http://localhost:7717" });
    vi.spyOn(window, "fetch").mockRejectedValue(new Error("network error"));

    await expect(service.checkHealth()).resolves.toBe(BRIDGE_UNREACHABLE);
  });

  it("checkHealth says the same when there is no configured URL", async () => {
    service.update({ url: "" });
    await expect(service.checkHealth()).resolves.toBe(BRIDGE_UNREACHABLE);
  });

  describe("pairing (P6.2)", () => {
    const answer = (status: number, body: unknown) =>
      vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

    it("exchanges the code for the token at the given address, as a request of the page's own, and gives the token", async () => {
      const fetchSpy = answer(200, { token: "a-token-of-the-bridge-0123456789" });
      await expect(service.pair("http://127.0.0.1:7717/", " abcd-2345 ")).resolves.toEqual({
        token: "a-token-of-the-bridge-0123456789",
      });
      expect(fetchSpy.mock.calls[0][0]).toBe("http://127.0.0.1:7717/pair");
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init).toMatchObject({
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      expect(JSON.parse(init.body as string)).toEqual({ code: "abcd-2345" });
      // Nothing is saved by it: the pane saves.
      expect(service.config().token).toBe("");
    });

    it("says what went wrong: a wrong code, a lock with its seconds, a code already used, no bridge, an answer that is no token", async () => {
      answer(401, { error: "wrong pairing code" });
      await expect(service.pair("http://127.0.0.1:7717", "x")).resolves.toEqual({
        problem: "That is not the code the bridge shows. After three wrong codes the bridge waits a minute.",
      });
      vi.restoreAllMocks();
      vi.spyOn(window, "fetch").mockResolvedValue(
        new Response("{}", { status: 429, headers: { "Retry-After": "42" } }),
      );
      await expect(service.pair("http://127.0.0.1:7717", "x")).resolves.toEqual({
        problem: "Three wrong codes: the bridge takes no code for 42 s.",
      });
      vi.restoreAllMocks();
      answer(410, { error: "used" });
      await expect(service.pair("http://127.0.0.1:7717", "x")).resolves.toEqual({
        problem: "This bridge's code was used. Start the bridge again for a new one.",
      });
      vi.restoreAllMocks();
      vi.spyOn(window, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(service.pair("http://127.0.0.1:7717", "x")).resolves.toEqual({ problem: BRIDGE_UNREACHABLE });
      vi.restoreAllMocks();
      for (const body of [{ token: 5 }, { token: "short" }, "no", {}]) {
        answer(200, body);
        await expect(service.pair("http://127.0.0.1:7717", "x")).resolves.toEqual({
          problem: "What answered at this address is not a Local Bridge.",
        });
        vi.restoreAllMocks();
      }
    });
  });
});
