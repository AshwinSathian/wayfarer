import { TestBed } from "@angular/core/testing";
import { HttpErrorResponse, HttpResponse } from "@angular/common/http";
import { Observable, of, throwError } from "rxjs";
import { signal } from "@angular/core";
import { RequestExecutionService, BuiltRequest } from "./request-execution.service";
import { MainService } from "./main.service";
import { EnvironmentsService } from "./environments.service";
import { ResponseInspectorService } from "../shared/inspect/response-inspector.service";
import { ScriptSandboxService } from "../shared/scripts/script-sandbox.service";
import { AssertionRunnerService } from "../shared/scripts/assertion-runner.service";
import { EnvironmentDoc } from "../models/environments.models";
import { ScriptExecutionResult } from "../models/test-assertion.models";
import { describe, it, beforeEach, expect, vi } from "vitest";

class MainServiceStub {
  private response$: Observable<HttpResponse<unknown>> = of(
    new HttpResponse({ status: 200, statusText: "OK", body: { ok: true } })
  );

  sendRequest = vi.fn()
    .mockImplementation(() => this.response$);

  setResponse(response$: Observable<HttpResponse<unknown>>): void {
    this.response$ = response$;
    this.sendRequest.mockImplementation(() => this.response$);
  }
}

class ResponseInspectorServiceStub {
  markRequest = vi.fn();
  markResponse = vi.fn();
}

class EnvironmentsServiceStub {
  private readonly activeEnvSignal = signal<EnvironmentDoc | null>(null);
  readonly activeEnvironment = this.activeEnvSignal.asReadonly();
  updateEnvironment = vi.fn()
    .mockImplementation(async (id: string, patch: Partial<EnvironmentDoc>) => {
      const current = this.activeEnvSignal();
      if (current && current.meta.id === id) {
        this.activeEnvSignal.set({ ...current, ...patch } as EnvironmentDoc);
      }
    });

  setActiveEnvironment(env: EnvironmentDoc | null): void {
    this.activeEnvSignal.set(env);
  }
}

class ScriptSandboxServiceStub {
  private nextResult: ScriptExecutionResult = { logs: [], envMutations: {}, testResults: [] };

  execute = vi.fn().mockImplementation(async () => this.nextResult);

  setNextResult(result: ScriptExecutionResult): void {
    this.nextResult = result;
  }
}

function buildEnvironment(vars: Record<string, string>): EnvironmentDoc {
  return {
    id: "env-1",
    meta: { id: "env-1", createdAt: 1, updatedAt: 1, version: 1 },
    name: "Test env",
    order: 1,
    vars,
  } as EnvironmentDoc;
}

function builtRequest(overrides: Partial<BuiltRequest> = {}): BuiltRequest {
  return {
    method: "GET",
    url: "https://example.com/data",
    headers: {},
    usesBody: false,
    ...overrides,
  };
}

