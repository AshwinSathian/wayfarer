import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, input, model, output, signal } from "@angular/core";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { TooltipModule } from "primeng/tooltip";
import { EnvironmentsService } from "../../services/environments.service";
import { ThemeService } from "../../services/theme.service";
import { BridgeService } from "../../services/bridge.service";
import { PaletteAction } from "../collections/collections-sidebar.component";
import {
  serializeEnvironmentExport,
  validateEnvironmentExport,
} from "../../shared/environments/environment-io.util";

interface KeyboardShortcut {
  keys: string;
  description: string;
}

/**
 * Dedicated Settings surface (Part D/E, Phase 3) — consolidates the theme
 * toggle, data export/import, Reset All Data, a Local Bridge shortcut, and
 * a keyboard-shortcuts reference into one discoverable place. Everything
 * here is a UI wrapper around logic that already exists elsewhere:
 * ThemeService for the toggle, environment-io.util's own serialize/
 * validate for export/import, and the Reset All Data / Local Bridge flows
 * are still fully owned (and confirmed/executed) by AppShellComponent —
 * this component only requests them via outputs.
 */
@Component({
  selector: "app-settings",
  standalone: true,
  imports: [CommonModule, ButtonModule, DialogModule, TooltipModule],
  templateUrl: "./settings.component.html",
  styleUrls: ["./settings.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly themeService = inject(ThemeService);
  readonly bridgeService = inject(BridgeService);
  private readonly environmentsService = inject(EnvironmentsService);

  readonly visible = model(false);
  /** Same actions registered in the command palette (AppShellComponent's sidebarPaletteActions), reused here for the shortcuts reference so this list can never drift out of sync with what's actually registered. */
  readonly paletteActions = input<PaletteAction[]>([]);

  readonly resetAllData = output<void>();
  readonly openBridgeSettings = output<void>();
  readonly openSecrets = output<void>();

  readonly importStatus = signal<{ kind: "ok" | "error"; message: string } | null>(null);

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
    const text = await file.text();
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
