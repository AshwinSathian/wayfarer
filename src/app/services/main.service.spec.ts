import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MainService } from './main.service';
import { BridgeService } from './bridge.service';

describe('MainService', () => {
  let service: MainService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('wayfarer:bridge');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
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

  it('should perform GET requests with provided headers', (done) => {
    service.sendRequest('GET', 'https://example.com/data', { Accept: 'application/json' })
      .subscribe(response => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
        done();
      }, done.fail);

    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Accept')).toBe('application/json');
    req.flush({ ok: true }, { status: 200, statusText: 'OK' });
  });

  it('should send body payloads for mutating methods', (done) => {
    service.sendRequest(
      'PATCH',
      'https://example.com/profile',
      { 'Content-Type': 'application/json' },
      { displayName: 'Jane' }
    ).subscribe(response => {
      expect(response.status).toBe(204);
      done();
    }, done.fail);

    const req = httpMock.expectOne('https://example.com/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Jane' });
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('should surface errors for DELETE requests', (done) => {
    service.sendRequest('DELETE', 'https://example.com/resource/1', { Authorization: 'Bearer token' })
      .subscribe({
        next: () => done.fail('Expected error response'),
        error: error => {
          expect(error.status).toBe(404);
          done();
        }
      });

    const req = httpMock.expectOne('https://example.com/resource/1');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token');
    req.flush({ message: 'missing' }, { status: 404, statusText: 'Not Found' });
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

    it('relays the request to the bridge with the token header and unwraps a successful target response', (done) => {
      service
        .sendRequest('GET', 'https://internal.example.com/data', { Accept: 'application/json' })
        .subscribe((response) => {
          expect(response.status).toBe(200);
          expect(response.body).toEqual({ ok: true });
          done();
        }, done.fail);

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

    it('surfaces a non-2xx target status (relayed successfully by the bridge) as an error', (done) => {
      service.sendRequest('GET', 'https://internal.example.com/missing', {}).subscribe({
        next: () => done.fail('Expected error response'),
        error: (error: HttpErrorResponse) => {
          expect(error.status).toBe(404);
          expect(error.error).toEqual({ message: 'not found' });
          done();
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

    it('surfaces a bridge-level failure (e.g. an unreachable target) with a readable message', (done) => {
      service.sendRequest('GET', 'https://intranet.example.com/data', {}).subscribe({
        next: () => done.fail('Expected error response'),
        error: (error: HttpErrorResponse) => {
          expect(error.status).toBe(502);
          expect(error.error).toBe('connect ECONNREFUSED');
          done();
        },
      });

      const req = httpMock.expectOne('http://127.0.0.1:7717/relay');
      req.flush(
        { error: { message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' } },
        { status: 502, statusText: 'Bad Gateway' }
      );
    });

    it('surfaces an invalid bridge token as a readable error', (done) => {
      service.sendRequest('GET', 'https://intranet.example.com/data', {}).subscribe({
        next: () => done.fail('Expected error response'),
        error: (error: HttpErrorResponse) => {
          expect(error.status).toBe(401);
          expect(error.error).toBe('invalid or missing bridge token');
          done();
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
