import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, catchError, of, switchMap, throwError } from 'rxjs';
import { PastRequest } from '../models/history.models';
import { BridgeService } from './bridge.service';

interface BridgeRelayEnvelope {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: 'utf8' | 'base64';
}

interface BridgeRelayErrorBody {
  error: string | { message: string; code?: string };
}

@Injectable({
  providedIn: 'root'
})
export class MainService {
  private _httpClient = inject(HttpClient);
  private _bridgeService = inject(BridgeService);

  sendRequest(
    method: PastRequest['method'],
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Observable<HttpResponse<unknown>> {
    const bridge = this._bridgeService.config();
    if (bridge.enabled && bridge.url) {
      return this.sendViaBridge(bridge.url, bridge.token, method, url, headers, body);
    }

    const httpHeaders = new HttpHeaders(headers);
    const options: {
      headers: HttpHeaders;
      observe: 'response';
      body?: unknown;
    } = {
      headers: httpHeaders,
      observe: 'response'
    };

    if (body !== undefined) {
      options.body = body;
    }

    return this._httpClient.request(method, url, options);
  }

  /**
   * Routes the request through the optional Local Bridge companion process
   * instead of fetching directly — see `local-bridge/README.md`. The bridge
   * always answers the relay call itself with HTTP 200 when it successfully
   * reached the target (even if the *target* returned a non-2xx status);
   * only a bridge-level failure (bad token, unreachable target, etc.)
   * produces a non-200 from the bridge itself. `toHttpResponse` re-derives
   * the caller-facing success/error split from the target's own status, so
   * downstream code (RequestExecutionService) sees the same success/error
   * shape it would from a direct fetch.
   */
  private sendViaBridge(
    bridgeUrl: string,
    token: string,
    method: PastRequest['method'],
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Observable<HttpResponse<unknown>> {
    const relayHeaders = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Wayfarer-Bridge-Token': token,
    });
    const payload = { method, url, headers, body };
    const endpoint = `${bridgeUrl.replace(/\/+$/, '')}/relay`;

    return this._httpClient
      .post<BridgeRelayEnvelope>(endpoint, payload, { headers: relayHeaders })
      .pipe(
        // Only catches failures of the POST to the bridge itself (status 0 —
        // bridge unreachable, already classified correctly by
        // RequestExecutionService's isNetworkError() — or a non-2xx from the
        // bridge: bad token, malformed request, relay failure to the
        // target). Deliberately placed *before* switchMap so it never
        // catches the target-status errors toHttpResponse below throws for
        // a successfully-relayed non-2xx target response.
        catchError((err: HttpErrorResponse) => {
          const message = this.describeBridgeError(err.error as BridgeRelayErrorBody | undefined);
          return throwError(
            () =>
              new HttpErrorResponse({
                error: message ?? err.message,
                status: err.status,
                statusText: err.statusText,
                url: err.url ?? url,
              })
          );
        }),
        switchMap((envelope) => this.toHttpResponse(envelope, url))
      );
  }

  private toHttpResponse(
    envelope: BridgeRelayEnvelope,
    url: string
  ): Observable<HttpResponse<unknown>> {
    const targetHeaders = new HttpHeaders(envelope.headers ?? {});
    const targetBody = this.decodeBridgeBody(envelope);

    if (envelope.status >= 200 && envelope.status < 300) {
      return of(
        new HttpResponse({
          status: envelope.status,
          statusText: envelope.statusText,
          headers: targetHeaders,
          body: targetBody,
          url,
        })
      );
    }

    return throwError(
      () =>
        new HttpErrorResponse({
          error: targetBody,
          status: envelope.status,
          statusText: envelope.statusText,
          headers: targetHeaders,
          url,
        })
    );
  }

  private decodeBridgeBody(envelope: BridgeRelayEnvelope): unknown {
    let text = envelope.body ?? '';
    if (envelope.bodyEncoding === 'base64') {
      try {
        text = atob(text);
      } catch {
        // leave as the raw base64 string if it somehow doesn't decode
      }
    }
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private describeBridgeError(body: BridgeRelayErrorBody | undefined): string | undefined {
    if (!body?.error) {
      return undefined;
    }
    if (typeof body.error === 'string') {
      return body.error;
    }
    return body.error.message;
  }
}
