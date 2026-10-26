import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  afterEveryRender,
  afterRenderEffect,
  effect,
  inject,
  input,
  output,
  untracked,
} from "@angular/core";
import { TabList } from "@angular/aria/tabs";

/** What can take focus inside a pane; a pane that holds one is no Tab stop of its own. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Angular Aria's tab list (D1.5) with the app's styles and what Aria leaves
 * to its user. Inside an `ngTabs`, with one `ngTabPanel` per tab:
 *
 *   <div ngTabs>
 *     <div uiTabList [selectedTab]="tab()" (selectedTabChange)="tab.set($event)">
 *       <button ngTab value="auth">Auth</button>
 *     </div>
 *     <div ngTabPanel value="auth" class="tab-pane" [preserveContent]="true">
 *       <ng-template ngTabContent>…</ng-template>
 *     </div>
 *   </div>
 *
 * A pane is made the first time its tab is chosen and kept after:
 * `preserveContent` is false by default in 22.2.3, whatever Angular's guide
 * says, and an editor in a pane must stay mounted. A focused tab is chosen
 * (Aria's `follow`); the arrows wrap, Home and End go to the ends.
 *
 * What Aria does not do, each with a test in `tabs.spec.ts`:
 * - it does not follow a choice made by code (Alt+T, a tree click, the
 *   composer opening its Body): the tab stop and the arrows stayed on the tab
 *   chosen before. The chosen tab is made Aria's active one.
 * - it does not follow focus moved by code either: a tab focused by anything
 *   but its keys becomes the one they move from, and is chosen, as a tab
 *   focused by its keys is.
 * - when the chosen value has no tab (Body, for a GET), it sends `undefined`
 *   and forgets the value, so the tab was not chosen when it came back. That
 *   is not passed on, and the value is given to Aria again when the tabs change.
 * - its list does not scroll: a bar that does not fit scrolls sideways, and
 *   the chosen tab is brought into it.
 * - a choice is drawn at the next render, and Chromium takes a key before
 *   it: Tab right after a click went into the pane that was shown before.
 *   A click, or a key Aria took, is drawn at once.
 * - it makes every pane a Tab stop (`tabindex="0"`). WAI-ARIA's pattern asks
 *   for that only of a pane with nothing to focus in it (U-090): a pane that
 *   holds a control is taken out of the Tab order, and Tab goes from the tab
 *   to the pane's first control.
 */
@Component({
  // On the template's own element: the tabs are its children there, and it is the tablist.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: "[uiTabList]",
  hostDirectives: [TabList],
  template: "<ng-content />",
  styleUrl: "./tabs.css",
  // The tabs and panes are the user's template's, beside and inside this one.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // After Aria's own listeners: a host directive's come first.
  host: {
    class: "tab-bar",
    "(focusin)": "followFocus($event)",
    "(click)": "drawNow()",
    "(keydown)": "drawNow($event)",
  },
})
export class UiTabList<T extends string> {
  private readonly list = inject(TabList);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly app = inject(ApplicationRef);

  /** The chosen tab's value. */
  readonly selectedTab = input.required<T>();
  /** A tab was chosen by a click or a key. */
  readonly selectedTabChange = output<T>();

  constructor() {
    this.list.selectedTab.subscribe((value) => {
      // A tab's value is one of `T`: the template that writes the tabs gives both.
      if (value !== undefined && value !== this.selectedTab()) this.selectedTabChange.emit(value as T);
    });
    effect(() => {
      // Read with the tabs, so that a value whose tab came back is chosen again.
      this.list._tabPatterns();
      this.list.selectedTab.set(this.selectedTab());
    });
    afterRenderEffect(() => {
      const chosen = this.list.findTab(this.selectedTab())?._pattern;
      // Not when the active tab moves: a tab focused by code stays the one the keys move from.
      const active = this.list._pattern.inputs.activeItem;
      if (chosen && untracked(active) !== chosen) active.set(chosen);
    });
    // A pane is a Tab stop only while nothing in it can take focus. Every render: a pane's content is made when
    // its tab is first chosen, and an editor's after that.
    afterEveryRender(() => {
      for (const tab of this.list._tabPatterns()) {
        const panel = this.host.ownerDocument.getElementById(tab.element()?.getAttribute("aria-controls") ?? "");
        if (!panel || panel.hasAttribute("inert")) continue;
        const stop = panel.querySelector(FOCUSABLE) ? "-1" : "0";
        if (panel.getAttribute("tabindex") !== stop) panel.setAttribute("tabindex", stop);
      }
    });
    // The bar is moved, not the page. Whole pixels, rounded outward: WebKit left a tab 0.4% out of the bar.
    afterRenderEffect(() => {
      const open = this.list.findTab(this.selectedTab())?.element.getBoundingClientRect();
      if (!open) return;
      const room = this.host.getBoundingClientRect();
      if (open.left < room.left) this.host.scrollLeft -= Math.ceil(room.left - open.left);
      else if (open.right > room.right) this.host.scrollLeft += Math.ceil(open.right - room.right);
    });
  }

  /**
   * After a click, or a key Aria took. Returns nothing: Angular prevents the
   * default of an event whose listener returns false, and Escape and Tab
   * stopped working on a tab.
   */
  protected drawNow(key?: KeyboardEvent): void {
    if (!key || key.defaultPrevented) this.app.tick();
  }

  protected followFocus(event: FocusEvent): void {
    const element = (event.target as Element).closest('[role="tab"]');
    const tab = this.list._tabPatterns().find((pattern) => pattern.element() === element);
    if (!tab) return;
    const active = this.list._pattern.inputs.activeItem;
    if (active() !== tab) active.set(tab);
    if (!tab.selected()) tab.open();
  }
}
