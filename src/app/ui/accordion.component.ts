import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from "@angular/core";
import { IconComponent } from "../shared/icon/icon.component";

let nextId = 0;

type PanelValue = string | number;

/**
 * Single-open accordion (WAI-ARIA accordion pattern):
 *
 *   <ui-accordion [value]="open()" (valueChange)="open.set($event)">
 *     <ui-accordion-panel value="a">
 *       <ui-accordion-header>A</ui-accordion-header>
 *       <ui-accordion-content>…</ui-accordion-content>
 *     </ui-accordion-panel>
 *   </ui-accordion>
 *
 * `value` is optional: without it the accordion starts closed and keeps its
 * own state. Content stays mounted; a closed panel is inert and invisible.
 */
@Component({
  selector: "ui-accordion",
  template: "<ng-content />",
  host: { class: "ui-accordion" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionComponent {
  readonly value = input<PanelValue | null>();
  readonly valueChange = output<PanelValue | null>();
  /** The open panel. Follows `value` when the owner sets it. */
  readonly open = linkedSignal<PanelValue | null>(() => this.value() ?? null);

  toggle(panel: PanelValue): void {
    const next = this.open() === panel ? null : panel;
    this.open.set(next);
    this.valueChange.emit(next);
  }
}

@Component({
  selector: "ui-accordion-panel",
  template: "<ng-content />",
  host: { class: "ui-accordion-panel", "[class.ui-accordion-panel--open]": "isOpen()" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionPanelComponent {
  private readonly accordion = inject(AccordionComponent);
  readonly value = input.required<PanelValue>();
  readonly id = `ui-accordion-${nextId++}`;
  readonly isOpen = computed(() => this.accordion.open() === this.value());

  toggle(): void {
    this.accordion.toggle(this.value());
  }
}

@Component({
  selector: "ui-accordion-header",
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="ui-accordion-header"
      [id]="panel.id + '-header'"
      [attr.aria-expanded]="panel.isOpen()"
      [attr.aria-controls]="panel.id + '-content'"
      (click)="panel.toggle()"
    >
      <ng-content />
      <app-icon class="ui-accordion-chevron" [name]="panel.isOpen() ? 'keyboard_arrow_up' : 'keyboard_arrow_down'" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionHeaderComponent {
  protected readonly panel = inject(AccordionPanelComponent);
}

@Component({
  selector: "ui-accordion-content",
  template: `<div class="ui-accordion-content-clip"><div class="ui-accordion-content-body"><ng-content /></div></div>`,
  host: {
    class: "ui-accordion-content",
    role: "region",
    "[id]": "panel.id + '-content'",
    "[attr.aria-labelledby]": "panel.id + '-header'",
    "[attr.inert]": "panel.isOpen() ? null : ''",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionContentComponent {
  protected readonly panel = inject(AccordionPanelComponent);
}

export const UI_ACCORDION = [AccordionComponent, AccordionPanelComponent, AccordionHeaderComponent, AccordionContentComponent] as const;
