import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { authFromV4, authToV4 } from "@wayfarer/core";
import { WorkspaceStore } from "../../state/workspace-store";
import { AuthEditor } from "./auth-editor/auth-editor";
import { ComposerView } from "./composer-view";

/** The draft's auth, edited through `AuthEditor`, which still speaks the v4 shape. */
@Component({
  selector: "app-auth-panel",
  imports: [AuthEditor],
  template: `
    <app-auth-editor
      [auth]="auth()"
      [showPassword]="view.showAuthPassword()"
      (authTypeChange)="view.onAuthTypeChange($event)"
      (authChange)="store.patch({ auth: fromV4($event) })"
      (togglePasswordVisibility)="view.showAuthPassword.set(!view.showAuthPassword())"
    ></app-auth-editor>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPanel {
  protected readonly store = inject(WorkspaceStore);
  protected readonly view = inject(ComposerView);

  protected readonly auth = computed(() => authToV4(this.store.draft().auth));
  protected readonly fromV4 = authFromV4;
}
