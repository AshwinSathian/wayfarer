import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeSettings } from "../../services/bridge-settings";
import { RequestFiles } from "../../services/request-files";
import { WorkspaceStore } from '../../state/workspace-store';
import { ComposerHarness, JSON_HEADERS, buildEnvironment, jsonBytes, rows, setupComposer } from '../../../testing/composer-setup';
import { Composer } from './composer';
import { ComposerView } from './composer-view';

describe('Composer: methods and body modes', () => {
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

  describe('any HTTP method (P2.16)', () => {
    it('upper-cases a typed method and sends it, a body with it', async () => {
      store.patch({ url: 'https://a.test/cache', headers: [] });
      view.onRequestMethodChange(' purge ');
      expect(store.draft().method).toBe('PURGE');
      store.setBody({ mode: 'raw', raw: { language: 'text', text: 'all' } });

      const pending = component.sendRequest();
      const req = httpMock.expectOne('https://a.test/cache');
      expect(req.request.init.method).toBe('PURGE');
      expect(req.request.init.body).toBe('all');
      req.flush(jsonBytes({}), { status: 200, statusText: 'OK', headers: JSON_HEADERS });
      await pending;

      view.onRequestMethodChange('patch');
      expect(store.draft().method).toBe('PATCH');
    });

    it('does not send a method that is not one, and says what a method is', async () => {
      store.patch({ url: 'https://a.test/x' });
      for (const [typed, message] of [
        ['', 'Enter a method, such as GET.'],
        ['GET; rm -rf', '"GET; RM -RF" is not an HTTP method.'],
        ['A'.repeat(33), 'is not an HTTP method.'],
      ]) {
        view.onRequestMethodChange(typed);
        await component.sendRequest();
        expect(store.endpointError(), typed).toContain(message);
      }
      httpMock.verify();
    });

    it('does not send CONNECT, TRACE or TRACK from the browser, and says the Local Bridge can', async () => {
      store.patch({ url: 'https://a.test/x' });
      for (const method of ['CONNECT', 'trace', 'TRACK']) {
        view.onRequestMethodChange(method);
        await component.sendRequest();
        expect(store.endpointError()).toBe(`Browsers do not send ${method.toUpperCase()} requests. Turn on the Local Bridge to send one.`);
      }

      // Through the bridge the request is made: the bridge is not a browser.
      TestBed.inject(BridgeSettings).config.set({ enabled: true, url: 'http://127.0.0.1:7717', token: 't'.repeat(16) });
      view.onRequestMethodChange('TRACE');
      const pending = component.sendRequest();
      const relay = await vi.waitFor(() => httpMock.expectOne('http://127.0.0.1:7717/relay'));
      expect(relay.request.body).toMatchObject({ method: 'TRACE', url: 'https://a.test/x' });
      relay.flush(JSON.stringify({ status: 200, statusText: 'OK', headers: {}, body: '', bodyEncoding: 'utf8' }), { status: 200 });
      await pending;
      expect(store.endpointError()).toBe('');
    });
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
        // The vault is open and does not have this secret: the reference stays, and is refused.
        expect(store.endpointError(), body.mode).toContain('refers to a vault secret that could not be read');
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
});
