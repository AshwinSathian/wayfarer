import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { AccordionContent, AccordionPanel, AccordionTrigger } from "@angular/aria/accordion";
import { isBodyMethod } from "@wayfarer/core";
import { Icon } from "../../shared/icon/icon";
import { WorkspaceStore } from "../../state/workspace-store";
import { UiAccordion, UiAccordionPanel } from "../../ui/accordion";
import { AuthPanel } from "./auth-panel";
import { BodyPanel } from "./body-panel";
import { BrowserNotes } from "./browser-notes";
import { ComposerView } from "./composer-view";
import { HeadersPanel } from "./headers-panel";
import { ParamsPanel } from "./params-panel";
import { ScriptsPanel } from "./scripts-panel";

/**
 * The composer's parts on a phone: one section each, one open at a time (see
 * `mobileActivePanels` in `ComposerView`). The bindings hold it to one: Aria's
 * group would let several open. A section's content is made when it first
 * opens and kept after.
 */
@Component({
  selector: "app-composer-sections",
  imports: [
    AccordionContent,
    AccordionPanel,
    AccordionTrigger,
    AuthPanel,
    BodyPanel,
    BrowserNotes,
    HeadersPanel,
    Icon,
    ParamsPanel,
    ScriptsPanel,
    UiAccordion,
    UiAccordionPanel,
  ],
  templateUrl: "./composer-sections.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class ComposerSections {
  private readonly store = inject(WorkspaceStore);
  protected readonly view = inject(ComposerView);
  protected readonly hasBody = computed(() => isBodyMethod(this.store.draft().method));
}
