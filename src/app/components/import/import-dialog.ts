import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { UiSpinner } from "../../ui/spinner";
import { UiInput } from "../../ui/input";
import { Icon } from "../../shared/icon/icon";
import { ImportPipeline } from "../../services/import-pipeline";
import { CollectionsStore } from "../../services/collections-store";
import { ScriptTrust } from "../../services/script-trust";
import { SecretsVault } from "../../services/secrets-vault";
import { recordDiagnostic } from "../../services/diagnostics";
import {
  collectionHosts,
  receiverLines,
  receiverLineText,
  scriptsOf,
  type ReceiverLine,
  type VaultSecretName,
  type CollectionImportPlanEntry,
  type ImportedCollection,
} from "@wayfarer/core";
import { Dialog } from "../../ui/dialog";
import { ScriptReviewDialog } from "../composer/script-review-dialog";
import { DOCS } from "../../shared/docs";

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
  protected readonly docs = DOCS;
  protected readonly pipeline = inject(ImportPipeline);
  private readonly collections = inject(CollectionsStore);
  private readonly trust = inject(ScriptTrust);
  private readonly vault = inject(SecretsVault);
  /** This vault's secrets' ids and names, read for each report (never a value: they are readable while the vault is locked); `null` when they could not be read. */
  private readonly vaultSecrets = signal<VaultSecretName[] | null>([]);

  constructor() {
    effect(() => {
      if (this.pipeline.imported()) void this.readVaultSecrets();
    });
  }

  private async readVaultSecrets(): Promise<void> {
    try {
      this.vaultSecrets.set((await this.vault.listSecrets()).map(({ id, name }) => ({ id, name })));
    } catch (error) {
      recordDiagnostic(error, "import report: the vault's secrets");
      this.vaultSecrets.set(null);
    }
  }
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
  /** The code typed for a shared link. */
  protected readonly code = signal("");

  /** Enter in the code's field opens the link, as Open does. */
  protected openLink(event: Event): void {
    event.preventDefault();
    if (this.code().trim()) void this.pipeline.openWithCode(this.code());
  }

  /** Every host the collection sends to, shown before anything is stored (T1.3). */
  protected hostsOf(entry: ImportedCollection): string[] {
    return collectionHosts(entry.payload);
  }
  /** What the collection needs of the person receiving it: secrets, credentials, scripts (`receive.md`). */
  protected linesOf(entry: ImportedCollection): ReceiverLine[] {
    return receiverLines(entry.payload, this.vaultSecrets());
  }

  /**
   * Import: with the box for a command open, reads it in the worker and opens the report a file opens (U-201); with
   * the box for a link, Open reads the link; at the report, it stores what the report shows. Nothing is stored before the report's Import.
   */
  protected async importClicked(): Promise<void> {
    const pasting = this.pipeline.pasting();
    if (!pasting) await this.pipeline.confirm();
    else if (pasting === "link") await this.pipeline.openPastedLink(this.pipeline.pasted());
    else await this.pipeline.stage("the pasted command", this.pipeline.pasted());
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
   * Per collection of the file: the stored collection's name when this browser has its id (receive.md, File step 2),
   * each item's effect, counted, and for a list of at most `PLAN_ROWS` the rows with what changes first. Compared two
   * ways with what is stored: the base copy a three-way compare needs comes with T2.0's stores (PLAN-design row 1.73).
   * The stored items are looked up by id in maps made once here: a file may be 10 MB.
   */
  protected readonly reviews = computed(() => {
    const trees = this.collections.tree();
    // By id in every collection: a file may name one another collection holds, and the import takes it from there.
    const stored = lookup(
      trees.map((tree) => tree.collection),
      trees.flatMap((tree) => tree.folders),
      trees.flatMap((tree) => tree.requests),
    );
    return new Map(
      (this.pipeline.imported()?.collections ?? []).map((entry) => {
        const { collection, folders, requests } = entry.payload;
        const incoming = lookup([collection], folders, requests);
        const effects = entry.plan.map((item) =>
          effectOf(item, stored[item.type].get(item.id), incoming[item.type].get(item.id), collection.meta.id),
        );
        const rows =
          entry.plan.length > PLAN_ROWS
            ? []
            : entry.plan
                .map((item, index) => ({ item, effect: effects[index] }))
                .sort((a, b) => EFFECTS.indexOf(a.effect) - EFFECTS.indexOf(b.effect));
        const known = trees.find((tree) => tree.collection.meta.id === collection.meta.id)?.collection.name;
        return [entry, { known, rows, summary: summaryOf(effects) }] as const;
      }),
    );
  });

  /** Named for what the file holds, once that is known. */
  protected readonly header = computed(() => {
    const imported = this.pipeline.imported();
    if (this.pipeline.link() || this.pipeline.pasting() === "link") return "Open a shared collection";
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
    const known = [...this.reviews().values()].flatMap(({ known }) =>
      known ? [`You have this collection: ${known}. Review what this file changes.`] : [],
    );
    const said = [...known, `"${this.pipeline.fileName()}" will add ${this.counts()}.`];
    if (warnings) said.push(`${warnings} ${warnings === 1 ? "thing" : "things"} to know before you import.`);
    const [first] = imported.collections.length === 1 ? this.linesOf(imported.collections[0]) : [];
    if (first) said.push(receiverLineText(first));
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

type Effect = "New" | "Same" | "Changes" | "Moves here";
/** The plan is listed row by row up to this many items; past it the counts say it. */
const PLAN_ROWS = 200;

interface Stored {
  meta: { id: string };
}
/** The items of each kind by id. */
function lookup(collections: Stored[], folders: Stored[], requests: Stored[]) {
  const byId = (docs: Stored[]) => new Map<string, Stored>(docs.map((doc) => [doc.meta.id, doc]));
  return { collection: byId(collections), folder: byId(folders), request: byId(requests) };
}

/**
 * What an item does to what is stored (U-160, U-161): New when nothing has its id, Same when the stored copy holds
 * what the file holds, Changes when it differs, Moves here when another collection holds it. "Replaces" said all alike.
 */
function effectOf(item: CollectionImportPlanEntry, stored?: Stored, incoming?: Stored, collectionId?: string): Effect {
  if (item.action === "create" || !stored) return "New";
  if ("collectionId" in stored && stored.collectionId !== collectionId) return "Moves here";
  return shape(stored) === shape(incoming) ? "Same" : "Changes";
}
/** The order of the plan's rows: what changes what is stored comes first. */
const EFFECTS: Effect[] = ["Changes", "Moves here", "New", "Same"];

/** "2 items change, 1 is new and 9 are the same", or that nothing differs. */
function summaryOf(effects: Effect[]): string {
  const said = (
    [
      ["Changes", "changes", "change"],
      ["Moves here", "moves here from another collection", "move here from another collection"],
      ["New", "is new", "are new"],
      ["Same", "is the same", "are the same"],
    ] as const
  )
    .map(([effect, one, many]) => [effects.filter((each) => each === effect).length, one, many] as const)
    .filter(([count]) => count > 0)
    .map(
      ([count, one, many], index) =>
        `${count} ${index ? "" : count === 1 ? "item " : "items "}${count === 1 ? one : many}`,
    );
  if (effects.every((effect) => effect === "Same")) return "Nothing in this file differs from yours.";
  return `${said.length > 1 ? `${said.slice(0, -1).join(", ")} and ${said.at(-1)}` : said[0]}.`;
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
