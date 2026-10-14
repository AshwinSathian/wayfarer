import { TestBed } from "@angular/core/testing";
import type { Provider } from "@angular/core";
import { CollectionRequestsRepository } from "../app/data/collection-requests-repository";
import { CollectionsRepository } from "../app/data/collections-repository";
import { EnvironmentsRepository } from "../app/data/environments-repository";
import { FoldersRepository } from "../app/data/folders-repository";
import { HistoryRepository } from "../app/data/history-repository";
import { IdbCore } from "../app/data/idb-core";
import { SecretsRepository } from "../app/data/secrets-repository";
import { WorkspaceRepository } from "../app/data/workspace-repository";

/** Every repository of the database, for a test that seeds and reads through several. */
export function repositories() {
  const core = TestBed.inject(IdbCore);
  const history = TestBed.inject(HistoryRepository);
  return {
    core,
    history,
    collections: TestBed.inject(CollectionsRepository),
    folders: TestBed.inject(FoldersRepository),
    requests: TestBed.inject(CollectionRequestsRepository),
    environments: TestBed.inject(EnvironmentsRepository),
    secrets: TestBed.inject(SecretsRepository),
    workspace: TestBed.inject(WorkspaceRepository),
    /** Deletes the database and forgets the history kept in memory, as Reset all data does. */
    async resetDatabase(options: { untilReload?: boolean } = {}): Promise<void> {
      await core.resetDatabase(options);
      history.resetLocalState();
    },
  };
}

export type Repositories = ReturnType<typeof repositories>;

/** One stand-in object for the database and every repository: a test's fake answers whichever a service asks. */
export function provideRepositories(fake: object): Provider[] {
  return [IdbCore, HistoryRepository, CollectionsRepository, FoldersRepository, CollectionRequestsRepository, EnvironmentsRepository, SecretsRepository, WorkspaceRepository].map(
    (token) => ({ provide: token, useValue: fake })
  );
}
