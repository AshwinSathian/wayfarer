import { SHORTCUTS } from "../../shared/shortcuts";
import {
  afterRenderEffect,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { Tab, TabContent, TabPanel } from "@angular/aria/tabs";
import { UiButton } from "../../ui/button";
import { UiInput } from "../../ui/input";
import { UiMenu } from "../../ui/menu";
import { UiMenuItem } from "../../ui/menu-item";
import { UiTooltip } from "../../ui/tooltip";
import { Icon } from "../../shared/icon/icon";
import { TabState } from "../../state/tab-state";
import { Tabs } from "../../state/tabs";
import { Confirm } from "../../ui/confirm";
import { UiTabList } from "../../ui/tabs";
import { CollectionsStore } from "../../services/collections-store";
import { RequestSave } from "../../services/request-save";
import { recordDiagnostic } from "../../services/diagnostics";

/**
 * Text where a typed character is plausible: a script, a body, a note (U-081). Option+W types "∑" on a Mac. A
 * one-line field holds an address or a name, where focus usually is, and Alt+T keeps working there.
 */
function writing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("textarea, .monaco-editor"));
}

/**
 * The composer's tabs (P5.1). Each tab closes by its own × (the pointer's way), Alt+W, Delete on a focused tab, or
 * its menu (right-click, Shift+F10), which also duplicates and renames it (U-027). New follows the last tab. A
 * saved request is renamed in place by a double click or F2 (U-035); an unsaved one is named where it is saved.
 * New and Close are also Alt+T and Alt+W (plan D9): a page does not get Ctrl or Cmd with T or W, the browser keeps
 * those. Neither fires in an editor or a text area (U-081): on a Mac Option+W types "∑".
 */
@Component({
  selector: "app-tab-strip",
  imports: [Icon, UiButton, UiInput, UiMenu, UiTooltip, Tab, TabContent, TabPanel, UiTabList],
  templateUrl: "./tab-strip.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:keydown)": "onKeydown($event)" },
})
export class TabStrip {
  protected readonly tabs = inject(Tabs);
  protected readonly shortcuts = SHORTCUTS;
  private readonly confirm = inject(Confirm);
  private readonly app = inject(ApplicationRef);
  private readonly collections = inject(CollectionsStore);
  private readonly requestSave = inject(RequestSave);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** A tab was opened and is empty: the composer puts the caret in its address field. */
  readonly opened = output<void>();

  protected readonly menuItems = signal<UiMenuItem[]>([]);
  private readonly menu = viewChild.required<UiMenu>("menu");
  /** The tab being renamed in place, with where its field is drawn. */
  protected readonly renaming = signal<{ tab: TabState; name: string; left: number; width: number } | null>(null);
  private readonly renameField = viewChild<ElementRef<HTMLInputElement>>("renameField");

  constructor() {
    afterRenderEffect(() => {
      const field = this.renameField()?.nativeElement;
      if (field && document.activeElement !== field) {
        field.focus();
        field.select();
      }
    });
  }

  /** The saved request's name, or else the address, or else that it is new. */
  protected label(tab: TabState): string {
    if (tab.environments) return "Environments";
    if (tab.run) return tab.run.target.name;
    return (
      tab.bound()?.name ??
      (tab
        .draft()
        .url.trim()
        .replace(/^https?:\/\//, "") ||
        "New request")
    );
  }

  /** The tab's address is a WebSocket's, as written. */
  protected isSocket(tab: TabState): boolean {
    return /^wss?:/i.test(tab.draft().url.trim());
  }

  open(): void {
    this.tabs.open();
    this.opened.emit();
  }

  duplicate(tab: TabState = this.tabs.active()): void {
    this.tabs.open(tab.copy());
  }

  /** Closes a tab, the open one unless named. One with changes not saved, or with something on its way, asks first. */
  async close(tab: TabState = this.tabs.active()): Promise<void> {
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
      const then =
        dirty && going ? `discards the changes and ${going[1]}` : dirty ? "discards them" : (going?.[1] ?? "");
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

  protected closeFromPointer(tab: TabState, event: MouseEvent): void {
    // Not the tab's own click, which would open it first.
    event.stopPropagation();
    void this.close(tab);
  }

  protected menuFor(tab: TabState, event: MouseEvent): void {
    const button = event.currentTarget as HTMLElement;
    this.menuItems.set([
      ...(tab.document ? [] : [{ label: "Rename", icon: "edit" as const, command: () => this.rename(tab, button) }]),
      { label: "Duplicate tab", icon: "content_copy", command: () => this.duplicate(tab) },
      { separator: true },
      { label: "Close tab", icon: "close", command: () => void this.close(tab) },
    ]);
    this.menu().openAt(event, () => button.focus());
  }

  /** Shift+F10 and the menu key open a tab's menu where a right-click would; Delete closes it; F2 renames it. */
  protected tabKey(tab: TabState, event: KeyboardEvent): void {
    const button = event.currentTarget as HTMLElement;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      button.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 12,
          clientY: rect.bottom,
        }),
      );
    } else if (event.key === "Delete" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void this.close(tab);
    } else if (event.key === "F2") {
      event.preventDefault();
      this.rename(tab, button);
    }
  }

  /** A saved request is renamed over its tab; an unsaved one is named where it is saved. */
  protected rename(tab: TabState, button?: HTMLElement): void {
    if (tab.document) return;
    if (!tab.bound()) {
      this.tabs.activate(tab.id);
      this.requestSave.openSaveAsDialog();
      return;
    }
    const at = button ?? this.host.querySelector<HTMLElement>(`[role="tab"][aria-selected="true"]`);
    const row = this.host.querySelector<HTMLElement>(".request-tabs-row");
    if (!at || !row) return;
    const [tabBox, rowBox] = [at.getBoundingClientRect(), row.getBoundingClientRect()];
    this.renaming.set({
      tab,
      name: this.label(tab),
      left: tabBox.left - rowBox.left,
      width: Math.max(tabBox.width, 160),
    });
  }

  protected renameKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Stop the field's blur from saving what was typed.
      const edit = this.renaming();
      this.renaming.set(null);
      if (edit) this.focusTab(edit.tab);
    }
  }

  protected async commitRename(value: string): Promise<void> {
    const edit = this.renaming();
    if (!edit) return;
    this.renaming.set(null);
    const name = value.trim();
    const bound = edit.tab.bound();
    if (bound && name && name !== bound.name) {
      try {
        // The tabs are bound again when the tree changes (TabsStorage.rebind), so the tab takes the new name.
        await this.collections.renameRequest(bound.meta.id, name);
      } catch (error) {
        recordDiagnostic(error, "tab-strip.rename");
      }
    }
    this.focusTab(edit.tab);
  }

  private focusTab(tab: TabState): void {
    const index = this.tabs.tabs().indexOf(tab);
    this.host.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus();
  }

  /** Read from `code`, the key's place on the keyboard: on macOS Option+T is the character "†". */
  protected onKeydown(event: KeyboardEvent): void {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.code !== "KeyT" && event.code !== "KeyW") return;
    // A dialog or a drawer over the page has the keyboard: the tab is not changed under it.
    if (document.querySelector("dialog:modal")) return;
    // In an editor or a text area the key is a character (U-081).
    if (writing(event.target)) return;
    event.preventDefault();
    // The key may come in the same task as the last keystroke (#360), before the app has drawn it: `[ngModel]` would
    // then see the new tab's address as unchanged and leave the field holding the old tab's. Draw first.
    this.app.tick();
    if (event.code === "KeyT") this.open();
    else void this.close();
  }
}
