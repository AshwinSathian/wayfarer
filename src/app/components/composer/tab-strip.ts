import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input, output } from "@angular/core";
import { MatIconButton } from "@angular/material/button";
import { MatTabLink, MatTabNav, MatTabNavPanel } from "@angular/material/tabs";
import { MatTooltip } from "@angular/material/tooltip";
import { Icon } from "../../shared/icon/icon";
import { TabState } from "../../state/tab-state";
import { Tabs } from "../../state/tabs";
import { Confirm } from "../../ui/confirm";

/**
 * The composer's tabs (P5.1): one per request being composed, and the three
 * things done to the open one. New and Close are also Alt+T and Alt+W (plan
 * D9): a page does not get Ctrl or Cmd with T or W, the browser keeps those.
 */
@Component({
  selector: "app-tab-strip",
  imports: [Icon, MatIconButton, MatTabLink, MatTabNav, MatTooltip],
  templateUrl: "./tab-strip.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:keydown)": "onKeydown($event)" },
})
export class TabStrip {
  protected readonly tabs = inject(Tabs);
  private readonly confirm = inject(Confirm);

  /** The panel the tabs are tabs of: the composer. */
  readonly panel = input.required<MatTabNavPanel>();
  /** A tab was opened and is empty: the composer puts the caret in its address field. */
  readonly opened = output<void>();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // The bar scrolls sideways and Material's paging is off: the open tab is brought into it. The bar is moved, not the page.
    afterRenderEffect(() => {
      this.tabs.active();
      const bar = host.querySelector(".mat-mdc-tab-link-container");
      const open = host.querySelector(".mdc-tab--active")?.getBoundingClientRect();
      if (!bar || !open) return;
      const room = bar.getBoundingClientRect();
      // Whole pixels, rounded outward: WebKit left a tab 0.4% out of the bar.
      if (open.left < room.left) bar.scrollLeft -= Math.ceil(room.left - open.left);
      else if (open.right > room.right) bar.scrollLeft += Math.ceil(open.right - room.right);
    });
  }

  /** The saved request's name, or else the address, or else that it is new. */
  protected label(tab: TabState): string {
    return tab.bound()?.name ?? (tab.draft().url.trim().replace(/^https?:\/\//, "") || "New request");
  }

  open(): void {
    if (this.tabs.locked()) return;
    this.tabs.open();
    this.opened.emit();
  }

  duplicate(): void {
    this.tabs.open(this.tabs.active().copy());
  }

  /** Closes the open tab. One with changes that are not saved asks first. */
  async close(): Promise<void> {
    const tab = this.tabs.active();
    if (this.tabs.locked()) return;
    if (tab.dirty()) {
      const close = await this.confirm.confirm({
        title: "Close this tab?",
        message: `${this.label(tab)} has changes that are not saved. Closing the tab discards them.`,
        acceptLabel: "Close tab",
        rejectLabel: "Keep it open",
      });
      if (!close) return;
    }
    this.tabs.close(tab.id);
  }

  /** Read from `code`, the key's place on the keyboard: on macOS Option+T is the character "†". */
  protected onKeydown(event: KeyboardEvent): void {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.code !== "KeyT" && event.code !== "KeyW") return;
    // A dialog or a drawer over the page has the keyboard: the tab is not changed under it.
    // A closed drawer is in the page too, and says `aria-modal` all the time.
    if (document.querySelector('.cdk-overlay-container [aria-modal="true"], .mat-drawer-opened[aria-modal="true"]')) return;
    event.preventDefault();
    if (event.code === "KeyT") this.open();
    else void this.close();
  }
}
