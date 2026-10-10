import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { WorkspaceStore } from "../../state/workspace-store";
import { AuthEditor } from "./auth-editor/auth-editor";
import { ComposerView } from "./composer-view";

/** The draft's auth, edited through `AuthEditor`. */
@Component({
  selector: "app-auth-panel",
  imports: [AuthEditor],
  template: `
    <app-auth-editor
      [auth]="store.draft().auth"
      [inherited]="store.inheritedAuth()"
      [showPassword]="view.showAuthPassword()"
      (authTypeChange)="view.onAuthTypeChange($event)"
      (authChange)="store.patch({ auth: $event })"
      (togglePasswordVisibility)="view.showAuthPassword.set(!view.showAuthPassword())"
    ></app-auth-editor>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPanel {
  protected readonly store = inject(WorkspaceStore);
  protected readonly view = inject(ComposerView);
}
