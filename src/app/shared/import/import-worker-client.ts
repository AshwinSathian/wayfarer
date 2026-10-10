import { Injectable } from "@angular/core";
import { newId, type ImportOptions, type Imported, type ValidationIssue } from "@wayfarer/core";
import type { ImportAnswer, ImportJob, PastedRequest } from "./import.worker";

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
  private readonly jobs = new Map<string, { resolve: (answer: ImportAnswer) => void; reject: (error: Error) => void }>();

  /** The text as the app's model, with its report. Rejects with `ImportRefused` when the file cannot be imported. */
  async run(text: string, options: ImportOptions = {}): Promise<Imported> {
    const answer = await this.post({ text, options });
    if ("imported" in answer) return answer.imported;
    throw new Error("The import worker answered a file with something else.");
  }

  /** A pasted cURL command as one request for the composer. Rejects with `ImportRefused` when it cannot be read. */
  async curl(text: string): Promise<PastedRequest> {
    const answer = await this.post({ text, options: {}, curl: true });
    if ("request" in answer) return answer.request;
    throw new Error("The import worker answered a command with something else.");
  }

  private post(job: Omit<ImportJob, "id">): Promise<ImportAnswer> {
    return new Promise((resolve, reject) => {
      const id = newId();
      this.jobs.set(id, { resolve, reject });
      this.start().postMessage({ ...job, id } satisfies ImportJob);
    });
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./import.worker", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<ImportAnswer>) => {
      const job = this.jobs.get(event.data.id);
      this.jobs.delete(event.data.id);
      if ("refused" in event.data) job?.reject(new ImportRefused(event.data.refused.message, event.data.refused.issues));
      else job?.resolve(event.data);
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
