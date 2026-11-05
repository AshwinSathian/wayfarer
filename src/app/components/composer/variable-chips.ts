import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import type { PreviewVariable } from "@wayfarer/core";
import { EnvironmentsStore } from "../../services/environments-store";
import { RequestSave } from "../../services/request-save";
import { VariableFocus } from "../../services/variable-focus";
import { WorkspaceStore } from "../../state/workspace-store";
import { UiMenu } from "../../ui/menu";
import type { UiMenuItem } from "../../ui/menu-item";
import { UiTooltip } from "../../ui/tooltip";
import { AUTH_TYPES } from "./auth-editor/auth-editor";
import { DOCS } from "../../shared/docs";

/**
 * The preview before Send (D4.12, DQ8): the address as it would go, the
 * auth and who sets it, and one chip per variable with where its value
 * comes from and what it hides. A secret is *** and named; the vault is not
 * read. A chip opens where its value is set (U-132).
 */
@Component({
  selector: "app-variable-chips",
  imports: [UiTooltip, UiMenu],
  templateUrl: "./variable-chips.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block space-y-2" },
})
export class VariableChips {
  protected readonly docs = DOCS;
  protected readonly store = inject(WorkspaceStore);
  private readonly variableFocus = inject(VariableFocus);
  private readonly environments = inject(EnvironmentsStore);
  private readonly saved = inject(RequestSave);

  /** "Bearer token, from collection "Shop"." and where its variables' values come from; "" with no auth sent. */
  protected readonly authLine = computed(() => {
    const { auth, from } = this.store.sentAuthSource();
    if (auth.type === "none") return "";
    const label = AUTH_TYPES.find((type) => type.value === auth.type)?.label ?? auth.type;
    const sources = this.store.authValueSources();
    return `Auth: ${label}, ${from ? `from ${from}` : "set on this request"}.${sources ? ` ${sources}` : ""}`;
  });

  /** The holders whose value of the same name this one hides: "collection "Shop" and the globals". */
  protected hidden(variable: PreviewVariable): string {
    const { shadows } = variable;
    return shadows.length < 2 ? shadows.join("") : `${shadows.slice(0, -1).join(", ")} and ${shadows.at(-1)}`;
  }

  /**
   * What a chip does, said as its tooltip; "" for one that does nothing (U-132). Each opens where its value is set; a
   * dynamic variable has none, and a script's or a data file's is set by the run.
   */
  protected action(variable: PreviewVariable): string {
    const { name, source } = variable;
    if (source === "environment") return `Show ${name} in its environment.`;
    if (source === "missing" && this.saved.loadedCollectionRequest())
      return `Add ${name} to the environment or the collection.`;
    if (source === "missing")
      return this.environments.activeEnvironment()
        ? `Add ${name} to the environment.`
        : `Make an environment with ${name} in it.`;
    if (source === "global") return `Show ${name} in the global variables.`;
    if (source === "secret") return "Show the vault's secrets.";
    if ((source === "collection" || source === "folder") && this.saved.holderOf(name, source))
      return `Show ${name} in ${variable.holder ?? `its ${source}`}'s settings.`;
    return "";
  }

  /** Where a missing variable may go when the request is in a collection (D4.5): the environment or the collection. */
  protected readonly placeItems = signal<UiMenuItem[]>([]);

  protected act(variable: PreviewVariable, chip: HTMLElement, menu: UiMenu): void {
    if (!this.action(variable)) return;
    const bound = this.saved.loadedCollectionRequest();
    if (variable.source === "missing" && bound) {
      const environment = this.environments.activeEnvironment();
      const { name } = variable;
      this.placeItems.set([
        {
          label: environment ? `Add ${name} to environment "${environment.name}"` : `Add ${name} to a new environment`,
          icon: "dns",
          command: () => this.focus(variable),
        },
        {
          label: `Add ${name} to collection "${this.saved.breadcrumb()[0] ?? ""}"`,
          icon: "folder",
          command: () => this.focus(variable, { collectionId: bound.collectionId }),
        },
      ]);
      // Under the chip, as a button's menu would be; Escape and Tab give focus back to it.
      const box = chip.getBoundingClientRect();
      menu.openAt(new MouseEvent("contextmenu", { clientX: box.left, clientY: box.bottom }), () => chip.focus());
      return;
    }
    this.focus(variable);
  }

  private focus(variable: PreviewVariable, into?: { collectionId: string }): void {
    const environmentId = this.environments.activeEnvironment()?.meta.id;
    const holder =
      into ??
      ((variable.source === "collection" || variable.source === "folder") &&
        this.saved.holderOf(variable.name, variable.source));
    this.variableFocus.requestFocus({
      key: variable.name,
      source: variable.source,
      location: "url",
      field: "",
      ...(environmentId && { environmentId }),
      ...(holder && { holder }),
    });
  }
}
