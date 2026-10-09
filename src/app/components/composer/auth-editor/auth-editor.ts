import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatIconButton } from "@angular/material/button";
import { MatOption } from "@angular/material/core";
import { MatSelect } from "@angular/material/select";
import type { AuthConfig } from "@wayfarer/core";
import { Icon } from "../../../shared/icon/icon";

type AuthType = AuthConfig["type"];
const emptyApiKey = { type: "apikey", key: "", value: "", in: "header" } as const;

/**
 * The composer's Auth tab — extracted out of the composer (same
 * pattern as `ApiParamsBasic` for Params/Headers/Body) so the
 * "build a new AuthConfig from a field edit" logic has its own
 * testable home. The parent still owns the `showPassword` toggle state and
 * resets it on auth-type change/request load, so `authTypeChange` is a
 * distinct output from the generic `authChange` used by field edits.
 */
@Component({
  selector: "app-auth-editor",
  imports: [MatFormField, MatInput, Icon, FormsModule, MatIconButton, MatSelect, MatOption],
  templateUrl: "./auth-editor.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthEditor {
  readonly auth = input.required<AuthConfig>();
  readonly showPassword = input(false);

  readonly authTypeChange = output<AuthType>();
  readonly authChange = output<AuthConfig>();
  readonly togglePasswordVisibility = output<void>();

  readonly authTypes: { label: string; value: AuthType }[] = [
    { label: "None", value: "none" },
    { label: "Bearer Token", value: "bearer" },
    { label: "Basic Auth", value: "basic" },
    { label: "API Key", value: "apikey" },
  ];

  readonly apiKeyAddToOptions: { label: string; value: "header" | "query" }[] = [
    { label: "Header", value: "header" },
    { label: "Query param", value: "query" },
  ];

  onAuthTypeChange(type: AuthType): void {
    this.authTypeChange.emit(type);
  }

  // Each field belongs to one auth type, and its input exists only while that type is chosen.
  setBearerToken(token: string): void {
    this.authChange.emit({ type: "bearer", token });
  }

  setBasicUsername(username: string): void {
    const auth = this.auth();
    this.authChange.emit({ type: "basic", username, password: auth.type === "basic" ? auth.password : "" });
  }

  setBasicPassword(password: string): void {
    const auth = this.auth();
    this.authChange.emit({ type: "basic", username: auth.type === "basic" ? auth.username : "", password });
  }

  setApiKeyField(patch: Partial<{ key: string; value: string; in: "header" | "query" }>): void {
    const auth = this.auth();
    this.authChange.emit({ ...(auth.type === "apikey" ? auth : emptyApiKey), ...patch });
  }

  onTogglePasswordVisibility(): void {
    this.togglePasswordVisibility.emit();
  }
}
