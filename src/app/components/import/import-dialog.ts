import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { UiSpinner } from "../../ui/spinner";
import { UiInput } from "../../ui/input";
import { Icon } from "../../shared/icon/icon";
import { ImportPipeline } from "../../services/import-pipeline";
import { CollectionsStore } from "../../services/collections-store";
import { ScriptTrust } from "../../services/script-trust";
import { scriptsOf, type CollectionImportPlanEntry, type ImportedCollection } from "@wayfarer/core";
import { Dialog } from "../../ui/dialog";
import { ScriptReviewDialog } from "../composer/script-review-dialog";

/**
 * The one import dialog (plan P4.1): what a picked file will add and what
 * of it could not be kept, shown before anything is stored. Cancel stores
 * nothing. Every "Import" button of the app opens it through `ImportPipeline`.
 */
@Component({
  selector: "app-import-dialog",
  imports: [Dialog, FormsModule, Icon, ScriptReviewDialog, UiButton, UiCheckbox, UiInput, UiSpinner],
  templateUrl: "./import-dialog.html",
  styleUrl: "./import-dialog.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportDialog {
  protected readonly pipeline = inject(ImportPipeline);
  private readonly collections = inject(CollectionsStore);
  private readonly trust = inject(ScriptTrust);
  /** A report names an item in lower case (`collection "Shop"`); it starts a sentence here (C44). */
  protected sentence(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * The file is one collection with scripts: the import can end in their review (D5-e), where the person meets them.
   * It still stores them unapproved; only the review's "Trust these scripts" approves.
   */
  protected readonly holdsScripts = computed(() => {
    const collections = this.pipeline.imported()?.collections ?? [];
    if (collections.length !== 1) return false;
    const { collection, folders, requests } = collections[0].payload;
    return [collection, ...folders, ...requests].some((holder) => scriptsOf(holder).length);
  });
  protected readonly reviewing = signal(false);
  /**
   * Import: with the box for a command open, reads it in the worker and opens the report a file opens (U-201); there,
   * it stores what the report shows. Nothing is stored before the report's Import.
   */
  protected async importClicked(): Promise<void> {
    if (!this.pipeline.pasting()) {
      await this.pipeline.confirm();
      return;
    }
    await this.pipeline.stage("the pasted command", this.pipeline.pasted());
  }

  protected async importAndReview(): Promise<void> {
    const [id] = await this.pipeline.confirm();
    if (!id) return;
    this.trust.reviewOf.set(id);
    this.reviewing.set(true);
  }

  protected reviewClosed(open: boolean): void {
    if (open) return;
    this.reviewing.set(false);
    this.trust.reviewOf.set(null);
  }

  /**
   * What an item does to what is stored (U-160, U-161): New when nothing has its id, Same when the stored copy holds
   * what the file holds, Changes when it differs. "Replaces" said all three alike.
   */
  protected effectOf(
    entry: ImportedCollection,
    item: CollectionImportPlanEntry,
  ): "New" | "Same" | "Changes" | "Moves here" {
    if (item.action === "create") return "New";
    // By id in every collection: a file may name one another collection holds, and the import takes it from there.
    const trees = this.collections.tree();
    const pick = <T extends { meta: { id: string } }>(list: T[] | undefined) =>
      list?.find((doc) => doc.meta.id === item.id);
    const [stored, incoming] =
      item.type === "collection"
        ? [trees.find((tree) => tree.collection.meta.id === item.id)?.collection, entry.payload.collection]
        : item.type === "folder"
          ? [pick(trees.flatMap((tree) => tree.folders)), pick(entry.payload.folders)]
          : [pick(trees.flatMap((tree) => tree.requests)), pick(entry.payload.requests)];
    if (!stored) return "New";
    if ("collectionId" in stored && stored.collectionId !== entry.payload.collection.meta.id) return "Moves here";
    return shape(stored) === shape(incoming) ? "Same" : "Changes";
  }

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
    return [`"${this.pipeline.fileName()}" was not imported:`, refused.message, ...issues].join(" ");
  });
  protected readonly reportText = computed(() => {
    const imported = this.pipeline.imported();
    if (!imported) return "";
    const warnings = imported.report.warnings.length;
    const said = [`"${this.pipeline.fileName()}" will add ${this.counts()}.`];
    if (warnings) said.push(`${warnings} ${warnings === 1 ? "thing" : "things"} to know before you import.`);
    return said.join(" ");
  });

  /** "1 folder", "3 variables": a count with its noun agreeing (U-098). */
  protected plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
  }

  /** The kind of an item of the plan, as a word of a sentence: "Collection", "Folder", "Request". */
  protected kindOf(type: string): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

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

/** A stored or imported item as text, without what the store keeps of its own (ids, times, script approvals). */
function shape(item: object | undefined): string {
  if (!item) return "";
  const {
    meta: _meta,
    id: _id,
    collectionId: _collection,
    scriptTrust: _trust,
    ...rest
  } = item as Record<string, unknown>;
  // Keys in one order at every level: a replacer array lists each key once, sorted.
  const keys = new Set<string>();
  JSON.stringify(rest, (key: string, value: unknown) => (keys.add(key), value));
  return JSON.stringify(rest, [...keys].sort());
}
