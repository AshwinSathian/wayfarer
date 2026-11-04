import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { scriptsApproved, scriptsOf } from "@wayfarer/core";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { UiInput } from "../../ui/input";
import { UiSpinner } from "../../ui/spinner";
import {
  IMPORT_TOO_LARGE,
  formatDuration,
  isOversizedImport,
  readImportText,
  requestsInOrder,
  runCounts,
  runEnding,
  runFailed,
  sharedErrorHeading,
  sharedErrors,
  type RunResult,
} from "@wayfarer/core";
import { CollectionRunner } from "../../services/collection-runner";
import { statusTone } from "../../shared/http/status-tone";
import { CollectionsStore } from "../../services/collections-store";
import { ScriptTrust } from "../../services/script-trust";
import { ScriptReviewDialog } from "../composer/script-review-dialog";
import { Icon } from "../../shared/icon/icon";
import { historyExchange, type HarSource } from "../../shared/inspect/har-export";
import { saveFile } from "../../shared/save-file";
import { RunState } from "../../state/run-state";
import type { RequestDoc } from "../../models/collections";
import { HarExportDialog } from "../har-export/har-export-dialog";
import { ExchangeRecordView } from "../exchange-record/exchange-record";

/**
 * A collection run (P5.2): how it is to run, a table of its results as they
 * arrive, and the three reports. It is the content of a run's tab; the run
 * goes on when another tab is opened.
 */
