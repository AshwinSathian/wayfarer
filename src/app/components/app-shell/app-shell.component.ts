import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  input,
  signal,
  viewChild,
  output
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ConfirmService } from "../../ui/confirm.service";
import { ButtonDirective } from "../../ui/button.directive";
import { DialogComponent, DrawerComponent } from "../../ui/dialog.component";
import { SelectComponent } from "../../ui/select.component";
import { PastRequest, PastRequestKey } from "../../models/history.models";
import { RequestDoc } from "../../models/collections.models";
import { EnvironmentsService } from "../../services/environments.service";
import { SecretCryptoService } from "../../shared/secrets/secret-crypto.service";
import { SecretsService } from "../../services/secrets.service";
import { IdbService } from "../../data/idb.service";
import { DatabaseResetBlockedError } from "../../data/idb-core.service";
import { ThemeService } from "../../services/theme.service";
import { BridgeService } from "../../services/bridge.service";
import { ApiParamsComponent } from "../api-params/api-params.component";
import { PastRequestsComponent } from "../past-requests/past-requests.component";
import { CollectionsSidebarComponent, PaletteAction } from "../collections/collections-sidebar.component";
import { EnvironmentsManagerComponent } from "../environments/environments-manager.component";
import { SecretsManagerComponent } from "../secrets/secrets-manager.component";
import { SettingsComponent } from "../settings/settings.component";
import { IconComponent } from "../../shared/icon/icon.component";
import { DiagnosticsService } from "../../services/diagnostics.service";
import { SwUpdateService } from "../../services/sw-update.service";

