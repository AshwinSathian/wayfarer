import { Injectable, inject } from "@angular/core";
import { requestsInOrder, runRequests } from "@wayfarer/core";
import { RunState } from "../state/run-state";
import { WorkspaceStore } from "../state/workspace-store";
import { CollectionsStore } from "./collections-store";

/**
 * Runs a collection or a folder (P5.2). The order of a run is core's
 * (`runRequests`); this hands it the app's sender, `WorkspaceStore.sendForRun`:
 * each request goes out as a send of it would, scripts, trust gate, vault and
 * wire check included.
 */
@Injectable({ providedIn: "root" })
export class CollectionRunner {
  private readonly collections = inject(CollectionsStore);
  private readonly store = inject(WorkspaceStore);

  /** Runs `run`'s target as `run` says, and fills it as the results arrive. */
  async start(run: RunState): Promise<void> {
    if (run.running()) return;
    const tree = this.collections.tree().find((entry) => entry.collection.meta.id === run.target.collectionId);
    // The requests as they are stored when the run starts: an edit made while it runs is the next run's.
    const docs = tree ? requestsInOrder(tree, run.target.folderId) : [];
    const shared = this.store.startRun(run.target.collectionId);
    const controller = new AbortController();
    run.controller = controller;
    run.exchanges = [];
    run.records.set([]);
    run.results.set([]);
    run.report.set(null);
    run.scriptsSkipped.set(false);
    run.startedAt.set(new Date().toISOString());
    run.running.set(true);
    try {
      const report = await runRequests(
        docs.map((doc) => ({ id: doc.id, name: doc.name })),
        async (request, iteration, signal) => {
          // By its place: a request of the run is one of `docs`.
          const doc = docs.find((entry) => entry.id === request.id) ?? docs[0];
          const { outcome, exchange, scriptsSkipped } = await this.store.sendForRun(doc, iteration, signal, shared);
          if (exchange) run.exchanges.push(exchange);
          // Each send is one result, in order: the record of a request that was not sent is none.
          run.records.update((records) => [...records, exchange?.record]);
          if (scriptsSkipped) run.scriptsSkipped.set(true);
          return outcome;
        },
        {
          ...(run.iterations() !== null && { iterations: run.iterations() ?? 1 }),
          ...(run.dataFile() && { data: run.dataFile()?.rows }),
          delayMs: run.delayMs(),
          stopOnFailure: run.stopOnFailure(),
          signal: controller.signal,
          onResult: (result) => run.results.update((results) => [...results, result]),
        },
      );
      run.report.set(report);
    } finally {
      run.running.set(false);
    }
  }

  cancel(run: RunState): void {
    run.controller?.abort();
  }
}
