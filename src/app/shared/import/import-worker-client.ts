import { Injectable } from "@angular/core";
import { newId, type ImportOptions, type Imported, type ValidationIssue } from "@wayfarer/core";
import type { ImportAnswer, ImportJob } from "./import.worker";

/** Why a file was not imported, as the worker said it: the page does not load the importers to have their error class. */
export class ImportRefused extends Error {
  override readonly name = "ImportRefused";

  constructor(
    message: string,
    readonly issues: ValidationIssue[] = []
  ) {
    super(message);
  }
}

/**
 * Runs the importers in their worker (`import.worker.ts`). The worker, and
 * the importers with it, are loaded when the first file is picked: nothing
 * imports them but the `new Worker(...)` below.
 */
@Injectable({ providedIn: "root" })
export class ImportWorkerClient {
  private worker: Worker | null = null;
  private readonly jobs = new Map<string, { resolve: (imported: Imported) => void; reject: (error: Error) => void }>();

  /** The text as the app's model, with its report. Rejects with `ImportRefused` when the file cannot be imported. */
  run(text: string, options: ImportOptions = {}): Promise<Imported> {
    return new Promise((resolve, reject) => {
      const job: ImportJob = { id: newId(), text, options };
      this.jobs.set(job.id, { resolve, reject });
      this.start().postMessage(job);
    });
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./import.worker", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<ImportAnswer>) => {
      const job = this.jobs.get(event.data.id);
      this.jobs.delete(event.data.id);
      if ("imported" in event.data) job?.resolve(event.data.imported);
      else job?.reject(new ImportRefused(event.data.refused.message, event.data.refused.issues));
    });
    // The worker itself failed: every file waiting on it is told, and the next one starts a new worker.
    worker.addEventListener("error", (event) => {
      for (const job of this.jobs.values()) job.reject(new Error(event.message || "The import could not be run."));
      this.jobs.clear();
      worker.terminate();
      this.worker = null;
    });
    this.worker = worker;
    return worker;
  }
}
