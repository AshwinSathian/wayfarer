import { Injectable, inject } from "@angular/core";
import { HttpErrorResponse, HttpHeaders } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { MainService } from "./main.service";
import { EnvironmentsService } from "./environments.service";
import { ResponseInspectorService } from "../shared/inspect/response-inspector.service";
import {
  ScriptSandboxService,
  ScriptResponseContext,
} from "../shared/scripts/script-sandbox.service";
import {
  AssertionRunnerService,
  AssertionResponseContext,
} from "../shared/scripts/assertion-runner.service";
import { PastRequest } from "../models/history.models";
import { TestAssertion, TestResult } from "../models/test-assertion.models";

export interface BuiltRequest {
  method: PastRequest["method"];
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  usesBody: boolean;
}

export interface RequestExecutionSpec {
  preRequestScript: string;
  postRequestScript: string;
  tests: TestAssertion[];
  /**
   * Builds the actual method/url/headers/body to send. Invoked *after* the
   * pre-request script has run (and any pm.environment.set() mutations from
   * it have been persisted) — not upfront — so a pre-script that sets a
   * variable this same request's own headers/body/URL reference (e.g. an
   * auth token fetched by a prior call) is reflected in what actually gets
   * sent, matching the ordering `pre-script -> build -> send` implies.
   */
  buildRequest: () => BuiltRequest;
}

export interface RequestExecutionResponse {
  isError: boolean;
  statusCode?: number;
  statusText?: string;
  bodyIsJson: boolean;
  dataText: string;
  errorText: string;
  headersView: { name: string; value: string }[];
  contentLength?: number;
}

export interface RequestExecutionResult {
  durationMs: number;
  testResults: TestResult[];
  response: RequestExecutionResponse;
  history: PastRequest;
}

/**
 * Owns the pre-script -> send -> post-script -> assertions pipeline that
 * used to live inline in ApiParamsComponent.sendRequest(). Extracted so the
 * sequencing (and the response-shaping/error-classification logic it
 * depends on) is unit-testable without an Angular component harness, and so
 * ApiParamsComponent itself only has to own request-*building* (turning form
 * state into a spec) rather than request-*execution*.
 */