@Component({
  selector: "app-run-view",
  imports: [ExchangeRecordView, Icon, ScriptReviewDialog, UiButton, UiCheckbox, UiInput, UiSpinner, HarExportDialog],
  templateUrl: "./run-view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunView {
  private readonly runner = inject(CollectionRunner);
  private readonly collections = inject(CollectionsStore);

  readonly run = input.required<RunState>();
  protected readonly formatDuration = formatDuration;
  protected readonly statusTone = statusTone;

  /** The requests a run would send now, as they are stored. */
  protected readonly requests = computed(() => {
    const { collectionId, folderId } = this.run().target;
    const tree = this.collections.tree().find((entry) => entry.collection.meta.id === collectionId);
    return tree ? requestsInOrder(tree, folderId) : [];
  });
  protected readonly failed = computed(() => this.run().results().filter(runFailed).length);
  protected readonly passed = computed(
    () =>
      this.run()
        .results()
        .filter((result) => !result.skipped && !runFailed(result)).length,
  );
  protected readonly skipped = computed(
    () =>
      this.run()
        .results()
        .filter((result) => result.skipped).length,
  );
  /** How many results the run should give: its requests once an iteration. A script can send more or fewer. */
  protected readonly expected = computed(() => {
    const run = this.run();
    return this.requests().length * (run.iterations() ?? (run.dataFile()?.rows.length || 1));
  });
  /**
   * Each error two or more results ended with, the commonest first: a run
   * against a host the page cannot reach gave the same three lines on every
   * row. Each is said once, above the table.
   */
  protected readonly sharedErrors = computed(() => {
    // An error the page got no response for: the Local Bridge is what can send it, and says why (U-014).
    const network = new Set<string>();
    const records = this.run().records();
    const results = this.run().results();
    results.forEach(({ error }, index) => {
      if (error !== undefined && records[index]?.failure?.kind === "network") network.add(error);
    });
    return sharedErrors(results).map((shared) => ({ ...shared, network: network.has(shared.error) }));
  });

  /** A row's request, opened in a tab of its own (U-076); the run's tab is never loaded into. */
  readonly openRequest = output<RequestDoc>();

  /** The saved request a result was sent from, if it is still there. */
  protected requestOf(id: string): RequestDoc | undefined {
    const tree = this.collections.tree().find((entry) => entry.collection.meta.id === this.run().target.collectionId);
    return tree?.requests.find((request) => request.meta.id === id);
  }

  /** Set up the Local Bridge: the shell opens its settings (U-014). */
  readonly openBridge = output<void>();
  private readonly trust = inject(ScriptTrust);
  /** The review of the run's collection's scripts, from the run (U-039). */
  protected readonly reviewing = signal(false);
  /** Set once the review in this run's view approved the scripts: the note says to run again. */
  protected readonly reviewed = signal(false);

  /**
   * The collection holds scripts that wait for a review, as stored now: a run sends without them. Said before the run,
   * where the view had promised "with its scripts" (U-157).
   */
  protected readonly held = signal(false);
  private readonly heldWatcher = effect((onCleanup) => {
    const tree = this.collections.tree().find((entry) => entry.collection.meta.id === this.run().target.collectionId);
    if (!tree) return;
    let current = true;
    onCleanup(() => (current = false));
    const scripts = [tree.collection, ...tree.folders, ...tree.requests].flatMap((holder) => scriptsOf(holder));
    void scriptsApproved(tree.collection.scriptTrust, scripts).then((approved) => {
      if (current) this.held.set(!approved);
    });
  });

  protected review(): void {
    this.trust.reviewOf.set(this.run().target.collectionId);
    this.reviewing.set(true);
  }

  protected reviewClosed(open: boolean): void {
    if (open) return;
    this.reviewing.set(false);
    this.trust.reviewOf.set(null);
  }
  protected readonly failedOnly = signal(false);
  /** The row whose exchange record is open under it, by its number in the run (U-076). */
  protected readonly openRecord = signal<number | null>(null);
  /** The rows of the table, each with its number in the run. */
  protected readonly rows = computed(() =>
    this.run()
      .results()
      .map((result, index) => ({ result, number: index + 1, record: this.run().records()[index] }))
      .filter(({ result }) => !this.failedOnly() || runFailed(result)),
  );
  protected readonly tests = computed(() =>
    this.run()
      .results()
      .flatMap((result) => result.tests),
  );
  protected readonly failedTests = computed(() => this.tests().filter((test) => !test.passed).length);
  /** How the run ended, in a sentence. */
  protected readonly ending = computed(() => {
    const report = this.run().report();
    return report ? runEnding(report) : "";
  });
  /** "4 results in 1 iteration; 1 failed; 4 of 5 tests passed.", as the CLI says it. */
  protected readonly counts = computed(() => {
    const report = this.run().report();
    return report ? runCounts({ iterations: report.iterations, results: this.run().results() }) : "";
  });
  protected readonly sharedHeading = sharedErrorHeading;
  protected readonly harSource = signal<HarSource | null>(null);
  protected readonly failedOf = runFailed;

  /** The data file being read, if one is: Run pressed in that moment waits for it, or the run would go without it. */
  private reading: Promise<void> = Promise.resolve();

  /** Whether the setup is shown in full after a run; folded to one line once a run starts (U-096). */
  protected readonly setupOpen = signal(true);

  /** "2 iterations, 100 ms between requests, stopping on the first failure, data from rows.csv". */
  protected readonly setupSummary = computed(() => {
    const state = this.run();
    const data = state.dataFile();
    const iterations = state.iterations() ?? (data ? data.rows.length : 1);
    return [
      `${iterations} ${iterations === 1 ? "iteration" : "iterations"}`,
      state.delayMs() ? `${state.delayMs()} ms between requests` : "no delay",
      ...(state.stopOnFailure() ? ["stopping on the first failure"] : []),
      ...(data ? [`data from ${data.name}`] : []),
    ].join(", ");
  });

  /**
   * Run, or Stop while it runs. The second click of a double click is not a second press: it neither stops the run
   * the first started nor, after a short run, starts another (U-091).
   */
  protected runOrStop(event: MouseEvent): void {
    if (event.detail > 1) return;
    if (!this.run().running()) void this.start();
    else this.runner.cancel(this.run());
  }

  protected async start(): Promise<void> {
    this.setupOpen.set(false);
    await this.reading;
    await this.runner.start(this.run());
  }

  protected setIterations(text: string): void {
    const count = Math.floor(Number(text));
    this.run().iterations.set(text.trim() && Number.isFinite(count) ? Math.min(Math.max(count, 1), 10_000) : null);
  }

  protected setDelay(text: string): void {
    const ms = Math.floor(Number(text));
    this.run().delayMs.set(Number.isFinite(ms) ? Math.min(Math.max(ms, 0), 600_000) : 0);
  }

  protected pickData(field: HTMLInputElement): Promise<void> {
    this.reading = this.readData(field);
    return this.reading;
  }

  /** Reads the chosen data file: CSV, or a JSON list of objects. The parser is fetched when a file is first chosen. */
  private async readData(field: HTMLInputElement): Promise<void> {
    const file = field.files?.[0];
    field.value = "";
    if (!file) return;
    const run = this.run();
    try {
      const { parseDataFile } = await import("@wayfarer/core/data-file");
      const text = await readImportText(file);
      if (isOversizedImport(text)) {
        run.dataFile.set(null);
        run.dataError.set(IMPORT_TOO_LARGE);
        return;
      }
      const rows = parseDataFile(text, file.name);
      run.dataFile.set({ name: file.name, rows });
      run.dataError.set(rows.length ? "" : "The file has no rows: the run goes once, without data.");
    } catch (error) {
      // Not a data file: the parser's message is written for the user.
      if (!(error instanceof Error) || error.name !== "DataFileError") throw error;
      run.dataFile.set(null);
      run.dataError.set(error.message);
    }
  }

  protected removeData(): void {
    this.run().dataFile.set(null);
    this.run().dataError.set("");
  }

  /** What a result's row says of its tests: how many passed, or that it had none. */
  protected testsOf(result: RunResult): string {
    if (!result.tests.length) return "—";
    return `${result.tests.filter((test) => test.passed).length} of ${result.tests.length} passed`;
  }

  /** What went wrong with a result: why there is no response, and each failed test with its message. */
  protected problems(result: RunResult): string[] {
    const shared = this.sharedErrors();
    const index = shared.findIndex(({ error }) => error === result.error);
    const said =
      index < 0 ? result.error : shared.length === 1 ? "Same error as above" : `Same error as ${index + 1} above`;
    const error = said === undefined ? [] : [said];
    return [
      ...error,
      ...result.tests
        .filter((test) => !test.passed)
        .map((test) => (test.error ? `${test.name}: ${test.error}` : test.name)),
    ];
  }

  /** The reports are fetched when one is first asked for. */
  protected async save(format: "json" | "junit"): Promise<void> {
    const run = this.run();
    const report = run.report();
    if (!report) return;
    const { junitXml, runReportJson } = await import("@wayfarer/core/run-report");
    const info = { name: run.target.name, startedAt: run.startedAt() };
    if (format === "json")
      saveFile("wayfarer-run.json", `${JSON.stringify(runReportJson(report, info), null, 2)}\n`, "application/json");
    else saveFile("wayfarer-run.junit.xml", junitXml(report, info), "application/xml");
  }

  /** The run as a HAR, through the dialog that shows a HAR before it is written. The exchanges are masked as history's are. */
  protected saveHar(): void {
    const exchanges = this.run().exchanges.map(historyExchange);
    this.harSource.set({ name: "wayfarer-run", credentials: false, exchanges: () => exchanges });
  }
}
