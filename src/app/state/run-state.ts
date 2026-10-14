import { signal } from "@angular/core";
import type { Row, RunReport, RunResult } from "@wayfarer/core";
import { PastRequest } from "@wayfarer/core";

/** What a run sends: a collection, or one of its folders. `name` is what the tab and the reports call it. */
export interface RunTarget {
  collectionId: string;
  folderId?: string;
  name: string;
}

/**
 * A collection run (P5.2), as its tab holds it: how it is to run, and how it
 * went. It lives in the page's memory: a reload does not bring a run back,
 * and nothing of it is stored.
 */
export class RunState {
  /** How often the requests are run. Empty: once for each row of the data file, or once. */
  readonly iterations = signal<number | null>(null);
  /** A wait between two requests, in milliseconds. */
  readonly delayMs = signal(0);
  readonly stopOnFailure = signal(false);
  readonly dataFile = signal<{ name: string; rows: Row[][] } | null>(null);
  /** Why the file that was chosen is no data file. */
  readonly dataError = signal("");

  readonly running = signal(false);
  readonly results = signal<RunResult[]>([]);
  /** There once the run has ended. */
  readonly report = signal<RunReport | null>(null);
  /** When the run started, as ISO 8601. */
  readonly startedAt = signal("");
  /** A request's scripts were left out, because they wait for a review. */
  readonly scriptsSkipped = signal(false);
  /** Each exchange as history would have kept it, masked: the run's HAR. A run writes none of them to history. */
  exchanges: PastRequest[] = [];
  /** Aborts the run. */
  controller: AbortController | null = null;

  constructor(readonly target: RunTarget) {}
}
