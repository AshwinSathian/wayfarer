import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { AuthConfig } from "@wayfarer/core";
import { oauthRedirectUri } from "../../../services/oauth-tokens";
import { Icon } from "../../../shared/icon/icon";
import { UiButton } from "../../../ui/button";
import { UiCheckbox } from "../../../ui/checkbox";
import { UiInput } from "../../../ui/input";
import { UiSelect } from "../../../ui/select";
import { OAuthTokenPanel } from "../oauth-token/oauth-token";

type OAuthAuth = Extract<AuthConfig, { type: "oauth2" }>;

/** The fields of an OAuth 2.0 auth, under the redirect URI and the token, which a person needs first (U-045). */
@Component({
  selector: "app-oauth-fields",
  imports: [FormsModule, Icon, UiButton, UiCheckbox, UiInput, UiSelect, OAuthTokenPanel],
  templateUrl: "./oauth-fields.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuthFields {
  readonly auth = input.required<OAuthAuth>();
  readonly idPrefix = input("auth");
  readonly showPassword = input(false);
  readonly subject = input<"request" | "folder" | "collection">("request");

  readonly patch = output<Partial<Omit<OAuthAuth, "type">>>();
  readonly togglePassword = output<void>();

  protected readonly grants: { label: string; value: OAuthAuth["grant"] }[] = [
    { label: "Authorization code (PKCE)", value: "authorization_code" },
    { label: "Client credentials", value: "client_credentials" },
    { label: "Password (legacy)", value: "password" },
  ];
  protected readonly clientAuth: { label: string; value: OAuthAuth["clientAuth"] }[] = [
    { label: "Basic header", value: "header" },
    { label: "Request body", value: "body" },
  ];
  /** What a client registers with its identity provider. */
  protected readonly redirectUri = oauthRedirectUri();
}
