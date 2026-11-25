import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { variableCard, type PreviewVariable } from "@wayfarer/core";
import { EnvironmentsStore } from "../../services/environments-store";
import { RequestSave } from "../../services/request-save";
import { VariableFocus } from "../../services/variable-focus";
import { DOCS } from "../../shared/docs";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";
import { UiButton } from "../../ui/button";
import { placeTooltip, UiTooltip } from "../../ui/tooltip";
import { AUTH_TYPES } from "./auth-editor/auth-editor";

/** What a popover offers to do with a variable: where its value is set, or where to set it. */
interface VariableAction {
  label: string;
  run: () => void;
}

/**
 * The variables before Send (D4.12, DQ8): the auth and who sets it, and a row with one small button per variable.
 * Hovering or focusing it shows its card (the scope, the value, the holder); clicking it opens the popover, which says
 * the same and offers to show it where it is set or to add it (U-132). A secret is `***` and named: the vault is never
 * read here (claim C-007). The popover is the platform's, in the top layer, placed against its button.
 */
@Component({
  selector: "app-variable-chips",
  imports: [Icon, UiButton, UiTooltip],
  templateUrl: "./variable-chips.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block space-y-2" },
})
export class VariableChips {
  protected readonly docs = DOCS;
  protected readonly words = variableCard;
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

  /** The variable the popover shows, and the button it opened from (focus goes back to it). */
  protected readonly selected = signal<PreviewVariable | null>(null);
  private opener: HTMLElement | null = null;

  /** The colour family of a button: the environment's, the request's own, or a missing one. */
  protected family(variable: PreviewVariable): string {
    return variable.source === "missing" ? "missing" : variable.source === "environment" ? "environment" : "request";
  }

  /** The value as the card says it. A secret is never read: only its being a secret. */
  protected valueOf(variable: PreviewVariable): string {
    if (variable.error) return variable.error;
    if (variable.vaulted || variable.source === "secret") return this.words.secretValue;
    if (variable.value !== undefined) return variable.value;
    return variable.source === "dynamic" ? this.words.dynamicValue : this.words.noValue;
  }

  /** The holders whose value of the same name this one hides: "collection "Shop" and the globals". */
  protected hidden(variable: PreviewVariable): string {
    const { shadows } = variable;
    return shadows.length < 2 ? shadows.join("") : `${shadows.slice(0, -1).join(", ")} and ${shadows.at(-1)}`;
  }

  /** What can be done with a variable: each opens where its value is set. A dynamic one has none, and a script's or a data file's is set by the run. */
  protected actions(variable: PreviewVariable): VariableAction[] {
    const { name, source } = variable;
    const to = (label: string, into?: { collectionId: string }): VariableAction => ({
      label,
      run: () => this.focus(variable, into),
    });
    const bound = this.saved.loadedCollectionRequest();
    const environment = this.environments.activeEnvironment();
    if (source === "environment") return [to(`Show ${name} in its environment`)];
    if (source === "missing" && bound)
      return [
        to(environment ? `Add ${name} to environment "${environment.name}"` : `Add ${name} to a new environment`),
        to(`Add ${name} to collection "${this.saved.breadcrumb()[0] ?? ""}"`, { collectionId: bound.collectionId }),
      ];
    if (source === "missing")
      return [to(environment ? `Add ${name} to the environment` : `Make an environment with ${name} in it`)];
    if (source === "global") return [to(`Show ${name} in the global variables`)];
    if (source === "secret") return [to("Show the vault's secrets")];
    if ((source === "collection" || source === "folder") && this.saved.holderOf(name, source))
      return [to(`Show ${name} in ${variable.holder ?? `its ${source}`}'s settings`)];
    return [];
  }

  protected toggle(variable: PreviewVariable, chip: HTMLElement, popover: HTMLElement): void {
    if (this.selected()?.name === variable.name && popover.matches(":popover-open")) {
      popover.hidePopover();
      return;
    }
    this.opener = chip;
    this.selected.set(variable);
    // Drawn first, so that it is measured by what it holds.
    if (!popover.matches(":popover-open")) popover.showPopover();
    queueMicrotask(() => {
      const { left, top } = placeTooltip(
        chip.getBoundingClientRect(),
        { width: popover.offsetWidth, height: popover.offsetHeight },
        { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
        "below",
        "start",
      );
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      popover.focus();
    });
  }

  /** Closed, by Escape, a press outside or its button: focus goes back to the button it came from unless it went elsewhere. */
  protected closed(event: Event, popover: HTMLElement): void {
    if ((event as ToggleEvent).newState !== "closed") return;
    this.selected.set(null);
    const active = document.activeElement;
    if (active === document.body || popover.contains(active)) this.opener?.focus();
  }

  protected run(action: VariableAction, popover: HTMLElement): void {
    popover.hidePopover();
    action.run();
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
