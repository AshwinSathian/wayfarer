import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Composer } from '../app/components/composer/composer';
import { ComposerView } from '../app/components/composer/composer-view';
import { RequestSave } from '../app/services/request-save';
import { WorkspaceStore } from '../app/state/workspace-store';
import { Idb } from '../app/data/idb';
import { ResponseInspector } from '../app/shared/inspect/response-inspector';
import { EnvironmentsStore } from '../app/services/environments-store';
import { EnvironmentDoc } from '../app/models/environments';
import { CollectionsStore, CollectionTree } from '../app/services/collections-store';
import { Meta, NewRequest, RequestDoc } from '../app/models/collections';
import { requestContent, rowsOf } from './request-fixtures';
import { vi } from "vitest";
import { FetchMock } from './fetch-mock';

// Fixtures flush what the wire carries: bytes.
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;
export const JSON_HEADERS = { 'Content-Type': 'application/json' };

class IdbServiceMock {
  init = vi.fn().mockReturnValue(Promise.resolve());
  add = vi.fn().mockReturnValue(Promise.resolve(1));
  readonly memoryOnly = signal(false).asReadonly();
  readFile = vi.fn().mockReturnValue(Promise.resolve(undefined));
}

class ResponseInspectorServiceStub {
  readonly latest = signal(null).asReadonly();
  markRequest = vi.fn();
  markResponse = vi.fn();
}

class EnvironmentsServiceStub {
  private readonly activeEnvSignal = signal<EnvironmentDoc | null>(null);
  readonly activeEnvironment = this.activeEnvSignal.asReadonly();
  readonly environments = signal<EnvironmentDoc[]>([]).asReadonly();
  readonly loading = signal(false).asReadonly();
  ensureLoaded = vi.fn().mockReturnValue(Promise.resolve());
  updateEnvironment = vi.fn()
    .mockImplementation(async (id: string, patch: Partial<EnvironmentDoc>) => {
      const current = this.activeEnvSignal();
      if (current && current.meta.id === id) {
        this.activeEnvSignal.set({ ...current, ...patch } as EnvironmentDoc);
      }
    });

  setActiveEnvironment(env: EnvironmentDoc | null): void {
    this.activeEnvSignal.set(env);
  }
}

export function meta(id: string): Meta {
  return { id, createdAt: 1, updatedAt: 1, version: 1 };
}

export function makeRequestDoc(overrides: Partial<RequestDoc> = {}): RequestDoc {
  const id = overrides.id ?? 'r1';
  return {
    id,
    meta: meta(id),
    collectionId: 'c1',
    name: 'Saved request',
    order: 0,
    ...requestContent({ url: 'https://saved.example.com', headers: rowsOf({ Accept: 'application/json' }) }),
    ...overrides,
  };
}

class CollectionsServiceStub {
  private readonly treeSignal = signal<CollectionTree[]>([]);
  readonly tree = this.treeSignal.asReadonly();
  readonly loading = signal(false).asReadonly();

  createRequest = vi.fn().mockImplementation(
    async (payload: NewRequest): Promise<RequestDoc> => makeRequestDoc({ ...payload, id: 'new-id' })
  );

  updateRequest = vi.fn().mockImplementation(
    async (id: string, patch: Partial<RequestDoc>): Promise<RequestDoc> =>
      makeRequestDoc({ id, ...patch })
  );

  setTree(trees: CollectionTree[]): void {
    this.treeSignal.set(trees);
  }
}

export function buildEnvironment(vars: Record<string, string>): EnvironmentDoc {
  return {
    id: 'env-1',
    meta: { id: 'env-1', createdAt: 1, updatedAt: 1, version: 1 },
    name: 'Test env',
    order: 1,
    vars: rowsOf(vars),
  } as EnvironmentDoc;
}

/** Header rows as the draft holds them. */
export const rows = (items: { key: string; value: string }[]) => items.map((item) => ({ ...item, enabled: true }));

/** The composer with its stores stubbed and `fetch` captured, as both composer specs use it. */
export async function setupComposer() {
  const idbService = new IdbServiceMock();
  const responseInspector = new ResponseInspectorServiceStub();
  const environmentsService = new EnvironmentsServiceStub();
  const collectionsService = new CollectionsServiceStub();
  const httpMock = new FetchMock();
  await TestBed.configureTestingModule({
    imports: [Composer],
    providers: [
      { provide: Idb, useValue: idbService },
      { provide: ResponseInspector, useValue: responseInspector },
      { provide: EnvironmentsStore, useValue: environmentsService },
      { provide: CollectionsStore, useValue: collectionsService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Composer);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    store: TestBed.inject(WorkspaceStore),
    requestSave: TestBed.inject(RequestSave),
    view: fixture.debugElement.injector.get(ComposerView),
    httpMock,
    idbService,
    responseInspector,
    environmentsService,
    collectionsService,
  };
}

export type ComposerHarness = Awaited<ReturnType<typeof setupComposer>>;