describe("RequestExecutionService", () => {
  let service: RequestExecutionService;
  let mainService: MainServiceStub;
  let responseInspector: ResponseInspectorServiceStub;
  let environmentsService: EnvironmentsServiceStub;
  let scriptSandbox: ScriptSandboxServiceStub;

  beforeEach(() => {
    mainService = new MainServiceStub();
    responseInspector = new ResponseInspectorServiceStub();
    environmentsService = new EnvironmentsServiceStub();
    scriptSandbox = new ScriptSandboxServiceStub();

    TestBed.configureTestingModule({
      providers: [
        RequestExecutionService,
        AssertionRunnerService,
        { provide: MainService, useValue: mainService },
        { provide: ResponseInspectorService, useValue: responseInspector },
        { provide: EnvironmentsService, useValue: environmentsService },
        { provide: ScriptSandboxService, useValue: scriptSandbox },
      ],
    });
    service = TestBed.inject(RequestExecutionService);
  });

  it("sends the request built by buildRequest() and shapes a successful JSON response", async () => {
    mainService.setResponse(
      of(new HttpResponse({ status: 200, statusText: "OK", body: { hello: "world" } }))
    );

    const result = await service.execute({
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest({ url: "https://example.com/hello" }),
    });

    expect(mainService.sendRequest).toHaveBeenCalledWith(
      "GET",
      "https://example.com/hello",
      {},
      undefined
    );
    expect(result.response.isError).toBe(false);
    expect(result.response.statusCode).toBe(200);
    expect(result.response.bodyIsJson).toBe(true);
    expect(result.response.dataText).toContain("world");
    expect(result.history.status).toBe(200);
    expect(result.history.url).toBe("https://example.com/hello");
  });

  it("marks request/response with the URL from buildRequest(), not a placeholder", async () => {
    await service.execute({
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest({ url: "https://example.com/marked" }),
    });

    expect(responseInspector.markRequest).toHaveBeenCalledWith(
      expect.any(String),
      "https://example.com/marked"
    );
    expect(responseInspector.markResponse).toHaveBeenCalledWith(
      expect.any(String),
      "https://example.com/marked"
    );
  });

  it("includes the body in the sent request and history only when usesBody is true", async () => {
    await service.execute({
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () =>
        builtRequest({ method: "POST", usesBody: true, body: { name: "widget" } }),
    });

    expect(mainService.sendRequest).toHaveBeenCalledWith(
      "POST",
      expect.any(String),
      {},
      { name: "widget" }
    );
  });

  it("omits the body from the send call and history when usesBody is false", async () => {
    const result = await service.execute({
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest({ method: "DELETE", usesBody: false }),
    });

    expect(mainService.sendRequest).toHaveBeenCalledWith(
      "DELETE",
      expect.any(String),
      {},
      undefined
    );
    expect(result.history.body).toBeUndefined();
  });

  it("shapes a network error (status 0) into a readable message rather than leaking the raw event", async () => {
    const progressEvent =
      typeof ProgressEvent !== "undefined" ? new ProgressEvent("error") : ({} as ProgressEvent);
    const error = new HttpErrorResponse({ status: 0, error: progressEvent });
    mainService.setResponse(throwError(() => error));

    const result = await service.execute({
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(result.response.isError).toBe(true);
    expect(result.response.bodyIsJson).toBe(false);
    expect(result.response.errorText).not.toContain("isTrusted");
    expect(result.response.errorText.length).toBeGreaterThan(0);
    expect(result.history.error).toBeDefined();
  });

  it("shapes a JSON error body from a real HTTP error response", async () => {
    const error = new HttpErrorResponse({
      status: 500,
      statusText: "Server Error",
      error: { message: "boom" },
    });
    mainService.setResponse(throwError(() => error));

    const result = await service.execute({
      preRequestScript: "",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(result.response.isError).toBe(true);
    expect(result.response.statusCode).toBe(500);
    expect(result.response.bodyIsJson).toBe(true);
    expect(result.response.errorText).toContain("boom");
  });

  it("runs the pre-request script before calling buildRequest(), so env mutations it makes are visible to the built request", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({}));
    scriptSandbox.setNextResult({
      logs: [],
      envMutations: { authToken: "fetched-token" },
      testResults: [],
    });

    let capturedEnvDuringBuild: string | undefined;
    await service.execute({
      preRequestScript: "pm.environment.set('authToken', 'fetched-token');",
      postRequestScript: "",
      tests: [],
      buildRequest: () => {
        capturedEnvDuringBuild = environmentsService.activeEnvironment()?.vars?.["authToken"];
        return builtRequest();
      },
    });

    expect(scriptSandbox.execute).toHaveBeenCalledBefore(mainService.sendRequest);
    expect(capturedEnvDuringBuild).toBe("fetched-token");
  });

  it("merges pre-script test results into the final testResults", async () => {
    scriptSandbox.execute.mockImplementation(async (script: string) => {
      if (script.includes("pre")) {
        return {
          logs: [],
          envMutations: {},
          testResults: [{ label: "pre check", passed: true, source: "script" as const }],
        };
      }
      return { logs: [], envMutations: {}, testResults: [] };
    });

    const result = await service.execute({
      preRequestScript: "pre script",
      postRequestScript: "",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(result.testResults).toEqual([
      expect.objectContaining({ label: "pre check", passed: true }),
    ]);
  });

  it("runs the post-response script with response context and merges its test results", async () => {
    mainService.setResponse(
      of(new HttpResponse({ status: 201, statusText: "Created", body: { id: 1 } }))
    );
    scriptSandbox.setNextResult({
      logs: [],
      envMutations: {},
      testResults: [{ label: "post check", passed: true, source: "script" as const }],
    });

    const result = await service.execute({
      preRequestScript: "",
      postRequestScript: "pm.test('post check', () => true);",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(scriptSandbox.execute).toHaveBeenCalledWith(
      "pm.test('post check', () => true);",
      expect.any(Object),
      expect.objectContaining({ statusCode: 201 }),
    );
    expect(result.testResults).toEqual([
      expect.objectContaining({ label: "post check", passed: true }),
    ]);
  });

  it("runs visual test assertions against the response and merges them into testResults", async () => {
    mainService.setResponse(
      of(new HttpResponse({ status: 200, statusText: "OK", body: {} }))
    );

    const result = await service.execute({
      preRequestScript: "",
      postRequestScript: "",
      tests: [{ id: "t1", target: "status", operator: "equals", expected: "200" }],
      buildRequest: () => builtRequest(),
    });

    expect(result.testResults.length).toBe(1);
    expect(result.testResults[0].passed).toBe(true);
  });

  it("applies post-script env mutations too", async () => {
    environmentsService.setActiveEnvironment(buildEnvironment({ counter: "1" }));
    scriptSandbox.setNextResult({
      logs: [],
      envMutations: { counter: "2" },
      testResults: [],
    });

    await service.execute({
      preRequestScript: "",
      postRequestScript: "increment",
      tests: [],
      buildRequest: () => builtRequest(),
    });

    expect(environmentsService.updateEnvironment).toHaveBeenCalledWith(
      "env-1",
      expect.objectContaining({ vars: expect.objectContaining({ counter: "2" }) })
    );
  });
});
