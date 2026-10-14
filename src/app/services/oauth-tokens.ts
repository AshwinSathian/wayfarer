import { Injectable, effect, inject, signal, untracked } from "@angular/core";
import {
  OAUTH_CHANNEL,
  OAuthError,
  TransportError,
  authorizationUrl,
  newId,
  parseStoredToken,
  pkcePair,
  readTokenResponse,
  tokenExpired,
  tokenRequest,
  type OAuth2Auth,
  type OAuthExchange,
  type OAuthToken,
} from "@wayfarer/core";
import { Idb } from "../data/idb";
import { containsSecretPlaceholder, type RoutePolicy } from "@wayfarer/core";
import { RequestSettings } from "./request-settings";
import { SecretsVault } from "./secrets-vault";
import { TransportRouter } from "./transport-router";

/** A token's vault secret is named this and the token's key. */
const SECRET_NAME = "OAuth 2.0 token ";
/** How long a sign-in window is waited for: the app cannot see it close (plan P4.7). */
const SIGN_IN_MS = 5 * 60_000;

const NO_ANSWER =
  "The token request got no answer the page could read. A token endpoint that does not send Access-Control-Allow-Origin for this page cannot be called from a browser: " +
  "send it through the Local Bridge (Settings, Local Bridge, Route), which has no such limit. See docs/browser-limits.md#oauth.";

/**
 * OAuth 2.0 tokens (P4.7): gets one, renews it, and keeps it. A token is
 * kept as a vault secret when the vault is unlocked, and otherwise in this
 * tab's memory only: nothing else stores one. It is named by `oauthTokenKey`
 * of its auth, which holds no secret.
 *
 * Every token request goes through `TransportRouter`, like the user's own
 * request, and is refused when it still holds a vault secret's reference
 * (C-007). None is written to history.
 */
@Injectable({ providedIn: "root" })
export class OAuthTokens {
  private readonly vault = inject(SecretsVault);
  private readonly transport = inject(TransportRouter);
  private readonly settings = inject(RequestSettings);

  private readonly held = signal<ReadonlyMap<string, OAuthToken>>(new Map());
  /** A sign-in window is open and its answer is waited for. */
  readonly waiting = signal(false);
  /** Something the user should know about the sign-in that is open. */
  readonly notice = signal("");
  private signIn: AbortController | undefined;

  constructor() {
    // Unlocked: what this tab got while the vault was locked goes in, and what the vault holds comes out.
    effect(() => {
      if (this.vault.isUnlocked()) untracked(() => void this.sync(true));
    });
    // Another tab renewed a token: its refresh token replaced the one held here.
    inject(Idb).onChangeElsewhere((stores) => {
      if (stores.includes("secrets") && this.vault.isUnlocked()) void this.sync(false);
    });
  }

  /** The token held for `key`, if any. A signal's value: a view that reads it follows it. */
  token(key: string): OAuthToken | undefined {
    return this.held().get(key);
  }

  /**
   * A token to send with, without asking the user for anything but the
   * vault's passphrase: the one held if it has not expired, else a renewed
   * one. `renew` asks for a new one whatever the held one says (a 401).
   * `auth` is resolved, secrets included; `key` is its `oauthTokenKey`.
   */
  async tokenFor(auth: OAuth2Auth, key: string, options: { renew?: boolean; signal?: AbortSignal } = {}): Promise<string> {
    let token = this.token(key);
    // Not held by this tab: the vault may have it. Read here and waited for, not left to the effect that follows an unlock.
    const secret = token ? undefined : await this.stored(key);
    if (secret) {
      if (!(await this.vault.ensureUnlocked())) throw new OAuthError("The OAuth 2.0 token is in the vault, which is locked. Unlock it to send.");
      token = parseStoredToken((await this.vault.readSecret(secret.id)) ?? "") ?? undefined;
      if (token) this.hold(key, token);
    }
    if (token && !options.renew && !tokenExpired(token, Date.now())) return token.accessToken;
    if (token?.refreshToken) {
      try {
        return (await this.exchange(auth, key, { refreshToken: token.refreshToken }, token, options.signal)).accessToken;
      } catch (error) {
        // A refresh token the server no longer takes: a grant that needs no user asks again, below.
        if (!(error instanceof OAuthError) || auth.grant === "authorization_code") throw error;
      }
    }
    if (auth.grant !== "authorization_code") return (await this.exchange(auth, key, "grant", undefined, options.signal)).accessToken;
    throw new OAuthError(token ? "The OAuth 2.0 token has expired and cannot be renewed. Choose Get token in the Auth tab." : "There is no OAuth 2.0 token yet. Choose Get token in the Auth tab.");
  }

