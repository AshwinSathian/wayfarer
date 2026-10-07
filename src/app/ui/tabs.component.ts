import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from "@angular/core";

let nextId = 0;

/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation):
 *
 *   <ui-tabs [value]="tab()" (valueChange)="tab.set($event)">
 *     <ui-tablist><ui-tab value="a">A</ui-tab>…</ui-tablist>
 *     <ui-tabpanels><ui-tabpanel value="a">…</ui-tabpanel>…</ui-tabpanels>
 *   </ui-tabs>
 *
 * Controlled: the owner holds the value. Panels stay mounted and are hidden
 * with the `hidden` attribute, so editors inside keep their state.
 */
@Component({
  selector: "ui-tabs",
  template: "<ng-content />",
  host: { class: "ui-tabs" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsComponent {
  readonly value = input<string | number>();
  readonly valueChange = output<string | number>();
  readonly id = `ui-tabs-${nextId++}`;

  select(value: string | number): void {
    if (value !== this.value()) this.valueChange.emit(value);
  }
}

@Component({
  selector: "ui-tablist",
  template: "<ng-content />",
  host: { class: "ui-tablist", role: "tablist", "(keydown)": "onKeydown($event)" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabListComponent {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Arrow keys, Home and End move focus between tabs and select the tab they land on. */
  protected onKeydown(event: KeyboardEvent): void {
    const tabs = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]'));
    const current = tabs.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    const last = tabs.length - 1;
    const target =
      event.key === "ArrowRight" ? (current === last ? 0 : current + 1)
      : event.key === "ArrowLeft" ? (current === 0 ? last : current - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (target < 0) return;
    event.preventDefault();
    tabs[target].focus();
    tabs[target].click();
  }
}

@Component({
  selector: "ui-tab",
  template: "<ng-content />",
  host: {
    class: "ui-tab",
    role: "tab",
    "[id]": "tabs.id + '-tab-' + value()",
    "[attr.aria-controls]": "tabs.id + '-panel-' + value()",
    "[attr.aria-selected]": "selected()",
    "[attr.tabindex]": "selected() ? 0 : -1",
    "[class.ui-tab--active]": "selected()",
    "(click)": "tabs.select(value())",
    "(keydown.enter)": "tabs.select(value())",
    "(keydown.space)": "$event.preventDefault(); tabs.select(value())",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabComponent {
  protected readonly tabs = inject(TabsComponent);
  readonly value = input.required<string | number>();
  protected readonly selected = computed(() => this.tabs.value() === this.value());
}

@Component({
  selector: "ui-tabpanels",
  template: "<ng-content />",
  host: { class: "ui-tabpanels" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabPanelsComponent {}

@Component({
  selector: "ui-tabpanel",
  template: "<ng-content />",
  host: {
    class: "ui-tabpanel",
    role: "tabpanel",
    "[id]": "tabs.id + '-panel-' + value()",
    "[attr.aria-labelledby]": "tabs.id + '-tab-' + value()",
    "[attr.hidden]": "tabs.value() === value() ? null : ''",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabPanelComponent {
  protected readonly tabs = inject(TabsComponent);
  readonly value = input.required<string | number>();
}

export const UI_TABS = [TabsComponent, TabListComponent, TabComponent, TabPanelsComponent, TabPanelComponent] as const;
