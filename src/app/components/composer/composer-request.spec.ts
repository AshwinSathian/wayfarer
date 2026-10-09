import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore, bodyValue, requestFromHistory, sentHeaders } from '../../state/workspace-store';
import { requestContent } from '../../../testing/request-fixtures';
import { ComposerHarness, JSON_HEADERS, buildEnvironment, jsonBytes, rows, setupComposer } from '../../../testing/composer-setup';
import { Composer } from './composer';
import { ComposerView } from './composer-view';

describe('Composer: rows, payloads and variables', () => {
  let component: Composer;
  let store: WorkspaceStore;
  let view: ComposerView;
  let httpMock: ComposerHarness['httpMock'];
  let environmentsService: ComposerHarness['environmentsService'];

  beforeEach(async () => {
    ({ component, store, view, httpMock, environmentsService } = await setupComposer());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('manages dynamic header and body rows', () => {
    store.patch({ headers: rows([{ key: '', value: '' }]) });
    expect(store.isAddDisabled('Headers')).toBe(true);

    store.draft().headers[0] = { key: 'Accept', value: 'application/json', enabled: true };
    expect(store.isAddDisabled('Headers')).toBe(false);

    store.addRow('Headers');
    expect(store.draft().headers.length).toBe(2);
    store.removeRow(1, 'Headers');
    expect(store.draft().headers.length).toBe(1);

    view.onRequestMethodChange('POST');
    store.addRow('Body');
    expect(store.bodyRows().length).toBe(2);
    store.removeRow(1, 'Body');
    expect(store.bodyRows().length).toBe(1);
  });

  it('builds headers and body payloads with appropriate conversions', () => {
    store.patch({ headers: rows([
      { key: 'Authorization', value: 'Bearer token' },
      { key: '', value: 'ignore-me' }
    ]) });
    const headers = store.snapshot().headers;
    expect(headers).toEqual(rows([{ key: 'Authorization', value: 'Bearer token' }]));

    store.setBodyRows([
      { key: 'count', value: '42' },
      { key: 'enabled', value: 'false' },
      { key: '', value: 'skip' }
    ]);
    const body = bodyValue(store.snapshot().body);
    expect(body).toEqual({ count: '42', enabled: 'false' });
  });

  it('saves rows as written: a switched-off row is kept, names are trimmed, a row with no name is left out', () => {
    store.patch({ headers: [
      { key: ' Accept ', value: '*/*', enabled: true },
      { key: 'X-Off', value: '1', enabled: false },
      { key: 'Accept', value: 'text/plain', enabled: true },
      { key: '__proto__', value: 'x', enabled: true },
      { key: '  ', value: 'no name', enabled: true },
    ] });

    const { headers } = store.snapshot();

    expect(headers).toEqual([
      { key: 'Accept', value: '*/*', enabled: true },
      { key: 'X-Off', value: '1', enabled: false },
      { key: 'Accept', value: 'text/plain', enabled: true },
      { key: '__proto__', value: 'x', enabled: true },
    ]);
    expect('responseId' in store.snapshot()).toBe(false);
    // Only enabled rows are sent.
    expect(sentHeaders(headers).map(([name]) => name)).toEqual(['Accept', 'Accept', '__proto__']);
  });

  it('keeps a body that is not an object when a request is loaded: it has no rows, and it is not rewritten', () => {
    const array = { mode: 'raw' as const, raw: { language: 'json' as const, text: '[1, 2]' } };
    const text = { mode: 'raw' as const, raw: { language: 'json' as const, text: '{"n": {{count}}}' } };

    expect(store.load(requestContent({ method: 'POST', url: 'https://a.test', body: array }), 'collection')).toBe(false);
    expect(store.snapshot().body).toEqual(array);
    expect(store.bodyRows()).toEqual([{ key: '', value: '' }]);

    // Not JSON until its variable is filled in.
    store.load(requestContent({ method: 'POST', url: 'https://a.test', body: text }), 'collection');
    expect(store.snapshot().body).toEqual(text);
  });

  it('loads a history entry as what was sent, keeping the scripts and tests being composed', () => {
    store.patch({ scripts: { pre: 'mine', post: '' } });

    store.load(
      requestFromHistory({ method: 'POST', url: 'https://a.test/x?a=1', headers: { A: '1' }, body: { n: 1 }, createdAt: 1 }),
      'history'
    );

    const draft = store.snapshot();
    expect([draft.method, draft.url]).toEqual(['POST', 'https://a.test/x?a=1']);
    expect(draft.headers).toEqual(rows([{ key: 'A', value: '1' }]));
    expect(draft.params).toEqual(rows([{ key: 'a', value: '1' }]));
    expect(bodyValue(draft.body)).toEqual({ n: 1 });
    expect(draft.auth).toEqual({ type: 'none' });
    expect(draft.scripts.pre).toBe('mine');
    expect(requestFromHistory({ method: 'GET', url: '', headers: {}, createdAt: 1 }).body).toEqual({ mode: 'none' });
  });

  it('resolves {{var}} placeholders from the active environment into the actual outgoing request', async () => {
    environmentsService.setActiveEnvironment(
      buildEnvironment({ baseHost: 'jsonplaceholder.typicode.com', authToken: 'secret-token' })
    );

    store.patch({ url: 'https://{{baseHost}}/todos/1' });
    store.patch({ headers: rows([
      { key: 'Authorization', value: 'Bearer {{authToken}}' },
    ]) });

    const pending = component.sendRequest();

    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/todos/1');
    expect(req.request.headers.get('Authorization')).toBe('Bearer secret-token');
    req.flush(jsonBytes({ id: 1 }), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
    await pending;
  });

  it('sends a {{var}} query param once, resolved, whether typed in the URL or in the Params tab', async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ baseUrl: 'api.test', token: 'abc' }));

    store.setUrl('{{baseUrl}}/users?token={{token}}');
    store.patch({ params: [...store.draft().params, { key: 'page', value: '{{token}}', enabled: true }] });
    store.paramsEdited();
    expect(store.draft().url).toBe('{{baseUrl}}/users?token={{token}}&page={{token}}');

    const pending = component.sendRequest();

    const req = httpMock.expectOne('https://api.test/users?token=abc&page=abc');
    req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
    await pending;
  });

  it('leaves an unresolvable {{var}} placeholder as literal text in headers/body rather than blanking it', async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({}));

    store.patch({ url: 'https://example.com/data' });
    store.patch({ headers: rows([
      { key: 'X-Missing', value: '{{doesNotExist}}' },
    ]) });

    const pending = component.sendRequest();

    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.headers.get('X-Missing')).toBe('{{doesNotExist}}');
    req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
    await pending;
  });

  describe('{{var}} resolution in nested bodies and auth (P0.6, #64 #65)', () => {
    async function sendAndCapture(url: string) {
      const pending = component.sendRequest();
      const req = httpMock.expectOne((r) => r.url.startsWith(url));
      const captured = { body: req.request.body, headers: req.request.headers, url: req.request.urlWithParams };
      req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
      await pending;
      return captured;
    }

    beforeEach(() => {
      environmentsService.setActiveEnvironment(
        buildEnvironment({ v: 'resolved', user: 'ada', pass: 'pw', keyName: 'X-Key' })
      );
    });

    it('resolves variables at depth 3 and inside arrays, keeping non-string types', async () => {
      view.onRequestMethodChange('POST');
      store.patch({ url: 'https://example.com/nested' });
      view.onBodyJsonParsed({
        a: { b: { c: '{{v}}' } },
        list: ['{{v}}', { deep: ['x-{{v}}'] }],
        n: 1,
        flag: false,
        nothing: null,
      });

      const { body } = await sendAndCapture('https://example.com/nested');

      expect(body).toEqual({
        a: { b: { c: 'resolved' } },
        list: ['resolved', { deep: ['x-resolved'] }],
        n: 1,
        flag: false,
        nothing: null,
      });
    });

    it('resolves a bearer token', async () => {
      store.patch({ url: 'https://example.com/bearer' });
      store.patch({ auth: { type: 'bearer', token: '{{v}}' } });
      const { headers } = await sendAndCapture('https://example.com/bearer');
      expect(headers.get('Authorization')).toBe('Bearer resolved');
    });

    it('resolves basic username and password before encoding', async () => {
      store.patch({ url: 'https://example.com/basic' });
      store.patch({ auth: { type: 'basic', username: '{{user}}', password: '{{pass}}' } });
      const { headers } = await sendAndCapture('https://example.com/basic');
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('ada:pw')}`);
    });

    it('resolves API-key name and value, in a header and in the query', async () => {
      store.patch({ url: 'https://example.com/key' });
      store.patch({ auth: { type: 'apikey', key: '{{keyName}}', value: '{{v}}', in: 'header' } });
      const header = await sendAndCapture('https://example.com/key');
      expect(header.headers.get('X-Key')).toBe('resolved');

      store.patch({ url: 'https://example.com/query' });
      store.patch({ auth: { type: 'apikey', key: '{{keyName}}', value: '{{v}}', in: 'query' } });
      const query = await sendAndCapture('https://example.com/query');
      expect(query.url).toContain('X-Key=resolved');
    });
  });

  it('keeps the JSON editor text showing the literal {{var}} template, not a resolved snapshot', () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ baseHost: 'example.com' }));
    store.patch({ headers: rows([{ key: 'X-Host', value: '{{baseHost}}' }]) });

    view.onEditorModeChange('json');

    expect(view.headersJsonText()).toContain('{{baseHost}}');
    expect(view.headersJsonText()).not.toContain('example.com');
  });

  // F56 (#178): built by assignment on a plain object, a header named __proto__ was dropped.
  it('sends a header named __proto__ like any other, once per name whatever its case', async () => {
    store.patch({ url: 'https://example.com/data' });
    store.patch({
      headers: rows([
        { key: '__proto__', value: 'kept' },
        { key: 'x-trace', value: 'first' },
        { key: 'X-Trace', value: 'second' },
      ]),
    });

    const pending = component.sendRequest();

    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.init.headers).toEqual([['__proto__', 'kept'], ['X-Trace', 'second']]);
    req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
    await pending;
  });

  // P2.3 (F10)
  it('cancel ends the request in flight: the response says so and Send is available again', async () => {
    store.patch({ url: 'https://example.com/slow' });
    const pending = component.sendRequest();
    httpMock.expectOne('https://example.com/slow');
    expect(store.loadingState()).toBe(true);

    store.cancel();
    await pending;

    expect(store.loadingState()).toBe(false);
    expect(store.responseError()).toBe('The request was cancelled.');
    expect(store.responseStatusCode()).toBeUndefined();
    expect(store.shouldShowResponsePanel).toBe(true);
  });

  it('shows where a redirected response came from, and forgets it on the next send', async () => {
    store.patch({ url: 'https://example.com/start' });
    const pending = component.sendRequest();
    const response = new Response('{}', { status: 200, headers: JSON_HEADERS });
    Object.defineProperty(response, 'redirected', { value: true });
    Object.defineProperty(response, 'url', { value: 'https://example.com/end' });
    httpMock.expectOne('https://example.com/start').respond(response);
    await pending;
    expect(store.responseRedirectedTo()).toBe('https://example.com/end');

    const again = component.sendRequest();
    expect(store.responseRedirectedTo()).toBeUndefined();
    httpMock.expectOne('https://example.com/start').flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
    await again;
  });
});
