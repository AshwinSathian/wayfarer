import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiButton } from "../../ui/button";
import { Tab, TabContent, TabPanel, Tabs } from "@angular/aria/tabs";
import { UiTabList } from "../../ui/tabs";
import { ancestorsOf, effectiveAuth, emptyAuth, scriptsApproved, scriptsOf, variableChanges, type AuthConfig, type Route, type Row, type Scripts } from "@wayfarer/core";
import { CollectionsStore } from "../../services/collections-store";
import { Dialog } from "../../ui/dialog";
import { AuthEditor } from "../composer/auth-editor/auth-editor";
import { RowsEditor } from "../composer/rows-editor/rows-editor";
import { ScriptEditor } from "../script-editor/script-editor";
import { UiSelect, type UiSelectOption } from "../../ui/select";

/** The collection, or the folder in it, whose settings are open. */
export interface InheritedSettingsTarget {
  collectionId: string;
  folderId?: string;
}

/**
 * What a collection or a folder holds for the requests in it (P4.9): auth
 * for those set to inherit, variables, and scripts that run before and
 * after each of them. A collection also holds the route its requests are
 * sent by (P6.4).
 */
@Component({
  selector: "app-inherited-settings-dialog",
  imports: [AuthEditor, Dialog, FormsModule, UiButton, UiSelect, Tab, TabContent, TabPanel, Tabs, UiTabList, RowsEditor, ScriptEditor],
  templateUrl: "./inherited-settings-dialog.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InheritedSettingsDialog {
  private readonly collections = inject(CollectionsStore);

  /** Null while the dialog is closed. */
  readonly target = input<InheritedSettingsTarget | null>(null);
  readonly closed = output<void>();

  protected readonly tab = signal<"auth" | "variables" | "scripts" | "route">("auth");
  protected readonly auth = signal<AuthConfig>({ type: "none" });
  protected readonly showPassword = signal(false);
  /** A copy, edited in place by the rows editor. */
  protected readonly rows = signal<Row[]>([]);
  protected readonly scripts = signal<Scripts>({ pre: "", post: "" });
  /** A collection's own route; null: the device's. */
  protected readonly route = signal<Route | null>(null);
  protected readonly routes: UiSelectOption<Route | null>[] = [
    { value: null, label: "The device's (Settings, Local Bridge)" },
    { value: "auto", label: "Auto" },
    { value: "direct", label: "Direct" },
    { value: "bridge", label: "Local Bridge" },
  ];
  protected readonly saving = signal(false);

  private readonly tree = computed(() => this.collections.tree().find((entry) => entry.collection.meta.id === this.target()?.collectionId));
  private readonly folder = computed(() => this.tree()?.folders.find((folder) => folder.meta.id === this.target()?.folderId));
  /** The collection or the folder as it is stored. */
  private readonly node = computed(() => (this.target()?.folderId ? this.folder() : this.tree()?.collection));

  protected readonly kind = computed(() => (this.target()?.folderId ? "folder" : "collection"));
  protected readonly header = computed(() => `${this.kind() === "folder" ? "Folder" : "Collection"} settings: ${this.node()?.name ?? ""}`);
  /** What a folder set to inherit gives its requests: from the folders it is in, then the collection. */
  protected readonly inherited = computed(() => {
    const tree = this.tree();
    return effectiveAuth({ type: "inherit" }, tree ? ancestorsOf(tree.collection, tree.folders, this.folder()?.parentFolderId) : []);
  });
  protected readonly variablesHint = computed(() =>
    this.kind() === "folder"
      ? "Requests in this folder can use these as {{name}}. They win over the collection's variables; a variable of the active environment with the same name wins over them."
      : "Every request of this collection can use these as {{name}}. A folder's variable and a variable of the active environment with the same name win."
  );

  constructor() {
    // Each opening starts from what is stored then.
    effect(() => {
      if (!this.target()) return;
      const node = untracked(this.node);
      if (!node) return;
      this.tab.set("auth");
      this.showPassword.set(false);
      this.auth.set(structuredClone(node.auth));
      this.rows.set(node.variables.map((row) => ({ ...row })));
      this.scripts.set({ ...node.scripts });
      this.route.set(("route" in node && node.route) || null);
    });
  }

  protected onAuthType(type: AuthConfig["type"]): void {
    this.auth.set(emptyAuth(type));
    this.showPassword.set(false);
  }

  protected removeRow(index: number): void {
    this.rows.set(this.rows().filter((_, i) => i !== index));
  }

  protected setScript(kind: keyof Scripts, text: string): void {
    this.scripts.update((scripts) => ({ ...scripts, [kind]: text }));
  }

  protected async save(): Promise<void> {
    const [target, tree, node] = [this.target(), this.tree(), this.node()];
    if (!target || !tree || !node) return;
    this.saving.set(true);
    try {
      // The user's own scripts when the ones here before were allowed to run: the rule a request's save has (D6).
      const scriptsAllowed = await scriptsApproved(tree.collection.scriptTrust, scriptsOf(node));
      const route = this.route();
      await this.collections.saveInherited(target, { auth: this.auth(), scripts: this.scripts(), ...(route && { route }) }, scriptsAllowed);
      const named = this.rows()
        .map((row) => ({ ...row, key: row.key.trim() }))
        .filter((row) => row.key);
      // What changed, not the rows: another tab's change to another variable is kept (D22).
      const changes = variableChanges(node.variables, named);
      if (changes.length) {
        await (target.folderId ? this.collections.changeFolderVariables(target.folderId, changes) : this.collections.changeCollectionVariables(target.collectionId, changes));
      }
      this.closed.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