@Injectable({ providedIn: "root" })
export class RequestExecutionService {
  private readonly mainService = inject(MainService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly responseInspector = inject(ResponseInspectorService);
  private readonly scriptSandbox = inject(ScriptSandboxService);
  private readonly assertionRunner = inject(AssertionRunnerService);

  async execute(spec: RequestExecutionSpec): Promise<RequestExecutionResult> {
    const requestId = this.createRequestId();
    const startedAt = performance.now();
    const createdAt = Date.now();
    let testResults: TestResult[] = [];

    if (spec.preRequestScript?.trim()) {
      const preResult = await this.scriptSandbox.execute(
        spec.preRequestScript,
        this.getEnvSnapshot()
      );
      if (preResult.testResults.length) {
        testResults = [...preResult.testResults];
      }
      await this.applyEnvMutations(preResult.envMutations);
    }

    // Built only now, after the pre-script (and any environment mutations
    // it made) has already landed — see BuiltRequest / buildRequest's doc.
    const request = spec.buildRequest();

    this.responseInspector.markRequest(requestId, request.url);

    try {
      const response = await firstValueFrom(
        this.mainService.sendRequest(
          request.method,
          request.url,
          request.headers,
          request.usesBody ? request.body ?? {} : undefined
        )
      );
      this.responseInspector.markResponse(requestId, request.url);

      const durationMs = Math.round(performance.now() - startedAt);
      const bodyIsJson = this.isJsonPayload(response.body);
      const postTestResults = await this.runPostScriptAndAssertions(
        spec,
        response.status,
        response.statusText ?? "",
        response.body,
        this.extractHeadersMap(response.headers),
        durationMs
      );
      testResults = [...testResults, ...postTestResults];

      const history: PastRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        createdAt,
        status: response.status,
        durationMs,
      };
      if (request.usesBody) {
        history.body = request.body;
      }

      return {
        durationMs,
        testResults,
        history,
        response: {
          isError: false,
          statusCode: response.status,
          statusText: response.statusText ?? "",
          bodyIsJson,
          dataText: bodyIsJson
            ? this.serializeJsonPayload(response.body)
            : this.stringifyPayload(response.body),
          errorText: "",
          headersView: this.extractHeadersList(response.headers),
          contentLength: this.extractContentLength(response.headers),
        },
      };
    } catch (err) {
      const error = err as HttpErrorResponse;
      this.responseInspector.markResponse(requestId, request.url);

      const durationMs = Math.round(performance.now() - startedAt);
      const errorBody = this.resolveErrorBody(error);
      const bodyIsJson = !this.isNetworkError(error) && this.isJsonPayload(error.error);
      const postTestResults = await this.runPostScriptAndAssertions(
        spec,
        error.status,
        error.statusText ?? "",
        error.error,
        this.extractHeadersMap(error.headers),
        durationMs
      );
      testResults = [...testResults, ...postTestResults];

      const history: PastRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        createdAt,
        status: error.status,
        durationMs,
        error: this.extractError(error),
      };
      if (request.usesBody) {
        history.body = request.body;
      }

      return {
        durationMs,
        testResults,
        history,
        response: {
          isError: true,
          statusCode: error.status,
          statusText: error.statusText ?? "",
          bodyIsJson,
          dataText: "",
          errorText: bodyIsJson
            ? this.serializeJsonPayload(errorBody)
            : this.stringifyPayload(errorBody),
          headersView: this.extractHeadersList(error.headers),
          contentLength: this.extractContentLength(error.headers),
        },
      };
    }
  }

  private async runPostScriptAndAssertions(
    spec: RequestExecutionSpec,
    statusCode: number,
    statusText: string,
    body: unknown,
    headers: Record<string, string>,
    durationMs: number
  ): Promise<TestResult[]> {
    let results: TestResult[] = [];

    if (spec.postRequestScript?.trim()) {
      const responseCtx: ScriptResponseContext = {
        statusCode,
        statusText,
        body,
        headers,
        durationMs,
      };
      const postResult = await this.scriptSandbox.execute(
        spec.postRequestScript,
        this.getEnvSnapshot(),
        responseCtx
      );
      results = [...results, ...postResult.testResults];
      await this.applyEnvMutations(postResult.envMutations);
    }

    if (spec.tests.length) {
      const assertionCtx: AssertionResponseContext = {
        statusCode,
        body,
        headers,
        durationMs,
      };
      const assertionResults = this.assertionRunner.run(spec.tests, assertionCtx);
      results = [...results, ...assertionResults];
    }

    return results;
  }

  private getEnvSnapshot(): Record<string, string> {
    return { ...(this.environmentsService.activeEnvironment()?.vars ?? {}) };
  }

  private async applyEnvMutations(mutations: Record<string, string>): Promise<void> {
    const keys = Object.keys(mutations);
    if (!keys.length) {
      return;
    }
    const active = this.environmentsService.activeEnvironment();
    if (!active) {
      return;
    }
    const vars = { ...active.vars };
    for (const key of keys) {
      if (mutations[key] === "") {
        delete vars[key];
      } else {
        vars[key] = mutations[key];
      }
    }
    await this.environmentsService.updateEnvironment(active.meta.id, { vars });
  }

  private createRequestId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private isJsonPayload(payload: unknown): boolean {
    if (payload === null || payload === undefined) {
      return false;
    }
    if (typeof payload === "object") {
      const hasBlob = typeof Blob !== "undefined" && payload instanceof Blob;
      const hasArrayBuffer =
        typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer;
      const hasFormData = typeof FormData !== "undefined" && payload instanceof FormData;
      if (hasBlob || hasArrayBuffer || hasFormData) {
        return false;
      }
      return true;
    }
    if (typeof payload === "string") {
      try {
        JSON.parse(payload);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * True when the browser never got a response to parse — a CORS rejection,
   * DNS failure, refused connection, etc. In that case `HttpErrorResponse.error`
   * is the raw `ProgressEvent`/`ErrorEvent` the browser fired, not a response
   * body. Stringifying that object directly used to leak `{"isTrusted":true}`
   * (an Event's only own-enumerable property) into the response viewer instead
   * of a readable message.
   */
  private isNetworkError(error: HttpErrorResponse): boolean {
    if (error.status === 0) {
      return true;
    }
    return (
      (typeof ProgressEvent !== "undefined" && error.error instanceof ProgressEvent) ||
      (typeof ErrorEvent !== "undefined" && error.error instanceof ErrorEvent)
    );
  }

  private resolveErrorBody(error: HttpErrorResponse): unknown {
    if (this.isNetworkError(error)) {
      return (
        error.message ||
        "Network error — no response was received. Check the URL, your connection, or whether the API allows cross-origin requests (CORS)."
      );
    }
    return error.error ?? error.message;
  }

  private extractError(error: HttpErrorResponse): string {
    if (error.message) {
      return error.message;
    }
    return "Unknown error";
  }

  private extractHeadersList(
    headers: HttpHeaders | null | undefined
  ): { name: string; value: string }[] {
    if (!headers) {
      return [];
    }
    const keys = headers.keys();
    return keys
      .map((name) => {
        const values = headers.getAll(name);
        return {
          name,
          value: values && values.length ? values.join(", ") : "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private extractHeadersMap(headers: HttpHeaders | null | undefined): Record<string, string> {
    if (!headers) {
      return {};
    }
    return headers.keys().reduce((acc, key) => {
      acc[key] = headers.get(key) ?? "";
      return acc;
    }, {} as Record<string, string>);
  }

  private extractContentLength(headers: HttpHeaders | null | undefined): number | undefined {
    if (!headers) {
      return undefined;
    }
    const value = headers.get("content-length");
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private serializeJsonPayload(payload: unknown): string {
    if (payload === null || payload === undefined) {
      return "";
    }
    if (typeof payload === "string") {
      return payload;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return this.stringifyPayload(payload);
    }
  }

  private stringifyPayload(payload: unknown): string {
    try {
      if (payload === null || payload === undefined) {
        return "";
      }
      if (typeof payload === "string") {
        return payload;
      }
      return JSON.stringify(payload, undefined, 4);
    } catch {
      return String(payload);
    }
  }
}
