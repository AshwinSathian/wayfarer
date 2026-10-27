import { SHORTCUTS } from "../../shared/shortcuts";
import { ImportDialog } from "../import/import-dialog";
import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { UiInput } from "../../ui/input";
import { UiTooltip } from "../../ui/tooltip";
import { Confirm } from "../../ui/confirm";
import { UiButton } from "../../ui/button";
import { Dialog } from "../../ui/dialog";
import { UiModal } from "../../ui/modal";
import { PastRequest } from "@wayfarer/core";
import { RequestDoc } from "../../models/collections";
import { EnvironmentsStore } from "../../services/environments-store";
import { SecretsVault, passphraseProblem } from "../../services/secrets-vault";
import { StoragePersistence } from "../../services/storage-persistence";
import { WorkspaceBackup } from "../../services/workspace-backup";
import { HistoryRepository } from "../../data/history-repository";
import { DatabaseResetBlockedError, IdbCore } from "../../data/idb-core";
import { Theme } from "../../services/theme";
import { BridgeSettings } from "../../services/bridge-settings";
import { Composer } from "../composer/composer";
import { PastRequests } from "../past-requests/past-requests";
import { CollectionsSidebar, PaletteAction } from "../collections/collections-sidebar";
import { EnvironmentsManager } from "../environments/environments-manager";
import { SecretsManager } from "../secrets/secrets-manager";
import { Settings, type SettingsSection } from "../settings/settings";
import { Icon } from "../../shared/icon/icon";
import { Diagnostics } from "../../services/diagnostics";
import { SwUpdate } from "../../services/sw-update";
import type { RunTarget } from "../../state/run-state";
import { VariableFocus } from "../../services/variable-focus";
import { UiSelect } from "../../ui/select";

