import { TestBed } from '@angular/core/testing';
import { IdbService } from './idb.service';
import { IdbCoreService } from './idb-core.service';
import { PastRequest } from '../models/history.models';

const createRequest = (overrides: Partial<PastRequest> = {}): PastRequest => ({
  method: 'GET',
  url: 'https://example.com/api',
  headers: {},
  createdAt: Date.now(),
  ...overrides,
});

describe('IdbService (facade)', () => {
  let service: IdbService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IdbService);
    await service.init();
    await service.clear();
  });

  it('adds and retrieves requests by id', async () => {
    const key = await service.add(createRequest({ url: 'https://example.com/1' }));
    expect(typeof key).toBe('number');

    const stored = await service.get(key!);
    expect(stored?.url).toBe('https://example.com/1');
  });

  it('returns latest requests ordered by createdAt', async () => {
    await service.add(createRequest({ url: 'https://example.com/old', createdAt: 1 }));
    await service.add(createRequest({ url: 'https://example.com/new', createdAt: 5 }));

    const latest = await service.getLatest();
    expect(latest[0]?.url).toBe('https://example.com/new');
    expect(latest[1]?.url).toBe('https://example.com/old');
  });

  it('filters requests by url', async () => {
    await service.add(createRequest({ url: 'https://match.me' }));
    await service.add(createRequest({ url: 'https://other.com' }));
    await service.add(createRequest({ url: 'https://match.me', createdAt: 999 }));

    const matches = await service.findByUrl('https://match.me');
    expect(matches.length).toBe(2);
    expect(matches[0]?.url).toBe('https://match.me');
  });

  it('deletes and clears requests', async () => {
    const key = await service.add(createRequest({ url: 'https://delete.me' }));
    await service.delete(key!);
    expect(await service.get(key!)).toBeNull();

    await service.add(createRequest({ url: 'https://clear.me' }));
    await service.clear();
    expect(await service.getLatest()).toEqual([]);
  });

  it('delegates collections/environments/secrets calls to the respective repositories', async () => {
    // Full CRUD round-trips against a real IndexedDB per aggregate are
    // covered directly on each repository (collections.repository.spec.ts
    // etc.) where each spec owns and cleans up only its own store — sharing
    // one real, persistent IndexedDB across many facade-level tests for
    // every aggregate at once turned out to be exactly the kind of
    // cross-test contamination that made the pre-split IdbService risky to
    // extend. This just proves the facade methods actually reach the doc
    // the repository produces, once, narrowly.
    const collection = await service.createCollection({ name: 'Smoke test collection' });
    expect(collection.name).toBe('Smoke test collection');
    await service.deleteCollection(collection.meta.id);
  });
});

describe('IdbService (memory fallback, indexedDB unavailable)', () => {
  const originalIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    (globalThis as any).indexedDB = originalIndexedDB;
  });

  it('uses in-memory storage end-to-end when indexedDB is unavailable', async () => {
    delete (globalThis as unknown as Record<string, unknown>).indexedDB;

    TestBed.configureTestingModule({});
    const service = TestBed.inject(IdbService);
    const core = TestBed.inject(IdbCoreService);

    await service.init();
    expect(core.useMemoryFallback).toBeTrue();

    const key = await service.add(createRequest({ url: 'https://memory-only', createdAt: 42 }));
    expect(key).toBe(1);

    const latest = await service.getLatest();
    expect(latest.length).toBe(1);
    expect(latest[0]?.url).toBe('https://memory-only');

    await service.delete(key!);
    expect(await service.getLatest()).toEqual([]);
  });
});