  /**
   * Gets a new token because the user asked. The code grant opens the
   * identity provider in a window; `public/oauth/callback.html` posts what
   * came back on a `BroadcastChannel` (plan D20: the window has no opener
   * under COOP), and only an answer with the `state` made here is taken.
   * The wait ends with the answer, with `cancel()`, or after five minutes.
   */
  async get(auth: OAuth2Auth, key: string): Promise<void> {
    if (auth.grant !== "authorization_code") {
      await this.exchange(auth, key, "grant");
      return;
    }
    if (!globalThis.crypto?.subtle) throw new OAuthError("OAuth 2.0 sign-in needs the browser's cryptography, which a page has only over https or from localhost.");
    this.signIn?.abort("Another sign-in was started.");
    const abort = new AbortController();
    this.signIn = abort;
    const redirectUri = oauthRedirectUri();
    const state = newId();
    const { verifier, challenge } = await pkcePair();
    const address = authorizationUrl(auth, redirectUri, state, challenge);
    const channel = new BroadcastChannel(OAUTH_CHANNEL);
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.notice.set("");
    this.waiting.set(true);
    try {
      const answer = new Promise<Record<string, unknown>>((resolve, reject) => {
        channel.onmessage = (event: MessageEvent<unknown>) => {
          const data = typeof event.data === "object" && event.data !== null ? (event.data as Record<string, unknown>) : {};
          if (data["state"] !== state) {
            // Another tab's sign-in, or something that is not ours at all. It is not taken.
            if (data["code"] || data["error"]) this.notice.set("An answer came back with a state this app did not issue, and was ignored.");
            return;
          }
          // Tells the callback page it may close.
          channel.postMessage({ state, received: true });
          resolve(data);
        };
        abort.signal.addEventListener("abort", () => reject(new OAuthError(String(abort.signal.reason))));
        timer = setTimeout(() => abort.abort("The sign-in was not finished within five minutes."), SIGN_IN_MS);
      });
      if (!window.open(address, "_blank", "popup,width=520,height=720")) {
        throw new OAuthError("The browser blocked the sign-in window. Allow pop-ups for this page and try again.");
      }
      const { code, error, description } = await answer;
      if (typeof code !== "string" || !code) {
        throw new OAuthError(`The sign-in ended without a code: ${typeof error === "string" ? error.slice(0, 200) : "the answer held none"}${typeof description === "string" ? ` (${description.slice(0, 300)})` : ""}.`);
      }
      await this.exchange(auth, key, { code, verifier, redirectUri }, undefined, abort.signal);
    } finally {
      clearTimeout(timer);
      channel.close();
      if (this.signIn === abort) {
        this.signIn = undefined;
        this.waiting.set(false);
      }
    }
  }

  /** Gives up on the sign-in that is open. */
  cancel(): void {
    this.signIn?.abort("The sign-in was cancelled.");
  }

  /** Forgets the token, here and in the vault. */
  async clear(key: string): Promise<void> {
    this.hold(key, undefined);
    const secret = await this.stored(key);
    if (secret) await this.vault.deleteSecret(secret.id);
  }

  /** One request to the token endpoint, and the token it gave, kept. */
  private async exchange(auth: OAuth2Auth, key: string, exchange: OAuthExchange, previous?: OAuthToken, signal?: AbortSignal): Promise<OAuthToken> {
    const request = tokenRequest(auth, exchange);
    if (!URL.canParse(request.url)) throw new OAuthError("The token URL is not an address. No token was asked for.");
    if (containsSecretPlaceholder(request)) {
      throw new OAuthError("The token request refers to a vault secret that could not be read (it may have been deleted), so it was not sent.");
    }
    let status: number;
    let body: string;
    // The device's route; nothing is asked: a token request the browser may have sent is not sent again (D7).
    const policy: RoutePolicy = { route: this.transport.route() };
    try {
      const envelope = await this.transport.send(request, { signal: signal ?? new AbortController().signal, timeoutMs: this.settings.timeoutMs() }, policy);
      status = envelope.status;
      body = await new Response(envelope.body).text();
    } catch (error) {
      if (!(error instanceof TransportError)) throw error;
      throw new OAuthError(error.kind === "network" && policy.took === "direct" ? NO_ANSWER : `The token request failed: ${error.message}`);
    }
    const token = readTokenResponse(status, body, Date.now(), previous);
    this.hold(key, token);
    if (this.vault.isUnlocked()) await this.store(key, token);
    return token;
  }

  private hold(key: string, token: OAuthToken | undefined): void {
    const next = new Map(this.held());
    if (token) next.set(key, token);
    else next.delete(key);
    this.held.set(next);
  }

  private async stored(key: string) {
    return (await this.vault.listSecrets()).find((secret) => secret.name === SECRET_NAME + key);
  }

  private async store(key: string, token: OAuthToken): Promise<void> {
    const secret = await this.stored(key);
    const plaintext = JSON.stringify(token);
    if (!secret || !(await this.vault.replaceSecret(secret.id, plaintext))) await this.vault.saveSecret({ name: SECRET_NAME + key, plaintext });
  }

  /** Brings this tab and the vault into step. `mine`: what this tab holds is the newer and is written; otherwise the vault's is. */
  private async sync(mine: boolean): Promise<void> {
    if (mine) for (const [key, token] of this.held()) await this.store(key, token);
    for (const secret of await this.vault.listSecrets()) {
      if (!secret.name.startsWith(SECRET_NAME)) continue;
      const key = secret.name.slice(SECRET_NAME.length);
      if (mine && this.token(key)) continue;
      const token = parseStoredToken((await this.vault.readSecret(secret.id)) ?? "");
      if (token) this.hold(key, token);
    }
  }
}

/** Where the identity provider sends the sign-in window back to: the app's own callback page. It is what a client registers. */
export function oauthRedirectUri(): string {
  return `${location.origin}/oauth/callback`;
}
