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
  /** The button is the plain `outlined` one; false for the filled one. */
  readonly quiet = input(true);
  private readonly file = viewChild<ElementRef<HTMLInputElement>>("file");

  protected readonly items = computed<UiMenuItem[]>(() => [
    { label: importing.menu[0], icon: "upload_file", command: () => this.file()?.nativeElement.click() },
    { label: importing.menu[1], icon: "terminal", command: () => this.pipeline.openPaste() },
    { label: importing.menu[2], icon: "link", command: () => this.pipeline.openPaste("link") },
    ...this.extra(),
  ]);
}
