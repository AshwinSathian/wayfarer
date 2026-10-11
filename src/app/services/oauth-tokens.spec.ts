import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { OAUTH_CHANNEL, OAuthError, TransportError, emptyAuth, oauthTokenKey, type OAuth2Auth, type ResolvedRequest, type ResponseEnvelope } from "@wayfarer/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Idb } from "../data/idb";
import { OAuthTokens } from "./oauth-tokens";
import { SecretsVault } from "./secrets-vault";
import { TransportRouter } from "./transport-router";

const auth = (patch: Partial<OAuth2Auth> = {}): OAuth2Auth => ({ ...(emptyAuth("oauth2") as OAuth2Auth), grant: "client_credentials", tokenUrl: "https://idp.test/token", authUrl: "https://idp.test/authorize", clientId: "client", clientSecret: "secret", ...patch });
const form = (request: ResolvedRequest) => Object.fromEntries(new URLSearchParams(String(request.body)));
const answer = (status: number, body: unknown): ResponseEnvelope => ({ status, statusText: "", headers: [], body: new TextEncoder().encode(JSON.stringify(body)).buffer, redirected: false, finalUrl: "", route: "direct", sizes: { decoded: 0 } });

/** A vault that holds what it is given, in memory: the service is tested, not the vault's crypto. */
class FakeVault {
  readonly isUnlocked = signal(false);
  readonly secrets = new Map<string, { id: string; name: string; plaintext: string }>();
  unlockAnswer = true;
  ensureUnlocked = vi.fn(async () => {
    if (this.unlockAnswer) this.isUnlocked.set(true);
    return this.isUnlocked();
  });
  listSecrets = async () => [...this.secrets.values()];
  readSecret = async (id: string) => (this.isUnlocked() ? (this.secrets.get(id)?.plaintext ?? null) : null);
  async saveSecret(request: { name: string; plaintext: string }) {
    const id = `secret-${this.secrets.size + 1}`;
    this.secrets.set(id, { id, ...request });
    return id;
  }
  async replaceSecret(id: string, plaintext: string) {
    const secret = this.secrets.get(id);
    if (!secret || !this.isUnlocked()) return false;
    secret.plaintext = plaintext;
    return true;
  }
  deleteSecret = async (id: string) => void this.secrets.delete(id);
}

