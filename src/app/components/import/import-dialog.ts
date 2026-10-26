import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { UiSpinner } from "../../ui/spinner";
import { ImportPipeline } from "../../services/import-pipeline";
import { Dialog } from "../../ui/dialog";

/**
 * The one import dialog (plan P4.1): what a picked file will add and what
 * of it could not be kept, shown before anything is stored. Cancel stores
 * nothing. Every "Import" button of the app opens it through `ImportPipeline`.
 */
@Component({
  selector: "app-import-dialog",
  imports: [Dialog, FormsModule, UiButton, UiCheckbox, UiSpinner],
  templateUrl: "./import-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportDialog {
  protected readonly pipeline = inject(ImportPipeline);

  /** Named for what the file holds, once that is known. */
  protected readonly header = computed(() => {
    const imported = this.pipeline.imported();
    if (imported?.collections.length) return "Import collection";
    if (imported?.environments.length) return "Import environments";
    return "Import";
  });

  /** What the live regions say when a file is refused or read (U-075). */
  protected readonly refusedText = computed(() => {
    const refused = this.pipeline.refused();
    if (!refused) return "";
    const issues = refused.issues.map((issue) => (issue.path ? `${issue.path} — ` : "") + issue.message);
    return [`Unable to import "${this.pipeline.fileName()}":`, refused.message, ...issues].join(" ");
  });
  protected readonly reportText = computed(() => {
    const imported = this.pipeline.imported();
    if (!imported) return "";
    const warnings = imported.report.warnings.length;
    const said = [`"${this.pipeline.fileName()}" will add ${this.counts()}.`];
    if (warnings) said.push(`${warnings} ${warnings === 1 ? "thing" : "things"} to know before you import.`);
    return said.join(" ");
  });

  /** "1 collection, 2 folders and 5 requests": the kinds the file has any of. */
  protected readonly counts = computed(() => {
    const counts = this.pipeline.imported()?.report.counts;
    if (!counts) return "";
    const parts = (["collection", "folder", "request", "environment"] as const)
      .map((kind) => [kind, counts[`${kind}s`]] as const)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`);
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "nothing");
  });
}
