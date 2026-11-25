import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChild } from "@angular/core";
import { MenuTrigger } from "@angular/aria/menu";
import { importing } from "@wayfarer/core";
import { ImportPipeline } from "../../services/import-pipeline";
import { Icon } from "../../shared/icon/icon";
import { UiButton } from "../../ui/button";
import { UiMenu } from "../../ui/menu";
import type { UiMenuItem } from "../../ui/menu-item";

/**
 * The one Import menu (overhaul S5c): a file, a cURL command, a shared link, wherever Import is offered. Each choice
 * goes down `ImportPipeline`, whose report is the one dialog. `extra` adds what only one place has (the sidebar's
 * Folder…).
 */
@Component({
  selector: "app-import-menu",
  imports: [Icon, MenuTrigger, UiButton, UiMenu],
  templateUrl: "./import-menu.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "contents" },
})
export class ImportMenu {
  protected readonly pipeline = inject(ImportPipeline);
  /** Items after the three common ones. */
  readonly extra = input<UiMenuItem[]>([]);
  /** The button is text, or outlined where it stands beside other outlined buttons or alone in an empty state. */
  readonly look = input<"text" | "outlined">("text");
  private readonly file = viewChild<ElementRef<HTMLInputElement>>("file");

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Aria's trigger takes Escape on its button and stops it, also with the menu closed (CLAUDE.md, Angular Aria). A
   * dialog around the menu (Settings) must still hear it: the key goes on from the host's parent, as a new event.
   * With the menu open, focus is in its items and not on this button, so this is only a closed menu's key.
   */
  protected escape(): void {
    this.host.nativeElement.parentElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  }

  protected readonly items = computed<UiMenuItem[]>(() => [
    { label: importing.menu[0], icon: "upload_file", command: () => this.file()?.nativeElement.click() },
    { label: importing.menu[1], icon: "terminal", command: () => this.pipeline.openPaste() },
    { label: importing.menu[2], icon: "link", command: () => this.pipeline.openPaste("link") },
    ...this.extra(),
  ]);
}
