import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnInit,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
  output
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ConfirmationService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { DialogModule } from "primeng/dialog";
import { DrawerModule } from "primeng/drawer";
import { SelectModule } from "primeng/select";
import { InputTextModule } from "primeng/inputtext";
import { CheckboxModule } from "primeng/checkbox";
import { SkeletonModule } from "primeng/skeleton";
import { ToolbarModule } from "primeng/toolbar";
import { PastRequest, PastRequestKey } from "../../models/history.models";
import { RequestDoc } from "../../models/collections.models";
import { EnvironmentsService } from "../../services/environments.service";
import { SecretCryptoService } from "../../shared/secrets/secret-crypto.service";
import { SecretsService } from "../../services/secrets.service";
import { IdbService } from "../../data/idb.service";
import { ThemeService } from "../../services/theme.service";
import { BridgeService } from "../../services/bridge.service";
import { ApiParamsComponent } from "../api-params/api-params.component";
import { PastRequestsComponent } from "../past-requests/past-requests.component";
import { CollectionsSidebarComponent, PaletteAction } from "../collections/collections-sidebar.component";
import { EnvironmentsManagerComponent } from "../environments/environments-manager.component";
import { SecretsManagerComponent } from "../secrets/secrets-manager.component";
import { SettingsComponent } from "../settings/settings.component";

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [
    CommonModule,
    DrawerModule,
    ButtonModule,
    ToolbarModule,
    SkeletonModule,
    SelectModule,
    DialogModule,
    InputTextModule,
    CheckboxModule,
    FormsModule,
    ApiParamsComponent,
    PastRequestsComponent,
    ConfirmDialogModule,
    CollectionsSidebarComponent,
    EnvironmentsManagerComponent,
    SecretsManagerComponent,
    SettingsComponent,
  ],
  templateUrl: "./app-shell.component.html",
  styleUrls: ["./app-shell.component.css"],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent implements OnInit {
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

  private readonly confirmationService = inject(ConfirmationService);
  private readonly injector = inject(Injector);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly secretCrypto = inject(SecretCryptoService);
  private readonly secretsService = inject(SecretsService);
  private readonly idb = inject(IdbService);
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

  confirmClear() {
    this.confirmationService.confirm({
      header: "Are you sure?",
      message: "Your entire history will be cleared",
      accept: () => this.clearHistory.emit(),
    });
    this.fixConfirmDialogAriaLabelledBy();
  }

  confirmResetAllData(): void {
    this.confirmationService.confirm({
      header: "Reset all data?",
      message:
        "This will delete every collection, request, environment, secret, history item, and preference stored in your browser. This cannot be undone.",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Reset",
      rejectLabel: "Cancel",
      acceptButtonStyleClass: "p-button-danger",
      accept: () => this.performResetAllData(),
    });
    this.fixConfirmDialogAriaLabelledBy();
  }

  /**
   * PrimeNG's ConfirmDialog always auto-generates aria-labelledby pointing at
   * an internal header <span> — but that span only renders in its default
   * (non-headless) template. We use a #headless template (for design-system
   * styling), so the generated id is permanently dangling, leaving the open
   * dialog with no accessible name. Re-point it at the real header element
   * we render ourselves, once Angular has painted the just-opened dialog.
   *
   * Two bugs fixed here, found via a failing e2e run against a production
   * build (never caught before — CI had only ever exercised this against
   * `ng serve`'s dev server): the selector was `[data-pc-name="dialog"]`,
   * but the actually-rendered attribute on this PrimeNG version's dialog
   * panel is `data-pc-name="t"` — an internal, unstable-looking name not
   * worth matching on at all — so the selector never matched anything and
   * this "fix" was a silent no-op. Selecting on `.p-confirmdialog[role]`
   * instead (the class axe itself reports as the violating node's target)
   * is what the panel actually carries. Separately, replaced the bare
   * `setTimeout(fn)` — a Zone-era "run after this render" idiom — with
   * `afterNextRender()`, which is the correct, zoneless-safe primitive for
   * the same intent (this app adopted zoneless change detection, under
   * which a bare macrotask isn't guaranteed to run after the dialog's DOM
   * is actually committed).
   */
  private fixConfirmDialogAriaLabelledBy(): void {
    afterNextRender(
      () => {
        document
          .querySelector('.p-confirmdialog[role="alertdialog"]')
          ?.setAttribute("aria-labelledby", "global-confirm-dialog-header");
      },
      { injector: this.injector }
    );
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

  private async performResetAllData(): Promise<void> {
    if (this.resettingAll) {
      return;
    }
    this.resettingAll = true;
    try {
      await this.idb.resetDatabase();
      this.clearLocalCaches();
    } catch (error) {
      console.error("Failed to reset IndexedDB", error);
    } finally {
      this.resettingAll = false;
      this.secretCrypto.lock();
      location.reload();
    }
  }

  private clearLocalCaches(): void {
    const keys = ["wayfarer:active-environment", "wayfarer:feature-flags"];
    for (const key of keys) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignored
      }
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignored
      }
    }
  }
}
