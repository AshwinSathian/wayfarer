import { HttpTestingController } from '@angular/common/http/testing';
import { authFromV4 } from '@wayfarer/core';
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from '../../state/workspace-store';
import { ComposerHarness, JSON_HEADERS, buildEnvironment, jsonBytes, rows, setupComposer } from '../../../testing/composer-setup';
import { Composer } from './composer';
import { ComposerView } from './composer-view';

describe('Composer: rows, payloads and variables', () => {
  let component: Composer;
  let store: WorkspaceStore;
  let view: ComposerView;
  let httpMock: HttpTestingController;
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
    expect(headers).toEqual({ Authorization: 'Bearer token' });

    store.setBodyRows([
      { key: 'count', value: '42' },
      { key: 'enabled', value: 'false' },
      { key: '', value: 'skip' }
    ]);
    const body = store.snapshot().body;
    expect(body).toEqual({ count: '42', enabled: 'false' });
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
      store.patch({ auth: authFromV4({ type: 'bearer', bearer: { token: '{{v}}' } }) });
      const { headers } = await sendAndCapture('https://example.com/bearer');
      expect(headers.get('Authorization')).toBe('Bearer resolved');
    });

    it('resolves basic username and password before encoding', async () => {
      store.patch({ url: 'https://example.com/basic' });
      store.patch({ auth: authFromV4({ type: 'basic', basic: { username: '{{user}}', password: '{{pass}}' } }) });
      const { headers } = await sendAndCapture('https://example.com/basic');
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('ada:pw')}`);
    });

    it('resolves API-key name and value, in a header and in the query', async () => {
      store.patch({ url: 'https://example.com/key' });
      store.patch({ auth: authFromV4({ type: 'api-key', apiKey: { key: '{{keyName}}', value: '{{v}}', addTo: 'header' } }) });
      const header = await sendAndCapture('https://example.com/key');
      expect(header.headers.get('X-Key')).toBe('resolved');

      store.patch({ url: 'https://example.com/query' });
      store.patch({ auth: authFromV4({ type: 'api-key', apiKey: { key: '{{keyName}}', value: '{{v}}', addTo: 'query' } }) });
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
});
