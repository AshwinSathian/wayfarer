import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestFiles } from "../../services/request-files";
import { WorkspaceStore, requestFromHistory, sentHeaders } from '../../state/workspace-store';
import { headerLines } from '../../shared/http/header-lines';
import { jsonBody, requestContent } from '../../../testing/request-fixtures';
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

  it('adds and removes header rows, and keeps the body when the method changes to one that sends none', () => {
    store.patch({ headers: rows([{ key: 'Accept', value: 'application/json' }]) });

    store.addHeader();
    expect(store.draft().headers).toEqual(rows([{ key: 'Accept', value: 'application/json' }, { key: '', value: '' }]));
    store.removeHeader(1);
    expect(store.draft().headers.length).toBe(1);

    view.onRequestMethodChange('POST');
    store.setBody(jsonBody({ kept: true }));
    view.onRequestMethodChange('GET');
    view.onRequestMethodChange('POST');
    expect(store.draft().body).toEqual(jsonBody({ kept: true }));
  });

  it('builds headers and body payloads with appropriate conversions', () => {
    store.patch({ headers: rows([
      { key: 'Authorization', value: 'Bearer token' },
      { key: '', value: 'ignore-me' }
    ]) });
    const headers = store.snapshot().headers;
    expect(headers).toEqual(rows([{ key: 'Authorization', value: 'Bearer token' }]));

    store.setBody({ mode: 'urlencoded', urlencoded: rows([
      { key: 'count', value: '42' },
      { key: ' enabled ', value: 'false' },
      { key: '', value: 'skip' }
    ]) });
    store.setBody({ multipart: [
      { kind: 'text', key: 'note', value: 'hi', enabled: true },
      { kind: 'file', key: '', fileId: 'f-1', fileName: 'unnamed.bin', enabled: true },
    ] });
    const body = store.snapshot().body;
    expect(body.urlencoded).toEqual(rows([{ key: 'count', value: '42' }, { key: 'enabled', value: 'false' }]));
    expect(body.multipart).toEqual([{ kind: 'text', key: 'note', value: 'hi', enabled: true }]);
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

  it('keeps a body that is not an object when a request is loaded, and sends it as written (F58)', async () => {
    const array = { mode: 'raw' as const, raw: { language: 'json' as const, text: '[1, 2]' } };
    const text = { mode: 'raw' as const, raw: { language: 'json' as const, text: '{"n": {{count}}}' } };

    store.load(requestContent({ method: 'POST', url: 'https://a.test/array', body: array }), 'collection');
    expect(store.snapshot().body).toEqual(array);
    let pending = component.sendRequest();
    let req = httpMock.expectOne('https://a.test/array');
    expect(req.request.init.body).toBe('[1, 2]');
    req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
    await pending;

    // Not JSON until its variable is filled in.
    environmentsService.setActiveEnvironment(buildEnvironment({ count: '3' }));
    store.load(requestContent({ method: 'POST', url: 'https://a.test/text', body: text }), 'collection');
    expect(store.snapshot().body).toEqual(text);
    pending = component.sendRequest();
    req = httpMock.expectOne('https://a.test/text');
    expect(req.request.init.body).toBe('{"n": 3}');
    req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
    await pending;
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
    expect(draft.body).toEqual(jsonBody({ n: 1 }));
    expect(draft.auth).toEqual({ type: 'none' });
    expect(draft.scripts.pre).toBe('mine');
    // A body is recorded as the text that was sent; text that is not JSON comes back as text.
    const base = { method: 'POST', url: 'https://a.test', headers: {}, createdAt: 1 };
    expect(requestFromHistory({ ...base, body: '{"a":1}' }).body).toEqual({ mode: 'raw', raw: { language: 'json', text: '{"a":1}' } });
    expect(requestFromHistory({ ...base, body: 'a=1&b=2' }).body).toEqual({ mode: 'raw', raw: { language: 'text', text: 'a=1&b=2' } });
    expect(requestFromHistory({ method: 'GET', url: '', headers: {}, createdAt: 1 }).body).toEqual({ mode: 'none' });
  });

  describe('body modes (P2.12)', () => {
    const send = async (url: string) => {
      const pending = component.sendRequest();
      const req = httpMock.expectOne(url);
      req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
      await pending;
      return req.request.init;
    };
    /** As `send`, for a body with a file: the request is built once the file is read. */
    const sendWithFile = async (url: string) => {
      const pending = component.sendRequest();
      const req = await vi.waitFor(() => httpMock.expectOne(url));
      req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
      await pending;
      return req.request.init;
    };
    const contentType = (init: RequestInit) => new Headers(init.headers).get('content-type');

    beforeEach(() => {
      store.patch({ method: 'POST', url: 'https://a.test/body', headers: [] });
      environmentsService.setActiveEnvironment(buildEnvironment({ v: 'a b&c', name: 'who' }));
    });

    it('sends raw text as written, with the Content-Type of its language unless the request sets one', async () => {
      for (const [language, type] of [
        ['json', 'application/json'],
        ['text', 'text/plain'],
        ['xml', 'application/xml'],
        ['html', 'text/html'],
        ['javascript', 'application/javascript'],
      ] as const) {
        store.setBody({ mode: 'raw', raw: { language, text: '<a b="{{v}}">\n</a>' } });
        const init = await send('https://a.test/body');
        expect(init.body, language).toBe('<a b="a b&c">\n</a>');
        expect(contentType(init), language).toBe(type);
      }

      store.patch({ headers: rows([{ key: 'content-type', value: 'application/vnd.api+json' }]) });
      const own = await send('https://a.test/body');
      expect(own.headers).toEqual([['content-type', 'application/vnd.api+json']]);
    });

    it('sends no body and no Content-Type for mode none, for empty raw text, and for GET and HEAD whatever the body', async () => {
      store.setBody({ mode: 'none', raw: { language: 'json', text: '{"kept":true}' } });
      expect(await send('https://a.test/body')).toMatchObject({ body: undefined, headers: [] });

      store.setBody({ mode: 'raw', raw: { language: 'json', text: '' } });
      expect(await send('https://a.test/body')).toMatchObject({ body: undefined, headers: [] });

      store.setBody({ mode: 'raw', raw: { language: 'json', text: '{"kept":true}' } });
      for (const method of ['GET', 'HEAD']) {
        store.patch({ method });
        expect(await send('https://a.test/body'), method).toMatchObject({ body: undefined, headers: [] });
      }
      store.patch({ method: 'DELETE' });
      expect((await send('https://a.test/body')).body).toBe('{"kept":true}');
    });

    it('encodes form fields: enabled rows in order, a name twice, variables resolved before encoding', async () => {
      store.setBody({
        mode: 'urlencoded',
        urlencoded: [
          { key: 'q', value: '{{v}}', enabled: true },
          { key: 'off', value: '1', enabled: false },
          { key: '{{name}}', value: 'é=1', enabled: true },
          { key: 'q', value: 'again', enabled: true },
        ],
      });

      const init = await send('https://a.test/body');

      expect(init.body).toBe('q=a+b%26c&who=%C3%A9%3D1&q=again');
      expect(contentType(init)).toBe('application/x-www-form-urlencoded');
    });

    it('sends multipart parts as a form, files with their bytes and names, and leaves the Content-Type to the browser', async () => {
      const picked = TestBed.inject(RequestFiles).pick(new File([new Uint8Array([0, 255, 10, 13])], 'bytes.bin'));
      if (typeof picked === 'string') throw new Error(picked);
      store.setBody({
        mode: 'multipart',
        multipart: [
          { kind: 'text', key: 'note', value: '{{v}}', enabled: true },
          { kind: 'text', key: 'off', value: 'x', enabled: false },
          { kind: 'file', key: 'upload', enabled: true, ...picked },
        ],
      });

      const init = await sendWithFile('https://a.test/body');

      const form = init.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect([...form.keys()]).toEqual(['note', 'upload']);
      expect(form.get('note')).toBe('a b&c');
      const file = form.get('upload') as File;
      expect(file.name).toBe('bytes.bin');
      expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([0, 255, 10, 13]);
      // fetch writes "multipart/form-data; boundary=…" itself.
      expect(init.headers).toEqual([]);
    });

    it('sends a binary body as the file, typed by the file unless the request sets a Content-Type', async () => {
      const picked = TestBed.inject(RequestFiles).pick(new File(['%PDF-'], 'doc.pdf', { type: 'application/pdf' }));
      if (typeof picked === 'string') throw new Error(picked);
      store.setBody({ mode: 'binary', binary: { ...picked, contentType: 'application/pdf' } });

      const init = await sendWithFile('https://a.test/body');

      expect(await (init.body as Blob).text()).toBe('%PDF-');
      expect(contentType(init)).toBe('application/pdf');

      store.setBody({ binary: picked });
      expect(contentType(await sendWithFile('https://a.test/body'))).toBe('application/pdf');
    });

    it('does not send when a body names a file this browser does not have, or a binary body has no file', async () => {
      store.setBody({ mode: 'binary' });
      expect(await component.sendRequest()).toBeUndefined();
      expect(store.endpointError()).toBe('Choose a file for the body, or set the body to None.');

      store.setBody({ mode: 'multipart', multipart: [{ kind: 'file', key: 'f', enabled: true, fileId: 'gone', fileName: 'report.csv' }] });
      await component.sendRequest();
      expect(store.endpointError()).toBe('The file "report.csv" is not stored in this browser. Choose it again.');
      expect(store.loadingState()).toBe(false);
      httpMock.verify();
    });

    it('never sends a protected-variable placeholder inside a form or a multipart body (C-007)', async () => {
      const secret = '{{ $secret.0b6f1c2e-0000-4000-8000-000000000001 }}';
      for (const body of [
        { mode: 'urlencoded' as const, urlencoded: rows([{ key: 'k', value: secret }]) },
        { mode: 'multipart' as const, multipart: [{ kind: 'text' as const, key: secret, value: '1', enabled: true }] },
      ]) {
        store.setBody(body);
        await component.sendRequest();
        expect(store.endpointError(), body.mode).toContain('Protected variables');
      }
      httpMock.verify();
    });

    it('lists the variables of the mode that is sent', () => {
      store.setBody({
        mode: 'urlencoded',
        raw: { language: 'json', text: '{{rawOnly}}' },
        urlencoded: rows([{ key: '{{name}}', value: '{{v}}' }]),
      });
      expect(store.variableTokens().map((token) => token.key)).toEqual(['name', 'v']);

      store.setBody({ mode: 'raw' });
      expect(store.variableTokens().map((token) => token.key)).toEqual(['rawOnly']);
    });
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
      store.setBody(jsonBody({
        a: { b: { c: '{{v}}' } },
        list: ['{{v}}', { deep: ['x-{{v}}'] }],
        n: 1,
        flag: false,
        nothing: null,
      }));

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

  it('keeps the headers as text showing the literal {{var}} template, not a resolved snapshot', () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ baseHost: 'example.com' }));
    store.patch({ headers: rows([{ key: 'X-Host', value: '{{baseHost}}' }]) });

    const text = headerLines(store.draft().headers);

    expect(text).toContain('{{baseHost}}');
    expect(text).not.toContain('example.com');
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
