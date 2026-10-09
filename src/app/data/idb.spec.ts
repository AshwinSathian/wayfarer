import { TestBed } from '@angular/core/testing';
import { Idb } from './idb';
import { IdbCore } from './idb-core';
import { PastRequest } from '../models/history';
import { historyEntry } from '../../testing/request-fixtures';
import { describe, it, beforeEach, afterEach, expect } from "vitest";

const createRequest = (fields: Parameters<typeof historyEntry>[0] = {}): PastRequest => historyEntry(fields);

describe('Idb (facade)', () => {
  let service: Idb;
  let core: IdbCore;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Idb);
    core = TestBed.inject(IdbCore);
    await service.init();
    await service.clear();
  });

  // Each test gets a fresh TestBed-injected IdbCore, which opens its
  // own real IndexedDB connection to the same physical database. Left open,
  // these accumulate across this describe block's tests and — since nothing
  // else in the suite closes them — can block idb-core.spec.ts's
  // later openDB()/deleteDatabase() calls behind IndexedDB's "blocked" state
  // indefinitely, surfacing as unrelated 5000ms timeouts there. Closing here
  // is what keeps this spec file from leaking state into others via the
  // real, shared, per-browser-session IndexedDB.
  afterEach(async () => {
    await core.resetDatabase();
  });

  it('adds and retrieves requests by id', async () => {
    const key = await service.add(createRequest({ url: 'https://example.com/1' }), 500);
    expect(typeof key).toBe('number');

    const stored = await service.get(key!);
    expect(stored?.sent.url).toBe('https://example.com/1');
  });

  it('returns latest requests ordered by createdAt', async () => {
    await service.add(createRequest({ url: 'https://example.com/old', createdAt: 1 }), 500);
    await service.add(createRequest({ url: 'https://example.com/new', createdAt: 5 }), 500);

    const latest = await service.getLatest();
    expect(latest[0]?.sent.url).toBe('https://example.com/new');
    expect(latest[1]?.sent.url).toBe('https://example.com/old');
  });

  it('keeps no more than the cap: the oldest entries go when a new one is written', async () => {
    for (const createdAt of [3, 1, 2, 4]) {
      await service.add(createRequest({ url: `https://example.com/${createdAt}`, createdAt }), 3);
    }
    expect((await service.getLatest()).map((entry) => entry.createdAt)).toEqual([4, 3, 2]);

    // A smaller cap takes effect on the next write.
    await service.add(createRequest({ createdAt: 5 }), 1);
    expect((await service.getLatest()).map((entry) => entry.createdAt)).toEqual([5]);
  });

  it('deletes and clears requests', async () => {
    const key = await service.add(createRequest({ url: 'https://delete.me' }), 500);
    await service.delete(key!);
    expect(await service.get(key!)).toBeNull();

    await service.add(createRequest({ url: 'https://clear.me' }), 500);
    await service.clear();
    expect(await service.getLatest()).toEqual([]);
  });

  it('delegates collections/environments/secrets calls to the respective repositories', async () => {
    // Full CRUD round-trips against a real IndexedDB per aggregate are
    // covered directly on each repository (collections-repository.spec.ts
    // etc.) where each spec owns and cleans up only its own store — sharing
    // one real, persistent IndexedDB across many facade-level tests for
    // every aggregate at once turned out to be exactly the kind of
    // cross-test contamination that made the pre-split Idb risky to
    // extend. This just proves the facade methods actually reach the doc
    // the repository produces, once, narrowly.
    const collection = await service.createCollection({ name: 'Smoke test collection' });
    expect(collection.name).toBe('Smoke test collection');
    await service.deleteCollection(collection.meta.id);
  });
});

describe('Idb (memory fallback, indexedDB unavailable)', () => {
  const originalIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    (globalThis as { indexedDB: IDBFactory }).indexedDB = originalIndexedDB;
  });

  it('uses in-memory storage end-to-end when indexedDB is unavailable', async () => {
    delete (globalThis as unknown as Record<string, unknown>)["indexedDB"];

    TestBed.configureTestingModule({});
    const service = TestBed.inject(Idb);
    const core = TestBed.inject(IdbCore);

    await service.init();
    expect(core.useMemoryFallback).toBe(true);

    const key = await service.add(createRequest({ url: 'https://memory-only', createdAt: 42 }), 500);
    expect(key).toBe(1);

    const latest = await service.getLatest();
    expect(latest.length).toBe(1);
    expect(latest[0]?.sent.url).toBe('https://memory-only');

    // The cap holds in memory too.
    await service.add(createRequest({ createdAt: 50 }), 1);
    expect((await service.getLatest()).map((entry) => entry.createdAt)).toEqual([50]);

    await service.delete(2);
    expect(await service.getLatest()).toEqual([]);
  });
});
