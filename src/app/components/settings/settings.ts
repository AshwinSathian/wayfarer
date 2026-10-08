import { ChangeDetectionStrategy, Component, inject, input, model, output, signal } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { Dialog } from "../../ui/dialog";
import { EnvironmentsStore } from "../../services/environments-store";
import { Theme } from "../../services/theme";
import { BridgeSettings } from "../../services/bridge-settings";
import { PaletteAction } from "../collections/collections-sidebar";
import {
  serializeEnvironmentExport,
  validateEnvironmentExport,
} from "../../shared/environments/environment-io";
import { version } from "../../../../package.json";
import { Icon } from "../../shared/icon/icon";
import { readImportText } from "../../shared/json/safe-json";

interface KeyboardShortcut {
  keys: string;
  description: string;
}

/**
 * Dedicated Settings surface (Part D/E, Phase 3) — consolidates the theme
 * toggle, data export/import, Reset All Data, a Local Bridge shortcut, and
 * a keyboard-shortcuts reference into one discoverable place. Everything
 * here is a UI wrapper around logic that already exists elsewhere:
 * Theme for the toggle, environment-io's own serialize/
 * validate for export/import, and the Reset All Data / Local Bridge flows
 * are still fully owned (and confirmed/executed) by AppShell —
 * this component only requests them via outputs.
 */
@Component({
  selector: "app-settings",
  imports: [Icon, MatButton, Dialog],
  templateUrl: "./settings.html",
  styleUrl: "./settings.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  readonly themeService = inject(Theme);
  readonly bridgeService = inject(BridgeSettings);
  private readonly environmentsService = inject(EnvironmentsStore);

  readonly visible = model(false);
  /** Same actions registered in the command palette (AppShell's sidebarPaletteActions), reused here for the shortcuts reference so this list can never drift out of sync with what's actually registered. */
  readonly paletteActions = input<PaletteAction[]>([]);

  readonly resetAllData = output<void>();
  readonly openBridgeSettings = output<void>();
  readonly openSecrets = output<void>();

  readonly importStatus = signal<{ kind: "ok" | "error"; message: string } | null>(null);

  /** From package.json, so the release bump is the only place it changes. */
  readonly version = version;

  readonly fixedShortcuts: KeyboardShortcut[] = [
    { keys: "⌘K / Ctrl+K", description: "Open the command palette" },
    { keys: "C", description: "New collection (collections panel focused, no field editing)" },
    { keys: "N", description: "New request in the selected collection/folder" },
    { keys: "Delete", description: "Delete the selected collections-panel item" },
    { keys: "Esc", description: "Close the open dialog/drawer/palette" },
  ];

  exportEnvironments(): void {
    const json = serializeEnvironmentExport(this.environmentsService.environments());
    this.downloadJson(json, "environments-export.json");
  }

  async handleEnvironmentImport(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await readImportText(file);
    const result = validateEnvironmentExport(text);
    if (!result.ok || !result.payload) {
      this.importStatus.set({
        kind: "error",
        message: result.errors?.join(" ") ?? "Invalid environments export file.",
      });
      input.value = "";
      return;
    }

    const existingNames = new Set(this.environmentsService.environments().map((env) => env.name));
    let imported = 0;
    for (const env of result.payload) {
      const name = this.uniqueName(env.name, existingNames);
      existingNames.add(name);
      await this.environmentsService.createEnvironment({
        name,
        description: env.description,
        vars: env.vars,
      });
      imported += 1;
    }

    this.importStatus.set({
      kind: "ok",
      message: `Imported ${imported} environment${imported === 1 ? "" : "s"} as new environment${
        imported === 1 ? "" : "s"
      }. For merge/replace control over existing environments, use Import from the Environments editor instead.`,
    });
    input.value = "";
  }

  private uniqueName(name: string, used: Set<string>): string {
    if (!used.has(name)) {
      return name;
    }
    let counter = 2;
    let candidate = `${name} (${counter})`;
    while (used.has(candidate)) {
      counter += 1;
      candidate = `${name} (${counter})`;
    }
    return candidate;
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
