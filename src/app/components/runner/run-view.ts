import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { IMPORT_TOO_LARGE, isOversizedImport, readImportText, requestsInOrder, runFailed, type RunResult } from "@wayfarer/core";
import { CollectionRunner } from "../../services/collection-runner";
import { CollectionsStore } from "../../services/collections-store";
import { Icon } from "../../shared/icon/icon";
import { historyExchange, type HarSource } from "../../shared/inspect/har-export";
import { saveFile } from "../../shared/save-file";
import { RunState } from "../../state/run-state";
import { HarExportDialog } from "../har-export/har-export-dialog";

/**
 * A collection run (P5.2): how it is to run, a table of its results as they
 * arrive, and the three reports. It is the content of a run's tab; the run
 * goes on when another tab is opened.
 */
@Component({
  selector: "app-run-view",
  imports: [Icon, MatButton, MatCheckbox, MatFormField, MatInput, MatProgressSpinner, HarExportDialog],
  templateUrl: "./run-view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunView {
  private readonly runner = inject(CollectionRunner);
  private readonly collections = inject(CollectionsStore);

  readonly run = input.required<RunState>();

  /** The requests a run would send now, as they are stored. */
  protected readonly requests = computed(() => {
    const { collectionId, folderId } = this.run().target;
    const tree = this.collections.tree().find((entry) => entry.collection.meta.id === collectionId);
    return tree ? requestsInOrder(tree, folderId) : [];
  });
  protected readonly failed = computed(() => this.run().results().filter(runFailed).length);
  protected readonly tests = computed(() => this.run().results().flatMap((result) => result.tests));
  protected readonly failedTests = computed(() => this.tests().filter((test) => !test.passed).length);
  /** How the run ended, in a sentence. */
  protected readonly ending = computed(() => {
    const report = this.run().report();
    if (!report) return "";
    switch (report.ended) {
      case "completed":
        return "The run is complete.";
      case "cancelled":
        return "The run was cancelled.";
      case "failed":
        return "The run stopped at the first failure.";
      case "ended":
        return `The run was stopped. ${report.reason ?? ""}`.trim();
    }
  });
  protected readonly harSource = signal<HarSource | null>(null);
  protected readonly failedOf = runFailed;

  /** The data file being read, if one is: Run pressed in that moment waits for it, or the run would go without it. */
  private reading: Promise<void> = Promise.resolve();

  protected async start(): Promise<void> {
    await this.reading;
    await this.runner.start(this.run());
  }

  protected cancel(): void {
    this.runner.cancel(this.run());
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
    return [...(result.error !== undefined ? [result.error] : []), ...result.tests.filter((test) => !test.passed).map((test) => (test.error ? `${test.name}: ${test.error}` : test.name))];
  }

  /** The reports are fetched when one is first asked for. */
  protected async save(format: "json" | "junit"): Promise<void> {
    const run = this.run();
    const report = run.report();
    if (!report) return;
    const { junitXml, runReportJson } = await import("@wayfarer/core/run-report");
    const info = { name: run.target.name, startedAt: run.startedAt() };
    if (format === "json") saveFile("wayfarer-run.json", `${JSON.stringify(runReportJson(report, info), null, 2)}\n`, "application/json");
    else saveFile("wayfarer-run.junit.xml", junitXml(report, info), "application/xml");
  }

  /** The run as a HAR, through the dialog that shows a HAR before it is written. The exchanges are masked as history's are. */
  protected saveHar(): void {
    const exchanges = this.run().exchanges.map(historyExchange);
    this.harSource.set({ name: "wayfarer-run", credentials: false, exchanges: () => exchanges });
  }
}
