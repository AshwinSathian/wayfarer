import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import type { PreviewVariable } from "@wayfarer/core";
import { EnvironmentsStore } from "../../services/environments-store";
import { RequestSave } from "../../services/request-save";
import { VariableFocus } from "../../services/variable-focus";
import { WorkspaceStore } from "../../state/workspace-store";
import { UiTooltip } from "../../ui/tooltip";
import { AUTH_TYPES } from "./auth-editor/auth-editor";

/**
 * The preview before Send (D4.12, DQ8): the address as it would go, the
 * auth and who sets it, and one chip per variable with where its value
 * comes from and what it hides. A secret is *** and named; the vault is not
 * read. A chip opens where its value is set (U-132).
 */
@Component({
  selector: "app-variable-chips",
  imports: [UiTooltip],
  templateUrl: "./variable-chips.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block space-y-2" },
})
export class VariableChips {
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

  protected act(variable: PreviewVariable): void {
    if (!this.action(variable)) return;
    const environmentId = this.environments.activeEnvironment()?.meta.id;
    const holder =
      (variable.source === "collection" || variable.source === "folder") &&
      this.saved.holderOf(variable.name, variable.source);
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
