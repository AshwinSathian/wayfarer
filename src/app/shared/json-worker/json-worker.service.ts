import { Injectable, OnDestroy } from "@angular/core";

type WorkerJob =
  | { kind: "parse-pretty"; input: string; indent?: number }
  | { kind: "minify"; input: string }
  | { kind: "search"; input: string; query: string };

type WorkerMessage =
  | { id: number; ok: true; result: string | WorkerSearchResult }
  | { id: number; ok: false; error: string };

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
const WORKER_MODULE_URL = new URL("./json.worker.ts", import.meta.url);

@Injectable({
  providedIn: "root",
})
export class JsonWorkerService implements OnDestroy {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingJob>();

  async parsePretty(input: string, indent = 2): Promise<string> {
    return this.dispatchJob(
      { kind: "parse-pretty", input, indent },
      () => this.parsePrettyFallback(input, indent)
    );
  }

  async minify(input: string): Promise<string> {
    return this.dispatchJob(
      { kind: "minify", input },
      () => this.minifyFallback(input)
    );
  }

  async search(input: string, query: string): Promise<WorkerSearchResult> {
    return this.dispatchJob(
      { kind: "search", input, query },
      () => this.searchFallback(input, query)
    );
  }

  ngOnDestroy(): void {
    this.terminateWorker(new Error("JsonWorkerService destroyed"));
  }

  private async dispatchJob<T extends string | WorkerSearchResult>(
    job: WorkerJob,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    const worker = this.ensureWorker();
    if (!worker) {
      return Promise.resolve().then(() => fallback());
    }

    const jobId = this.nextId++;

    try {
      return await new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.rejectJob(jobId, new Error("Worker timed out"));
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
    } catch {
      return Promise.resolve().then(() => fallback());
    }
  }

  private ensureWorker(): Worker | null {
    if (typeof Worker === "undefined") {
      return null;
    }

    if (!this.worker) {
      this.worker = new Worker(WORKER_MODULE_URL, { type: "module" });
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (error) => {
        this.terminateWorker(
          new Error(error.message || "JSON worker encountered an error")
        );
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

  private parsePrettyFallback(input: string, indent = 2): string {
    const value = JSON.parse(input);
    return JSON.stringify(value, null, indent);
  }

  private minifyFallback(input: string): string {
    const value = JSON.parse(input);
    return JSON.stringify(value);
  }

  private searchFallback(input: string, query: string): WorkerSearchResult {
    const trimmed = query.trim();
    if (!trimmed) {
      return { count: 0, excerpts: [] };
    }

    const lowerInput = input.toLowerCase();
    const lowerNeedle = trimmed.toLowerCase();

    const excerpts: WorkerSearchResult["excerpts"] = [];
    let startIndex = 0;

    while (startIndex <= lowerInput.length) {
      const matchIndex = lowerInput.indexOf(lowerNeedle, startIndex);
      if (matchIndex === -1) {
        break;
      }

      const contextRadius = 48;
      const contextStart = Math.max(0, matchIndex - contextRadius);
      const contextEnd = Math.min(
        input.length,
        matchIndex + trimmed.length + contextRadius
      );

      excerpts.push({
        index: matchIndex,
        context: input.slice(contextStart, contextEnd),
      });

      if (excerpts.length >= 50) {
        break;
      }

      startIndex = matchIndex + trimmed.length;
    }

    return {
      count: excerpts.length,
      excerpts,
    };
  }
}
