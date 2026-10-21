import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { UiButton } from "../../../ui/button";
import { UiSpinner } from "../../../ui/spinner";
import { tokenExpired } from "@wayfarer/core";
import { OAuthTokens } from "../../../services/oauth-tokens";
import { SecretsVault } from "../../../services/secrets-vault";
import { WorkspaceStore } from "../../../state/workspace-store";

/**
 * The OAuth 2.0 token of the request being composed (P4.7): whether there
 * is one, until when, where it is kept, and the buttons that get one and
 * forget it. The auth may be the request's own or one it inherits.
 */
@Component({
  selector: "app-oauth-token",
  imports: [UiButton, UiSpinner],
  templateUrl: "./oauth-token.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "oauth-token block rounded-xl bg-canvas-panel border border-separator p-3.5" },
})
export class OAuthTokenPanel {
  private readonly store = inject(WorkspaceStore);
  protected readonly tokens = inject(OAuthTokens);
  private readonly vault = inject(SecretsVault);

  protected readonly busy = signal(false);
  protected readonly error = signal("");
  /** The time, read every second: a token expires while the panel is open. */
  private readonly now = signal(Date.now());

  protected readonly token = computed(() => {
    const oauth = this.store.oauth();
    return oauth ? this.tokens.token(oauth.key) : undefined;
  });
  protected readonly interactive = computed(() => this.store.oauth()?.auth.grant === "authorization_code");

  protected readonly status = computed(() => {
    const token = this.token();
    if (!token) return this.interactive() ? "No token yet. Get token opens the sign-in in a window." : "No token yet. One is asked for when the request is sent.";
    const kept = this.vault.isUnlocked() ? "It is kept in the vault." : "It is kept in this tab's memory only: the vault is locked.";
    if (token.expiresAt === null) return `There is a token. The server named no expiry. ${kept}`;
    const when = new Date(token.expiresAt).toLocaleTimeString();
    if (!tokenExpired(token, this.now())) return `There is a token, good until ${when}. ${kept}`;
    return token.refreshToken || !this.interactive() ? `The token expired at ${when}. A new one is asked for when the request is sent.` : `The token expired at ${when}. Get a new one.`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async get(): Promise<void> {
    this.error.set("");
    this.busy.set(true);
    try {
      await this.store.getOAuthToken();
    } catch (error) {
      // An `OAuthError` or a `SendBlockedError`: both are written for the user.
      if (!(error instanceof Error)) throw error;
      this.error.set(error.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected clear(): void {
    const oauth = this.store.oauth();
    this.error.set("");
    if (oauth) void this.tokens.clear(oauth.key);
  }
}
