import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonBody, rowsOf } from '../../../testing/request-fixtures';
import { PastRequest } from '../../models/history';
import { RequestSave } from '../../services/request-save';
import { WorkspaceStore } from '../../state/workspace-store';
import { ComposerHarness, JSON_HEADERS, jsonBytes, makeRequestDoc, meta, rows, setupComposer } from '../../../testing/composer-setup';
import { Composer } from './composer';
import { ComposerView } from './composer-view';

describe('Composer', () => {
  let component: Composer;
  let store: WorkspaceStore;
  let view: ComposerView;
  let requestSave: RequestSave;
  let httpMock: ComposerHarness['httpMock'];
  let idbService: ComposerHarness['idbService'];
  let responseInspector: ComposerHarness['responseInspector'];
  let collectionsService: ComposerHarness['collectionsService'];

  beforeEach(async () => {
    ({ component, store, view, requestSave, httpMock, idbService, responseInspector, collectionsService } = await setupComposer());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate URLs and block invalid submissions', () => {
    store.patch({ url: 'not-a-url' });
    void component.sendRequest();
    expect(store.endpointError()).toContain('valid URL');
    expect(idbService.add).not.toHaveBeenCalled();
  });

  it('should send GET requests and persist history', async () => {
    const mockCreatedAt = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(mockCreatedAt);
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1105);

    let emitted = false;
    component.newRequest.subscribe(() => emitted = true);

    store.patch({ url: 'https://example.com/data' });
    store.patch({ method: 'GET' });

    const pending = component.sendRequest();
    expect(responseInspector.markRequest).toHaveBeenCalledWith(
      expect.any(String),
      'https://example.com/data'
    );

    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.method).toBe('GET');
    req.flush(jsonBytes({ ok: true }), { status: 200, statusText: 'OK', headers: JSON_HEADERS });

    await pending;

    expect(responseInspector.markResponse).toHaveBeenCalledWith(
      expect.any(String),
      'https://example.com/data'
    );
    expect(store.responseData()).toContain('ok');
    expect(store.responseBodyIsJson()).toBe(true);
    expect(store.responseStatusCode()).toBe(200);
    expect(store.shouldShowResponsePanel).toBe(true);
    expect(idbService.add).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://example.com/data',
      status: 200,
      durationMs: 105,
      createdAt: mockCreatedAt
    }));
    expect(emitted).toBe(true);
    // A successful send must NOT wipe the composer — the request stays
    // visible/editable so the user can tweak a header and resend, the same
    // way every competing API client behaves. This used to unconditionally
    // call resetForm() after every send, which cleared the entire form
    // (method/url/headers/body/auth/params) the instant a response arrived.
    expect(store.draft().url).toBe('https://example.com/data');
    expect(store.draft().method).toBe('GET');
  });

  it('should send POST requests and record errors', async () => {
    const mockCreatedAt = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(mockCreatedAt);
    vi.spyOn(performance, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2150);

    view.onRequestMethodChange('POST');
    store.patch({ url: 'https://example.com/create' });
    store.setBodyRows([{ key: 'isActive', value: 'true' }]);
    store.patch({ headers: rows([{ key: 'Content-Type', value: 'application/json' }]) });

    const pending = component.sendRequest();
    expect(responseInspector.markRequest).toHaveBeenCalledWith(
      expect.any(String),
      'https://example.com/create'
    );

    const req = httpMock.expectOne('https://example.com/create');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ isActive: 'true' });
    req.flush(jsonBytes({ message: 'failed' }), { status: 500, statusText: 'Server Error', headers: JSON_HEADERS });

    await pending;

    expect(responseInspector.markResponse).toHaveBeenCalledWith(
      expect.any(String),
      'https://example.com/create'
    );
    expect(store.responseError()).toContain('failed');
    expect(store.responseBodyIsJson()).toBe(true);
    expect(store.responseStatusCode()).toBe(500);
    expect(store.shouldShowResponsePanel).toBe(true);
    expect(idbService.add).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://example.com/create',
      body: { isActive: 'true' },
      status: 500,
      error: expect.any(String)
    }));
    expect(view.activeTab()).toBe('headers');

  });

  it('should send PUT requests with body payload', async () => {
    const mockCreatedAt = 1_810_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(mockCreatedAt);
    vi.spyOn(performance, 'now').mockReturnValueOnce(3000).mockReturnValueOnce(3185);

    view.onRequestMethodChange('PUT');
    store.patch({ url: 'https://example.com/items/42' });
    store.setBodyRows([{ key: 'name', value: 'Widget' }]);
    store.patch({ headers: rows([{ key: 'X-Trace', value: 'abc123' }]) });

    const pending = component.sendRequest();

    const req = httpMock.expectOne('https://example.com/items/42');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Widget' });
    expect(req.request.headers.get('X-Trace')).toBe('abc123');
    req.flush(jsonBytes({ updated: true }), { status: 200, statusText: 'OK', headers: JSON_HEADERS });

    await pending;

    expect(store.responseData()).toContain('updated');
    const history = idbService.add.mock.lastCall![0] as PastRequest;
    expect(history.method).toBe('PUT');
    expect(history.body).toEqual({ name: 'Widget' });
    expect(view.activeTab()).toBe('headers');
  });

  it('should handle DELETE requests without body', async () => {
    const mockCreatedAt = 1_820_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(mockCreatedAt);
    vi.spyOn(performance, 'now').mockReturnValueOnce(4000).mockReturnValueOnce(4150);

    view.onRequestMethodChange('DELETE');
    store.patch({ url: 'https://example.com/items/99' });
    store.patch({ headers: rows([{ key: 'Authorization', value: 'Bearer xyz' }]) });

    const pending = component.sendRequest();

    const req = httpMock.expectOne('https://example.com/items/99');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush(new ArrayBuffer(0), { status: 204, statusText: 'No Content' });

    await pending;

    expect(idbService.add).toHaveBeenCalled();
    const stored = idbService.add.mock.lastCall![0] as PastRequest;
    expect(stored.method).toBe('DELETE');
    expect(stored.body).toBeUndefined();
    expect(view.activeTab()).toBe('headers');
  });

  it('should populate form when loading past requests', () => {
    const stored: PastRequest = {
      id: 1,
      method: 'POST',
      url: 'https://example.com/update',
      headers: { Authorization: 'Bearer token' },
      body: { count: 3, enabled: true },
      createdAt: 123
    };

    component.loadPastRequest(stored);

    expect(store.draft().method).toBe('POST');
    expect(store.draft().url).toBe('https://example.com/update');
    expect(store.draft().headers[0].key).toBe('Authorization');
    // Values keep their JSON types, so replaying sends 3/true, not "3"/"true" (P0.6).
    expect(store.bodyRows()).toEqual([
      { key: 'count', value: 3 },
      { key: 'enabled', value: true },
    ]);
    expect(view.activeTab()).toBe('body');
  });

  it('loadPastRequest clears any existing collection-request binding', () => {
    component.loadCollectionRequest(makeRequestDoc());
    expect(requestSave.loadedCollectionRequest()).not.toBeNull();

    component.loadPastRequest({
      method: 'GET',
      url: 'https://history.example.com',
      headers: {},
      createdAt: 1,
    });

    expect(requestSave.loadedCollectionRequest()).toBeNull();
  });

  it('loadCollectionRequest populates auth, scripts, and tests — not just method/url/headers/body', () => {
    const doc = makeRequestDoc({
      method: 'POST',
      url: 'https://saved.example.com/create',
      headers: rowsOf({ 'X-Test': '1' }),
      body: jsonBody({ count: 2 }),
      auth: { type: 'bearer', token: 'secret-token' },
      scripts: { pre: 'pm.environment.set("a", "1")', post: 'pm.test("ok", () => {})' },
      tests: [],
    });

    component.loadCollectionRequest(doc);

    expect(requestSave.loadedCollectionRequest()).toBe(doc);
    expect(store.draft().method).toBe('POST');
    expect(store.draft().url).toBe('https://saved.example.com/create');
    expect(store.draft().auth).toEqual({ type: 'bearer', token: 'secret-token' });
    expect(store.draft().scripts.pre).toBe('pm.environment.set("a", "1")');
    expect(store.draft().scripts.post).toBe('pm.test("ok", () => {})');
  });

  it('clearComposer resets the form and drops any collection-request binding', () => {
    component.loadCollectionRequest(makeRequestDoc());
    store.patch({ url: 'https://something-edited.example.com' });

    component.clearComposer();

    expect(requestSave.loadedCollectionRequest()).toBeNull();
    expect(store.draft().url).toBe('');
    expect(store.draft().method).toBe('GET');
  });

  it('saveCurrentRequest updates the bound collection request in place, without opening Save As', async () => {
    const doc = makeRequestDoc({ id: 'bound-1' });
    component.loadCollectionRequest(doc);
    store.patch({ url: 'https://saved.example.com/edited' });
    store.patch({ method: 'POST' });

    await component.saveCurrentRequest();

    expect(collectionsService.updateRequest).toHaveBeenCalledWith(
      'bound-1',
      expect.objectContaining({ method: 'POST', url: 'https://saved.example.com/edited' })
    );
    expect(collectionsService.createRequest).not.toHaveBeenCalled();
    expect(requestSave.saveAsDialogVisible()).toBe(false);
  });

  it('saveCurrentRequest opens Save As when the composer is not bound to a collection request', () => {
    expect(requestSave.loadedCollectionRequest()).toBeNull();

    void component.saveCurrentRequest();

    expect(requestSave.saveAsDialogVisible()).toBe(true);
    expect(collectionsService.updateRequest).not.toHaveBeenCalled();
  });

  it('confirmSaveAs creates a new request with the full composer state and binds the composer to it', async () => {
    collectionsService.setTree([
      {
        collection: { id: 'c1', meta: meta('c1'), name: 'Collection 1', order: 0, scriptTrust: { trusted: true } },
        folders: [],
        requests: [],
      },
    ]);
    store.patch({ url: 'https://new.example.com' });
    store.patch({ method: 'GET' });

    requestSave.openSaveAsDialog();
    expect(requestSave.saveAsCollectionId()).toBe('c1');

    requestSave.saveAsName.set('My new request');
    await requestSave.confirmSaveAs(store.snapshot());

    expect(collectionsService.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: 'c1',
        name: 'My new request',
        method: 'GET',
        url: 'https://new.example.com',
        // The whole request goes in the one write: nothing is left for a second.
        headers: store.snapshot().headers,
        body: store.snapshot().body,
        auth: store.snapshot().auth,
        scripts: store.snapshot().scripts,
        tests: store.snapshot().tests,
      })
    );
    expect(collectionsService.updateRequest).not.toHaveBeenCalled();
    expect(requestSave.loadedCollectionRequest()).not.toBeNull();
    expect(requestSave.saveAsDialogVisible()).toBe(false);
  });

  it('isSaveAsDisabled is true without a name or a chosen collection', () => {
    requestSave.saveAsName.set('');
    requestSave.saveAsCollectionId.set('c1');
    expect(requestSave.isSaveAsDisabled).toBe(true);

    requestSave.saveAsName.set('Named');
    requestSave.saveAsCollectionId.set(null);
    expect(requestSave.isSaveAsDisabled).toBe(true);

    requestSave.saveAsCollectionId.set('c1');
    expect(requestSave.isSaveAsDisabled).toBe(false);
  });

});