describe("OAuthTokens", () => {
  let tokens: OAuthTokens;
  let vault: FakeVault;
  let sent: ResolvedRequest[];
  let answers: (ResponseEnvelope | Error)[];
  let route: "direct" | "bridge";
  let changedElsewhere: (stores: string[]) => void;
  const key = oauthTokenKey(auth());
  const now = vi.spyOn(Date, "now");

  beforeEach(() => {
    vault = new FakeVault();
    sent = [];
    answers = [];
    route = "direct";
    now.mockReturnValue(1_000_000);
    TestBed.configureTestingModule({
      providers: [
        { provide: SecretsVault, useValue: vault },
        { provide: Idb, useValue: { onChangeElsewhere: (listener: (stores: string[]) => void) => (changedElsewhere = listener) } },
        {
          provide: TransportRouter,
          useValue: {
            route: () => route,
            send: async (request: ResolvedRequest) => {
              sent.push(request);
              const next = answers.shift();
              if (!next) throw new Error("a token request nobody expected");
              if (next instanceof Error) throw next;
              return next;
            },
          },
        },
      ],
    });
    tokens = TestBed.inject(OAuthTokens);
  });

  afterEach(() => {
    expect(answers).toEqual([]);
  });

  it("asks for a token when there is none, holds it, and asks for no other while it is good", async () => {
    answers.push(answer(200, { access_token: "a-1", expires_in: 60 }));
    expect(await tokens.tokenFor(auth(), key)).toBe("a-1");
    expect(form(sent[0])).toEqual({ grant_type: "client_credentials" });
    expect(tokens.token(key)).toEqual({ accessToken: "a-1", refreshToken: "", expiresAt: 1_060_000 });

    now.mockReturnValue(1_059_999);
    expect(await tokens.tokenFor(auth(), key)).toBe("a-1");
    expect(sent).toHaveLength(1);
  });

  it("renews an expired token with its refresh token, once, and keeps the refresh token that came back", async () => {
    answers.push(answer(200, { access_token: "a-1", expires_in: 60, refresh_token: "r-1" }));
    await tokens.tokenFor(auth(), key);
    now.mockReturnValue(1_060_000);
    answers.push(answer(200, { access_token: "a-2", expires_in: 60, refresh_token: "r-2" }));
    expect(await tokens.tokenFor(auth(), key)).toBe("a-2");
    expect(form(sent[1])).toEqual({ grant_type: "refresh_token", refresh_token: "r-1" });
    expect(tokens.token(key)?.refreshToken).toBe("r-2");
    expect(await tokens.tokenFor(auth(), key)).toBe("a-2");
    expect(sent).toHaveLength(2);
  });

  it("`renew` asks for a new token whatever the held one says: a 401 came back", async () => {
    answers.push(answer(200, { access_token: "a-1", expires_in: 3600, refresh_token: "r-1" }), answer(200, { access_token: "a-2", expires_in: 3600 }));
    await tokens.tokenFor(auth(), key);
    expect(await tokens.tokenFor(auth(), key, { renew: true })).toBe("a-2");
    // No new refresh token in the answer: the one it was made with still counts.
    expect(tokens.token(key)?.refreshToken).toBe("r-1");
  });

  it("a refresh the server refuses: a grant that needs no user asks again, the code grant says to sign in", async () => {
    answers.push(answer(200, { access_token: "a-1", expires_in: 1, refresh_token: "spent" }));
    await tokens.tokenFor(auth(), key);
    now.mockReturnValue(2_000_000);
    answers.push(answer(400, { error: "invalid_grant" }), answer(200, { access_token: "a-2" }));
    expect(await tokens.tokenFor(auth(), key)).toBe("a-2");
    expect(sent.map((request) => form(request)["grant_type"])).toEqual(["client_credentials", "refresh_token", "client_credentials"]);

    const code = auth({ grant: "authorization_code" });
    const codeKey = oauthTokenKey(code);
    await expect(tokens.tokenFor(code, codeKey)).rejects.toThrow("There is no OAuth 2.0 token yet. Choose Get token in the Auth tab.");
    answers.push(answer(400, { error: "invalid_grant" }));
    // A token the vault had, expired, with a refresh token that is spent.
    vault.isUnlocked.set(true);
    await vault.saveSecret({ name: `OAuth 2.0 token ${codeKey}`, plaintext: JSON.stringify({ accessToken: "old", refreshToken: "spent", expiresAt: 5 }) });
    await expect(tokens.tokenFor(code, codeKey)).rejects.toThrow("The token endpoint refused: invalid_grant.");
  });

  it("an expired token with no refresh token: the code grant cannot renew it without the user", async () => {
    const code = auth({ grant: "authorization_code" });
    const codeKey = oauthTokenKey(code);
    vault.isUnlocked.set(true);
    await vault.saveSecret({ name: `OAuth 2.0 token ${codeKey}`, plaintext: JSON.stringify({ accessToken: "old", refreshToken: "", expiresAt: 5 }) });
    await expect(tokens.tokenFor(code, codeKey)).rejects.toThrow("The OAuth 2.0 token has expired and cannot be renewed. Choose Get token in the Auth tab.");
    expect(sent).toEqual([]);
  });

  it("a token request that gets no answer names CORS and the bridge when it left from the page, and the transport's own error otherwise", async () => {
    answers.push(new TransportError("network", "Failed to fetch"));
    await expect(tokens.get(auth(), key)).rejects.toThrow(/does not send Access-Control-Allow-Origin for this page.*Local Bridge.*docs\/browser-limits\.md#oauth/);
    answers.push(new TransportError("timeout", "The request timed out after 5 s."));
    await expect(tokens.get(auth(), key)).rejects.toThrow("The token request failed: The request timed out after 5 s.");
    route = "bridge";
    answers.push(new TransportError("network", "The bridge is not running."));
    await expect(tokens.get(auth(), key)).rejects.toThrow("The token request failed: The bridge is not running.");
    answers.push(new Error("not a transport's"));
    await expect(tokens.get(auth(), key)).rejects.toThrow("not a transport's");
    expect(tokens.token(key)).toBeUndefined();
  });

  it("a token request is never sent with a vault secret's reference in it, or to something that is no address (C-007)", async () => {
    const reference = "{{$secret.00000000-0000-4000-8000-00000000d5d5}}";
    for (const withReference of [auth({ clientSecret: reference }), auth({ clientSecret: reference, clientAuth: "body" }), auth({ grant: "password", username: "u", password: reference })]) {
      await expect(tokens.get(withReference, key)).rejects.toThrow("refers to a vault secret that could not be read");
    }
    await expect(tokens.get(auth({ tokenUrl: "{{nowhere}}" }), key)).rejects.toThrow("The token URL is not an address.");
    expect(sent).toEqual([]);
  });

  it("with the vault unlocked the token is a vault secret under its name, replaced when renewed and removed when forgotten", async () => {
    vault.isUnlocked.set(true);
    answers.push(answer(200, { access_token: "a-1", refresh_token: "r-1" }), answer(200, { access_token: "a-2" }));
    await tokens.get(auth(), key);
    await tokens.get(auth(), key);
    expect([...vault.secrets.values()]).toEqual([{ id: "secret-1", name: `OAuth 2.0 token ${key}`, plaintext: JSON.stringify({ accessToken: "a-2", refreshToken: "", expiresAt: null }) }]);
    await tokens.clear(key);
    expect(vault.secrets.size).toBe(0);
    expect(tokens.token(key)).toBeUndefined();
  });

  it("with the vault locked the token is in memory only; once the vault is unlocked it goes in, and what the vault held comes out", async () => {
    answers.push(answer(200, { access_token: "a-1" }));
    await tokens.get(auth(), key);
    expect(vault.secrets.size).toBe(0);
    vault.secrets.set("other", { id: "other", name: 'OAuth 2.0 token ["x"]', plaintext: JSON.stringify({ accessToken: "b-1", refreshToken: "", expiresAt: null }) });
    vault.secrets.set("variable", { id: "variable", name: "API_TOKEN", plaintext: "not a token" });
    vault.secrets.set("broken", { id: "broken", name: 'OAuth 2.0 token ["y"]', plaintext: "not a token" });

    vault.isUnlocked.set(true);
    TestBed.tick();
    await vi.waitFor(() => expect(tokens.token('["x"]')?.accessToken).toBe("b-1"));
    expect([...vault.secrets.values()].find((secret) => secret.name === `OAuth 2.0 token ${key}`)?.plaintext).toContain('"a-1"');
    expect(tokens.token('["y"]')).toBeUndefined();
    expect(tokens.token(key)?.accessToken).toBe("a-1");
  });

  it("a token another tab renewed replaces the one held here", async () => {
    vault.isUnlocked.set(true);
    answers.push(answer(200, { access_token: "a-1", refresh_token: "r-1" }));
    await tokens.get(auth(), key);
    [...vault.secrets.values()][0].plaintext = JSON.stringify({ accessToken: "a-2", refreshToken: "r-2", expiresAt: null });
    changedElsewhere(["history"]);
    changedElsewhere(["secrets"]);
    await vi.waitFor(() => expect(tokens.token(key)).toEqual({ accessToken: "a-2", refreshToken: "r-2", expiresAt: null }));
  });

  it("a token this tab does not hold is read from the vault, after the passphrase; a locked vault that stays locked sends nothing", async () => {
    vault.secrets.set("s", { id: "s", name: `OAuth 2.0 token ${key}`, plaintext: JSON.stringify({ accessToken: "kept", refreshToken: "", expiresAt: null }) });
    vault.unlockAnswer = false;
    await expect(tokens.tokenFor(auth(), key)).rejects.toThrow("The OAuth 2.0 token is in the vault, which is locked. Unlock it to send.");
    vault.unlockAnswer = true;
    expect(await tokens.tokenFor(auth(), key)).toBe("kept");
    expect(vault.ensureUnlocked).toHaveBeenCalledTimes(2);
    expect(sent).toEqual([]);
  });

  describe("the code grant's sign-in window", () => {
    const code = auth({ grant: "authorization_code", clientSecret: "" });
    const codeKey = oauthTokenKey(code);
    let opened: URL[];
    let other: BroadcastChannel;

    beforeEach(() => {
      opened = [];
      other = new BroadcastChannel(OAUTH_CHANNEL);
      vi.spyOn(window, "open").mockImplementation((address) => {
        opened.push(new URL(String(address)));
        return window;
      });
    });

    afterEach(() => {
      other.close();
      vi.mocked(window.open).mockRestore();
    });

    const stateAsked = async () => (await vi.waitFor(() => expect(opened).toHaveLength(1)), opened[0].searchParams.get("state"));

    it("opens the identity provider, takes only the answer with its own state, tells the page it may close, and exchanges the code with the verifier", async () => {
      const acknowledged: unknown[] = [];
      other.onmessage = (event) => acknowledged.push(event.data);
      answers.push(answer(200, { access_token: "a-1", expires_in: 60 }));
      const done = tokens.get(code, codeKey);
      const state = await stateAsked();
      expect(tokens.waiting()).toBe(true);
      expect(opened[0].searchParams.get("redirect_uri")).toBe(`${location.origin}/oauth/callback`);

      other.postMessage({ state: "someone-else", code: "stolen" });
      await vi.waitFor(() => expect(tokens.notice()).toBe("An answer came back with a state this app did not issue, and was ignored."));
      expect(sent).toEqual([]);
      // Not an answer at all: another tab telling its own window to close.
      other.postMessage({ state: "someone-else", received: true });
      other.postMessage("text");

      other.postMessage({ state, code: "code-1" });
      await done;
      expect(form(sent[0])).toMatchObject({ grant_type: "authorization_code", code: "code-1", redirect_uri: `${location.origin}/oauth/callback`, client_id: "client" });
      // The verifier is the one whose SHA-256 was sent as the challenge.
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(form(sent[0])["code_verifier"])));
      expect(opened[0].searchParams.get("code_challenge")).toBe(btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
      // The page's go-ahead to close is a message too: it arrives in a task of its own.
      await vi.waitFor(() => expect(acknowledged).toEqual([{ state, received: true }]));
      expect(tokens.waiting()).toBe(false);
      expect(tokens.token(codeKey)?.accessToken).toBe("a-1");
    });

    it("an error from the identity provider ends the wait with what it said", async () => {
      const refused = expect(tokens.get(code, codeKey)).rejects.toThrow("The sign-in ended without a code: access_denied (The user said no).");
      other.postMessage({ state: await stateAsked(), code: null, error: "access_denied", description: "The user said no" });
      await refused;
      expect(tokens.waiting()).toBe(false);
    });

    it("Cancel ends the wait, and so does a second sign-in", async () => {
      const replaced = expect(tokens.get(code, codeKey)).rejects.toThrow("Another sign-in was started.");
      await stateAsked();
      const cancelled = expect(tokens.get(code, codeKey)).rejects.toThrow(new OAuthError("The sign-in was cancelled."));
      await replaced;
      await vi.waitFor(() => expect(opened).toHaveLength(2));
      expect(tokens.waiting()).toBe(true);
      tokens.cancel();
      await cancelled;
      expect(tokens.waiting()).toBe(false);
    });

    it("a window the browser blocked is said, and nothing is waited for", async () => {
      vi.mocked(window.open).mockReturnValue(null);
      await expect(tokens.get(code, codeKey)).rejects.toThrow("The browser blocked the sign-in window.");
      expect(tokens.waiting()).toBe(false);
    });
  });
});