@Component({
  selector: "app-shell",
  imports: [
    UiInput,
    NgTemplateOutlet,
    Icon,
    UiModal,
    UiButton,
    UiSelect,
    Dialog,
    ImportDialog,
    UiTooltip,
    FormsModule,
    Composer,
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
  /** The composer stacks its sections (below 768 px). */
  readonly isMobile = input(false);
  /** The sidebar is a drawer over the page, not pinned beside it (below 1024 px). */
  readonly sidebarOverlay = input(false);

  readonly newRequest = output<void>();
  readonly clearHistory = output<void>();
  readonly deleteRequest = output<number>();
  readonly closeDrawer = output<void>();
  readonly toggleDrawer = output<void>();

  readonly composer = viewChild.required(Composer);

  private readonly confirm = inject(Confirm);
  private readonly environmentsService = inject(EnvironmentsStore);
  private readonly secretsService = inject(SecretsVault);
  protected readonly backup = inject(WorkspaceBackup);
  protected readonly persistence = inject(StoragePersistence);
  private readonly idb = inject(IdbCore);
  private readonly history = inject(HistoryRepository);
  readonly dataResetElsewhere = this.idb.closedByOtherTab;
  readonly storageUnavailable = this.idb.memoryOnly;
  readonly themeService = inject(Theme);
  readonly bridgeService = inject(BridgeSettings);
  protected readonly routeNames = { auto: "auto", direct: "direct", bridge: "Local Bridge" } as const;
  /** What the app will do with a request of no other route, not what is chosen (U-131): Auto with no paired bridge sends from the page. */
  protected readonly routeNow = computed(() => {
    const { route, url } = this.bridgeService.config();
    if (route === "auto" && !this.bridgeService.paired()) return this.routeNames.direct;
    if (route === "bridge" && !url) return this.routeNames.direct;
    return this.routeNames[route];
  });
  protected readonly themeNames = { system: "system", light: "light", dark: "dark" } as const;
  private static readonly THEME_ORDER = ["system", "light", "dark"] as const;
  /** The choice the status bar's theme button makes next: system, light and dark in turn (U-087). */
  protected readonly nextChoice = computed(() => {
    const order = AppShell.THEME_ORDER;
    return order[(order.indexOf(this.themeService.choice()) + 1) % order.length];
  });
  protected nextTheme(): void {
    this.themeService.choose(this.nextChoice());
  }
  /** "Vault unlocked." or "Vault locked." when the vault changes; nothing at first. */
  protected readonly vaultSaid = signal("");
  private vaultWasUnlocked: boolean | undefined;
  private readonly vaultWatcher = effect(() => {
    const unlocked = this.secretsService.isUnlocked();
    if (this.vaultWasUnlocked !== undefined && unlocked !== this.vaultWasUnlocked)
      this.vaultSaid.set(unlocked ? "Vault unlocked." : "Vault locked.");
    this.vaultWasUnlocked = unlocked;
  });

  private readonly environmentWatcher = effect(() => {
    const envs = this.environmentsService.environments();
    this.dropdownOptions.set(envs.map((env) => ({ label: env.name, value: env.meta.id })));
    this.selectedEnvironmentId.set(this.environmentsService.activeEnvironment()?.meta.id ?? null);
  });

  readonly dropdownOptions = signal<{ label: string; value: string }[]>([]);
  readonly selectedEnvironmentId = signal<string | null>(null);
  readonly lockDialogVisible = signal(false);
  /** A send that needs a vault secret asks for the vault to be opened. */
  private readonly unlockWatcher = effect(() => {
    if (this.secretsService.unlockRequested()) {
      void this.openLockDialog();
    }
  });
  readonly historyDrawerVisible = signal(false);
  readonly isFirstVaultSetup = signal(false);
  readonly confirmPassphrase = signal("");
  readonly unlockPassphrase = signal("");
  resettingAll = false;
  readonly resetError = signal("");
  protected readonly resetErrorText = computed(() =>
    this.resetError() ? `Nothing was deleted. ${this.resetError()}` : "",
  );
  /** The banners' words, drawn in each banner and said by the shell's two live regions (U-075). */
  protected readonly banners = {
    update: "Update available: a new version of Wayfarer is ready.",
    backup:
      "It has been more than 14 days since this workspace was backed up. It lives only in this browser, which can delete it.",
    resetElsewhere: "The data was reset in another tab. Reload this one: what you change here is no longer saved.",
    storage:
      "This browser is not letting Wayfarer store data (a private window, or storage blocked for this site). History is kept only until this tab closes; collections, environments and secrets cannot be saved.",
  } as const;
  /** The backup reminder's words: sooner and plainer while the browser has not promised to keep the data (U-137). */
  protected readonly backupWords = computed(() =>
    this.persistence.persisted() === false
      ? "This workspace lives only in this browser, which has not promised to keep it. Back up to keep a copy."
      : this.banners.backup,
  );
  protected readonly bannerStatus = computed(() =>
    [this.swUpdate.updateAvailable() ? this.banners.update : "", this.backup.reminderDue() ? this.backupWords() : ""]
      .filter(Boolean)
      .join(" "),
  );
  protected readonly bannerAlert = computed(() =>
    [
      this.dataResetElsewhere() ? this.banners.resetElsewhere : "",
      this.storageUnavailable() ? this.banners.storage : "",
      this.resetErrorText(),
    ]
      .filter(Boolean)
      .join(" "),
  );
  readonly unlockError = signal("");

  readonly secretsDialogVisible = signal(false);
  /** The environments editor, a dialog: the page holds the request and its response only. */
  readonly environmentsVisible = signal(false);
  private readonly variableFocus = inject(VariableFocus);
  /** A variable chip or the secrets list asks to see an environment's variable, or to add a missing one: the editor opens for it. */
  private readonly openForVariable = effect(() => {
    const source = this.variableFocus.pending()?.source;
    if (source === "environment" || source === "missing") this.environmentsVisible.set(true);
  });
  readonly settingsDialogVisible = signal(false);

  /** The pane Settings opens at. */
  readonly settingsSection = signal<SettingsSection>("general");

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
        id: "new-tab",
        label: "New tab",
        keys: SHORTCUTS.newTab,
        run: () => this.composer().newTab(),
      },
      {
        id: "duplicate-tab",
        label: "Duplicate Tab",
        run: () => this.composer().duplicateTab(),
      },
      {
        id: "close-tab",
        label: "Close tab",
        keys: SHORTCUTS.closeTab,
        run: () => this.composer().closeTab(),
      },
      {
        id: "send-request",
        label: "Send request",
        keys: SHORTCUTS.send,
        run: () => this.composer().sendRequest(),
      },
      {
        id: "save-request",
        label: "Save request",
        keys: SHORTCUTS.save,
        run: () => this.composer().saveCurrentRequest(),
      },
      {
        id: "environments",
        label: "Environments",
        run: () => this.environmentsVisible.set(true),
      },
      {
        id: "focus-address-bar",
        label: "Focus Address Bar",
        run: () => this.composer().focusUrl(),
      },
      {
        id: "toggle-theme",
        label: this.themeService.theme() === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        run: () => this.themeService.toggle(),
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Collections Sidebar",
        run: () => this.toggleNavigation(),
      },
      {
        id: "open-history",
        label: "Open Request History",
        run: () => this.openHistory(),
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
        run: () => this.openSettings(),
      },
    ];
  }

  get historyBadge(): string | undefined {
    const pastRequests = this.pastRequests();
    return pastRequests?.length ? String(pastRequests.length) : undefined;
  }

  private readonly navigationDrawer = viewChild<UiModal>("navigationDrawer");
  private readonly historyDrawer = viewChild.required<UiModal>("historyDrawer");

  /**
   * A drawer is shown and closed in the task that asks for it (#223), so
   * focus is in it before the next key: the binding would do it a render
   * later, and opened and closed before that render, it would see no change.
   */
  protected openHistory(): void {
    this.historyDrawer().show();
    this.historyDrawerVisible.set(true);
  }

  protected closeHistory(): void {
    this.historyDrawer().close();
    this.historyDrawerVisible.set(false);
  }

  /** Pinned, the sidebar is no drawer: the app shows or hides it. */
  protected toggleNavigation(): void {
    const drawer = this.navigationDrawer();
    if (drawer?.element.open) drawer.close();
    else drawer?.show();
    this.toggleDrawer.emit();
  }

  protected closeNavigation(): void {
    this.navigationDrawer()?.close();
    this.closeDrawer.emit();
  }

  get drawerWidth(): string {
    return this.sidebarOverlay() ? "18rem" : "22rem";
  }

  handleLoadRequest(request: PastRequest): void {
    this.composer().loadPastRequest(request);
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
  }

  /** The drawer closes first: while it is open, the address field is in the inert page and takes no focus. */
  handleLoadCollectionRequest(request: RequestDoc): void {
    this.composer().loadCollectionRequest(request);
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
    this.composer().focusUrl();
  }

  handleRun(target: RunTarget): void {
    this.composer().openRun(target);
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
  }

  handleNewRequest(): void {
    this.composer().clearComposer();
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
    this.composer().focusUrl();
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
    // The status bar and the backup reminder say whether the browser keeps the data (U-137).
    void this.persistence.refresh();
  }

  /** What the status bar says of where the data is kept. */
  protected readonly storageWords = computed(() => {
    if (this.storageUnavailable()) return "Not saved: this browser refuses storage";
    if (this.persistence.persisted() === false) return "Saved in this browser, which may delete it";
    if (this.persistence.persisted()) return "Kept in this browser";
    return "Saved in this browser only";
  });

  async handleEnvironmentChange(id: string | null): Promise<void> {
    await this.environmentsService.setActiveEnvironment(id);
  }

  async openLockDialog(): Promise<void> {
    this.isFirstVaultSetup.set(!(await this.secretsService.exists()));
    this.lockDialogVisible.set(true);
    this.unlockPassphrase.set("");
    this.confirmPassphrase.set("");
    this.unlockError.set("");
  }

  closeLockDialog(): void {
    this.lockDialogVisible.set(false);
    // Whoever asked for the vault to be opened gets its answer.
    this.secretsService.unlockDialogClosed();
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
    const problem = this.isFirstVaultSetup() && passphraseProblem(passphrase, this.confirmPassphrase());
    if (problem) {
      this.unlockError.set(problem);
      return;
    }
    try {
      if (this.isFirstVaultSetup()) {
        if (await this.secretsService.create(passphrase)) {
          this.closeLockDialog();
        } else {
          // Another tab chose a passphrase while this dialog was open.
          this.isFirstVaultSetup.set(false);
          this.unlockError.set("Another tab has just made the vault. Enter its passphrase.");
        }
      } else if (await this.secretsService.unlock(passphrase)) {
        this.closeLockDialog();
      } else {
        this.unlockError.set("That passphrase does not open the vault.");
      }
    } catch (error) {
      console.error("Failed to unlock secrets", error);
      this.unlockError.set("This browser cannot open the vault.");
    }
  }

  lockSecrets(): void {
    this.secretsService.lock();
  }

  get secretsUnlocked(): boolean {
    return this.secretsService.isUnlocked();
  }

  /** Opens Settings at a section: the list's first, or the one a button is about. */
  openSettings(section: SettingsSection = "general"): void {
    this.settingsSection.set(section);
    this.settingsDialogVisible.set(true);
  }

  /** The bridge's settings are a pane of Settings. */
  openBridgeSettings(): void {
    this.openSettings("bridge");
  }

  /** Reloads only after the data is really gone; otherwise says why (F37). */
  private async performResetAllData(): Promise<void> {
    if (this.resettingAll) {
      return;
    }
    this.resettingAll = true;
    this.resetError.set("");
    try {
      // Until the reload: a send that ends in the meantime, or a tab's timer, must not open the database again.
      await this.idb.resetDatabase({ untilReload: true });
      this.history.resetLocalState();
    } catch (error) {
      console.error("Failed to reset IndexedDB", error);
      this.resetError.set(
        error instanceof DatabaseResetBlockedError ? error.message : "Reload the page and try again.",
      );
      this.resettingAll = false;
      return;
    }
    this.clearLocalCaches();
    this.secretsService.lock();
    location.reload();
  }

  reload(): void {
    location.reload();
  }

  /** Every key the app writes: theme, bridge URL and token, split ratios. */
  private clearLocalCaches(): void {
    for (const name of ["localStorage", "sessionStorage"] as const) {
      try {
        const storage = window[name];
        for (const key of Object.keys(storage)) {
          if (key.startsWith("wayfarer:")) storage.removeItem(key);
        }
      } catch (error) {
        this.diagnostics.record(error, `reset: could not clear ${name}`);
      }
    }
  }
}
