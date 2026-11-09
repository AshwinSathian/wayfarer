import { SHORTCUTS, ariaKeysOf, keysOf, matches } from "../../shared/shortcuts";
import { UndoNotice } from "../../services/undo-notice";
import { ImportPipeline } from "../../services/import-pipeline";

/** Where a key types text, and ⌘Z undoes typing. */
const typingIn = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || !!target.closest("input, textarea, select, .monaco-editor"));
import { Palette, PaletteItem } from "../palette/palette";
import { CollectionsStore } from "../../services/collections-store";
import { ImportDialog } from "../import/import-dialog";
import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
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
import { RequestDoc } from "../../models/collections";
import { EnvironmentsStore } from "../../services/environments-store";
import { SecretsVault, passphraseProblem } from "../../services/secrets-vault";
import { StoragePersistence } from "../../services/storage-persistence";
import { WorkspaceBackup } from "../../services/workspace-backup";
import { HistoryRepository, type HistorySummary } from "../../data/history-repository";
import { DatabaseResetBlockedError, IdbCore } from "../../data/idb-core";
import { Theme } from "../../services/theme";
import { PaneLayout } from "../../services/pane-layout";
import { BridgeSettings } from "../../services/bridge-settings";
import { Composer } from "../composer/composer";
import { PastRequests } from "../past-requests/past-requests";
import { CollectionsSidebar, PaletteAction } from "../collections/collections-sidebar";
import { SecretsManager } from "../secrets/secrets-manager";
import { Settings, type SettingsSection } from "../settings/settings";
import { Icon } from "../../shared/icon/icon";
import { Mark } from "../../shared/icon/mark";
import { DOCS } from "../../shared/docs";
import { Diagnostics } from "../../services/diagnostics";
import { SwUpdate } from "../../services/sw-update";
import type { RunTarget } from "../../state/run-state";
import type { HolderTarget } from "../../state/tab-state";
import { VariableFocus } from "../../services/variable-focus";
import { UiSelect } from "../../ui/select";

import { AiSettings } from "../../services/ai-settings";
import { ModelCalls } from "../../services/model-calls";
import { AiDraft } from "../ai-draft/ai-draft";
import { Tabs } from "../../state/tabs";
@Component({
  selector: "app-shell",
  imports: [
    AiDraft,
    UiInput,
    NgTemplateOutlet,
    Icon,
    Mark,
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
    SecretsManager,
    Settings,
    Palette,
  ],
  templateUrl: "./app-shell.html",
  styleUrl: "./app-shell.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(window:keydown)": "paletteKey($event)" },
})
export class AppShell implements OnInit {
  protected readonly shortcuts = SHORTCUTS;
  protected readonly keys = keysOf;
  protected readonly ariaKeys = ariaKeysOf;
  private readonly diagnostics = inject(Diagnostics);
  protected readonly swUpdate = inject(SwUpdate);
  readonly pastRequests = input<HistorySummary[]>([]);
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
  /** Between 1,024 and 1,200 px: keep the sidebar beside the page (true) or make it a drawer again (U-070). */
  readonly pinSidebar = output<boolean>();
  /** The window is wide enough for the sidebar to stay beside the page if asked (1,024 to 1,200 px). */
  readonly canPin = input(false);

  readonly composer = viewChild.required(Composer);

