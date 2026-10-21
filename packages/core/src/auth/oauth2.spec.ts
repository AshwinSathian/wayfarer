import { describe, expect, it } from "vitest";
import { emptyAuth } from "../model/request";
import {
  OAuthError,
  authorizationUrl,
  oauthTokenKey,
  parseStoredToken,
  pkcePair,
  readTokenResponse,
  tokenExpired,
  tokenRequest,
  type OAuth2Auth,
} from "./oauth2";

const auth = (patch: Partial<OAuth2Auth> = {}): OAuth2Auth => ({
  ...(emptyAuth("oauth2") as OAuth2Auth),
  authUrl: "https://idp.test/authorize?tenant=a",
  tokenUrl: "https://idp.test/token",
  clientId: "client 1",
  ...patch,
});
const form = (request: { body?: unknown }) => Object.fromEntries(new URLSearchParams(String(request.body)));
const header = (request: { headers: [string, string][] }, name: string) =>
  request.headers.find(([key]) => key === name)?.[1];

describe("OAuth 2.0", () => {
  it("a PKCE pair: the challenge is the SHA-256 of the verifier, base64url without padding (RFC 7636)", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    expect(challenge).toBe(
      btoa(String.fromCharCode(...digest))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, ""),
    );
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await pkcePair()).verifier).not.toBe(verifier);
  });

  it("the authorization address keeps the query it had and adds the code grant's, with the scope only when there is one", () => {
    const url = new URL(
      authorizationUrl(auth({ scope: "read write" }), "https://app.test/oauth/callback", "state-1", "challenge-1"),
    );
    expect(`${url.origin}${url.pathname}`).toBe("https://idp.test/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tenant: "a",
      response_type: "code",
      client_id: "client 1",
      redirect_uri: "https://app.test/oauth/callback",
      state: "state-1",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
      scope: "read write",
    });
    expect(new URL(authorizationUrl(auth(), "https://app.test/cb", "s", "c")).searchParams.has("scope")).toBe(false);
    expect(() => authorizationUrl(auth({ authUrl: "not an address" }), "https://app.test/cb", "s", "c")).toThrow(
      OAuthError,
    );
  });

  it("the code is exchanged with its verifier, and a client with no secret is named in the form", () => {
    const request = tokenRequest(auth(), {
      code: "code-1",
      verifier: "verifier-1",
      redirectUri: "https://app.test/oauth/callback",
    });
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://idp.test/token");
    expect(header(request, "Content-Type")).toBe("application/x-www-form-urlencoded");
    expect(header(request, "Authorization")).toBeUndefined();
    expect(form(request)).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: "https://app.test/oauth/callback",
      code_verifier: "verifier-1",
      client_id: "client 1",
    });
  });

  it("a client with a secret is named in a Basic header, each part form-encoded, or in the form when the auth says so", () => {
    const secret = auth({ grant: "client_credentials", clientSecret: "s:é cret", scope: "read" });
    const inHeader = tokenRequest(secret, "grant");
    expect(atob(header(inHeader, "Authorization")?.slice("Basic ".length) ?? "")).toBe("client+1:s%3A%C3%A9+cret");
    expect(form(inHeader)).toEqual({ grant_type: "client_credentials", scope: "read" });
    const inBody = tokenRequest({ ...secret, clientAuth: "body" }, "grant");
    expect(header(inBody, "Authorization")).toBeUndefined();
    expect(form(inBody)).toEqual({
      grant_type: "client_credentials",
      scope: "read",
      client_id: "client 1",
      client_secret: "s:é cret",
    });
  });

  it("the password grant sends the user's name and password; a refresh sends the refresh token; the code grant has no request of its own", () => {
    expect(form(tokenRequest(auth({ grant: "password", username: "u", password: "p&w" }), "grant"))).toEqual({
      grant_type: "password",
      username: "u",
      password: "p&w",
      client_id: "client 1",
    });
    expect(form(tokenRequest(auth({ scope: "read" }), { refreshToken: "r-1" }))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "r-1",
      client_id: "client 1",
    });
    expect(() => tokenRequest(auth(), "grant")).toThrow(/needs a sign-in/);
  });

  it("a token answer is read: the expiry from now, and a refresh token that rotates or is kept", () => {
    const first = readTokenResponse(
      200,
      JSON.stringify({ access_token: "a-1", token_type: "bearer", expires_in: 60, refresh_token: "r-1" }),
      1_000,
    );
    expect(first).toEqual({ accessToken: "a-1", refreshToken: "r-1", expiresAt: 61_000 });
    // Rotation: a new refresh token replaces the old one.
    expect(readTokenResponse(200, JSON.stringify({ access_token: "a-2", refresh_token: "r-2" }), 5_000, first)).toEqual(
      { accessToken: "a-2", refreshToken: "r-2", expiresAt: null },
    );
    // None in the answer: the one the refresh was made with still counts.
    expect(readTokenResponse(200, JSON.stringify({ access_token: "a-3", expires_in: "30" }), 5_000, first)).toEqual({
      accessToken: "a-3",
      refreshToken: "r-1",
      expiresAt: 35_000,
    });
    expect(readTokenResponse(200, JSON.stringify({ access_token: "a-4" }), 0).refreshToken).toBe("");
  });

  it("an answer that is no token says why", () => {
    expect(() =>
      readTokenResponse(400, JSON.stringify({ error: "invalid_grant", error_description: "The code was used" }), 0),
    ).toThrow("The token endpoint refused: invalid_grant (The code was used).");
    expect(() => readTokenResponse(200, JSON.stringify({ error: "invalid_client" }), 0)).toThrow(
      "refused: invalid_client.",
    );
    expect(() => readTokenResponse(503, "{}", 0)).toThrow("refused: 503.");
    expect(() => readTokenResponse(200, "<html>", 0)).toThrow("answered 200 with something that is not JSON");
    expect(() => readTokenResponse(200, JSON.stringify({ access_token: 5 }), 0)).toThrow("holds no access token");
    expect(() => readTokenResponse(200, "null", 0)).toThrow("holds no access token");
    expect(() => readTokenResponse(200, JSON.stringify({ access_token: "a", token_type: "mac" }), 0)).toThrow(
      "only Bearer tokens are",
    );
    // A field of the prototype is not a field of the answer.
    expect(() => readTokenResponse(200, JSON.stringify({ __proto__: { access_token: "a" } }), 0)).toThrow(
      "holds no access token",
    );
  });

  it("a token expires at its time, and one without a time does not", () => {
    expect(tokenExpired({ accessToken: "a", refreshToken: "", expiresAt: 1_000 }, 999)).toBe(false);
    expect(tokenExpired({ accessToken: "a", refreshToken: "", expiresAt: 1_000 }, 1_000)).toBe(true);
    expect(tokenExpired({ accessToken: "a", refreshToken: "", expiresAt: null }, 9e15)).toBe(false);
  });

  it("a kept token is read back, and anything else is not one", () => {
    const token = { accessToken: "a", refreshToken: "r", expiresAt: 5 };
    expect(parseStoredToken(JSON.stringify(token))).toEqual(token);
    expect(parseStoredToken(JSON.stringify({ ...token, expiresAt: null }))?.expiresAt).toBeNull();
    for (const text of [
      "",
      "not json",
      "null",
      "[]",
      JSON.stringify({ accessToken: "a" }),
      JSON.stringify({ ...token, expiresAt: "5" }),
    ])
      expect(parseStoredToken(text), text).toBeNull();
  });

  it("a token's name says the grant, the endpoint, the client and the scope, and no secret", () => {
    const one = auth({ grant: "password", scope: "read", username: "u", password: "p", clientSecret: "s" });
    expect(oauthTokenKey(one)).toBe('["password","https://idp.test/token","client 1","read","u"]');
    expect(
      oauthTokenKey({
        ...one,
        password: "other",
        clientSecret: "other",
        authUrl: "x",
        retryOn401: true,
        clientAuth: "body",
      }),
    ).toBe(oauthTokenKey(one));
    for (const patch of [
      { scope: "write" },
      { clientId: "c2" },
      { tokenUrl: "https://idp.test/t2" },
      { username: "v" },
      { grant: "client_credentials" as const },
    ]) {
      expect(oauthTokenKey({ ...one, ...patch }), JSON.stringify(patch)).not.toBe(oauthTokenKey(one));
    }
    // Another user's name is not part of a grant that has no user.
    expect(oauthTokenKey(auth({ username: "u" }))).toBe(oauthTokenKey(auth({ username: "v" })));
  });
});
