import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Tab, TabContent, TabPanel, Tabs } from "@angular/aria/tabs";
import { UiTabList } from "../../ui/tabs";
import {
  ancestorsOf,
  effectiveAuth,
  emptyAuth,
  type AuthConfig,
  type Route,
  type Row,
  type Scripts,
  type VariableChange,
} from "@wayfarer/core";
import { CollectionsStore } from "../../services/collections-store";
import { recordDiagnostic } from "../../services/diagnostics";
import { Icon } from "../../shared/icon/icon";
import type { HolderTarget } from "../../state/tab-state";
import { AuthEditor } from "../composer/auth-editor/auth-editor";
import { ScriptEditor } from "../script-editor/script-editor";
import { VariableRows, type VariableHolder } from "../variables/variable-rows";
import { UiSelect, type UiSelectOption } from "../../ui/select";

/** What the tab writes with `saveInherited`: everything but the variables, which are written as changes. */
interface Inherited {
  auth: AuthConfig;
  scripts: Scripts;
  /** A collection's own route; null: the device's. */
  route: Route | null;
}

/**
 * What a collection or a folder holds for the requests in it (P4.9): variables, auth for those set to inherit, and
 * scripts that run before and after each of them; a collection also the route its requests are sent by (P6.4). A
 * document in a tab (D5-e), as the environments are: each field is written as it is left, with no Save button.
 */