  private readonly confirm = inject(Confirm);
  private readonly environmentsService = inject(EnvironmentsStore);
  protected readonly secretsService = inject(SecretsVault);
  protected readonly backup = inject(WorkspaceBackup);
  protected readonly persistence = inject(StoragePersistence);
  private readonly idb = inject(IdbCore);
  private readonly history = inject(HistoryRepository);
  readonly dataResetElsewhere = this.idb.closedByOtherTab;
  readonly updatedElsewhere = this.idb.closedForUpdate;
  readonly storageUnavailable = this.idb.memoryOnly;
  readonly themeService = inject(Theme);
  private readonly paneLayout = inject(PaneLayout);
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
    // No environment is a choice too, once there is one to leave, and it lasts.
    this.dropdownOptions.set([
      ...(envs.length ? [{ label: "No environment", value: null }] : []),
      ...envs.map((env) => ({ label: env.name, value: env.meta.id })),
    ]);
    this.selectedEnvironmentId.set(this.environmentsService.activeEnvironment()?.meta.id ?? null);
  });

  readonly dropdownOptions = signal<{ label: string; value: string | null }[]>([]);
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
    update: "A new version of Wayfarer is ready. Reload to use it.",
    backup:
      "It has been more than 14 days since your data was backed up. It lives only in this browser, which can delete it.",
    resetElsewhere: "The data was reset in another tab. Reload this one: what you change here is no longer saved.",
    updatedElsewhere: "Wayfarer was updated in another tab. Reload this one: what you change here is no longer saved.",
    storage:
      "This browser is not letting Wayfarer store data (a private window, or storage blocked for this site). History is kept only until this tab closes; collections, environments and secrets cannot be saved.",
  } as const;
  /** The backup reminder's words: sooner and plainer while the browser has not promised to keep the data (U-137). */
  protected readonly backupWords = computed(() =>
    // Safari's rule first: seven days without a visit, whatever it has promised (U-165).
    this.persistence.safariNotInstalled
      ? "Safari deletes your data after seven days without a visit. Back up, or add Wayfarer to the Dock, to keep it."
      : this.persistence.persisted() === false
        ? "Your data lives only in this browser, which has not promised to keep it. Back up to keep a copy."
        : this.banners.backup,
  );
  /** Why this tab closed its database: another tab reset the data, or runs a later Wayfarer. */
  protected readonly closedWords = computed(() =>
    this.updatedElsewhere() ? this.banners.updatedElsewhere : this.banners.resetElsewhere,
  );
  protected readonly bannerStatus = computed(() =>
    [this.swUpdate.updateAvailable() ? this.banners.update : "", this.backup.reminderDue() ? this.backupWords() : ""]
      .filter(Boolean)
      .join(" "),
  );
  protected readonly bannerAlert = computed(() =>
    [
      this.dataResetElsewhere() ? this.closedWords() : "",
      this.storageUnavailable() ? this.banners.storage : "",
      this.resetErrorText(),
    ]
      .filter(Boolean)
      .join(" "),
  );
  readonly unlockError = signal("");

  readonly secretsDialogVisible = signal(false);
  /** The Environments tab (D4.5): it replaced the dialog that lost edits and stacked dialogs (U-060, U-085). */
  protected openEnvironmentsTab(): void {
    this.composer().openEnvironments();
  }
  private readonly variableFocus = inject(VariableFocus);
  /**
   * A variable chip or the secrets list asks to see a variable: an environment's, a global or a missing one opens the
   * Environments tab, which shows it; a secret's opens the secrets, and a collection's or a folder's its settings tab
   * at Variables (U-132).
   */
  private readonly openForVariable = effect(() => {
    const token = this.variableFocus.pending();
    const source = token?.source;
    if (token?.holder) {
      const { holder, key } = token;
      untracked(() => {
        this.variableFocus.pending.set(null);
        this.composer().openHolder(holder, key);
      });
    } else if (source === "environment" || source === "missing" || source === "global")
      untracked(() => this.openEnvironmentsTab());
    else if (source === "secret")
      untracked(() => {
        this.variableFocus.pending.set(null);
        this.secretsDialogVisible.set(true);
      });
  });
  readonly settingsDialogVisible = signal(false);
  protected readonly ai = inject(AiSettings);
  protected readonly modelCalls = inject(ModelCalls);
  private readonly openTabs = inject(Tabs);

  /** The pane Settings opens at. */
  readonly settingsSection = signal<SettingsSection>("general");

  /** The shell's commands for the palette; the sidebar adds New collection and what can be done to its selected row. */
  get paletteCommands(): PaletteAction[] {
    return [
      // One command: a new request is a new tab (ia.md, D4-f; U-168).
      {
        id: "new-request",
        label: "New request",
        keys: SHORTCUTS.newTab,
        run: () => this.handleNewRequest(),
      },
      {
        id: "duplicate-tab",
        label: "Duplicate tab",
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
        run: () => this.openEnvironmentsTab(),
      },
      {
        id: "focus-address-bar",
        label: "Go to the address",
        run: () => this.composer().focusUrl(),
      },
      {
        id: "toggle-theme",
        label: this.themeService.theme() === "dark" ? "Switch to the light theme" : "Switch to the dark theme",
        run: () => this.themeService.toggle(),
      },
      {
        id: "response-under",
        label: "Put the response under the request",
        run: () => this.paneLayout.choose("under"),
      },
      {
        id: "response-beside",
        label: "Put the response beside the request",
        run: () => this.paneLayout.choose("beside"),
      },
      {
        id: "toggle-sidebar",
        label: "Show or hide the sidebar",
        run: () => this.toggleNavigation(),
      },
      {
        id: "open-history",
        label: "History",
        run: () => this.openHistory(),
      },
      {
        id: this.secretsUnlocked ? "lock-secrets" : "unlock-secrets",
        label: this.secretsUnlocked
          ? "Lock the vault"
          : this.secretsService.made() === false
            ? "Create vault"
            : "Unlock the vault",
        run: () => (this.secretsUnlocked ? this.lockSecrets() : this.openLockDialog()),
      },
      {
        id: "open-secrets-manager",
        label: "Secrets",
        run: () => this.secretsDialogVisible.set(true),
      },
      {
        id: "open-local-bridge-settings",
        label: "Local Bridge settings",
        run: () => this.openBridgeSettings(),
      },
      {
        id: "reset-all-data",
        label: "Reset all data…",
        run: () => this.confirmResetAllData(),
      },
      {
        id: "open-settings",
        label: "Settings",
        run: () => this.openSettings(),
      },
      {
        // The site's pages, beside the app (U-166); a tab of their own, as Settings › About's link.
        id: "open-docs",
        label: "Documentation",
        run: () => void window.open(DOCS.index, "_blank", "noopener"),
      },
      // Only with a provider and the action on (AI-1), and Write tests and Explain only where their control is.
      ...this.aiCommands(),
      ...(this.ai.offers().draft
        ? [
            {
              id: "ai-draft",
              label: "Draft a request from a description…",
              run: () => this.modelCalls.draftOpen.set(true),
            },
          ]
        : []),
    ];
  }

  /** Write tests and Explain in the palette: the open tab's response must be there, and failed for Explain. */
  private aiCommands(): PaletteAction[] {
    const tab = this.openTabs.active();
    const status = tab.responseStatusCode();
    if (status === undefined) return [];
    const ask = (action: "tests" | "explain") => {
      if (action === "tests") tab.responseTab.set("tests");
      else tab.recordOpen.set(true);
      this.modelCalls.asked.set(action);
    };
    return [
      ...(this.ai.offers().tests
        ? [{ id: "ai-tests", label: "Write tests from the response…", run: () => ask("tests") }]
        : []),
      ...(this.ai.offers().explain && status >= 400
        ? [{ id: "ai-explain", label: "Explain the response…", run: () => ask("explain") }]
        : []),
    ];
  }

  /** The palette is open (⌘K anywhere, or the toolbar's search, U-011). */
  readonly paletteOpen = signal(false);
  private readonly sidebar = viewChild(CollectionsSidebar);
  private readonly collections = inject(CollectionsStore);
  private readonly injector = inject(Injector);
  protected readonly undo = inject(UndoNotice);
  private readonly importPipeline = inject(ImportPipeline);

  /** What the palette finds: commands, requests, collections and folders, environments and past requests (U-011). */
  get paletteItems(): PaletteItem[] {
    const commands: PaletteItem[] = [...this.paletteCommands, ...(this.sidebar()?.commands() ?? [])].map((action) => ({
      ...action,
      group: "Commands",
    }));
    const requests: PaletteItem[] = [];
    const places: PaletteItem[] = [];
    for (const { collection, folders, requests: docs } of this.collections.tree()) {
      places.push({
        id: `collection:${collection.meta.id}`,
        group: "Collections and folders",
        label: collection.name,
        run: () => this.revealInSidebar(`collection:${collection.meta.id}`),
      });
      for (const folder of folders)
        places.push({
          id: `folder:${folder.meta.id}`,
          group: "Collections and folders",
          label: folder.name,
          detail: collection.name,
          run: () => this.revealInSidebar(`folder:${folder.meta.id}`),
        });
      for (const doc of docs)
        requests.push({
          id: doc.meta.id,
          group: "Requests",
          label: doc.name || doc.url,
          detail: doc.url,
          method: doc.method,
          run: () => this.handleLoadCollectionRequest(doc),
        });
    }
    const active = this.environmentsService.activeEnvironment()?.meta.id;
    const environments: PaletteItem[] = this.environmentsService.environments().map((environment) => ({
      id: environment.meta.id,
      group: "Environments",
      label: environment.name,
      detail: environment.meta.id === active ? "In use" : undefined,
      run: () => this.handleEnvironmentChange(environment.meta.id),
    }));
    // A model call loads into no tab (D4.10): History opens it into its record.
    const history: PaletteItem[] = [...this.pastRequests()]
      .filter((entry) => !entry.model)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((entry) => ({
        id: String(entry.id ?? entry.createdAt),
        group: "History",
        label: entry.sent.url,
        method: entry.sent.method,
        run: () => void this.handleLoadRequest(entry),
      }));
    return [...commands, ...requests, ...places, ...environments, ...history];
  }

  /** A link's Import moves focus to the collection it added (receive.md, "Done"); the status region says "Added …". */
  private readonly linkImported = effect(() => {
    const added = this.importPipeline.addedFromLink();
    if (added) untracked(() => this.revealInSidebar(`collection:${added.id}`));
  });

  /** The sidebar is shown (a drawer below 1,200 px), then the row selected in it. */
  private revealInSidebar(key: string): void {
    if (this.sidebarOverlay() || !this.drawerVisible()) this.toggleNavigation();
    afterNextRender(() => this.sidebar()?.reveal(key), { injector: this.injector });
  }

  /** A drawer row (U-097): the drawer closes first, so what it opens is over the page and takes the keys. */
  protected fromDrawer(open: () => void): void {
    this.closeNavigation();
    open();
  }
  protected readonly openEnvironments = () => this.openEnvironmentsTab();
  protected readonly openHistoryRow = () => this.openHistory();

  /** The drawer's search row: the drawer closes first, so the palette opens over the page. */
  protected searchFromDrawer(): void {
    this.closeNavigation();
    this.paletteOpen.set(true);
  }

  /**
   * ⌘K anywhere, from a field too (U-049), unless a dialog has the keyboard. ⌘Z or Ctrl+Z, while an Undo is offered
   * and focus is not where text is typed (there the key undoes typing), undoes the delete (U-080).
   */
  protected paletteKey(event: KeyboardEvent): void {
    if (document.querySelector("dialog:modal")) return;
    if (matches(event, SHORTCUTS.palette)) {
      event.preventDefault();
      this.paletteOpen.set(true);
    } else if (matches(event, SHORTCUTS.undo) && this.undo.current() && !typingIn(event.target)) {
      event.preventDefault();
      void this.undo.undo();
    }
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

  /** The sidebar is on screen: pinned and shown, or the drawer open. The toolbar's button says what it will do. */
  protected readonly sidebarShown = computed(() => this.drawerVisible());

  /** Pinned below 1,200 px (U-070) it is narrower: beside it the composer and the response keep room. */
  get drawerWidth(): string {
    return this.sidebarOverlay() ? "18rem" : this.canPin() ? "17.5rem" : "22rem";
  }

  /** The list holds no template: the entry is read by its id, then loaded. */
  async handleLoadRequest(request: HistorySummary): Promise<void> {
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
    const entry = request.id === undefined ? null : await this.history.get(request.id);
    if (entry) this.composer().loadPastRequest(entry);
  }

  /** The drawer closes first: while it is open, the address field is in the inert page and takes no focus. */
  handleLoadCollectionRequest(request: RequestDoc): void {
    this.composer().loadCollectionRequest(request);
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
    this.composer().focusUrl();
  }

  /** Settings… of a collection or a folder (D5-e): its tab, over which a drawer would lie. */
  handleOpenSettings(target: HolderTarget): void {
    this.composer().openHolder(target);
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
  }

  handleRun(target: RunTarget): void {
    this.composer().openRun(target);
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
  }

  /** A new request in a tab of its own: emptying the open tab lost what was typed in it (U-168). */
  handleNewRequest(): void {
    this.composer().newTab();
    if (this.sidebarOverlay()) {
      this.closeNavigation();
    }
    this.composer().focusUrl();
  }

  async confirmClear(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: "Clear history?",
      message: "Every entry is deleted; collections are not touched. This cannot be undone.",
      acceptLabel: "Clear history",
      rejectLabel: "Cancel",
    });
    if (confirmed) {
      this.clearHistory.emit();
    }
  }

  async confirmResetAllData(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: "Reset all data?",
      message:
        "Every collection, request, environment, secret, history entry and setting in this browser is deleted. This cannot be undone.",
      acceptLabel: "Reset all data",
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
    if (this.persistence.safariNotInstalled) return "Kept by Safari for 7 days without a visit";
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
        error instanceof DatabaseResetBlockedError
          ? error.message
          : "The reset stopped with an error. Reload the page and reset again.",
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
