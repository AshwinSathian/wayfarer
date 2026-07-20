import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PastRequest } from '../models/history.models';

@Injectable({
  providedIn: 'root'
})
export class MainService {
  private _httpClient = inject(HttpClient);


  sendRequest(
    method: PastRequest['method'],
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Observable<HttpResponse<unknown>> {
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
}
