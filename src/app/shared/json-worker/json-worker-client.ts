import { Injectable, OnDestroy } from "@angular/core";

type WorkerJob =
  { kind: "parse-pretty"; input: string; indent?: number } | { kind: "search"; input: string; query: string };

type WorkerMessage =
  { id: number; ok: true; result: string | WorkerSearchResult } | { id: number; ok: false; error: string };

interface PendingJob {
  resolve: (value: string | WorkerSearchResult) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface WorkerSearchResult {
  count: number;
  excerpts: { index: number; context: string }[];
}

const WORKER_TIMEOUT_MS = 10_000;

/**
 * Formats and searches a large body off the main thread. A job that fails rejects: nothing is run on the main thread
 * in its place, which would freeze the page the worker is there to spare. One that times out ends the worker, still
 * busy with it, so the next job gets a new one.
 */
@Injectable({
  providedIn: "root",
})
export class JsonWorkerClient implements OnDestroy {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingJob>();

  parsePretty(input: string, indent = 2): Promise<string> {
    return this.dispatchJob({ kind: "parse-pretty", input, indent });
  }

  search(input: string, query: string): Promise<WorkerSearchResult> {
    return this.dispatchJob({ kind: "search", input, query });
  }

  ngOnDestroy(): void {
    this.terminateWorker(new Error("JsonWorkerClient destroyed"));
  }

  private dispatchJob<T extends string | WorkerSearchResult>(job: WorkerJob): Promise<T> {
    const worker = this.ensureWorker();
    const jobId = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.terminateWorker(new Error("Worker timed out"));
      }, WORKER_TIMEOUT_MS);

      this.pending.set(jobId, {
        resolve: (value) => {
          clearTimeout(timeout);
          this.pending.delete(jobId);
          resolve(value as T);
        },
        reject: (reason) => {
          clearTimeout(timeout);
          this.pending.delete(jobId);
          reject(reason);
        },
        timeout,
      });

      worker.postMessage({ id: jobId, job });
    });
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      // The URL must be written inside `new Worker(...)`: that is the only
      // form the bundler recognises and emits a worker chunk for (F45).
      this.worker = new Worker(new URL("./json.worker", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (error) => {
        this.terminateWorker(new Error(error.message || "JSON worker encountered an error"));
      };
    }

    return this.worker;
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    const pendingJob = this.pending.get(message.id);
    if (!pendingJob) {
      return;
    }

    if (message.ok) {
      pendingJob.resolve(message.result);
      return;
    }

    pendingJob.reject(new Error((message as Extract<WorkerMessage, { ok: false }>).error));
  }

  private rejectJob(jobId: number, reason: unknown): void {
    const pendingJob = this.pending.get(jobId);
    if (!pendingJob) {
      return;
    }
    clearTimeout(pendingJob.timeout);
    this.pending.delete(jobId);
    pendingJob.reject(reason);
  }

  private rejectAll(reason: unknown): void {
    const entries = Array.from(this.pending.keys());
    for (const jobId of entries) {
      this.rejectJob(jobId, reason);
    }
  }

  private terminateWorker(reason: unknown): void {
    if (!this.worker) {
      return;
    }

    this.rejectAll(reason);
    this.worker.terminate();
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker = null;
  }
}
