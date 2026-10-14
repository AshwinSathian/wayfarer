import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, inject, input, model, output, signal, untracked } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonToggle, MatButtonToggleGroup } from "@angular/material/button-toggle";
import { MatButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { Dialog } from "../../ui/dialog";
import { EnvironmentsStore } from "../../services/environments-store";
import { Theme, type ThemeChoice } from "../../services/theme";
import { BridgePane } from "./bridge-pane";
import { BridgeSettings } from "../../services/bridge-settings";
import { CookiesPane } from "./cookies-pane";
import { DiagnosticsPane } from "./diagnostics-pane";
import { RequestSettings } from "../../services/request-settings";
import { PaletteAction } from "../collections/collections-sidebar";
import { version } from "../../../../package.json";
import { Icon } from "../../shared/icon/icon";
import type { IconName } from "../../shared/icon/icon-paths";
import { SecretsVault } from "../../services/secrets-vault";
import { StoragePersistence } from "../../services/storage-persistence";
import { WorkspaceBackup } from "../../services/workspace-backup";
import { Confirm } from "../../ui/confirm";
import { readImportText, serializeEnvironmentExport } from "@wayfarer/core";
import { ImportPipeline } from "../../services/import-pipeline";

interface KeyboardShortcut {
  keys: string;
  description: string;
}

/** The panes of Settings, by the id a caller opens one with. */
export type SettingsSection = "general" | "requests" | "history" | "data" | "vault" | "bridge" | "cookies" | "shortcuts" | "diagnostics" | "about" | "danger";

interface SectionEntry {
  id: SettingsSection;
  label: string;
  icon: IconName;
  /** What the pane is for, under its heading. */
  about: string;
}

const SECTIONS: SectionEntry[] = [
  { id: "general", label: "General", icon: "settings", about: "How the app looks." },
  { id: "requests", label: "Requests", icon: "bolt", about: "How a request is sent." },
  { id: "history", label: "History", icon: "history", about: "What is kept of the requests you send." },
  { id: "data", label: "Data and storage", icon: "save", about: "Take your work out, bring it back, and see where it is kept." },
  { id: "vault", label: "Vault", icon: "shield_lock", about: "The secrets vault and when it locks." },
  { id: "bridge", label: "Local Bridge", icon: "router", about: "An optional relay on your own machine, for APIs a browser cannot reach." },
  { id: "cookies", label: "Cookies", icon: "dns", about: "What responses set through the Local Bridge, and what later requests carry." },
  { id: "shortcuts", label: "Shortcuts", icon: "terminal", about: "Keys, and everything the command palette can do." },
  { id: "diagnostics", label: "Diagnostics", icon: "rule", about: "What is running, self-tests, and what went wrong. Nothing leaves this page unless you copy it." },
  { id: "about", label: "About", icon: "info", about: "This version, and where to read more." },
  { id: "danger", label: "Danger zone", icon: "warning", about: "What cannot be undone." },
];

const UNITS = ["B", "kB", "MB", "GB", "TB"];

/**
 * Settings: a dialog with its sections listed on the left and one section's
 * pane on the right. Below 768 px the list is the dialog, and a section
 * opens over it with a way back. A caller opens it at a section (`section`):
 * the toolbar's bridge button opens the Local Bridge pane.
 *
 * What a pane does is done by the service that owns it (`Theme`,
 * `RequestSettings`, `SecretsVault`, `WorkspaceBackup`, `BridgeSettings`).
 * Reset all data and the secrets manager are the shell's, asked for by an
 * output.
 */
@Component({
  selector: "app-settings",
  imports: [Icon, FormsModule, MatButton, MatButtonToggle, MatButtonToggleGroup, MatCheckbox, MatFormField, MatInput, Dialog, BridgePane, CookiesPane, DiagnosticsPane],
  templateUrl: "./settings.html",
  styleUrl: "./settings.css",
  // The rules reach the Local Bridge pane, a component of its own; each starts at `.settings`.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  readonly themeService = inject(Theme);
  readonly bridgeService = inject(BridgeSettings);
  readonly requestSettings = inject(RequestSettings);
  readonly vault = inject(SecretsVault);
  readonly persistence = inject(StoragePersistence);
  private readonly backup = inject(WorkspaceBackup);
  private readonly confirm = inject(Confirm);
  private readonly importPipeline = inject(ImportPipeline);

  readonly backupHistory = signal(false);
  readonly backupErrors = signal<string[]>([]);
  private readonly environmentsService = inject(EnvironmentsStore);

  readonly visible = model(false);
  /** The pane that is open. Set by the caller before it opens Settings, and by the list. */
  readonly section = model<SettingsSection>("general");
  protected readonly sections = SECTIONS;
  protected readonly current = computed(() => SECTIONS.find((entry) => entry.id === this.section()) ?? SECTIONS[0]);
  /** On a phone: a pane is shown in place of the list. A wider dialog shows both and does not read this. */
  protected readonly paneOpen = signal(false);
  protected readonly themeChoices: { value: ThemeChoice; label: string; icon: IconName }[] = [
    { value: "system", label: "System", icon: "settings" },
    { value: "light", label: "Light", icon: "light_mode" },
    { value: "dark", label: "Dark", icon: "dark_mode" },
  ];
  /** Same actions registered in the command palette (AppShell's sidebarPaletteActions), reused here for the shortcuts reference so this list can never drift out of sync with what's actually registered. */
  readonly paletteActions = input<PaletteAction[]>([]);

  readonly resetAllData = output<void>();
  readonly clearHistory = output<void>();
  readonly openSecrets = output<void>();


  /** From package.json, so the release bump is the only place it changes. */
  readonly version = version;

  /** Where to read more. Each opens in a tab of its own: GitHub, or a file served with the app. */
  protected readonly links: { label: string; about: string; href: string }[] = [
    { label: "Changelog", about: "What changed in each version, and what was wrong before.", href: "https://github.com/AshwinSathian/wayfarer/blob/main/CHANGELOG.md" },
    { label: "Trust center", about: "Where your data is, what leaves the page, and the known limits.", href: "https://github.com/AshwinSathian/wayfarer/blob/main/docs/trust-center.md" },
    { label: "Source and issues", about: "The code, and where to report a problem.", href: "https://github.com/AshwinSathian/wayfarer" },
    { label: "Licences", about: "The licences of the packages bundled with the app.", href: "/3rdpartylicenses.txt" },
  ];

  readonly fixedShortcuts: KeyboardShortcut[] = [
    { keys: "⌘K / Ctrl+K", description: "Open the command palette" },
    { keys: "Alt+T / ⌥T", description: "New tab" },
    { keys: "Alt+W / ⌥W", description: "Close the open tab" },
    { keys: "C", description: "New collection (collections panel focused, no field editing)" },
    { keys: "N", description: "New request in the selected collection/folder" },
    { keys: "Delete", description: "Delete the selected collections-panel item" },
    { keys: "Esc", description: "Close the open dialog/drawer/palette" },
  ];

  exportEnvironments(): void {
    const json = serializeEnvironmentExport(this.environmentsService.environments());
    this.downloadJson(json, "environments-export.json");
  }

  /** The file goes down the one import road: the report opens over Settings, and nothing is stored before it is confirmed. */
  async handleEnvironmentImport(event: Event): Promise<void> {
    await this.importPipeline.pick(event);
  }

  constructor() {
    // The storage state is read when Settings opens: it changes with what the user does elsewhere.
    effect(() => {
      if (!this.visible()) return;
      void this.persistence.refresh();
      // Opened at a section by its caller (the bridge button), a phone shows that pane; opened plainly, the list.
      this.paneOpen.set(untracked(() => this.section()) !== "general");
    });
  }

  protected open(section: SettingsSection): void {
    this.section.set(section);
    this.paneOpen.set(true);
    // On a phone the list has just gone: focus goes to the way back, which is in its place.
    this.focusWhenShown(".settings-back");
  }

  /** Back to the list, on a phone, with focus on the section that was open. */
  protected back(): void {
    this.paneOpen.set(false);
    this.focusWhenShown('.settings-nav-item[aria-current="page"]');
  }

  /** Up and Down walk the list, Home and End go to its ends, as in a menu. */
  protected walk(event: KeyboardEvent): void {
    const items = [...((event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>(".settings-nav-item") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[event.key];
    if (to === undefined || at === -1) return;
    event.preventDefault();
    items[(to + items.length) % items.length].focus();
  }

  /** Focuses what `selector` finds in the dialog once it is drawn, if it is shown at this width. */
  private focusWhenShown(selector: string): void {
    setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`.settings ${selector}`);
      if (target?.offsetParent) target.focus();
    });
  }

  /** A size as a person reads it: "3.6 MB", "10 GB". */
  protected size(bytes: number): string {
    const power = Math.min(UNITS.length - 1, bytes > 0 ? Math.floor(Math.log(bytes) / Math.log(1024)) : 0);
    const value = bytes / 1024 ** power;
    return `${value >= 100 || power === 0 ? Math.round(value) : Number(value.toFixed(1))} ${UNITS[power]}`;
  }

  /** How much of what the browser allows is used, as a width for the bar: never less than a sliver once anything is stored. */
  protected used(estimate: { usage: number; quota: number }): number {
    if (!estimate.quota || !estimate.usage) return 0;
    return Math.min(100, Math.max(1, (estimate.usage / estimate.quota) * 100));
  }

  async exportBackup(): Promise<void> {
    this.backupErrors.set([]);
    this.downloadJson(await this.backup.exportJson({ history: this.backupHistory() }), "wayfarer-workspace.json");
  }

  /** Replaces everything stored here with the file's workspace, after the user confirms. */
  async restoreBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    const text = await readImportText(file);
    const confirmed = await this.confirm.confirm({
      title: "Restore this backup?",
      message: "Everything stored in this browser (collections, requests, environments, variables and the vault) is replaced with what the file holds. This cannot be undone.",
      acceptLabel: "Restore",
    });
    if (!confirmed) {
      return;
    }
    const errors = await this.backup.restore(text);
    this.backupErrors.set(errors);
    if (!errors.length) {
      // Every store changed under the page: start again from what is stored.
      location.reload();
    }
  }

  private downloadJson(json: string, filename: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  close(): void {
    this.visible.set(false);
  }
}
