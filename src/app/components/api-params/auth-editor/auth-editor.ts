import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconButton } from "@angular/material/button";
import { Select } from "../../../ui/select";
import { AuthType, HttpAuthPlaceholder } from "../../../models/collections";
import { Icon } from "../../../shared/icon/icon";

/**
 * The composer's Auth tab — extracted out of `ApiParams` (same
 * pattern as `ApiParamsBasic` for Params/Headers/Body) so the
 * "build a new HttpAuthPlaceholder from a field edit" logic has its own
 * testable home. The parent still owns the `showPassword` toggle state and
 * resets it on auth-type change/request load, so `authTypeChange` is a
 * distinct output from the generic `authChange` used by field edits.
 */
@Component({
  selector: "app-auth-editor",
  imports: [Icon, FormsModule, MatIconButton, Select],
  templateUrl: "./auth-editor.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthEditor {
  readonly auth = input.required<HttpAuthPlaceholder>();
  readonly showPassword = input(false);

  readonly authTypeChange = output<AuthType>();
  readonly authChange = output<HttpAuthPlaceholder>();
  readonly togglePasswordVisibility = output<void>();

  readonly authTypes: { label: string; value: AuthType }[] = [
    { label: "None", value: "none" },
    { label: "Bearer Token", value: "bearer" },
    { label: "Basic Auth", value: "basic" },
    { label: "API Key", value: "api-key" },
  ];

  readonly apiKeyAddToOptions: { label: string; value: "header" | "query" }[] = [
    { label: "Header", value: "header" },
    { label: "Query param", value: "query" },
  ];

  onAuthTypeChange(type: AuthType): void {
    this.authTypeChange.emit(type);
  }

  setBearerToken(token: string): void {
    this.authChange.emit({ ...this.auth(), bearer: { token } });
  }

  setBasicUsername(username: string): void {
    const auth = this.auth();
    this.authChange.emit({
      ...auth,
      basic: { username, password: auth.basic?.password ?? "" },
    });
  }

  setBasicPassword(password: string): void {
    const auth = this.auth();
    this.authChange.emit({
      ...auth,
      basic: { username: auth.basic?.username ?? "", password },
    });
  }

  setApiKeyField(patch: Partial<{ key: string; value: string; addTo: "header" | "query" }>): void {
    const auth = this.auth();
    this.authChange.emit({
      ...auth,
      apiKey: {
        key: auth.apiKey?.key ?? "",
        value: auth.apiKey?.value ?? "",
        addTo: auth.apiKey?.addTo ?? "header",
        ...patch,
      },
    });
  }

  onTogglePasswordVisibility(): void {
    this.togglePasswordVisibility.emit();
  }
}