@Component({
  selector: "app-holder-settings",
  imports: [
    AuthEditor,
    FormsModule,
    Icon,
    ScriptEditor,
    Tab,
    TabContent,
    TabPanel,
    Tabs,
    UiSelect,
    UiTabList,
    VariableRows,
  ],
  templateUrl: "./holder-settings.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class HolderSettings implements OnDestroy {
  private readonly collections = inject(CollectionsStore);

  readonly holder = input.required<HolderTarget>();
  /** A variable a chip asked to see (U-132): the Variables pane shows its row. */
  readonly reveal = input<{ key: string } | null>(null);

  protected readonly tab = signal<"variables" | "auth" | "scripts" | "route">("variables");
  protected readonly showPassword = signal(false);
  /** The fields as typed here. */
  protected readonly edits = signal<Inherited | null>(null);
  /** What is stored, as last read or written: an edit is what differs from it. */
  private written = "";
  /** Each write waits for the one before it. */
  private writing: Promise<void> = Promise.resolve();
  /** Why the last write did not land, said under the panes until the next one does. */
  protected readonly saveError = signal("");
  protected readonly routes: UiSelectOption<Route | null>[] = [
    { value: null, label: "The device's (Settings, Local Bridge)" },
    { value: "auto", label: "Auto" },
    { value: "direct", label: "Direct" },
    { value: "bridge", label: "Local Bridge" },
  ];

  private readonly tree = computed(() =>
    this.collections.tree().find((entry) => entry.collection.meta.id === this.holder().collectionId),
  );
  private readonly folder = computed(() =>
    this.tree()?.folders.find((folder) => folder.meta.id === this.holder().folderId),
  );
  /** The collection or the folder as it is stored; undefined once it is deleted. */
  protected readonly node = computed(() => (this.holder().folderId ? this.folder() : this.tree()?.collection));
  protected readonly kind = computed(() => (this.holder().folderId ? "folder" : "collection"));
  protected readonly title = computed(() => (this.kind() === "folder" ? "Folder settings" : "Collection settings"));
  /** Where the folder is: its collection and the folders it is in. */
  protected readonly path = computed(() => {
    const tree = this.tree();
    const folder = this.folder();
    return tree && folder
      ? ancestorsOf(tree.collection, tree.folders, folder.parentFolderId)
          .map((holder) => holder.name)
          .join(" / ")
      : "";
  });
  /** What a folder set to inherit gives its requests: from the folders it is in, then the collection. */
  protected readonly inherited = computed(() => {
    const tree = this.tree();
    return effectiveAuth(
      { type: "inherit" },
      tree ? ancestorsOf(tree.collection, tree.folders, this.folder()?.parentFolderId) : [],
    );
  });
  protected readonly variablesHint = computed(() =>
    this.kind() === "folder"
      ? "Requests in this folder can use these as {{name}}. They win over the collection's variables; a variable of the active environment with the same name wins over them."
      : "Every request of this collection can use these as {{name}}. A folder's variable and a variable of the active environment with the same name win.",
  );
  /** The variables, for the rows: they write what changed, never the rows (D22). */
  protected readonly variables = computed<VariableHolder | null>(() => {
    const node = this.node();
    if (!node) return null;
    const { collectionId, folderId } = this.holder();
    return {
      id: folderId ?? collectionId,
      name: node.name,
      rows: node.variables,
      write: (changes) => this.writeVariables(changes),
    };
  });

  constructor() {
    // What is stored, shown: when the tab opens, and when another browser tab changes it while nothing typed here waits.
    effect(() => {
      const node = this.node();
      if (!node) return;
      const stored: Inherited = {
        auth: node.auth,
        scripts: node.scripts,
        route: ("route" in node && node.route) || null,
      };
      const text = JSON.stringify(stored);
      untracked(() => {
        const edits = this.edits();
        if (edits && JSON.stringify(edits) !== this.written) return;
        this.written = text;
        this.edits.set(structuredClone(stored));
      });
    });
    effect(() => {
      if (this.reveal()) untracked(() => this.tab.set("variables"));
    });
  }

  /** The tab closed or another opened: what was typed and not yet written is written now (U-060). */
  ngOnDestroy(): void {
    void this.commit();
  }

  protected setAuth(auth: AuthConfig): void {
    this.edit({ auth });
  }

  protected onAuthType(type: AuthConfig["type"]): void {
    this.showPassword.set(false);
    this.edit({ auth: emptyAuth(type) });
    void this.commit();
  }

  protected setScript(kind: keyof Scripts, text: string): void {
    const edits = this.edits();
    if (edits) this.edit({ scripts: { ...edits.scripts, [kind]: text } });
  }

  protected setRoute(route: Route | null): void {
    this.edit({ route });
    void this.commit();
  }

  private edit(patch: Partial<Inherited>): void {
    this.edits.update((edits) => (edits ? { ...edits, ...patch } : edits));
  }

  /**
   * Writes the auth, the scripts and the route when they differ from what is stored (DQ9: no Save button): when focus
   * leaves a field, when a choice is made and when the tab closes. Whether the scripts written are approved is the
   * store's to say, from the scripts it held before this write (D6): an edit of a script that was held stays held.
   */
  commit(): Promise<void> {
    const edits = this.edits();
    const target = this.holder();
    if (!edits || JSON.stringify(edits) === this.written) return this.writing;
    this.writing = this.writing
      .then(() => this.write(target, edits))
      .catch((error: unknown) => recordDiagnostic(error, "holder settings: a write ended in an error"));
    return this.writing;
  }

  private async write(target: HolderTarget, edits: Inherited): Promise<void> {
    const text = JSON.stringify(edits);
    if (text === this.written) return;
    const name = this.node()?.name ?? "These settings";
    if (!this.node()) {
      this.saveError.set(`${name} were not saved: the ${this.kind()} was deleted.`);
      return;
    }
    try {
      const { route, ...rest } = edits;
      await this.collections.saveInherited(target, { ...rest, ...(route && { route }) });
    } catch (error) {
      recordDiagnostic(error, "holder settings: a write was refused");
      this.saveError.set(`${name} was not saved: this browser refused the write. Your edits are still here.`);
      return;
    }
    this.written = text;
    this.saveError.set("");
  }

  private async writeVariables(changes: VariableChange[]): Promise<readonly Row[] | null> {
    const { collectionId, folderId } = this.holder();
    const saved = await (folderId
      ? this.collections.changeFolderVariables(folderId, changes)
      : this.collections.changeCollectionVariables(collectionId, changes));
    // The store has read the tree again: what it holds now, another tab's write included (F62).
    return saved ? (this.node()?.variables ?? saved.variables) : null;
  }
}
