import { newId } from "../id";
import type { AuthConfig } from "../model/request";
import type { ResolvedRequest } from "../transport/transport";

export type OAuth2Auth = Extract<AuthConfig, { type: "oauth2" }>;

/** What a token endpoint gave. `expiresAt` is a time in milliseconds, or `null` when the server named none. */
export interface OAuthToken {
  accessToken: string;
  /** Empty when the server gave none. */
  refreshToken: string;
  expiresAt: number | null;
}

/** A token could not be had: the message says why, in words for the user. */
export class OAuthError extends Error {
  override readonly name = "OAuthError";
}

/** The channel the callback page (`public/oauth/callback.html`) answers on (plan D20). */
export const OAUTH_CHANNEL = "wayfarer:oauth";

/**
 * Names the token of an auth: where it is from, for whom and for what. Made
 * from the auth with its variables replaced and its vault secrets not read,
 * so that it holds no secret: it is the name the token is stored under.
 */
export function oauthTokenKey(auth: OAuth2Auth): string {
  return JSON.stringify([
    auth.grant,
    auth.tokenUrl,
    auth.clientId,
    auth.scope,
    auth.grant === "password" ? auth.username : "",
  ]);
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** A PKCE pair (RFC 7636, S256): 244 random bits as the verifier, and its SHA-256 as the challenge. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = `${newId()}${newId()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** The address the popup opens: the identity provider's, with what the code grant asks for. */
export function authorizationUrl(auth: OAuth2Auth, redirectUri: string, state: string, challenge: string): string {
  if (!URL.canParse(auth.authUrl)) throw new OAuthError("The authorization URL is not an address. Nothing was opened.");
  const url = new URL(auth.authUrl);
  const query: [string, string][] = [
    ["response_type", "code"],
    ["client_id", auth.clientId],
    ["redirect_uri", redirectUri],
    ["state", state],
    ["code_challenge", challenge],
    ["code_challenge_method", "S256"],
  ];
  if (auth.scope) query.push(["scope", auth.scope]);
  for (const [name, value] of query) url.searchParams.set(name, value);
  return url.href;
}

/** What is exchanged for a token: the code the popup brought back, a refresh token, or the auth's own grant. */
export type OAuthExchange =
  { code: string; verifier: string; redirectUri: string } | { refreshToken: string } | "grant";

/**
 * The request to the token endpoint (RFC 6749): a form, with the client
 * named in a Basic header or in the form as the auth says. A client with no
 * secret is always named in the form: that is how a public client says who
 * it is.
 */
export function tokenRequest(auth: OAuth2Auth, exchange: OAuthExchange): ResolvedRequest & { body: string } {
  const form: [string, string][] = [];
  if (exchange === "grant") {
    if (auth.grant === "authorization_code")
      throw new OAuthError("This grant needs a sign-in: choose Get token in the Auth tab.");
    form.push(["grant_type", auth.grant]);
    if (auth.grant === "password") form.push(["username", auth.username], ["password", auth.password]);
    if (auth.scope) form.push(["scope", auth.scope]);
  } else if ("code" in exchange) {
    form.push(
      ["grant_type", "authorization_code"],
      ["code", exchange.code],
      ["redirect_uri", exchange.redirectUri],
      ["code_verifier", exchange.verifier],
    );
  } else {
    form.push(["grant_type", "refresh_token"], ["refresh_token", exchange.refreshToken]);
  }
  const headers: [string, string][] = [
    ["Content-Type", "application/x-www-form-urlencoded"],
    ["Accept", "application/json"],
  ];
  if (auth.clientAuth === "header" && auth.clientSecret) {
    // RFC 6749, 2.3.1: each is form-encoded before the two are joined.
    const pair = `${new URLSearchParams({ k: auth.clientId }).toString().slice(2)}:${new URLSearchParams({ k: auth.clientSecret }).toString().slice(2)}`;
    headers.push(["Authorization", `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(pair)))}`]);
  } else {
    if (auth.clientId) form.push(["client_id", auth.clientId]);
    if (auth.clientSecret) form.push(["client_secret", auth.clientSecret]);
  }
  return { method: "POST", url: auth.tokenUrl, headers, body: new URLSearchParams(form).toString() };
}

const own = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

/**
 * The token of a token endpoint's answer, or an `OAuthError` that says what
 * the server said. A refresh that brings no new refresh token keeps the one
 * it was made with (`previous`); one that brings a new one replaces it.
 */
export function readTokenResponse(status: number, body: string, now: number, previous?: OAuthToken): OAuthToken {
  let answer: unknown;
  try {
    answer = JSON.parse(body);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new OAuthError(`The token endpoint answered ${status} with something that is not JSON.`);
  }
  const error = own(answer, "error");
  if (status < 200 || status > 299 || typeof error === "string") {
    const description = own(answer, "error_description");
    throw new OAuthError(
      `The token endpoint refused: ${typeof error === "string" ? error.slice(0, 200) : status}${typeof description === "string" ? ` (${description.slice(0, 300)})` : ""}.`,
    );
  }
  const accessToken = own(answer, "access_token");
  if (typeof accessToken !== "string" || !accessToken)
    throw new OAuthError("The token endpoint's answer holds no access token.");
  const type = own(answer, "token_type");
  if (typeof type === "string" && type.toLowerCase() !== "bearer")
    throw new OAuthError(`The token is of a type the app cannot send (${type.slice(0, 40)}): only Bearer tokens are.`);
  const expiresIn = Number(own(answer, "expires_in"));
  const refreshToken = own(answer, "refresh_token");
  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" && refreshToken ? refreshToken : (previous?.refreshToken ?? ""),
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? now + expiresIn * 1000 : null,
  };
}

/** A token as it is kept (the vault's plaintext), read back. `null` for anything that is not one. */
export function parseStoredToken(text: string): OAuthToken | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  const accessToken = own(value, "accessToken");
  const refreshToken = own(value, "refreshToken");
  const expiresAt = own(value, "expiresAt");
  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    (expiresAt !== null && typeof expiresAt !== "number")
  )
    return null;
  return { accessToken, refreshToken, expiresAt };
}

export const tokenExpired = (token: OAuthToken, now: number): boolean =>
  token.expiresAt !== null && token.expiresAt <= now;