@Component({
  selector: "app-shell",
  imports: [
    IconComponent,
    CommonModule,
    DrawerComponent,
    ButtonDirective,
    SelectComponent,
    DialogComponent,
    FormsModule,
    ApiParamsComponent,
    PastRequestsComponent,
    CollectionsSidebarComponent,
    EnvironmentsManagerComponent,
    SecretsManagerComponent,
    SettingsComponent,
  ],
  templateUrl: "./app-shell.component.html",
  styleUrl: "./app-shell.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent implements OnInit {
  private readonly diagnostics = inject(DiagnosticsService);
  protected readonly swUpdate = inject(SwUpdateService);
  readonly pastRequests = input<PastRequest[]>([]);
  readonly historyLoading = input(false);
  readonly drawerVisible = input(true);
  readonly isMobile = input(false);

  readonly newRequest = output<void>();
  readonly clearHistory = output<void>();
  readonly deleteRequest = output<PastRequestKey>();
  readonly openDrawer = output<void>();
  readonly closeDrawer = output<void>();
  readonly toggleDrawer = output<void>();

  readonly apiParams = viewChild.required(ApiParamsComponent);

  private readonly confirm = inject(ConfirmService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly secretCrypto = inject(SecretCryptoService);
  private readonly secretsService = inject(SecretsService);
  private readonly idb = inject(IdbService);
  readonly dataResetElsewhere = this.idb.closedByOtherTab;
  readonly themeService = inject(ThemeService);
  readonly bridgeService = inject(BridgeService);

  private readonly environmentWatcher = effect(() => {
    const envs = this.environmentsService.environments();
    this.dropdownOptions.set(
      envs.map((env) => ({ label: env.name, value: env.meta.id }))
    );
    this.selectedEnvironmentId.set(
      this.environmentsService.activeEnvironment()?.meta.id ?? null
    );
  });

  readonly dropdownOptions = signal<{ label: string; value: string }[]>([]);
  readonly selectedEnvironmentId = signal<string | null>(null);
  readonly lockDialogVisible = signal(false);
  readonly historyDrawerVisible = signal(false);
  readonly isFirstVaultSetup = signal(false);
  readonly confirmPassphrase = signal("");
  readonly unlockPassphrase = signal("");
  resettingAll = false;
  readonly resetError = signal("");
  readonly unlockError = signal("");

  readonly secretsDialogVisible = signal(false);
  readonly settingsDialogVisible = signal(false);

  readonly bridgeDialogVisible = signal(false);
  readonly bridgeUrlDraft = signal("");
  readonly bridgeTokenDraft = signal("");
  readonly bridgeEnabledDraft = signal(false);
  readonly bridgeTestStatus = signal<"idle" | "testing" | "ok" | "fail">("idle");

  /**
   * Cross-cutting app commands the command palette (hosted inside
   * app-collections-sidebar, where ⌘K is wired) can't build itself since it
   * has no access to the composer, theme, history drawer, or bridge state —
   * those all live here. Passed down as data via [externalActions].
   */
  get sidebarPaletteActions(): PaletteAction[] {
    return [
      {
        id: "new-request",
        label: "New Request",
        run: () => this.handleNewRequest(),
      },
      {
        id: "send-request",
        label: "Send Request",
        run: () => this.apiParams().sendRequest(),
      },
      {
        id: "focus-address-bar",
        label: "Focus Address Bar",
        run: () => this.apiParams().focusUrl(),
      },
      {
        id: "toggle-theme",
        label: this.themeService.theme() === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        run: () => this.themeService.toggle(),
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Collections Sidebar",
        run: () => this.toggleDrawer.emit(),
      },
      {
        id: "open-history",
        label: "Open Request History",
        run: () => this.historyDrawerVisible.set(true),
      },
      {
        id: this.secretsUnlocked ? "lock-secrets" : "unlock-secrets",
        label: this.secretsUnlocked ? "Lock Secrets" : "Unlock Secrets",
        run: () => (this.secretsUnlocked ? this.lockSecrets() : this.openLockDialog()),
      },
      {
        id: "open-secrets-manager",
        label: "Manage Secrets",
        run: () => this.secretsDialogVisible.set(true),
      },
      {
        id: "open-local-bridge-settings",
        label: "Local Bridge Settings",
        run: () => this.openBridgeSettings(),
      },
      {
        id: "reset-all-data",
        label: "Reset All Data…",
        run: () => this.confirmResetAllData(),
      },
      {
        id: "open-settings",
        label: "Settings",
        run: () => this.settingsDialogVisible.set(true),
      },
    ];
  }

  get historyBadge(): string | undefined {
    const pastRequests = this.pastRequests();
    return pastRequests?.length
      ? String(pastRequests.length)
      : undefined;
  }

  get drawerWidth(): string {
    return this.isMobile() ? "18rem" : "22rem";
  }

  handleLoadRequest(request: PastRequest): void {
    const apiParams = this.apiParams();
    if (apiParams) {
      apiParams.loadPastRequest(request);
    }
    if (this.isMobile()) {
      this.closeDrawer.emit();
    }
  }

  handleLoadCollectionRequest(request: RequestDoc): void {
    const apiParams = this.apiParams();
    if (apiParams) {
      apiParams.loadCollectionRequest(request);
      apiParams.focusUrl();
    }
    if (this.isMobile()) {
      this.closeDrawer.emit();
    }
  }

  handleNewRequest(): void {
    this.apiParams().clearComposer();
    this.apiParams().focusUrl();
    if (this.isMobile()) {
      this.closeDrawer.emit();
    }
  }

  async confirmClear(): Promise<void> {
    if (await this.confirm.confirm({ title: "Are you sure?", message: "Your entire history will be cleared" })) {
      this.clearHistory.emit();
    }
  }

  async confirmResetAllData(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: "Reset all data?",
      message:
        "This will delete every collection, request, environment, secret, history item, and preference stored in your browser. This cannot be undone.",
    });
    if (confirmed) await this.performResetAllData();
  }

  async ngOnInit(): Promise<void> {
    await this.environmentsService.ensureLoaded();
  }

  async handleEnvironmentChange(id: string | null): Promise<void> {
    await this.environmentsService.setActiveEnvironment(id);
  }

  async openLockDialog(): Promise<void> {
    this.isFirstVaultSetup.set(!(await this.secretsService.hasAnySecrets()));
    this.lockDialogVisible.set(true);
    this.unlockPassphrase.set("");
    this.confirmPassphrase.set("");
    this.unlockError.set("");
  }

  closeLockDialog(): void {
    this.lockDialogVisible.set(false);
    this.unlockPassphrase.set("");
    this.confirmPassphrase.set("");
    this.unlockError.set("");
  }

  async unlockSecrets(): Promise<void> {
    const passphrase = this.unlockPassphrase().trim();
    if (!passphrase) {
      return;
    }
    if (this.isFirstVaultSetup()) {
      if (passphrase !== this.confirmPassphrase().trim()) {
        this.unlockError.set("Passphrases do not match.");
        return;
      }
      if (passphrase.length < 8) {
        this.unlockError.set("Passphrase must be at least 8 characters.");
        return;
      }
    }
    try {
      const ok = await this.secretsService.verifyAndUnlock(passphrase);
      if (ok) {
        this.closeLockDialog();
      } else {
        this.unlockError.set("Incorrect passphrase. Please try again.");
      }
    } catch (error) {
      console.error("Failed to unlock secrets", error);
      this.unlockError.set("Unable to unlock secrets in this environment.");
    }
  }

  lockSecrets(): void {
    this.secretCrypto.lock();
  }

  get secretsUnlocked(): boolean {
    return this.secretCrypto.isUnlocked;
  }

  openBridgeSettings(): void {
    const current = this.bridgeService.config();
    this.bridgeUrlDraft.set(current.url);
    this.bridgeTokenDraft.set(current.token);
    this.bridgeEnabledDraft.set(current.enabled);
    this.bridgeTestStatus.set("idle");
    this.bridgeDialogVisible.set(true);
  }

  closeBridgeSettings(): void {
    this.bridgeDialogVisible.set(false);
  }

  async testBridgeConnection(): Promise<void> {
    this.bridgeTestStatus.set("testing");
    const originalConfig = this.bridgeService.config();
    // checkHealth() reads the service's current config, so stage the draft
    // values there for the duration of the probe rather than duplicating
    // the fetch logic here.
    this.bridgeService.update({ url: this.bridgeUrlDraft().trim() });
    const ok = await this.bridgeService.checkHealth();
    this.bridgeService.update({ url: originalConfig.url });
    this.bridgeTestStatus.set(ok ? "ok" : "fail");
  }

  saveBridgeSettings(): void {
    this.bridgeService.update({
      enabled: this.bridgeEnabledDraft(),
      url: this.bridgeUrlDraft().trim(),
      token: this.bridgeTokenDraft().trim(),
    });
    this.closeBridgeSettings();
  }

  /** Reloads only after the data is really gone; otherwise says why (F37). */
  private async performResetAllData(): Promise<void> {
    if (this.resettingAll) {
      return;
    }
    this.resettingAll = true;
    this.resetError.set("");
    try {
      await this.idb.resetDatabase();
    } catch (error) {
      console.error("Failed to reset IndexedDB", error);
      this.resetError.set(
        error instanceof DatabaseResetBlockedError
          ? error.message
          : "Reset failed; your data was not deleted. Reload the page and try again."
      );
      this.resettingAll = false;
      return;
    }
    this.clearLocalCaches();
    this.secretCrypto.lock();
    location.reload();
  }

  reload(): void {
    location.reload();
  }

  private clearLocalCaches(): void {
    const keys = ["wayfarer:active-environment", "wayfarer:feature-flags"];
    for (const key of keys) {
      for (const storage of ["localStorage", "sessionStorage"] as const) {
        try {
          window[storage].removeItem(key);
        } catch (error) {
          this.diagnostics.record(error, `reset: could not clear ${storage} key ${key}`);
        }
      }
    }
  }
}
