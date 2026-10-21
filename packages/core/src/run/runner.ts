import { childrenInOrder, type CollectionTree, type RequestDoc } from "../model/collection";
import type { Row } from "../model/request";

/** A request of a run, as the run knows it. */
export interface RunRequest {
  id: string;
  name: string;
}

/** Which iteration a request is sent in, and the row of the data file for it. */
export interface RunIteration {
  /** From 0. */
  index: number;
  count: number;
  data: Row[];
}

export interface RunTest {
  name: string;
  passed: boolean;
  error?: string;
}

/** What the sender says of one request of a run. */
export interface RunOutcome {
  /** A pre-request script called `pm.execution.skipRequest()`: nothing was sent. */
  skipped?: true;
  status?: number;
  statusText?: string;
  /** The request alone, as a send measures it. */
  durationMs?: number;
  /** Why there is no response, or which script ended in an error. */
  error?: string;
  tests: RunTest[];
  /** What the request's scripts gave `pm.execution.setNextRequest`, the last call of them: a name or an id, or null to end the iteration. */
  nextRequest?: string | null;
  /** The run ends with this request, and this says why: the user said no to a question the sender asked. */
  end?: string;
}

export interface RunResult extends Omit<RunOutcome, "nextRequest" | "end"> {
  id: string;
  name: string;
  iteration: number;
}

export interface RunReport {
  iterations: number;
  results: RunResult[];
  /** completed: every iteration ran. cancelled: the signal. failed: "stop on first failure" met one. ended: the sender ended it, and `reason` says why. */
  ended: "completed" | "cancelled" | "failed" | "ended";
  reason?: string;
}

export interface RunOptions {
  /** How often the requests are run. Absent: once for each row of the data file, or once. */
  iterations?: number;
  /** The rows of the data file. An iteration past the last row gets the last row again, as in Postman. */
  data?: Row[][];
  /** A wait between two requests. */
  delayMs?: number;
  stopOnFailure?: boolean;
  signal?: AbortSignal;
  /** Called with each result as it is there: the live table. */
  onResult?: (result: RunResult) => void;
}

/** A failed test, or no response, or a script that ended in an error. A status of 500 with no test about it is a response. */
export function runFailed(result: Pick<RunOutcome, "error" | "tests">): boolean {
  return result.error !== undefined || result.tests.some((test) => !test.passed);
}

/**
 * The requests a run of a collection, or of one of its folders, sends, in
 * the order of the tree, which is a Postman file's and Newman's (asked with
 * a probe): a request that stands before a folder is sent before the
 * requests of that folder. A file may name folders as each other's parents:
 * a folder is entered once.
 */
export function requestsInOrder(tree: Pick<CollectionTree, "folders" | "requests">, folderId?: string): RequestDoc[] {
  const entered = new Set<string>();
  const inOrder = (parent: string | undefined): RequestDoc[] =>
    childrenInOrder(tree, parent).flatMap((child) => {
      if (child.request) return [child.request];
      if (entered.has(child.folder.id)) return [];
      entered.add(child.folder.id);
      return inOrder(child.folder.id);
    });
  if (folderId !== undefined) entered.add(folderId);
  return inOrder(folderId);
}

/** Ends when `ms` have passed or the signal aborts. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      done();
    });
  });
}

/**
 * The order of a collection run (P5.2). It sends nothing itself: `send`
 * sends one request and says how it went, in the app (`RequestExecutor`),
 * in a test, in the CLI later.
 *
 * As Postman's runner, each point asked of Newman 6.2.3 with a probe:
 * every iteration starts at the first request; `setNextRequest` names the
 * request that follows, by name or id, the last of that name when several
 * have it; `null`, or a name no request has, ends the iteration and not the
 * run; what one iteration stored is there for the next.
 */
export async function runRequests(
  requests: RunRequest[],
  send: (request: RunRequest, iteration: RunIteration, signal: AbortSignal) => Promise<RunOutcome>,
  options: RunOptions = {},
): Promise<RunReport> {
  const data = options.data ?? [];
  const count = options.iterations ?? (data.length || 1);
  const signal = options.signal ?? new AbortController().signal;
  const results: RunResult[] = [];
  const report = (ended: RunReport["ended"], reason?: string): RunReport => ({
    iterations: count,
    results,
    ended,
    ...(reason !== undefined && { reason }),
  });
  let first = true;

  for (let index = 0; index < count; index++) {
    const iteration: RunIteration = { index, count, data: data[Math.min(index, data.length - 1)] ?? [] };
    for (let at = 0; at >= 0 && at < requests.length;) {
      if (!first && options.delayMs) await wait(options.delayMs, signal);
      if (signal.aborted) return report("cancelled");
      first = false;
      const request = requests[at];
      const { nextRequest, end, ...outcome } = await send(request, iteration, signal);
      const result: RunResult = { id: request.id, name: request.name, iteration: index, ...outcome };
      results.push(result);
      options.onResult?.(result);
      // The request the cancel met is in the results, with what its sender said of it.
      if (signal.aborted) return report("cancelled");
      if (end !== undefined) return report("ended", end);
      if (options.stopOnFailure && runFailed(result)) return report("failed");
      at =
        nextRequest === undefined
          ? at + 1
          : nextRequest === null
            ? -1
            : requests.map((entry) => entry.id === nextRequest || entry.name === nextRequest).lastIndexOf(true);
    }
  }
  return report("completed");
}
