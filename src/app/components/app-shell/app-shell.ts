import { NgTemplateOutlet } from "@angular/common";
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
import { MatTooltip } from "@angular/material/tooltip";
import { Confirm } from "../../ui/confirm";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from "@angular/material/sidenav";
import { Dialog } from "../../ui/dialog";
import { MatOption } from "@angular/material/core";
import { MatSelect } from "@angular/material/select";
import { PastRequest, PastRequestKey } from "../../models/history";
import { RequestDoc } from "../../models/collections";
import { EnvironmentsStore } from "../../services/environments-store";
import { SecretCrypto } from "../../shared/secrets/secret-crypto";
import { SecretsVault } from "../../services/secrets-vault";
import { Idb } from "../../data/idb";
import { DatabaseResetBlockedError } from "../../data/idb-core";
import { Theme } from "../../services/theme";
import { BridgeSettings } from "../../services/bridge-settings";
import { ApiParams } from "../api-params/api-params";
import { PastRequests } from "../past-requests/past-requests";
import { CollectionsSidebar, PaletteAction } from "../collections/collections-sidebar";
import { EnvironmentsManager } from "../environments/environments-manager";
import { SecretsManager } from "../secrets/secrets-manager";
import { Settings } from "../settings/settings";
import { Icon } from "../../shared/icon/icon";
import { Diagnostics } from "../../services/diagnostics";
import { SwUpdate } from "../../services/sw-update";

@Component({
  selector: "app-shell",
  imports: [
    NgTemplateOutlet,
    Icon,
    MatSidenavContainer,
    MatSidenav,
    MatSidenavContent,
    MatButton, MatIconButton,
    MatSelect, MatOption,
    Dialog,
    MatTooltip,
    FormsModule,
    ApiParams,
    PastRequests,
    CollectionsSidebar,
    EnvironmentsManager,
    SecretsManager,
    Settings,
  ],
  templateUrl: "./app-shell.html",
  styleUrl: "./app-shell.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell implements OnInit {
  private readonly diagnostics = inject(Diagnostics);
  protected readonly swUpdate = inject(SwUpdate);
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

  readonly apiParams = viewChild.required(ApiParams);

  private readonly confirm = inject(Confirm);
  private readonly environmentsService = inject(EnvironmentsStore);
  private readonly secretCrypto = inject(SecretCrypto);
  private readonly secretsService = inject(SecretsVault);
  private readonly idb = inject(Idb);
  readonly dataResetElsewhere = this.idb.closedByOtherTab;
  readonly storageUnavailable = this.idb.memoryOnly;
  readonly themeService = inject(Theme);
  readonly bridgeService = inject(BridgeSettings);

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

  /** What had focus when a drawer opened. */
  private drawerOpener: HTMLElement | null = null;

  /**
   * Moves focus into a drawer as it starts to open. Material does so when
   * the slide ends; until then Tab walked the page underneath, and Escape,
   * which a drawer reads from its own element, did nothing.
   */
  protected focusDrawer(panel: HTMLElement): void {
    this.drawerOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex='0']")?.focus();
  }

  /** Material notes where focus was only once the slide has ended, by when it is inside the drawer. */
  protected restoreDrawerFocus(): void {
    this.drawerOpener?.focus();
    this.drawerOpener = null;
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

  ngOnInit(): void {
    void this.environmentsService.ensureLoaded();
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
    // Used exactly as typed: trimming would silently weaken a passphrase that ends in a space.
    const passphrase = this.unlockPassphrase();
    if (!passphrase) {
      return;
    }
    if (this.isFirstVaultSetup()) {
      if (passphrase !== this.confirmPassphrase()) {
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
    const ok = await this.bridgeService.checkHealth(this.bridgeUrlDraft().trim());
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

  /** Every key the app ever wrote: theme, bridge URL and token, split ratios (`api-sandbox:` is the pre-rename prefix). */
  private clearLocalCaches(): void {
    for (const name of ["localStorage", "sessionStorage"] as const) {
      try {
        const storage = window[name];
        for (const key of Object.keys(storage)) {
          if (/^(wayfarer|api-sandbox):/.test(key)) storage.removeItem(key);
        }
      } catch (error) {
        this.diagnostics.record(error, `reset: could not clear ${name}`);
      }
    }
  }
}
