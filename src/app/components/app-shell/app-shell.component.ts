import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  effect,
  inject,
  input,
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
import { SkeletonModule } from "primeng/skeleton";
import { ToolbarModule } from "primeng/toolbar";
import { PastRequest, PastRequestKey } from "../../models/history.models";
import { EnvironmentsService } from "../../services/environments.service";
import { SecretCryptoService } from "../../shared/secrets/secret-crypto.service";
import { SecretsService } from "../../services/secrets.service";
import { IdbService } from "../../data/idb.service";
import { ThemeService } from "../../services/theme.service";
import { ApiParamsComponent } from "../api-params/api-params.component";
import { PastRequestsComponent } from "../past-requests/past-requests.component";
import { CollectionsSidebarComponent } from "../collections/collections-sidebar.component";
import { EnvironmentsManagerComponent } from "../environments/environments-manager.component";

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
    FormsModule,
    ApiParamsComponent,
    PastRequestsComponent,
    ConfirmDialogModule,
    CollectionsSidebarComponent,
    EnvironmentsManagerComponent,
  ],
  templateUrl: "./app-shell.component.html",
  styleUrls: ["./app-shell.component.css"],
  providers: [ConfirmationService],
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
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly secretCrypto = inject(SecretCryptoService);
  private readonly secretsService = inject(SecretsService);
  private readonly idb = inject(IdbService);
  readonly themeService = inject(ThemeService);

  private readonly environmentWatcher = effect(() => {
    const envs = this.environmentsService.environments();
    this.dropdownOptions = envs.map((env) => ({
      label: env.name,
      value: env.meta.id,
    }));
    this.selectedEnvironmentId =
      this.environmentsService.activeEnvironment()?.meta.id ?? null;
  });

  dropdownOptions: { label: string; value: string }[] = [];
  selectedEnvironmentId: string | null = null;
  lockDialogVisible = false;
  historyDrawerVisible = false;
  isFirstVaultSetup = false;
  confirmPassphrase = "";
  unlockPassphrase = "";
  resettingAll = false;
  unlockError = "";

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

  handleLoadCollectionRequest(request: PastRequest): void {
    const apiParams = this.apiParams();
    if (apiParams) {
      apiParams.loadPastRequest(request);
      apiParams.focusUrl();
    }
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
   */
  private fixConfirmDialogAriaLabelledBy(): void {
    setTimeout(() => {
      document
        .querySelector('[data-pc-name="dialog"][role="alertdialog"]')
        ?.setAttribute("aria-labelledby", "global-confirm-dialog-header");
    });
  }

  async ngOnInit(): Promise<void> {
    await this.environmentsService.ensureLoaded();
  }

  async handleEnvironmentChange(id: string | null): Promise<void> {
    await this.environmentsService.setActiveEnvironment(id);
  }

  async openLockDialog(): Promise<void> {
    this.isFirstVaultSetup = !(await this.secretsService.hasAnySecrets());
    this.lockDialogVisible = true;
    this.unlockPassphrase = "";
    this.confirmPassphrase = "";
    this.unlockError = "";
  }

  closeLockDialog(): void {
    this.lockDialogVisible = false;
    this.unlockPassphrase = "";
    this.confirmPassphrase = "";
    this.unlockError = "";
  }

  async unlockSecrets(): Promise<void> {
    const passphrase = this.unlockPassphrase.trim();
    if (!passphrase) {
      return;
    }
    if (this.isFirstVaultSetup) {
      if (passphrase !== this.confirmPassphrase.trim()) {
        this.unlockError = "Passphrases do not match.";
        return;
      }
      if (passphrase.length < 8) {
        this.unlockError = "Passphrase must be at least 8 characters.";
        return;
      }
    }
    try {
      const ok = await this.secretsService.verifyAndUnlock(passphrase);
      if (ok) {
        this.closeLockDialog();
      } else {
        this.unlockError = "Incorrect passphrase. Please try again.";
      }
    } catch (error) {
      console.error("Failed to unlock secrets", error);
      this.unlockError = "Unable to unlock secrets in this environment.";
    }
  }

  lockSecrets(): void {
    this.secretCrypto.lock();
  }

  get secretsUnlocked(): boolean {
    return this.secretCrypto.isUnlocked;
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
    const keys = ["api-sandbox:active-environment", "api-sandbox:feature-flags"];
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
