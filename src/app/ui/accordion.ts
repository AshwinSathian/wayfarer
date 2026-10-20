import { ChangeDetectionStrategy, Component, Directive, ViewEncapsulation } from "@angular/core";
import { AccordionGroup } from "@angular/aria/accordion";

/**
 * Angular Aria's accordion (D1.5) with the app's styles. Each section is a
 * header button and its panel:
 *
 *   <div uiAccordion>
 *     <div class="sections-item">
 *       <button ngAccordionTrigger class="section-header" [panel]="params" [expanded]="open()" (expandedChange)="…">
 *         Params <app-icon class="section-chevron" name="keyboard_arrow_down" />
 *       </button>
 *       <div ngAccordionPanel uiAccordionPanel #params="ngAccordionPanel" class="section-body" [preserveContent]="true">
 *         <ng-template ngAccordionContent>…</ng-template>
 *       </div>
 *     </div>
 *   </div>
 *
 * A panel is made the first time it opens and kept after (`preserveContent`
 * is false by default). Enter, Space and a click open or close a section;
 * ArrowUp, ArrowDown, Home and End move between the headers, without wrapping.
 * Several sections may be open at once: an accordion that holds one open
 * says which in its own `[expanded]` bindings.
 */
@Component({
  // On the template's own element: the sections are its children there.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: "[uiAccordion]",
  hostDirectives: [AccordionGroup],
  template: "<ng-content />",
  styleUrl: "./accordion.css",
  // The sections are the user's template's, inside this one.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "sections" },
})
export class UiAccordion {}

/**
 * Beside `ngAccordionPanel`. Aria's group reads every key that reaches it,
 * also one typed into a field inside a panel: Space, Enter, the arrows, Home
 * and End there opened or closed a section, or moved to a header, and never
 * reached the field. The panel keeps those keys to itself. Only those keys,
 * and only without a modifier, which is what Aria takes: a shortcut like
 * Alt+T still reaches the window.
 */
@Directive({
  selector: "[uiAccordionPanel]",
  host: { "(keydown)": "keep($event)" },
})
export class UiAccordionPanel {
  protected keep(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (["ArrowUp", "ArrowDown", "Home", "End", " ", "Enter"].includes(event.key)) event.stopPropagation();
  }
}
