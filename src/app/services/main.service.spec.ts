import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MainService } from './main.service';
import { BridgeService } from './bridge.service';
import { BinaryBody } from '../shared/http/response-body.util';
import { describe, it, beforeEach, afterEach, expect } from "vitest";

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const json = { 'Content-Type': 'application/json' };

describe('MainService', () => {
  let service: MainService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('wayfarer:bridge');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(MainService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('wayfarer:bridge');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // HttpClientTesting's req.flush() calls subscribe's callbacks synchronously,
  // so these don't need the done-callback/async pattern - a plain synchronous
  // test body is enough, and it fails loudly (via a thrown error) if the
  // observable resolves via the "wrong" side.
  it('should perform GET requests with provided headers', () => {
    service.sendRequest('GET', 'https://example.com/data', { Accept: 'application/json' })
      .subscribe({
        next: (response) => {
          expect(response.status).toBe(200);
          expect(response.body).toEqual({ ok: true });
        },
        error: (err) => { throw err; },
      });

    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('arraybuffer');
    expect(req.request.headers.get('Accept')).toBe('application/json');
    req.flush(bytes('{"ok":true}'), { status: 200, statusText: 'OK', headers: json });
  });

  // P0.4 (F04, #61): with the default responseType 'json', HttpClient turned
  // every non-JSON body into a {error, text} parse-failure wrapper.
  for (const [contentType, text] of [
    ['text/html; charset=utf-8', '<h1>hi</h1>'],
    ['application/xml', '<a/>'],
    ['text/plain', 'User-agent: *'],
  ]) {
    it(`returns a ${contentType} body as text`, () => {
      let body: unknown;
      service.sendRequest('GET', 'https://example.com/t', {}).subscribe({
        next: (response) => (body = response.body),
        error: (err) => { throw err; },
      });
      httpMock.expectOne('https://example.com/t').flush(bytes(text), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': contentType },
      });
      expect(body).toBe(text);
    });
  }

  // P0.4 (F05, #62)
  it('returns an image body as BinaryBody with its exact bytes', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    let body: unknown;
    service.sendRequest('GET', 'https://example.com/i.png', {}).subscribe({
      next: (response) => (body = response.body),
      error: (err) => { throw err; },
    });
    httpMock.expectOne('https://example.com/i.png').flush(png, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'image/png' },
    });
    expect(body).toBeInstanceOf(BinaryBody);
    expect(new Uint8Array((body as BinaryBody).bytes)).toEqual(new Uint8Array(png));
  });

  it('decodes an HTTP error body instead of exposing the raw ArrayBuffer', () => {
    let error: HttpErrorResponse | undefined;
    service.sendRequest('GET', 'https://example.com/missing', {}).subscribe({
      next: () => expect.unreachable('Expected error response'),
      error: (err) => (error = err),
    });
    httpMock.expectOne('https://example.com/missing').flush(bytes('<p>Not here</p>'), {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'text/html' },
    });
    expect(error?.status).toBe(404);
    expect(error?.error).toBe('<p>Not here</p>');
  });

  it('should send body payloads for mutating methods', () => {
    service.sendRequest(
      'PATCH',
      'https://example.com/profile',
      { 'Content-Type': 'application/json' },
      { displayName: 'Jane' }
    ).subscribe({
      next: (response) => {
        expect(response.status).toBe(204);
      },
      error: (err) => { throw err; },
    });

    const req = httpMock.expectOne('https://example.com/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Jane' });
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush(new ArrayBuffer(0), { status: 204, statusText: 'No Content' });
  });

  it('should surface errors for DELETE requests', () => {
    service.sendRequest('DELETE', 'https://example.com/resource/1', { Authorization: 'Bearer token' })
      .subscribe({
        next: () => expect.unreachable('Expected error response'),
        error: error => {
          expect(error.status).toBe(404);
        }
      });

    const req = httpMock.expectOne('https://example.com/resource/1');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token');
    req.flush(bytes('{"message":"missing"}'), { status: 404, statusText: 'Not Found', headers: json });
  });

  describe('when the Local Bridge is enabled', () => {
    beforeEach(() => {
      const bridgeService = TestBed.inject(BridgeService);
      bridgeService.update({
        enabled: true,
        url: 'http://127.0.0.1:7717',
        token: 'test-token',
      });
    });

    it('relays the request to the bridge with the token header and unwraps a successful target response', () => {
      service
        .sendRequest('GET', 'https://internal.example.com/data', { Accept: 'application/json' })
        .subscribe({
          next: (response) => {
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });
          },
          error: (err) => { throw err; },
        });

      const req = httpMock.expectOne('http://127.0.0.1:7717/relay');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('X-Wayfarer-Bridge-Token')).toBe('test-token');
      expect(req.request.body.method).toBe('GET');
      expect(req.request.body.url).toBe('https://internal.example.com/data');
      expect(req.request.body.headers).toEqual({ Accept: 'application/json' });
      req.flush({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
        bodyEncoding: 'utf8',
      });
    });

    it('surfaces a non-2xx target status (relayed successfully by the bridge) as an error', () => {
      service.sendRequest('GET', 'https://internal.example.com/missing', {}).subscribe({
        next: () => expect.unreachable('Expected error response'),
        error: (error: HttpErrorResponse) => {
          expect(error.status).toBe(404);
          expect(error.error).toEqual({ message: 'not found' });
        },
      });

      const req = httpMock.expectOne('http://127.0.0.1:7717/relay');
      req.flush({
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'not found' }),
        bodyEncoding: 'utf8',
      });
    });

    it('keeps a bridge utf8 body intact when the target declares another charset (P0.4)', () => {
      let body: unknown;
      service.sendRequest('GET', 'https://internal.example.com/latin1', {}).subscribe({
        next: (response) => (body = response.body),
        error: (err) => { throw err; },
      });
      // The bridge has already decoded this body to a string.
      httpMock.expectOne('http://127.0.0.1:7717/relay').flush({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain; charset=iso-8859-1' },
        body: 'café',
        bodyEncoding: 'utf8',
      });
      expect(body).toBe('café');
    });

    it('returns a base64 binary target body as BinaryBody, not a binary string (P0.4, #62)', () => {
      let body: unknown;
      service.sendRequest('GET', 'https://internal.example.com/i.png', {}).subscribe({
        next: (response) => (body = response.body),
        error: (err) => { throw err; },
      });
      httpMock.expectOne('http://127.0.0.1:7717/relay').flush({
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'image/png' },
        body: btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47)),
        bodyEncoding: 'base64',
      });
      expect(body).toBeInstanceOf(BinaryBody);
      expect(Array.from(new Uint8Array((body as BinaryBody).bytes))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    it('surfaces a bridge-level failure (e.g. an unreachable target) with a readable message', () => {
      service.sendRequest('GET', 'https://intranet.example.com/data', {}).subscribe({
        next: () => expect.unreachable('Expected error response'),
        error: (error: HttpErrorResponse) => {
          expect(error.status).toBe(502);
          expect(error.error).toBe('connect ECONNREFUSED');
        },
      });

      const req = httpMock.expectOne('http://127.0.0.1:7717/relay');
      req.flush(
        { error: { message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' } },
        { status: 502, statusText: 'Bad Gateway' }
      );
    });

    it('surfaces an invalid bridge token as a readable error', () => {
      service.sendRequest('GET', 'https://intranet.example.com/data', {}).subscribe({
        next: () => expect.unreachable('Expected error response'),
        error: (error: HttpErrorResponse) => {
          expect(error.status).toBe(401);
          expect(error.error).toBe('invalid or missing bridge token');
        },
      });

      const req = httpMock.expectOne('http://127.0.0.1:7717/relay');
      req.flush(
        { error: 'invalid or missing bridge token' },
        { status: 401, statusText: 'Unauthorized' }
      );
    });
  });
});
