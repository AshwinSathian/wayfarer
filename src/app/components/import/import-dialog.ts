import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { UiSpinner } from "../../ui/spinner";
import { ImportPipeline } from "../../services/import-pipeline";
import { CollectionsStore } from "../../services/collections-store";
import type { CollectionImportPlanEntry, ImportedCollection } from "@wayfarer/core";
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
  styleUrl: "./import-dialog.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportDialog {
  protected readonly pipeline = inject(ImportPipeline);
  private readonly collections = inject(CollectionsStore);

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
