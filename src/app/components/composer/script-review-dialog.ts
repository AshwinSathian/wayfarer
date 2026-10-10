import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { ScriptTrust } from "../../services/script-trust";
import { Dialog } from "../../ui/dialog";
import { ScriptEditor } from "../script-editor/script-editor";

/**
 * Shows every script that is waiting for approval, read-only, and asks the
 * user to trust them (plan D6, P3.8). One editor holds them all, each under
 * a comment line that names its request, its folder or the collection: what is on screen is the text that
 * will run, in the order of the list.
 */
@Component({
  selector: "app-script-review-dialog",
  imports: [Dialog, FormsModule, MatButton, ScriptEditor],
  templateUrl: "./script-review-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptReviewDialog {
  private readonly trust = inject(ScriptTrust);

  readonly visible = input(false);
  readonly visibleChange = output<boolean>();

  protected readonly saving = signal(false);
  protected readonly count = computed(() => this.trust.toReview().reduce((sum, request) => sum + (request.pre.trim() ? 1 : 0) + (request.post.trim() ? 1 : 0), 0));
  /** Where the scripts are: "the collection, 1 folder and 2 requests". */
  protected readonly places = computed(() => {
    const count = (kind: string) => this.trust.toReview().filter((entry) => entry.kind === kind).length;
    const some = (kind: string) => (count(kind) ? [`${count(kind)} ${kind}${count(kind) === 1 ? "" : "s"}`] : []);
    const parts = [...(count("collection") ? ["the collection"] : []), ...some("folder"), ...some("request")];
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  });
  protected readonly text = computed(() =>
    this.trust
      .toReview()
      .flatMap((request) => [
        ...(request.pre.trim() ? [`// ---- ${request.name}: pre-request script ----\n${request.pre}`] : []),
        ...(request.post.trim() ? [`// ---- ${request.name}: post-response script ----\n${request.post}`] : []),
      ])
      .join("\n\n")
  );

  protected async approve(): Promise<void> {
    this.saving.set(true);
    try {
      await this.trust.approve();
      this.visibleChange.emit(false);
    } finally {
      this.saving.set(false);
    }
  }
}
