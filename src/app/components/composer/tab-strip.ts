import { ApplicationRef, ChangeDetectionStrategy, Component, inject, output } from "@angular/core";
import { Tab, TabContent, TabPanel } from "@angular/aria/tabs";
import { UiButton } from "../../ui/button";
import { UiTooltip } from "../../ui/tooltip";
import { Icon } from "../../shared/icon/icon";
import { TabState } from "../../state/tab-state";
import { Tabs } from "../../state/tabs";
import { Confirm } from "../../ui/confirm";
import { UiTabList } from "../../ui/tabs";

/**
 * The composer's tabs (P5.1): one per request being composed, and the three
 * things done to the open one. New and Close are also Alt+T and Alt+W (plan
 * D9): a page does not get Ctrl or Cmd with T or W, the browser keeps those.
 */
@Component({
  selector: "app-tab-strip",
  imports: [Icon, UiButton, UiTooltip, Tab, TabContent, TabPanel, UiTabList],
  templateUrl: "./tab-strip.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:keydown)": "onKeydown($event)" },
})
export class TabStrip {
  protected readonly tabs = inject(Tabs);
  private readonly confirm = inject(Confirm);
  private readonly app = inject(ApplicationRef);

  /** A tab was opened and is empty: the composer puts the caret in its address field. */
  readonly opened = output<void>();

  /** The saved request's name, or else the address, or else that it is new. */
  protected label(tab: TabState): string {
    if (tab.run) return tab.run.target.name;
    return tab.bound()?.name ?? (tab.draft().url.trim().replace(/^https?:\/\//, "") || "New request");
  }

  /** The tab's address is a WebSocket's, as written. */
  protected isSocket(tab: TabState): boolean {
    return /^wss?:/i.test(tab.draft().url.trim());
  }

  open(): void {
    this.tabs.open();
    this.opened.emit();
  }

  duplicate(): void {
    this.tabs.open(this.tabs.active().copy());
  }

  /** Closes the open tab. One with changes that are not saved, or with a request on its way, asks first. */
  async close(): Promise<void> {
    const tab = this.tabs.active();
    const dirty = tab.dirty();
    // What the tab has going, and what closing it does to that.
    const going: [string, string] | null = tab.run?.running()
      ? ["is running", "cancels the run"]
      : tab.loadingState()
        ? ["is waiting for a response", "cancels the request"]
        : tab.socket.status() !== "closed"
          ? ["has a WebSocket open", "closes the connection"]
          : null;
    if (dirty || going) {
      const why = [...(dirty ? ["has changes that are not saved"] : []), ...(going ? [going[0]] : [])].join(" and ");
      const then = dirty && going ? `discards the changes and ${going[1]}` : dirty ? "discards them" : (going?.[1] ?? "");
      const close = await this.confirm.confirm({
        title: "Close this tab?",
        message: `${this.label(tab)} ${why}. Closing the tab ${then}.`,
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
    if (document.querySelector("dialog:modal")) return;
    event.preventDefault();
    // The key may come in the same task as the last keystroke (#360), before the app has drawn it: `[ngModel]` would
    // then see the new tab's address as unchanged and leave the field holding the old tab's. Draw first.
    this.app.tick();
    if (event.code === "KeyT") this.open();
    else void this.close();
  }
}
